import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, test } from 'node:test'

import { check, issueTitle, run, update } from './glimstone.mjs'

const release = (version, body = `Notes for ${version}.`) => ({
  version,
  tag: `v${version}`,
  url: `https://github.com/junkerderprovinz/glimstone/releases/tag/v${version}`,
  body,
})

// fakeSource stands in for GitHub: releases newest first, as the API lists
// them, and the files of the repository at each tag.
function fakeSource(versions, files = {}) {
  const releases = versions.map((v) => (typeof v === 'string' ? release(v) : v))
  return {
    latest: async () => releases[0],
    releases: async () => releases,
    file: async (tag, path) => {
      const text = files[tag]?.[path]
      if (text === undefined) throw new Error(`no ${path} at ${tag}`)
      return Buffer.from(text)
    },
  }
}

const dirs = []
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true })
})

function repo(tree) {
  const root = mkdtempSync(join(tmpdir(), 'glimstone-'))
  dirs.push(root)
  for (const [path, content] of Object.entries(tree)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), typeof content === 'string' ? content : JSON.stringify(content, null, 2) + '\n')
  }
  return root
}

const read = (root, path) => readFileSync(join(root, path), 'utf8')

const pkg = (deps) => ({ name: 'web', dependencies: { vue: '^3.5.0', ...deps } })

test('a repo whose targets all follow the newest release passes', async () => {
  const root = repo({
    'glimstone.json': {
      targets: [
        { name: 'web', mode: 'npm', version: '4.3.7', package: 'web/package.json', versionFile: 'web/src/version.ts' },
        { name: 'plugin', mode: 'copy', version: '4.3.7', files: [{ from: 'packages/core/tokens.css', to: 'plugin/tokens.css' }] },
        { name: 'phone', mode: 'port', version: '4.3.7' },
      ],
    },
    'web/package.json': pkg({ '@glimstone/core': '4.3.7', '@glimstone/vue': '^4.3.7' }),
    'web/src/version.ts': "export const GLIMSTONE_VERSION = '4.3.7'\n",
    'plugin/tokens.css': '/* GlimStone 4.3.7 */\n:root {}\n',
  })
  const result = await check(root, fakeSource(['4.3.7']))
  assert.deepEqual(result.problems, [])
})

test('a missing glimstone.json fails the check', async () => {
  const root = repo({ 'README.md': 'hi' })
  const { problems } = await check(root, fakeSource(['4.3.7']))
  assert.equal(problems.length, 1)
  assert.equal(problems[0].file, 'glimstone.json')
  assert.match(problems[0].message, /no glimstone\.json/)
})

test('a glimstone.json that is not JSON fails the check', async () => {
  const root = repo({ 'glimstone.json': '{ "targets": [' })
  const { problems } = await check(root, fakeSource(['4.3.7']))
  assert.equal(problems[0].file, 'glimstone.json')
  assert.match(problems[0].message, /not valid JSON/)
})

test('an unknown mode is named with the target it belongs to', async () => {
  const root = repo({ 'glimstone.json': { targets: [{ name: 'web', mode: 'vendor', version: '4.3.7' }] } })
  const { problems } = await check(root, fakeSource(['4.3.7']))
  assert.match(problems[0].message, /web.*mode.*npm, copy or port/)
})

test('a misspelt key is not silently ignored', async () => {
  const root = repo({ 'glimstone.json': { targets: [{ name: 'phone', mode: 'port', version: '4.3.7', versionfile: 'v.ts' }] } })
  const { problems } = await check(root, fakeSource(['4.3.7']))
  assert.match(problems[0].message, /versionfile/)
})

test('a version that is not x.y.z is refused', async () => {
  const root = repo({ 'glimstone.json': { targets: [{ name: 'phone', mode: 'port', version: 'v4.3' }] } })
  const { problems } = await check(root, fakeSource(['4.3.7']))
  assert.match(problems[0].message, /phone.*version/)
})

