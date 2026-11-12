// Keeps an app on the newest GlimStone release. glimstone.json at the app's
// root lists the parts that follow GlimStone and how each one takes a release;
// glimstone.schema.json beside this file describes it.
//
//     node glimstone.mjs check [--repo DIR]
//     node glimstone.mjs update [--repo DIR] [--out DIR]
//
// check fails while a part is behind the newest release or a file disagrees
// with glimstone.json. update moves the npm and copy parts in the working tree
// and drafts an issue for the parts ported by hand. The reusable workflows
// glimstone-current.yml and glimstone-update.yml run the two in CI.

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, posix } from 'node:path'
import { pathToFileURL } from 'node:url'

const glimstoneRepo = 'junkerderprovinz/glimstone'
const configFile = 'glimstone.json'
const modes = { npm: ['package'], copy: ['files'], port: [] }
const commonKeys = ['name', 'mode', 'version', 'versionFile']
const dependencySections = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']
const semver = /^\d+\.\d+\.\d+$/
const marker = /GlimStone (\d+\.\d+\.\d+)/g
const hasMarker = /GlimStone \d+\.\d+\.\d+/
// GitHub refuses an issue body over 65536 characters.
const issueLimit = 60000

class ConfigError extends Error {}

export const issueTitle = (version) => `GlimStone ${version} is ready to port`
export const branchName = (version) => `chore/glimstone-${version}`

export function compareVersions(a, b) {
  const x = a.split('.').map(Number)
  const y = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return Math.sign(x[i] - y[i])
  return 0
}

function readConfig(root) {
  const path = join(root, configFile)
  if (!existsSync(path)) {
    throw new ConfigError('There is no glimstone.json here yet. It lists the parts of the app that follow GlimStone, and glimstone.schema.json in junkerderprovinz/junkerderprovinz shows how it looks.')
  }
  let raw
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'))
  } catch (e) {
    throw new ConfigError(`glimstone.json is not valid JSON: ${e.message}`)
  }
  validate(raw)
  return raw
}

function validate(raw) {
  const fail = (message) => {
    throw new ConfigError(`glimstone.json: ${message}`)
  }
  const isText = (v) => typeof v === 'string' && v.trim() !== ''
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('it should be an object with a "targets" list.')
  for (const key of Object.keys(raw)) if (key !== 'targets' && key !== '$schema') fail(`"${key}" is not a key it knows, only "targets".`)
  if (!Array.isArray(raw.targets) || raw.targets.length === 0) fail('"targets" should list at least one part of the app.')
  const names = new Set()
  raw.targets.forEach((t, i) => {
    if (!t || typeof t !== 'object') fail(`targets[${i}] should be an object.`)
    if (!isText(t.name)) fail(`targets[${i}] needs a "name".`)
    const label = `target "${t.name}"`
    if (names.has(t.name)) fail(`there are two targets called "${t.name}".`)
    names.add(t.name)
    if (!Object.hasOwn(modes, t.mode)) fail(`${label} has mode ${JSON.stringify(t.mode)}, which should be npm, copy or port.`)
    const known = [...commonKeys, ...modes[t.mode]]
    for (const key of Object.keys(t)) if (!known.includes(key)) fail(`${label} has "${key}", which a ${t.mode} target does not know. It knows ${known.join(', ')}.`)
    if (typeof t.version !== 'string' || !semver.test(t.version)) fail(`${label} needs a "version" like 4.3.7.`)
    if (t.versionFile !== undefined && !isText(t.versionFile)) fail(`${label} has an empty "versionFile".`)
    if (t.mode === 'npm' && !isText(t.package)) fail(`${label} needs "package", the path of its package.json.`)
    if (t.mode === 'copy') {
      if (!Array.isArray(t.files) || t.files.length === 0) fail(`${label} needs "files", a list of { "from", "to" } paths.`)
      t.files.forEach((f, j) => {
        if (!f || !isText(f.from) || !isText(f.to) || Object.keys(f).length !== 2) fail(`${label}: files[${j}] should be { "from": "<path in GlimStone>", "to": "<path in the app>" }.`)
      })
    }
  })
}

