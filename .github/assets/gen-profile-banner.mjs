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
// would be invisible on one of the two. A hue shift reads on both.
//
// The tone is the avatar's own yellow, sampled from the picture rather than guessed:
// its two dominant yellows are #857500 and #ffe600, and this is the bright one. Both
// themes take it undiluted, jdp's call. Worth knowing on the light banner: there the
// sheen replaces near-black letters on WHITE, so at full brightness the lit strokes
// carry little contrast against the page.
const SHEEN = "#ffe600";
const THEMES = [
  { suffix: "", bg: "#ffffff", fg: "#1f2328", sub: "#59636e", rule: "#d0d7de", accent: "#8b949e", sheen: SHEEN },
  { suffix: "-dark", bg: "#0d1117", fg: "#f0f6fc", sub: "#9198a1", rule: "#30363d", accent: "#6e7681", sheen: SHEEN },
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

// ---- the claim types itself out, gets the last word wrong, fixes it ----------
// The typo is a TRANSPOSITION ("softwrae" for "software"), which is what makes the
// whole thing cheap: the two endings are the same four glyphs in a different order,
// so both spellings are exactly as wide and the claim stays centred on one position.
// Any other typo would shift the line sideways at the moment of correction.
const FIX_RIGHT = "are.";
const FIX_WRONG = "rae.";
const TAG_STEM = TAG.slice(0, -FIX_RIGHT.length);   // "...good-looking softw"
const TAG_TYPO = TAG_STEM + FIX_WRONG;
if (!TAG.endsWith(FIX_RIGHT)) throw new Error(`TAG must end in "${FIX_RIGHT}" for the typo animation`);
// One path per spelling, both drawn from the SAME pen position: they share every
// glyph up to the stem, so swapping layers mid-animation is invisible.
const tagTypoPath = lato.getPath(TAG_TYPO, tagX, tagBaseline, tagSize).toPathData(2);

// Timeline as [ms, revealed width]. A reveal-width keyframe list rather than a
// character count, because Lato is proportional: an "i" and a "w" are not one step.
const TYPE_MS = 46, DEL_MS = 55, PAUSE_TYPO = 520, PAUSE_FIX = 190;
const runW = (s) => lato.getAdvanceWidth(s, tagSize);
const typeSteps = [];
let tms = 0;
for (let i = 0; i <= TAG_STEM.length; i++) { typeSteps.push([tms, runW(TAG_STEM.slice(0, i))]); tms += TYPE_MS; }
for (let i = 1; i <= FIX_WRONG.length; i++) { typeSteps.push([tms, runW(TAG_STEM + FIX_WRONG.slice(0, i))]); tms += TYPE_MS; }
tms += PAUSE_TYPO;                                     // the typo sits there a moment
typeSteps.push([tms, runW(TAG_TYPO)]);
for (let i = FIX_WRONG.length - 1; i >= 0; i--) { tms += DEL_MS; typeSteps.push([tms, runW(TAG_STEM + FIX_WRONG.slice(0, i))]); }
tms += PAUSE_FIX;
typeSteps.push([tms, runW(TAG_STEM)]);
const swapMs = tms;                                    // typo layer out, real one in
for (let i = 1; i <= FIX_RIGHT.length; i++) { tms += TYPE_MS; typeSteps.push([tms, runW(TAG_STEM + FIX_RIGHT.slice(0, i))]); }
const typeMs = tms;

// Geometry for the reveal and the caret. The untyped remainder is covered by a rect
// in the BACKGROUND colour that slides right, not by an animated clipPath: the
// background is flat, so a cover is indistinguishable from a clip, and animating a
// plain visible rect avoids depending on an engine re-evaluating clipPath geometry
// every frame. It also means the cover and the caret are the same movement, one
// keyframe list for both.
const wipeTop = tagBaseline - tagAsc - 4;
const wipeH = tagAsc + tagDesc + 8;
const caretW = Math.max(2, Math.round(tagSize * 0.055));
const caretTop = tagBaseline - tagAsc * 0.82;
const caretH = tagAsc * 0.82 + tagDesc * 0.55;
// steps(1,end) on the animation makes every interval hold its value and jump at its
// end, which is what typing looks like; a smooth tween would read as a wipe.
const caretKeys = typeSteps.map(([ms, w]) => `${((ms / typeMs) * 100).toFixed(3)}%{transform:translateX(${w.toFixed(2)}px)}`).join("");

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

// The claim starts typing once the ornament has finished unrolling (.65 + .9), and
// the sheen waits until the typing is done, so the two never compete for attention.
const TYPE_AT = 1.7;
const typeEndS = TYPE_AT + typeMs / 1000;
const SHEEN_AT = +(typeEndS + 0.9).toFixed(2);
const swapAtS = +(TYPE_AT + swapMs / 1000).toFixed(3);
// The caret blinks for a while after the last character, then stops. Not `infinite`:
// a cursor blinking forever on a profile page is a distraction, and letting the
// animation END returns it to the base rule, which is hidden.
const BLINK_S = 0.9;
const blinkCount = Math.ceil((typeMs / 1000 + 2.6) / BLINK_S);

const heroStyle = `
    .jdp-up{opacity:0;transform:translateY(16px);animation:jdp-up .8s cubic-bezier(.2,.7,.3,1) forwards}
    .jdp-name{animation-delay:.15s}
    .jdp-rule{transform:scaleX(0);transform-box:view-box;transform-origin:${HW / 2}px ${ornY}px;animation:jdp-rule .9s cubic-bezier(.2,.7,.3,1) .65s forwards}
    .jdp-wipe{animation:jdp-caret ${(typeMs / 1000).toFixed(3)}s steps(1,end) ${TYPE_AT}s both}
    .jdp-caret{opacity:0;animation:jdp-caret ${(typeMs / 1000).toFixed(3)}s steps(1,end) ${TYPE_AT}s both,jdp-blink ${BLINK_S}s step-end ${TYPE_AT}s ${blinkCount}}
    .jdp-typo{animation:jdp-off .01s linear ${swapAtS}s forwards}
    .jdp-real{opacity:0;animation:jdp-on .01s linear ${swapAtS}s forwards}
    .jdp-sheen{transform:translateX(${sheenFrom}px);animation:jdp-sheen 7s ease-in-out ${SHEEN_AT}s infinite}
    @keyframes jdp-up{to{opacity:1;transform:translateY(0)}}
    @keyframes jdp-rule{to{transform:scaleX(1)}}
    @keyframes jdp-caret{${caretKeys}}
    @keyframes jdp-blink{0%,49%{opacity:1}50%,100%{opacity:0}}
    @keyframes jdp-off{to{opacity:0}}
    @keyframes jdp-on{to{opacity:1}}
    @keyframes jdp-sheen{0%{transform:translateX(${sheenFrom}px)}34%,100%{transform:translateX(${HW + skewPad}px)}}
    @media (prefers-reduced-motion:reduce){
      .jdp-up{opacity:1;transform:none;animation:none}
      .jdp-rule{transform:none;animation:none}
      .jdp-sheen{display:none}
      .jdp-wipe,.jdp-caret,.jdp-typo{display:none}
      .jdp-real{opacity:1;animation:none}
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
      <stop offset=".38" stop-color="${t.sheen}" stop-opacity="1"/>
      <stop offset=".62" stop-color="${t.sheen}" stop-opacity="1"/>
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
  // Both spellings are drawn; the cover hides whatever is not typed yet, and the
  // swap between them happens while the cover sits exactly at the end of the shared
  // stem, so the change of layer cannot be seen. The still version draws neither the
  // typo nor the cover: it is the finished line.
  const claim = animated
    ? `
  <path class="jdp-typo" d="${tagTypoPath}" fill="${t.sub}"/>
  <path class="jdp-real" d="${tagPath}" fill="${t.sub}"/>
  <rect class="jdp-wipe" x="${tagX.toFixed(1)}" y="${wipeTop.toFixed(1)}" width="${HW}" height="${wipeH.toFixed(1)}" fill="${t.bg}"/>
  <rect class="jdp-caret" x="${tagX.toFixed(1)}" y="${caretTop.toFixed(1)}" width="${caretW}" height="${caretH.toFixed(1)}" fill="${t.sub}"/>`
    : `
  <path d="${tagPath}" fill="${t.sub}"/>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${HW} ${HH}" width="${HW}" height="${HH}" role="img" aria-label="Junker der Provinz">${defs}
  <rect width="${HW}" height="${HH}" fill="${t.bg}"/>
  <path${cls("jdp-up jdp-name")} d="${namePath}" fill="${t.fg}"/>
  <g${cls("jdp-rule")}><g transform="translate(${ornX},${ornY}) scale(${ornScale.toFixed(4)})" fill="${t.fg}">${ornGeom}</g></g>${claim}${sheen}
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