test('a stale npm target points to the branch the update keeps ready', async () => {
  const root = repo({
    'glimstone.json': { targets: [{ name: 'web', mode: 'npm', version: '4.3.4', package: 'package.json' }] },
    'package.json': pkg({ '@glimstone/core': '4.3.4' }),
  })
  const { problems } = await check(root, fakeSource(['4.3.7', '4.3.4']))
  assert.equal(problems.length, 1)
  assert.equal(problems[0].file, 'glimstone.json')
  assert.match(problems[0].message, /web.*4\.3\.4.*4\.3\.7/)
  assert.match(problems[0].message, /chore\/glimstone-4\.3\.7/)
})

test('a stale port target asks for the port and the bump', async () => {
  const root = repo({
    'glimstone.json': { targets: [{ name: 'phone', mode: 'port', version: '4.2.0', versionFile: 'mobile/version.ts' }] },
    'mobile/version.ts': "export const version = '4.2.0'\n",
  })
  const { problems } = await check(root, fakeSource(['4.3.7', '4.2.0']))
  assert.equal(problems.length, 1)
  assert.match(problems[0].message, /phone.*4\.2\.0.*4\.3\.7/)
  assert.match(problems[0].message, /port/i)
  assert.match(problems[0].message, /mobile\/version\.ts/)
  assert.ok(problems[0].message.includes(issueTitle('4.3.7')))
})

test('a version ahead of the newest release is refused', async () => {
  const root = repo({ 'glimstone.json': { targets: [{ name: 'phone', mode: 'port', version: '4.4.0' }] } })
  const { problems } = await check(root, fakeSource(['4.3.7']))
  assert.match(problems[0].message, /4\.4\.0.*4\.3\.7/)
})

test('an npm dependency on another version fails the check', async () => {
  const root = repo({
    'glimstone.json': { targets: [{ name: 'web', mode: 'npm', version: '4.3.7', package: 'web/package.json' }] },
    'web/package.json': pkg({ '@glimstone/core': '4.3.7', '@glimstone/react': '^4.3.3' }),
  })
  const { problems } = await check(root, fakeSource(['4.3.7']))
  assert.equal(problems.length, 1)
  assert.equal(problems[0].file, 'web/package.json')
  assert.match(problems[0].message, /@glimstone\/react.*\^4\.3\.3/)
})

test('a caret or tilde on the version counts as that version', async () => {
  const root = repo({
    'glimstone.json': { targets: [{ name: 'web', mode: 'npm', version: '4.3.7', package: 'package.json' }] },
    'package.json': { dependencies: { '@glimstone/core': '^4.3.7' }, devDependencies: { '@glimstone/vue': '~4.3.7' } },
  })
  const { problems } = await check(root, fakeSource(['4.3.7']))
  assert.deepEqual(problems, [])
})

test('an npm target whose package has no GlimStone dependency fails the check', async () => {
  const root = repo({
    'glimstone.json': { targets: [{ name: 'web', mode: 'npm', version: '4.3.7', package: 'package.json' }] },
    'package.json': pkg({}),
  })
  const { problems } = await check(root, fakeSource(['4.3.7']))
  assert.match(problems[0].message, /no @glimstone/)
})

test('a version file that names another version fails the check', async () => {
  const root = repo({
    'glimstone.json': { targets: [{ name: 'phone', mode: 'port', version: '4.3.7', versionFile: 'mobile/version.ts' }] },
    'mobile/version.ts': "export const version = '4.3.6'\n",
  })
  const { problems } = await check(root, fakeSource(['4.3.7']))
  assert.equal(problems[0].file, 'mobile/version.ts')
  assert.match(problems[0].message, /4\.3\.6/)
})

test('a missing version file fails the check', async () => {
  const root = repo({ 'glimstone.json': { targets: [{ name: 'phone', mode: 'port', version: '4.3.7', versionFile: 'mobile/version.ts' }] } })
  const { problems } = await check(root, fakeSource(['4.3.7']))
  assert.equal(problems[0].file, 'mobile/version.ts')
  assert.match(problems[0].message, /missing/)
})

test('a missing copied file fails the check', async () => {
  const root = repo({
    'glimstone.json': { targets: [{ name: 'plugin', mode: 'copy', version: '4.3.7', files: [{ from: 'packages/core/tokens.css', to: 'plugin/tokens.css' }] }] },
  })
  const { problems } = await check(root, fakeSource(['4.3.7']))
  assert.equal(problems[0].file, 'plugin/tokens.css')
  assert.match(problems[0].message, /missing/)
})