const isBinary = (buf) => buf.includes(0)
const markersIn = (buf) => (isBinary(buf) ? [] : [...buf.toString('utf8').matchAll(marker)].map((m) => m[1]))
const quotedVersions = (text) => [...text.matchAll(/(['"`])(\d+\.\d+\.\d+)\1/g)].map((m) => m[2])

function behind(t, latest) {
  const order = compareVersions(t.version, latest)
  if (order > 0) {
    return [`${t.name} names GlimStone ${t.version}, but the newest release is ${latest}. Please set it to a published version.`]
  }
  if (order === 0) return []
  if (t.mode === 'port') {
    const where = t.versionFile ? `in glimstone.json and in ${t.versionFile}` : 'in glimstone.json'
    return [`${t.name} follows GlimStone ${t.version}, and ${latest} is out. This part is ported by hand, and the issue "${issueTitle(latest)}" lists what changed. Once it's ported, set its version to ${latest} ${where}.`]
  }
  return [`${t.name} is on GlimStone ${t.version}, and ${latest} is out. The GlimStone update keeps the ${branchName(latest)} branch ready for you: merge it, or run glimstone.mjs update and commit what it changes.`]
}

function disagreements(root, t) {
  const problems = []
  const say = (file, message) => problems.push({ file, message })
  const at = (path) => join(root, path)

  if (t.versionFile) {
    if (!existsSync(at(t.versionFile))) {
      say(t.versionFile, `${t.versionFile} is missing, but glimstone.json names it as the version file of ${t.name}.`)
    } else {
      const found = quotedVersions(readFileSync(at(t.versionFile), 'utf8'))
      if (!found.includes(t.version)) {
        const holds = found.length ? `it holds ${[...new Set(found)].join(', ')}` : 'it holds no version in quotes'
        say(t.versionFile, `${t.versionFile} should hold "${t.version}" for ${t.name}, but ${holds}.`)
      }
    }
  }

  if (t.mode === 'npm') {
    if (!existsSync(at(t.package))) {
      say(t.package, `${t.package} is missing, but glimstone.json names it as the package of ${t.name}.`)
      return problems
    }
    let pkg
    try {
      pkg = JSON.parse(readFileSync(at(t.package), 'utf8'))
    } catch (e) {
      say(t.package, `${t.package} is not valid JSON: ${e.message}`)
      return problems
    }
    const deps = dependencySections.flatMap((s) => Object.entries(pkg[s] ?? {})).filter(([name]) => name.startsWith('@glimstone/'))
    if (deps.length === 0) say(t.package, `${t.package} has no @glimstone dependency, so ${t.name} has nothing to follow.`)
    const wanted = new RegExp(`^[\\^~]?${t.version.replaceAll('.', '\\.')}$`)
    for (const [name, spec] of deps) {
      if (!wanted.test(spec)) say(t.package, `${t.package} asks for ${name} ${spec}, but glimstone.json says ${t.name} is on ${t.version}. Please make the two agree.`)
    }
  }

  if (t.mode === 'copy') {
    for (const { from, to } of t.files) {
      if (!existsSync(at(to))) {
        say(to, `${to} is missing. ${t.name} copies it from ${from} in GlimStone.`)
        continue
      }
      const others = [...new Set(markersIn(readFileSync(at(to))))].filter((v) => v !== t.version)
      if (others.length) say(to, `${to} says GlimStone ${others.join(', ')}, but glimstone.json says ${t.name} is on ${t.version}.`)
    }
  }
  return problems
}

export async function check(root, source) {
  let config
  try {
    config = readConfig(root)
  } catch (e) {
    if (e instanceof ConfigError) return { latest: null, problems: [{ file: configFile, message: e.message }] }
    throw e
  }
  const latest = await source.latest()
  const problems = []
  for (const t of config.targets) {
    problems.push(...behind(t, latest.version).map((message) => ({ file: configFile, message })))
    problems.push(...disagreements(root, t))
  }
  return { latest, problems }
}

function moveDependencies(text, version) {
  return text.replace(/("@glimstone\/[^"]+"\s*:\s*")([\^~]?)\d+\.\d+\.\d+(")/g, `$1$2${version}$3`)
}

function moveQuoted(text, from, to) {
  return text.replace(new RegExp(`(['"\`])${from.replaceAll('.', '\\.')}\\1`, 'g'), `$1${to}$1`)
}

// moveCopy puts the app's marker on the fresh copy. A file GlimStone ships
// with a marker has it rewritten; one without keeps the marker line the app
// put on top of its copy, so the copy still says what it was taken from.
function moveCopy(previous, fresh, version) {
  if (isBinary(fresh)) return fresh
  const text = fresh.toString('utf8')
  if (markersIn(fresh).length) return Buffer.from(text.replace(marker, `GlimStone ${version}`))
  const header = previous && !isBinary(previous) ? previous.toString('utf8').split('\n')[0] : ''
  if (!hasMarker.test(header)) return fresh
  return Buffer.from(`${header.replace(marker, `GlimStone ${version}`)}\n${text}`)
}

// demoteHeadings pushes the headings in a release's notes two levels down, so
// they sit under the release's own heading in the issue.
function demoteHeadings(notes) {
  let fenced = false
  return notes
    .split(/\r?\n/)
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) fenced = !fenced
      const m = !fenced && /^(#{1,6})(\s.*)$/.exec(line)
      return m ? `${'#'.repeat(Math.min(6, m[1].length + 2))}${m[2]}` : line
    })
    .join('\n')
}

function issueBody(targets, latest, releases) {
  const oldest = targets.map((t) => t.version).sort(compareVersions)[0]
  const between = releases
    .filter((r) => compareVersions(r.version, oldest) > 0 && compareVersions(r.version, latest.version) <= 0)
    .sort((a, b) => compareVersions(a.version, b.version))
  const parts = targets.map((t) => `- **${t.name}** is on ${t.version}${t.versionFile ? ` (\`${t.versionFile}\`)` : ''}`)
  const head = [
    `Hi! [GlimStone ${latest.version}](${latest.url}) is out. ${targets.length === 1 ? 'This part of the app is' : 'These parts of the app are'} ported by hand, so ${targets.length === 1 ? 'it waits' : 'they wait'} for you:`,
    parts.join('\n'),
    `Once a part is ported, set its \`version\` in glimstone.json to ${latest.version}, and in its version file where it has one. Until then the release check holds back the next tag. If a newer GlimStone comes out first, a fresh issue takes over from this one.`,
    `Here is what changed since ${oldest}, oldest first.`,
  ]
  const foot = 'Happy porting!'
  const section = (r) => `### [${r.version}](${r.url})\n\n${demoteHeadings(r.body.trim()) || 'This release came without notes.'}`
  const linked = []
  const full = [...between]
  const compose = () => {
    const older = linked.length ? [`The notes for ${linked.map((r) => `[${r.version}](${r.url})`).join(', ')} didn't fit here, you'll find them on their release pages.`] : []
    return [...head, ...older, ...full.map(section), foot].join('\n\n') + '\n'
  }
  let body = compose()
  while (body.length > issueLimit && full.length > 1) {
    linked.push(full.shift())
    body = compose()
  }
  return body
}

function writeIfChanged(root, path, content) {
  const target = join(root, path)
  const next = Buffer.isBuffer(content) ? content : Buffer.from(content)
  if (existsSync(target) && readFileSync(target).equals(next)) return false
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, next)
  return true
}

export async function update(root, source) {
  const config = readConfig(root)
  const latest = await source.latest()
  const files = new Set()
  const lockDirs = new Set()
  const ported = []
  let moved = false
  for (const t of config.targets) {
    if (compareVersions(t.version, latest.version) >= 0) continue
    if (t.mode === 'port') {
      ported.push(t)
      continue
    }
    if (t.mode === 'npm') {
      if (writeIfChanged(root, t.package, moveDependencies(readFileSync(join(root, t.package), 'utf8'), latest.version))) {
        files.add(t.package)
        lockDirs.add(posix.dirname(t.package))
      }
    }
    if (t.mode === 'copy') {
      for (const { from, to } of t.files) {
        const previous = existsSync(join(root, to)) ? readFileSync(join(root, to)) : null
        if (writeIfChanged(root, to, moveCopy(previous, await source.file(latest.tag, from), latest.version))) files.add(to)
      }
    }
    if (t.versionFile && writeIfChanged(root, t.versionFile, moveQuoted(readFileSync(join(root, t.versionFile), 'utf8'), t.version, latest.version))) {
      files.add(t.versionFile)
    }
    t.version = latest.version
    moved = true
  }
  if (moved && writeIfChanged(root, configFile, JSON.stringify(config, null, 2) + '\n')) files.add(configFile)
  const issue = ported.length ? { title: issueTitle(latest.version), body: issueBody(ported, latest, await source.releases()) } : null
  return { version: latest.version, files: [...files].sort(), lockDirs: [...lockDirs].sort(), issue }
}

function asRelease(json) {
  const version = String(json.tag_name ?? '').replace(/^v/, '')
  if (!semver.test(version)) throw new Error(`the GlimStone release ${JSON.stringify(json.tag_name)} has no x.y.z version`)
  return { version, tag: json.tag_name, url: json.html_url, body: json.body ?? '' }
}

export function github(env) {
  const api = `https://api.github.com/repos/${glimstoneRepo}`
  const headers = { accept: 'application/vnd.github+json', 'user-agent': 'glimstone-check' }
  if (env.GH_TOKEN) headers.authorization = `Bearer ${env.GH_TOKEN}`
  const get = async (url, auth = true) => {
    const res = await fetch(url, { headers: auth ? headers : { 'user-agent': headers['user-agent'] }, signal: AbortSignal.timeout(30_000) })
    if (!res.ok) throw new Error(`${url} answered ${res.status} ${res.statusText}`)
    return res
  }
  return {
    latest: async () => asRelease(await (await get(`${api}/releases/latest`)).json()),
    releases: async () => {
      const all = []
      for (let page = 1; ; page++) {
        const list = await (await get(`${api}/releases?per_page=100&page=${page}`)).json()
        all.push(...list.filter((r) => !r.draft && !r.prerelease).map(asRelease))
        if (list.length < 100) return all
      }
    },
    file: async (tag, path) => {
      const url = `https://raw.githubusercontent.com/${glimstoneRepo}/${encodeURIComponent(tag)}/${path.split('/').map(encodeURIComponent).join('/')}`
      return Buffer.from(await (await get(url, false)).arrayBuffer())
    },
  }
}

function options(args) {
  const opts = {}
  for (let i = 0; i < args.length; i += 2) {
    if (!['--repo', '--out'].includes(args[i]) || args[i + 1] === undefined) return null
    opts[args[i].slice(2)] = args[i + 1]
  }
  return opts
}

const usage = 'usage: node glimstone.mjs check [--repo DIR]\n       node glimstone.mjs update [--repo DIR] [--out DIR]\n'

export async function run(argv, { source, stdout, env }) {
  const [command, ...rest] = argv
  const opts = options(rest)
  if (!['check', 'update'].includes(command) || !opts) {
    stdout.write(usage)
    return 2
  }
  const root = opts.repo ?? process.cwd()
  const say = (line) => stdout.write(`${line}\n`)
  try {
    if (command === 'check') {
      const { latest, problems } = await check(root, source)
      for (const p of problems) say(`::error file=${p.file}::${p.message}`)
      if (problems.length) return 1
      say(`Every part follows GlimStone ${latest.version}, the newest release.`)
      return 0
    }
    const result = await update(root, source)
    const out = opts.out ?? join(tmpdir(), 'glimstone')
    mkdirSync(out, { recursive: true })
    writeFileSync(join(out, 'files'), result.files.map((f) => `${f}\n`).join(''))
    writeFileSync(join(out, 'lock-dirs'), result.lockDirs.map((d) => `${d}\n`).join(''))
    for (const f of result.files) say(`Updated ${f} for GlimStone ${result.version}.`)
    for (const d of result.lockDirs) say(`The lockfile in ${d} needs npm install --package-lock-only.`)
    if (result.issue) {
      writeFileSync(join(out, 'issue-title'), result.issue.title)
      writeFileSync(join(out, 'issue-body.md'), result.issue.body)
      say(`Drafted the issue "${result.issue.title}" in ${out}.`)
    }
    if (!result.files.length && !result.issue) say(`Everything is on GlimStone ${result.version} already.`)
    if (env.GITHUB_OUTPUT) {
      const outputs = {
        version: result.version,
        branch: branchName(result.version),
        changed: String(result.files.length > 0),
        issue: String(result.issue !== null),
      }
      appendFileSync(env.GITHUB_OUTPUT, Object.entries(outputs).map(([k, v]) => `${k}=${v}\n`).join(''))
    }
    return 0
  } catch (e) {
    if (e instanceof ConfigError) say(`::error file=${configFile}::${e.message}`)
    else if (command === 'check') say(`::error::Couldn't look up the newest GlimStone release (${e.message}). The check stays red until it gets an answer, so please try again in a moment.`)
    else say(`::error::${e.message}`)
    return 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await run(process.argv.slice(2), { source: github(process.env), stdout: process.stdout, env: process.env })
}
