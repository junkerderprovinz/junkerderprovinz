/**
 * Generates the GitHub profile banners as theme-flipping pairs so they blend into
 * BOTH GitHub themes (light `#ffffff`, dark `#0d1117`) with no visible edge:
 *
 *   profile-banner.{svg,png} / profile-banner-dark.{svg,png}   hero: name + tagline
 *   section-<slug>.{svg,png} / section-<slug>-dark.{svg,png}    slim section headers
 *
 * The README serves each via <picture> (dark srcset + light default), pointing at
 * the SVG rather than the PNG: the hero is ANIMATED, and only the SVG can carry it.
 * The PNGs stay generated as a still fallback for anywhere SVG is not welcome.
 *
 * Text is rendered to SVG paths (opentype.js) so the SVG needs NO font. Section
 * headers are centred on their height; the hero is anchored near its top and sizes
 * its own canvas around the text block. Deps (global): opentype.js, @resvg/resvg-js.
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

// ---- content --------------------------------------------------------------
const NAME = "Junker der Provinz";
// Deliberately says nothing about WHERE the software runs. The old line ended in
// "tools for Unraid & Docker", which stopped being true once the apps outgrew the
// NAS: a desktop downloader, browser extensions, plain programs. A claim that
// names platforms has to be rewritten every time a new one is added, so this one
// names none.
const TAG = "One knight's crusade: free, private, good-looking software.";
const SECTIONS = [
  { slug: "apps", title: "Apps" },
  { slug: "images", title: "Images" },
  { slug: "wrappers", title: "Wrappers" },
  { slug: "plugins", title: "Plugins" },
  { slug: "themes", title: "Themes" },
  { slug: "feed", title: "Feed" },
  { slug: "focus", title: "Focus" },
  { slug: "support", title: "Support" },
];

// One entry per GitHub theme; bg matches the GitHub canvas so the banner blends in.
// `sheen` is the colour of the light that sweeps across the name (see the hero
// section). It is GOLD rather than white or black on purpose: the name is near-black
// on the light ground and near-white on the dark one, so a brightness-based sheen
// would be invisible on one of the two. A hue shift reads on both, and gold is the
// metal the rest of the brand is already made of.
const THEMES = [
  { suffix: "", bg: "#ffffff", fg: "#1f2328", sub: "#59636e", rule: "#d0d7de", accent: "#8b949e", sheen: "#a67c11" },
  { suffix: "-dark", bg: "#0d1117", fg: "#f0f6fc", sub: "#9198a1", rule: "#30363d", accent: "#6e7681", sheen: "#e3bf62" },
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

// Writes the .svg, and renders the .png from `still` - which defaults to the same
// markup but MUST be passed separately for anything animated. resvg has no timeline:
// it rasterises the document as authored, so an element that starts at opacity 0 and
// animates up renders as nothing at all. The hero passes its pre-animation markup
// here; without that the PNG fallback would silently be an empty coloured rectangle.
function emit(name, svg, bg, still = svg) {
  writeFileSync(join(__dir, `${name}.svg`), svg);
  const png = new Resvg(still, { background: bg, fitTo: { mode: "original" } }).render().asPng();
  writeFileSync(join(__dir, `${name}.png`), png);
}

// ---- hero (name + rule + tagline) -----------------------------------------
const HW = 1600;
// The name gets 1280 of the 1600 canvas and a 176px cap (was 1120/132). It is the
// one thing a profile banner exists to say, and at the old size it was carrying
// about as much weight as the claim underneath it.
const nameSize = fitSize(bree, NAME, 1280, 176);
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
const nameDesc = -bree.descender * sc(bree, nameSize);
const tagAsc = lato.ascender * sc(lato, tagSize);
const tagDesc = -lato.descender * sc(lato, tagSize);
const heroBlockH = nameAsc + gapNameRule + ornHeight + gapRuleTag + tagAsc + tagDesc;
// Anchored near the top instead of optically centred on HH/2. The ascent of a 176px
// Bree Serif is mostly empty space above the caps, so a block centred by its metrics
// LOOKS low even when the arithmetic is even; a fixed top edge puts the name where
// the eye expects it and leaves the slack under the claim, where it reads as air.
const heroTop = 34;
// The canvas is derived from the block, not fixed at some round number the block
// then has to live inside. A fixed height only stays balanced for one particular
// length of claim: the moment the text changes the slack all collects at the bottom.
// Slightly more room below than above, which is where the eye expects the weight.
const HH = Math.round(heroTop + heroBlockH + 52);
const nameBaseline = Math.round(heroTop + nameAsc);
const ornY = Math.round(nameBaseline + gapNameRule);
const tagBaseline = Math.round(ornY + ornHeight + gapRuleTag + tagAsc);
const nameX = (HW - bree.getAdvanceWidth(NAME, nameSize)) / 2;
const tagX = (HW - lato.getAdvanceWidth(TAG, tagSize)) / 2;
const namePath = bree.getPath(NAME, nameX, nameBaseline, nameSize).toPathData(2);
const tagPath = lato.getPath(TAG, tagX, tagBaseline, tagSize).toPathData(2);

// ---- hero animation --------------------------------------------------------
// GitHub serves an <img>-embedded SVG through camo with Content-Type image/svg+xml,
// which is exactly what the hosted animation services other profiles use return - so
// the movement can live in this repo's own asset instead of on somebody else's
// server. Nothing external is fetched and nothing breaks if a third party goes down.
//
// CSS animation, not SMIL: SMIL cannot be switched off for a reader who asked their
// system for less motion, and CSS can (see the reduced-motion block). Scripts are
// blocked in this context; inline <style> is not.
//
// The name and claim fade up, the ornament unrolls from its centre, and a band of
// gold then crosses the name every few seconds - clipped to the letterforms, so it
// looks like light moving over the type rather than a rectangle sliding past it.
const nameTop = nameBaseline - nameAsc;
const nameH = nameAsc + nameDesc;
const SHEEN_W = 300;      // width of the light band
const SHEEN_SKEW = 18;    // degrees off vertical, so it reads as a reflection
// A skewed rect leans by tan(skew) * height; widen it by that much on both sides so
// the lean cannot expose a clipped corner mid-sweep.
const skewPad = Math.ceil(Math.tan((SHEEN_SKEW * Math.PI) / 180) * nameH) + 20;
const sheenFrom = -(SHEEN_W + skewPad * 2);

const heroStyle = `
    .jdp-up{opacity:0;transform:translateY(16px);animation:jdp-up .8s cubic-bezier(.2,.7,.3,1) forwards}
    .jdp-name{animation-delay:.15s}
    .jdp-tag{animation-delay:1.15s}
    .jdp-rule{transform:scaleX(0);transform-box:view-box;transform-origin:${HW / 2}px ${ornY}px;animation:jdp-rule .9s cubic-bezier(.2,.7,.3,1) .65s forwards}
    .jdp-sheen{transform:translateX(${sheenFrom}px);animation:jdp-sheen 7s ease-in-out 2.4s infinite}
    @keyframes jdp-up{to{opacity:1;transform:translateY(0)}}
    @keyframes jdp-rule{to{transform:scaleX(1)}}
    @keyframes jdp-sheen{0%{transform:translateX(${sheenFrom}px)}34%,100%{transform:translateX(${HW + skewPad}px)}}
    @media (prefers-reduced-motion:reduce){
      .jdp-up{opacity:1;transform:none;animation:none}
      .jdp-rule{transform:none;animation:none}
      .jdp-sheen{display:none}
    }`;

function heroSvg(t, animated) {
  const cls = (c) => (animated ? ` class="${c}"` : "");
  // The sheen is a separate layer clipped to the name, and it exists only in the
  // animated file: parked off-canvas it would be invisible anyway, but leaving it
  // out keeps the PNG's markup to what the PNG actually shows.
  const defs = animated
    ? `
  <defs>
    <style>${heroStyle}
    </style>
    <clipPath id="jdp-nameclip"><path d="${namePath}"/></clipPath>
    <linearGradient id="jdp-sheengrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${t.sheen}" stop-opacity="0"/>
      <stop offset=".5" stop-color="${t.sheen}" stop-opacity=".85"/>
      <stop offset="1" stop-color="${t.sheen}" stop-opacity="0"/>
    </linearGradient>
  </defs>`
    : "";
  const sheen = animated
    ? `
  <g clip-path="url(#jdp-nameclip)">
    <g class="jdp-sheen"><rect x="${-skewPad}" y="${nameTop.toFixed(1)}" width="${SHEEN_W + skewPad * 2}" height="${nameH.toFixed(1)}" transform="skewX(${-SHEEN_SKEW})" fill="url(#jdp-sheengrad)"/></g>
  </g>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${HW} ${HH}" width="${HW}" height="${HH}" role="img" aria-label="Junker der Provinz">${defs}
  <rect width="${HW}" height="${HH}" fill="${t.bg}"/>
  <path${cls("jdp-up jdp-name")} d="${namePath}" fill="${t.fg}"/>
  <g${cls("jdp-rule")}><g transform="translate(${ornX},${ornY}) scale(${ornScale.toFixed(4)})" fill="${t.fg}">${ornGeom}</g></g>
  <path${cls("jdp-up jdp-tag")} d="${tagPath}" fill="${t.sub}"/>${sheen}
</svg>
`;
}

for (const t of THEMES) {
  emit(`profile-banner${t.suffix}`, heroSvg(t, true), t.bg, heroSvg(t, false));
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