test('a copied file whose marker names another version fails the check', async () => {
  const root = repo({
    'glimstone.json': {
      targets: [
        {
          name: 'plugin',
          mode: 'copy',
          version: '4.3.7',
          files: [
            { from: 'a.css', to: 'plugin/a.css' },
            { from: 'b.css', to: 'plugin/b.css' },
          ],
        },
      ],
    },
    'plugin/a.css': '/* GlimStone 4.3.5 */\n',
    'plugin/b.css': ':root {}\n',
  })
  const { problems } = await check(root, fakeSource(['4.3.7']))
  assert.equal(problems.length, 1)
  assert.equal(problems[0].file, 'plugin/a.css')
  assert.match(problems[0].message, /4\.3\.5/)
})

test('update moves npm dependencies, keeping their prefix, and bumps the versions', async () => {
  const root = repo({
    'glimstone.json': { targets: [{ name: 'web', mode: 'npm', version: '4.3.4', package: 'web/package.json', versionFile: 'web/src/version.ts' }] },
    'web/package.json': pkg({ '@glimstone/core': '4.3.4', '@glimstone/vue': '^4.3.4' }),
    'web/src/version.ts': "export const GLIMSTONE_VERSION = '4.3.4'\n",
  })
  const result = await update(root, fakeSource(['4.3.7', '4.3.4']))
  assert.equal(result.version, '4.3.7')
  assert.deepEqual(result.files.sort(), ['glimstone.json', 'web/package.json', 'web/src/version.ts'])
  assert.deepEqual(result.lockDirs, ['web'])
  assert.equal(result.issue, null)
  const deps = JSON.parse(read(root, 'web/package.json')).dependencies
  assert.deepEqual(deps, { vue: '^3.5.0', '@glimstone/core': '4.3.7', '@glimstone/vue': '^4.3.7' })
  assert.equal(read(root, 'web/src/version.ts'), "export const GLIMSTONE_VERSION = '4.3.7'\n")
  assert.equal(JSON.parse(read(root, 'glimstone.json')).targets[0].version, '4.3.7')
})

test('update copies the files at the new tag and moves their marker', async () => {
  const root = repo({
    'glimstone.json': {
      targets: [
        {
          name: 'plugin',
          mode: 'copy',
          version: '4.3.4',
          files: [
            { from: 'packages/core/tokens.css', to: 'plugin/tokens.css' },
            { from: 'reference/glyphs.json', to: 'plugin/glyphs.json' },
          ],
        },
      ],
    },
    'plugin/tokens.css': '/* GlimStone 4.3.4 */\n:root { --old: 1 }\n',
    'plugin/glyphs.json': '{"old":true}\n',
  })
  const source = fakeSource(['4.3.7', '4.3.4'], {
    'v4.3.7': {
      'packages/core/tokens.css': '/* GlimStone 4.3.7 */\n:root { --new: 1 }\n',
      'reference/glyphs.json': '{"new":true}\n',
    },
  })
  const result = await update(root, source)
  assert.deepEqual(result.files.sort(), ['glimstone.json', 'plugin/glyphs.json', 'plugin/tokens.css'])
  assert.deepEqual(result.lockDirs, [])
  assert.equal(read(root, 'plugin/tokens.css'), '/* GlimStone 4.3.7 */\n:root { --new: 1 }\n')
  assert.equal(read(root, 'plugin/glyphs.json'), '{"new":true}\n')
})

test('a marker line the app added to its copy survives the update', async () => {
  const root = repo({
    'glimstone.json': { targets: [{ name: 'plugin', mode: 'copy', version: '4.3.4', files: [{ from: 'tokens.css', to: 'plugin/tokens.css' }] }] },
    'plugin/tokens.css': '/* Copied from GlimStone 4.3.4, tokens.css */\n:root { --old: 1 }\n',
  })
  const source = fakeSource(['4.3.7'], { 'v4.3.7': { 'tokens.css': ':root { --new: 1 }\n' } })
  await update(root, source)
  assert.equal(read(root, 'plugin/tokens.css'), '/* Copied from GlimStone 4.3.7, tokens.css */\n:root { --new: 1 }\n')
})

