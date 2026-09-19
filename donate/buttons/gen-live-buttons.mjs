/**
 * The three donation buttons, with one sheen that crosses the whole row.
 *
 * A README button cannot react to the pointer: GitHub's sanitiser strips <style>
 * and script, an inline style has no pseudo-classes, an SVG loaded as <img> never
 * receives pointer events, and the sanitiser breaks <picture> inside <a>. Motion
 * still works.
 *
 * Each button is its own SVG document with its own timeline, so no single animation
 * can cross all three. Instead every button runs the same animation and button n
 * starts it `n * STEP` later, where STEP is the time the band needs for one button
 * plus the gap. The band leaves one button as it enters the next, which reads as
 * one band sweeping the row. Two things make it work:
 *   - The timing function is linear. Easing varies the speed inside each button,
 *     so the hand-off at the seam would come early or late.
 *   - The phase is fixed when each document loads and never settles afterwards,
 *     and separate images of one row can arrive more than a STEP apart on a first
 *     visit. So READMEs show give.svg, the three in one file, each through its own
 *     view (see sprite.mjs).
 *
 * The artwork is embedded as a PNG data URI rather than redrawn as vector, because
 * an <img>-loaded SVG with <text> falls back to whatever font the viewer's renderer
 * has. This keeps the lettering identical to the static row.
 *
 * CSS rather than SMIL, because only CSS can be switched off by
 * prefers-reduced-motion.
 *
 * Run: node donate/buttons/gen-live-buttons.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { sprite, view } from "./sprite.mjs";
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
 * The row in README order, with the artwork each button is built from. Buy Me a
 * Coffee is the vendor's SVG and is rasterised here; the other two use the PNGs of
 * the static row.
 */
const BUTTONS = [
  { name: "button-buy-me-a-coffee", from: "button-buy-me-a-coffee.svg" },
  { name: "button-paypal", from: "button-paypal.png" },
  { name: "button-crypto", from: "button-crypto.png" },
];

/**
 * The band is defined in screen pixels, not canvas units. Every button is drawn on
 * its vendor canvas (841.9 wide here, 720 for the download rows in the app
 * repositories) and each README scales its row to its own width, so a band in
 * canvas units would have a different size and speed in every row. Band width,
 * speed and loop are the same for every row (see the GitHub style guide, "Der
 * Schein"); everything else follows from the width the row is rendered at.
 *
 * The gap is measured in a browser: the row is `<img width="160">` with a newline,
 * two spaces and a `&nbsp;` between the images, which HTML collapses to space, nbsp,
 * space, or 13.16px at GitHub's 16px body text.
 *
 * PASS is how long the band needs to cross one button, from fully outside its left
 * edge to fully outside its right, and STEP how long it needs from one button's
 * left edge to the next one's. Both come from one speed, so the band leaves button
 * n as it enters button n+1 at any scale.
 */
const BAND_PX = 33;                    // the band's width on screen
const SPEED = 250;                     // screen pixels per second
const GAP_PX = 13.16;                  // measured, see above
const RENDER_PX = 160;                 // the width every README asks for
const CYCLE = 7;                       // seconds, one full loop including the rest

/**
 * Rows take turns, and this row goes second: on a README with a download row above
 * it, the band works its way down the page, the whole first row and then the whole
 * second.
 *
 * This file cannot know what is above it, since it is one shared asset referenced
 * by raw URL from many repositories and its phase is baked in. So the offset is
 * fixed at 3.8s, when the longest download row is finished (four buttons, the last
 * starting at 2.498s and needing 1.271s to cross). Without a download row the first
 * 3.8s look like a longer rest.
 *
 * A page that does not fit this retimes the copies in its own sprite. ArrowLoop and
 * KnightLoader put the give row above two download rows, and their
 * scripts/gen_download_buttons.py moves these three to the start of a longer loop
 * (three rows need 7.07s of travel). That generator rewrites the animation line and
 * the one keyframe stop between 0% and 100%, and refuses a file where it cannot
 * find them, so both have to keep their shape.
 */
const ROW_OFFSET = 3.8;

/** Canvas units per screen pixel, for this row's own rendered width. */
const SCALE = W / RENDER_PX;
const BAND_W = BAND_PX * SCALE;
/**
 * The band is skewed, so its horizontal extent is wider than the rect: skewX
 * shifts every point by tan(16 degrees) times its own y, and the rect is taller
 * than the canvas on both sides. Clearing the edge by the rect's width alone
 * would leave the tilted corner showing.
 */
const BAND_H = H + 120;
const CLEAR = BAND_W + Math.tan((16 * Math.PI) / 180) * BAND_H;
const FROM = -CLEAR;                   // fully clear of the left edge
const TO = W + CLEAR;                  // fully clear of the right edge
const PASS = (TO - FROM) / SCALE / SPEED;
const STEP = (RENDER_PX + GAP_PX) / SPEED;
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
  const delay = (ROW_OFFSET + STEP * index).toFixed(3);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     version="1.1" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <!-- Generated by gen-live-buttons.mjs, do not hand-edit.
       Position ${index + 1} of ${BUTTONS.length} in the row; the sheen starts
       ${delay}s into the loop, so one band appears to cross all three, and the
       row runs after the download row above it rather than beside it. -->
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
      0%             { transform: translateX(${FROM.toFixed(1)}px); }
      ${PASS_PCT}%   { transform: translateX(${TO.toFixed(1)}px); }
      100%           { transform: translateX(${TO.toFixed(1)}px); }
    }
    /* Linear, so the hand-off from one button to the next stays on time. The
       backwards fill mode holds the 0% state, off the left edge, during the
       delay; without it the band would wait motionless at x=0, inside the
       button, until the first pass starts. */
    .band { animation: pass ${CYCLE}s linear ${delay}s infinite backwards; }
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
      <rect x="0" y="-60" width="${BAND_W.toFixed(1)}" height="${BAND_H}"
            fill="url(#sheen)" transform="skewX(-16)"/>
    </g>
  </g>
</svg>
`;
}

const parts = [];
for (const [i, b] of BUTTONS.entries()) {
  const svg = build(b, i);
  writeFileSync(join(__dir, `${b.name}-live.svg`), svg, "utf8");
  parts.push({ svg, width: W, height: H });
  console.log(
    `${b.name}-live.svg: Position ${i + 1}, Start bei ${(ROW_OFFSET + STEP * i).toFixed(3)}s, ${Math.round(svg.length / 1024)} KB`
  );
}

// give.svg is what every README links: the three buttons as one file, see
// sprite.mjs for why. The single files stay, because the repositories with a
// download row build their own sprite from them (download and donation buttons
// in one file, so both rows run on one clock).
const give = sprite(parts);
writeFileSync(join(__dir, "give.svg"), give.svg, "utf8");
console.log(`give.svg: ${Math.round(give.svg.length / 1024)} KB, Ausschnitte ${give.views.map(view).join(" ")}`);
console.log(
  `Umlauf ${CYCLE}s, ein Durchgang ${PASS.toFixed(3)}s, Abstand ${STEP.toFixed(3)}s, ` +
    `Band ${BAND_PX}px bei ${SPEED}px/s`
);
