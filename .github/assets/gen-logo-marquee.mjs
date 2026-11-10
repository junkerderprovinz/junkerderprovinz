/**
 * Generates the strip of app and plugin logos that scrolls under the profile hero, as
 * logo-marquee.svg and logo-marquee-dark.svg. GitHub serves README images through a
 * proxy that blocks external references inside an SVG, so every icon is downscaled and
 * embedded as a data URI. Deps (global): sharp.
 * Run: node .github/assets/gen-logo-marquee.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";

const require = createRequire(import.meta.url);
const groot = execSync("npm root -g").toString().trim();
const sharp = require(`${groot}/sharp`);
const __dir = dirname(fileURLToPath(import.meta.url));

const RAW = "https://raw.githubusercontent.com/junkerderprovinz";
const feed = (slug) => `${RAW}/unraid-apps/main/${slug}/icon.png`;

// The README's Apps and Plugins, in its order. Images and wrappers carry other
// projects' logos, which would read as a claim to have made them. A logo that no
// repo publishes yet lives in logo-src.
const ICONS = [
  { slug: "arrowloop", url: feed("arrowloop") },
  { slug: "bombvault", url: feed("bombvault") },
  { slug: "cannoncommander", url: `${RAW}/cannoncommander/main/.github/assets/logo.svg` },
  { slug: "castleparcel", url: `${RAW}/castleparcel/main/.github/assets/castleparcel-logo.svg` },
  { slug: "knightloader", url: feed("knightloader") },
  { slug: "parleyport", url: feed("parleyport") },
  { slug: "pommelporter", url: `${RAW}/pommelporter/main/.github/assets/logo.svg` },
  { slug: "trickwork", url: feed("trickwork") },
  { slug: "bombvault-widget", url: feed("bombvaultwidget") },
  { slug: "towertorch", url: feed("towertorch") },
  { slug: "shiplog", url: feed("shiplog") },
  { slug: "firesquire", url: feed("firesquire") },
  { slug: "tillertouch", url: `${RAW}/tillertouch/main/.github/assets/icon.png` },
];

// The edges fade into GitHub's canvas colour. A mask would serve both themes with one
// file, but under a mask the moving logos shake in Firefox.
const THEMES = [
  { suffix: "", bg: "#ffffff" },
  { suffix: "-dark", bg: "#0d1117" },
];

const W = 1600;
const H = 140;
const SIZE = 96;
// One set must be wider than the view, or a gap opens before the second copy arrives.
const GAP = 64;
// Twice the drawn size, so the icons stay sharp on high-density screens.
const RASTER = SIZE * 2;
const FADE = 180;
const SPEED = 60;

async function source({ slug, url, file }) {
  if (file) return readFileSync(join(__dir, file));
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${slug} fetch ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

// WebP keeps the embedded icons at a fraction of their PNG size.
async function shrink(icon) {
  const webp = await sharp(await source(icon), { density: 300 })
    .resize(RASTER, RASTER, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 82, alphaQuality: 90, effort: 6 })
    .toBuffer();
  return webp.toString("base64");
}

const icons = await Promise.all(ICONS.map(shrink));
const pitch = SIZE + GAP;
const loop = icons.length * pitch;
const y = (H - SIZE) / 2;

const strip = icons
  .map((b64, i) => `<image x="${i * pitch + GAP / 2}" y="${y}" width="${SIZE}" height="${SIZE}" href="data:image/webp;base64,${b64}"/>`)
  .join("\n      ");

for (const { suffix, bg } of THEMES) {
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Logos of my apps and plugins">
  <defs>
    <style>
    .jdp-strip{animation:jdp-scroll ${(loop / SPEED).toFixed(2)}s linear infinite}
    @keyframes jdp-scroll{to{transform:translateX(-${loop}px)}}
    @media (prefers-reduced-motion:reduce){.jdp-strip{animation:none}}
    </style>
    <linearGradient id="jdp-fade-l">
      <stop offset="0" stop-color="${bg}"/>
      <stop offset="1" stop-color="${bg}" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="jdp-fade-r" x1="1" x2="0">
      <stop offset="0" stop-color="${bg}"/>
      <stop offset="1" stop-color="${bg}" stop-opacity="0"/>
    </linearGradient>
    <g id="jdp-set">
      ${strip}
    </g>
  </defs>
  <g class="jdp-strip">
    <use href="#jdp-set" xlink:href="#jdp-set"/>
    <use href="#jdp-set" xlink:href="#jdp-set" x="${loop}"/>
  </g>
  <rect width="${FADE}" height="${H}" fill="url(#jdp-fade-l)"/>
  <rect x="${W - FADE}" width="${FADE}" height="${H}" fill="url(#jdp-fade-r)"/>
</svg>
`;
  const name = `logo-marquee${suffix}.svg`;
  writeFileSync(join(__dir, name), svg);
  console.log(`${name}: ${icons.length} logos, ${(svg.length / 1024).toFixed(0)} KB`);
}
