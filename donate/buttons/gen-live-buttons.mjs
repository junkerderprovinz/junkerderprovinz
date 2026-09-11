/**
 * The three donation buttons, with one sheen that crosses the whole row.
 *
 * WHY MOTION AT ALL: a README button cannot react to the pointer. Four ways
 * were checked and all four are closed - GitHub's sanitiser strips <style> and
 * script, an inline style carries no pseudo-classes, an SVG loaded as <img>
 * never receives pointer events, and <picture> inside <a> is broken by the same
 * sanitiser. Motion is the one thing that still works, and this account's own
 * profile banner has been proving it daily.
 *
 * HOW ONE BAND CROSSES THREE SEPARATE IMAGES, which is the whole trick here
 * (jdp, 2026-09-11: "kann der schein nicht über alle drei buttons hinweg
 * laufen?"). It cannot be one animation: each button is its own <img>, its own
 * SVG document, its own timeline, and nothing in a README can talk between
 * them. What they DO share is a period. So every button runs the identical
 * animation and button n starts it `n * STEP` later, where STEP is how long the
 * band takes to travel one button plus the gap between them. The band leaves
 * the first button exactly as it enters the second, which reads as one band
 * sweeping the row.
 *
 * TWO THINGS THAT MAKE OR BREAK IT:
 *   - The timing function must be LINEAR. Any easing varies the speed inside
 *     each button, so the hand-off at the seam arrives early or late and the
 *     illusion of one band collapses into three that shimmer in turn.
 *   - The phase is set at LOAD, because a CSS animation in an <img>-loaded SVG
 *     starts with its own document. Three small files from the same host load
 *     within a few tens of milliseconds of each other, which is well under the
 *     STEP below, and once set the phase holds because all three share a
 *     period. This is the one part that is not exact, and it is honest to say
 *     so: on a cold, throttled connection the sweep can start out ragged and
 *     settles from the next cycle.
 *
 * WHY THE ARTWORK IS AN EMBEDDED RASTER rather than redrawn as vector: the
 * buttons carry WORDS, and an <img>-loaded SVG with a <text> element falls back
 * to whatever font the viewer's renderer happens to have - which is exactly why
 * the static buttons are PNGs in the first place. Embedding the finished
 * picture as a data URI keeps the lettering identical to the static row and
 * adds the motion on top. No network request, nothing cached separately.
 *
 * CSS, NOT SMIL, for one reason: only CSS can be switched off by
 * prefers-reduced-motion. Somebody who asked their system for less motion asked
 * everything, and an animation that ignores it is a bug.
 *
 * Run: node donate/buttons/gen-live-buttons.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";

const require = createRequire(import.meta.url);
const { Resvg } = require(`${execSync("npm root -g").toString().trim()}/@resvg/resvg-js`);

const __dir = dirname(fileURLToPath(import.meta.url));

/** The vendor canvas the generated buttons already share. */
const W = 841.9;
const H = 245.3;
const R = 38.2;

/**
 * The row, in the order every README shows it, with the artwork each one is
 * built from. Buy Me a Coffee is the vendor's own SVG and has no PNG, so it is
 * rasterised here; the other two already exist as PNGs and are used as they
 * are, byte for byte the same picture the static row shows.
 */
const BUTTONS = [
  { name: "button-buy-me-a-coffee", from: "button-buy-me-a-coffee.svg" },
  { name: "button-paypal", from: "button-paypal.png" },
  { name: "button-crypto", from: "button-crypto.png" },
];

/**
 * The timing, derived rather than picked.
 *
 * A README renders these at width 160 with a non-breaking space between them,
 * which measures 164px from one button's left edge to the next. In the canvas
 * the buttons share, that is 842 * (164/160) = 863 units of travel per step.
 *
 * PASS is how long the band needs to cross one canvas from fully outside the
 * left edge to fully outside the right. STEP follows from it by the ratio
 * above, so the seam lands where it should without anybody tuning a number by
 * eye.
 */
const BAND_W = 165;
const FROM = -(BAND_W + 120);          // fully clear of the left edge
const TO = W + 120;                    // fully clear of the right edge
const TRAVEL = TO - FROM;              // canvas units one pass covers
const CYCLE = 7;                       // seconds, one full loop including the rest
const PASS = 0.95;                     // seconds the band needs to cross one button
const STEP = PASS * (863 / TRAVEL);    // seconds between one button and the next
const PASS_PCT = ((PASS / CYCLE) * 100).toFixed(2);

/** A picture as a data URI, rasterising an SVG source on the way if needed. */
function artwork(file) {
  if (file.endsWith(".png")) {
    return readFileSync(join(__dir, file)).toString("base64");
  }
  // Rendered at the shared canvas width, so all three carry the same pixel
  // density. At the 160px a README shows them, that is a five-fold oversample
  // and stays crisp on any display.
  const svg = readFileSync(join(__dir, file), "utf8");
  const png = new Resvg(svg, { fitTo: { mode: "width", value: Math.round(W) } }).render().asPng();
  return Buffer.from(png).toString("base64");
}

function build({ name, from }, index) {
  const delay = (STEP * index).toFixed(3);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     version="1.1" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <!-- Generated by gen-live-buttons.mjs - do not hand-edit.
       Position ${index + 1} of ${BUTTONS.length} in the row; the sheen starts
       ${delay}s after the first, so one band appears to cross all three. -->
  <defs>
    <clipPath id="edge">
      <rect x="0" y="0" width="${W}" height="${H}" rx="${R}" ry="${R}"/>
    </clipPath>
    <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0"    stop-color="#fff" stop-opacity="0"/>
      <stop offset="0.45" stop-color="#fff" stop-opacity="0.28"/>
      <stop offset="0.55" stop-color="#fff" stop-opacity="0.28"/>
      <stop offset="1"    stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <style>
    @keyframes pass {
      0%             { transform: translateX(${FROM}px); }
      ${PASS_PCT}%   { transform: translateX(${TO}px); }
      100%           { transform: translateX(${TO}px); }
    }
    /* linear, not eased: see the header. An eased pass hands off at the wrong
       moment and the row stops reading as one band. */
    .band { animation: pass ${CYCLE}s linear ${delay}s infinite; }
    @media (prefers-reduced-motion: reduce) {
      .band { animation: none; opacity: 0; }
    }
  </style>
  <g clip-path="url(#edge)">
    <image x="0" y="0" width="${W}" height="${H}" xlink:href="data:image/png;base64,${artwork(from)}"/>
    <g class="band">
      <!-- Tilted and taller than the canvas, so the tilt never exposes a
           corner. skewX rather than rotate: the band stays axis-aligned for the
           translate, so the motion is one transform and not two. -->
      <rect x="0" y="-60" width="${BAND_W}" height="${H + 120}"
            fill="url(#sheen)" transform="skewX(-16)"/>
    </g>
  </g>
</svg>
`;
}

for (const [i, b] of BUTTONS.entries()) {
  const svg = build(b, i);
  writeFileSync(join(__dir, `${b.name}-live.svg`), svg, "utf8");
  console.log(
    `${b.name}-live.svg: Position ${i + 1}, Start nach ${(STEP * i).toFixed(3)}s, ${Math.round(svg.length / 1024)} KB`
  );
}
console.log(`Umlauf ${CYCLE}s, ein Durchgang ${PASS}s, Abstand ${STEP.toFixed(3)}s`);