test('update leaves a current repo untouched', async () => {
  const tree = {
    'glimstone.json': {
      targets: [
        { name: 'web', mode: 'npm', version: '4.3.7', package: 'package.json' },
        { name: 'phone', mode: 'port', version: '4.3.7' },
      ],
    },
    'package.json': pkg({ '@glimstone/core': '^4.3.7' }),
  }
  const root = repo(tree)
  const before = read(root, 'glimstone.json') + read(root, 'package.json')
  const result = await update(root, fakeSource(['4.3.7']))
  assert.deepEqual(result.files, [])
  assert.equal(result.issue, null)
  assert.equal(read(root, 'glimstone.json') + read(root, 'package.json'), before)
})

test('update writes nothing for a port target and drafts the issue instead', async () => {
  const root = repo({
    'glimstone.json': { targets: [{ name: 'phone', mode: 'port', version: '4.3.4', versionFile: 'mobile/version.ts' }] },
    'mobile/version.ts': "export const version = '4.3.4'\n",
  })
  const before = read(root, 'glimstone.json') + read(root, 'mobile/version.ts')
  const source = fakeSource([release('4.3.7', 'Seven.\n\n## Fixed\n\n- A thing.'), '4.3.6', '4.3.5', '4.3.4', '4.3.3'])
  const result = await update(root, source)
  assert.deepEqual(result.files, [])
  assert.equal(read(root, 'glimstone.json') + read(root, 'mobile/version.ts'), before)
  assert.equal(result.issue.title, issueTitle('4.3.7'))
  const body = result.issue.body
  assert.match(body, /phone/)
  assert.match(body, /4\.3\.4/)
  assert.match(body, /mobile\/version\.ts/)
  for (const v of ['4.3.5', '4.3.6', '4.3.7']) assert.ok(body.includes(`[${v}](https://github.com/junkerderprovinz/glimstone/releases/tag/v${v})`), v)
  assert.ok(!body.includes('Notes for 4.3.4.'))
  assert.ok(!body.includes('Notes for 4.3.3.'))
  assert.ok(body.indexOf('Notes for 4.3.5.') < body.indexOf('Notes for 4.3.6.'), 'oldest first')
  assert.match(body, /^#### Fixed$/m, 'headings in the notes sit below the release headings')
})

test('an issue too long for GitHub keeps the newest notes and links the older ones', async () => {
  const root = repo({ 'glimstone.json': { targets: [{ name: 'phone', mode: 'port', version: '1.0.0' }] } })
  const versions = Array.from({ length: 40 }, (_, i) => release(`2.${39 - i}.0`, `${'x'.repeat(4000)} end of 2.${39 - i}.0`))
  const result = await update(root, fakeSource(versions))
  const body = result.issue.body
  assert.ok(body.length < 65536, `${body.length} characters`)
  assert.ok(body.includes('end of 2.39.0'))
  assert.ok(!body.includes('end of 2.0.0'))
  assert.ok(body.includes('[2.0.0](https://github.com/junkerderprovinz/glimstone/releases/tag/v2.0.0)'))
})

test('after an update the npm and copy targets pass the check', async () => {
  const root = repo({
    'glimstone.json': {
      targets: [
        { name: 'web', mode: 'npm', version: '4.3.4', package: 'package.json' },
        { name: 'plugin', mode: 'copy', version: '4.3.4', versionFile: 'plugin/version.js', files: [{ from: 'tokens.css', to: 'plugin/tokens.css' }] },
      ],
    },
    'package.json': pkg({ '@glimstone/core': '~4.3.4' }),
    'plugin/version.js': 'const GLS_VER = "4.3.4"\n',
    'plugin/tokens.css': '/* GlimStone 4.3.4 */\n',
  })
  const source = fakeSource(['4.3.7'], { 'v4.3.7': { 'tokens.css': ':root {}\n' } })
  assert.notDeepEqual((await check(root, source)).problems, [])
  await update(root, source)
  assert.deepEqual((await check(root, source)).problems, [])
})

function capture() {
  const lines = []
  return { lines, write: (text) => lines.push(...text.trimEnd().split('\n')) }
}

test('check prints each problem as a workflow error and exits non-zero', async () => {
  const root = repo({
    'glimstone.json': { targets: [{ name: 'web', mode: 'npm', version: '4.3.4', package: 'package.json' }] },
    'package.json': pkg({ '@glimstone/core': '4.3.4' }),
  })
  const out = capture()
  const code = await run(['check', '--repo', root], { source: fakeSource(['4.3.7']), stdout: out, env: {} })
  assert.equal(code, 1)
  assert.ok(out.lines.some((l) => l.startsWith('::error file=glimstone.json::') && l.includes('web')), out.lines.join('\n'))
})

test('a failed release lookup fails the check with a clear error', async () => {
  const root = repo({ 'glimstone.json': { targets: [{ name: 'phone', mode: 'port', version: '4.3.7' }] } })
  const source = { latest: async () => { throw new Error('api.github.com answered 503') } }
  const out = capture()
  const code = await run(['check', '--repo', root], { source, stdout: out, env: {} })
  assert.equal(code, 1)
  assert.ok(out.lines.some((l) => l.startsWith('::error::') && l.includes('503')), out.lines.join('\n'))
})

test('update hands its results to the workflow', async () => {
  const root = repo({
    'glimstone.json': {
      targets: [
        { name: 'web', mode: 'npm', version: '4.3.4', package: 'web/package.json' },
        { name: 'phone', mode: 'port', version: '4.3.4' },
      ],
    },
    'web/package.json': pkg({ '@glimstone/core': '4.3.4' }),
  })
  const outDir = join(root, '..', `${root.split(/[\\/]/).pop()}-out`)
  dirs.push(outDir)
  const githubOutput = join(outDir, 'github-output')
  mkdirSync(outDir, { recursive: true })
  const out = capture()
  const code = await run(['update', '--repo', root, '--out', outDir], {
    source: fakeSource(['4.3.7', '4.3.4']),
    stdout: out,
    env: { GITHUB_OUTPUT: githubOutput },
  })
  assert.equal(code, 0)
  const outputs = readFileSync(githubOutput, 'utf8')
  assert.match(outputs, /^version=4\.3\.7$/m)
  assert.match(outputs, /^branch=chore\/glimstone-4\.3\.7$/m)
  assert.match(outputs, /^changed=true$/m)
  assert.match(outputs, /^issue=true$/m)
  assert.equal(readFileSync(join(outDir, 'files'), 'utf8'), 'glimstone.json\nweb/package.json\n')
  assert.equal(readFileSync(join(outDir, 'lock-dirs'), 'utf8'), 'web\n')
  assert.equal(readFileSync(join(outDir, 'issue-title'), 'utf8'), issueTitle('4.3.7'))
  assert.ok(readFileSync(join(outDir, 'issue-body.md'), 'utf8').includes('phone'))
})

test('update on a current repo tells the workflow there is nothing to do', async () => {
  const root = repo({ 'glimstone.json': { targets: [{ name: 'phone', mode: 'port', version: '4.3.7' }] } })
  const outDir = join(root, 'out')
  const githubOutput = join(root, 'github-output')
  const code = await run(['update', '--repo', root, '--out', outDir], { source: fakeSource(['4.3.7']), stdout: capture(), env: { GITHUB_OUTPUT: githubOutput } })
  assert.equal(code, 0)
  const outputs = readFileSync(githubOutput, 'utf8')
  assert.match(outputs, /^changed=false$/m)
  assert.match(outputs, /^issue=false$/m)
  assert.ok(!existsSync(join(outDir, 'issue-title')))
})

test('an unknown subcommand prints the usage', async () => {
  const out = capture()
  const code = await run(['frobnicate'], { source: fakeSource(['4.3.7']), stdout: out, env: {} })
  assert.equal(code, 2)
  assert.match(out.lines.join('\n'), /check[\s\S]*update/)
})
