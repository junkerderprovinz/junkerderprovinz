/**
 * Generates the GitHub profile header banner (dark, 1600x420):
 *   profile-banner.svg / .png  —  "Junker der Provinz" + tagline on Carbon #161616.
 *
 * Clean + modern: name in Bree Serif, tagline in Lato, a thin accent rule between
 * them; the whole text block is vertically centred on H/2 (house banner rule).
 * Text is rendered to SVG paths (opentype.js) so the SVG needs NO font. Dark hero
 * reads on both GitHub themes. Deps (global): opentype.js, @resvg/resvg-js.
 * Run: node .github/assets/gen-profile-banner.mjs
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

// ---- content + styling -----------------------------------------------------
const NAME = "Junker der Provinz";
const TAG = "Free, private, self-hosted tools for Unraid & Docker.";
const W = 1600, H = 420;
const BG = "#161616";          // IBM Carbon (house dark)
const NAME_FILL = "#f4f4f4";
const TAG_FILL = "#9a9a9a";
const RULE_FILL = "#525252";   // monochrome accent (house palette)
const maxNameW = 1120, maxTagW = 1000;
const gapNameRule = 34, gapRuleTag = 34, ruleW = 132, ruleH = 3;
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

// NaN-safe size fit (some Lato glyphs emit NaN at certain sizes — step down)
function fitSize(fnt, text, maxW, cap) {
  let size = Math.min(cap, Math.floor(100 * maxW / fnt.getAdvanceWidth(text, 100)));
  for (; size > 10; size--) {
    if (!fnt.getPath(text, 0, 0, size).toPathData(2).includes("NaN")) return size;
  }
  throw new Error("no NaN-free size");
}
const nameSize = fitSize(bree, NAME, maxNameW, 132);
const tagSize = fitSize(lato, TAG, maxTagW, 46);

// vertically centre the block { name + rule + tagline } on H/2
const sc = (fnt, s) => s / fnt.unitsPerEm;
const nameAsc = bree.ascender * sc(bree, nameSize);
const tagAsc = lato.ascender * sc(lato, tagSize);
const tagDesc = -lato.descender * sc(lato, tagSize);
const blockH = nameAsc + gapNameRule + ruleH + gapRuleTag + tagAsc + tagDesc;
const top = H / 2 - blockH / 2;
const nameBaseline = Math.round(top + nameAsc);
const ruleY = Math.round(nameBaseline + gapNameRule);
const tagBaseline = Math.round(ruleY + ruleH + gapRuleTag + tagAsc);

const nameX = (W - bree.getAdvanceWidth(NAME, nameSize)) / 2;
const tagX = (W - lato.getAdvanceWidth(TAG, tagSize)) / 2;
const namePath = bree.getPath(NAME, nameX, nameBaseline, nameSize).toPathData(2);
const tagPath = lato.getPath(TAG, tagX, tagBaseline, tagSize).toPathData(2);

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Junker der Provinz">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <path d="${namePath}" fill="${NAME_FILL}"/>
  <rect x="${(W - ruleW) / 2}" y="${ruleY}" width="${ruleW}" height="${ruleH}" rx="1.5" fill="${RULE_FILL}"/>
  <path d="${tagPath}" fill="${TAG_FILL}"/>
</svg>
`;
writeFileSync(join(__dir, "profile-banner.svg"), svg);
const png = new Resvg(svg, { fitTo: { mode: "width", value: W } }).render().asPng();
writeFileSync(join(__dir, "profile-banner.png"), png);
console.log(`profile banner ok: ${W}x${H}, name ${nameSize}px, tag ${tagSize}px, png ${png.length} bytes`);
