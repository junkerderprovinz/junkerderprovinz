/**
 * Generates the GitHub profile banners as theme-flipping pairs so they blend into
 * BOTH GitHub themes (light `#ffffff`, dark `#0d1117`) with no visible edge:
 *
 *   profile-banner.{svg,png} / profile-banner-dark.{svg,png}   hero: name + tagline
 *   section-<slug>.{svg,png} / section-<slug>-dark.{svg,png}    slim section headers
 *
 * The README serves each via <picture> (dark srcset + light default). Text is
 * rendered to SVG paths (opentype.js) so the SVG needs NO font. Text blocks are
 * vertically centred on H/2 (house banner rule). Deps (global): opentype.js,
 * @resvg/resvg-js. Run: node .github/assets/gen-profile-banner.mjs
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";

const require = createRequire(import.meta.url);
const groot = execSync("npm root -g").toString().trim();
const opentype = require(`${groot}/opentype.js`);
const { Resvg } = require(`${groot}/@resvg/resvg-js`);
const __dir = dirname(fileURLToPath(import.meta.url));

// ---- content --------------------------------------------------------------
const NAME = "Junker der Provinz";
const TAG = "Free, private, self-hosted tools for Unraid & Docker.";
const SECTIONS = [
  { slug: "containers", title: "Containers" },
  { slug: "templates", title: "Templates" },
  { slug: "plugins", title: "Plugins" },
  { slug: "extras", title: "Feed & extras" },
  { slug: "focus", title: "Focus" },
  { slug: "support", title: "Support" },
];

// One entry per GitHub theme; bg matches the GitHub canvas so the banner blends in.
const THEMES = [
  { suffix: "", bg: "#ffffff", fg: "#1f2328", sub: "#59636e", rule: "#d0d7de", accent: "#8b949e" },
  { suffix: "-dark", bg: "#0d1117", fg: "#f0f6fc", sub: "#9198a1", rule: "#30363d", accent: "#6e7681" },
];
// ---------------------------------------------------------------------------

async function font(file, url) {
  const p = join(tmpdir(), file);
  if (!existsSync(p)) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${file} fetch ${r.status}`);
    writeFileSync(p, Buffer.from(await r.arrayBuffer()));
  }
  const b = readFileSync(p);
  return opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
}
const bree = await font("jdp-BreeSerif-Regular.ttf", "https://github.com/google/fonts/raw/main/ofl/breeserif/BreeSerif-Regular.ttf");
const lato = await font("jdp-Lato-Regular.ttf", "https://github.com/google/fonts/raw/main/ofl/lato/Lato-Regular.ttf");

// NaN-safe size fit (some Lato glyphs emit NaN at certain sizes — step down).
function fitSize(fnt, text, maxW, cap) {
  let size = Math.min(cap, Math.floor((100 * maxW) / fnt.getAdvanceWidth(text, 100)));
  for (; size > 10; size--) {
    if (!fnt.getPath(text, 0, 0, size).toPathData(2).includes("NaN")) return size;
  }
  throw new Error("no NaN-free size");
}
const sc = (fnt, s) => s / fnt.unitsPerEm;
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function emit(name, svg, bg) {
  writeFileSync(join(__dir, `${name}.svg`), svg);
  const png = new Resvg(svg, { background: bg, fitTo: { mode: "original" } }).render().asPng();
  writeFileSync(join(__dir, `${name}.png`), png);
}

// ---- hero (name + rule + tagline, centred) --------------------------------
const HW = 1600, HH = 420;
const nameSize = fitSize(bree, NAME, 1120, 132);
const tagSize = fitSize(lato, TAG, 1000, 46);
// decorative hero rule: the user's flourish SVG, embedded 1:1 and recoloured per theme
const ornRaw = readFileSync(join(__dir, "hero-rule-ornament.svg"), "utf8");
const ornM = ornRaw.match(/viewBox="[\d.\-]+\s+[\d.\-]+\s+([\d.]+)\s+([\d.]+)"/);
const ornVW = parseFloat(ornM[1]), ornVH = parseFloat(ornM[2]);
const ornGeom = [...ornRaw.matchAll(/<(?:path|polygon)\b[^>]*\/>/g)].map((m) => m[0].replace(/\s*class="[^"]*"/, "")).join("");
const ornWidth = 520, ornScale = ornWidth / ornVW, ornHeight = ornVH * ornScale;
const ornX = (HW - ornWidth) / 2;
const gapNameRule = 30, gapRuleTag = 30;
const nameAsc = bree.ascender * sc(bree, nameSize);
const tagAsc = lato.ascender * sc(lato, tagSize);
const tagDesc = -lato.descender * sc(lato, tagSize);
const heroBlockH = nameAsc + gapNameRule + ornHeight + gapRuleTag + tagAsc + tagDesc;
const heroTop = HH / 2 - heroBlockH / 2;
const nameBaseline = Math.round(heroTop + nameAsc);
const ornY = Math.round(nameBaseline + gapNameRule);
const tagBaseline = Math.round(ornY + ornHeight + gapRuleTag + tagAsc);
const nameX = (HW - bree.getAdvanceWidth(NAME, nameSize)) / 2;
const tagX = (HW - lato.getAdvanceWidth(TAG, tagSize)) / 2;
const namePath = bree.getPath(NAME, nameX, nameBaseline, nameSize).toPathData(2);
const tagPath = lato.getPath(TAG, tagX, tagBaseline, tagSize).toPathData(2);

for (const t of THEMES) {
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${HW} ${HH}" width="${HW}" height="${HH}" role="img" aria-label="Junker der Provinz">
  <rect width="${HW}" height="${HH}" fill="${t.bg}"/>
  <path d="${namePath}" fill="${t.fg}"/>
  <g transform="translate(${ornX},${ornY}) scale(${ornScale.toFixed(4)})" fill="${t.fg}">${ornGeom}</g>
  <path d="${tagPath}" fill="${t.sub}"/>
</svg>
`;
  emit(`profile-banner${t.suffix}`, svg, t.bg);
}

// ---- slim section headers (title left of an accent bar) --------------------
// Section banners render at a FIXED display width (SECTION_W), not width=100%, so
// the title's pixel position is independent of GitHub's column width. Coords are 2x
// (SW = 2 * SECTION_W) for crispness; displayed at half scale the title lands at 32px
// = GitHub's list-text indent (ul padding-left: 2em), flush with the list below, and
// the accent bar lands in the bullet gutter. The README sets <img width="480">.
const SECTION_W = 480;
const SW = SECTION_W * 2, SH = 112, barX = 30, barW = 8;
// The title's VISIBLE ink must start on the list-text indent (2em = 32px = 64 in
// these 2x coords) so it lines up flush with the markdown list below. We place the
// pen at TITLE_X - glyph-left-bearing (via the path bounding box), NOT the pen
// itself at TITLE_X, otherwise the serif's left side bearing pushes the visible
// text a few px to the right of the list text (the misalignment jdp kept seeing).
const TITLE_X = 64;
const penFor = (fnt, text, y, size) => TITLE_X - fnt.getPath(text, 0, y, size).getBoundingBox().x1;
// Largest size <= 60 at which every section title renders NaN-free at its real
// (bbox-aligned) pen position; opentype.js can emit a NaN at the render coords
// even when (0,0) is clean (that silently truncated "Templates" -> "T"), and the
// baseline depends on the size, so pick both together.
let titleSize, sAsc, sDesc, sBaseline;
for (let size = 60; size > 10; size--) {
  sAsc = bree.ascender * sc(bree, size);
  sDesc = -bree.descender * sc(bree, size);
  sBaseline = Math.round(SH / 2 - (sAsc + sDesc) / 2 + sAsc);
  if (SECTIONS.every((s) => !bree.getPath(s.title, penFor(bree, s.title, sBaseline, size), sBaseline, size).toPathData(2).includes("NaN"))) {
    titleSize = size;
    break;
  }
}
if (!titleSize) throw new Error("no NaN-free section title size");
const barTop = Math.round(SH / 2 - (sAsc + sDesc) / 2);
const barH = Math.round(sAsc + sDesc);

for (const s of SECTIONS) {
  // Align each title's visible ink left edge to TITLE_X (the list-text indent).
  const titlePath = bree.getPath(s.title, penFor(bree, s.title, sBaseline, titleSize), sBaseline, titleSize).toPathData(2);
  for (const t of THEMES) {
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SW} ${SH}" width="${SW}" height="${SH}" role="img" aria-label="${esc(s.title)}">
  <rect width="${SW}" height="${SH}" fill="${t.bg}"/>
  <rect x="${barX}" y="${barTop}" width="${barW}" height="${barH}" rx="4" fill="${t.accent}"/>
  <path d="${titlePath}" fill="${t.fg}"/>
</svg>
`;
    emit(`section-${s.slug}${t.suffix}`, svg, t.bg);
  }
}

console.log(`profile banners ok: hero (${HW}x${HH}) + ${SECTIONS.length} sections (${SW}x${SH}), light+dark`);
