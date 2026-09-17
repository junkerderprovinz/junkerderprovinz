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
 *     starts with its own document, and it never settles afterwards: all three
 *     share a period, so whatever offset they start with they keep. Measured
 *     over the real network, the images of one row arrived up to 1.2 s apart on
 *     a first visit, more than a whole STEP. So no README links these files
 *     directly. They are served through buttons.halleluja.design/give/<name>.svg
 *     (the file name without "button-" and "-live"), a Worker that rewrites each
 *     delay against the wall clock as it answers; see donate/worker/. A button
 *     added to BUTTONS below is served there without any change to the Worker.
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
 * THE BAND IS DEFINED ON SCREEN, NOT ON THE CANVAS, and that sentence is the
 * whole of this block.
 *
 * Every button in this house is drawn on the vendor canvas it inherited - 841.9
 * wide here, 720 for the download row in the app repositories - and each README
 * then scales its row to a width of its own. A band described in canvas units
 * therefore comes out a different size and a different speed in every row that
 * uses it, which is exactly what happened: two rows on one page, one band 31px
 * wide crossing at 249px per second and the other 38px at 304. They read as two
 * effects rather than one house.
 *
 * So the three numbers below are in SCREEN pixels and are the same for every
 * row anywhere (see the GitHub style guide, "Der Schein"): a 33px band, 250px
 * per second, a seven second loop. Everything else is derived from the width
 * the row is rendered at.
 *
 * THE GAP IS MEASURED, not assumed. This row is `<img width="160">` with a
 * newline, two spaces and a `&nbsp;` between the images, which HTML collapses
 * to space-nbsp-space: 13.16px at GitHub's 16px body text, measured in a
 * browser rather than guessed at. It used to be taken as 4px, which put the
 * hand-off 5% early in this row and 17% late in the other.
 *
 * PASS is how long the band needs to cross one button from fully outside the
 * left edge to fully outside the right, and STEP is how long it needs to travel
 * from one button's left edge to the next one's. Because both come from one
 * speed, the band leaves button n at the moment it enters button n+1 whatever
 * the row is scaled to.
 */
const BAND_PX = 33;                    // the band's width on screen
const SPEED = 250;                     // screen pixels per second
const GAP_PX = 13.16;                  // measured, see above
const RENDER_PX = 160;                 // the width every README asks for
const CYCLE = 7;                       // seconds, one full loop including the rest

/**
 * ONE ROW AT A TIME, NOT ALL OF THEM AT ONCE, and this row goes second.
 *
 * A README that has a download row above this one was running both bands on the
 * same schedule, so two bands crossed two rows side by side. They are meant to
 * read as one band working its way down the page: the whole first row, then the
 * whole second.
 *
 * THIS FILE CANNOT KNOW WHAT IS ABOVE IT. These three buttons are one shared
 * asset, referenced by raw URL from twenty-six repositories, and their phase is
 * baked into the file. So the schedule is fixed rather than derived per page,
 * and it can be: the give row is the LAST row in every README the house has,
 * and no README has three rows.
 *
 * 3.8s is when the longest download row in the house is finished - ArrowLoop's
 * four buttons, whose last one starts at 2.498s and needs 1.271s to cross. A
 * README with no download row shows nothing for the first 3.8s of the loop
 * instead, which nobody can tell from a longer rest.
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
  <!-- Generated by gen-live-buttons.mjs - do not hand-edit.
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
    /* linear, not eased: see the header. An eased pass hands off at the wrong
       moment and the row stops reading as one band.

       The fill mode is not decoration, it is the second half of the delay. An
       animation that has not started yet leaves its element wherever the
       document put it, which for this band is x=0 - INSIDE the button, against
       its left edge. So the whole stagger that makes the row read as one band
       was also parking a motionless band on every button but the first, for as
       long as that button's delay, every single time the page loaded. It came
       right on its own from the second cycle onwards, which is why it survived:
       it is only ever wrong while somebody is looking at the row for the first
       time. Holding the 0% state during the delay fixes it, and 0% is off the
       left edge. */
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
