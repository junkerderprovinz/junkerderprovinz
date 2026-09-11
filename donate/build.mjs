/**
 * Builds ../docs/index.html from template.html and the list in coins.mjs.
 *
 * WHY A BUILD STEP AT ALL, for a page this small: the QR codes. A payment
 * address is the one string on a page that nobody can proofread, and a code
 * drawn from anything other than the address beside it is the one wrong answer
 * a reader cannot catch. Generating both from the same constant makes that
 * failure impossible rather than unlikely.
 *
 * The page lives in ../docs because that is one of the two places GitHub Pages
 * will serve from, and the other one is the repository root, where the profile
 * README and its assets already live.
 *
 * Run: node donate/build.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { COINS, MARKS } from "./coins.mjs";
import { qrPath } from "./qr.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, "..", "docs");

const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// --- The answer panels, one per DISTINCT address -----------------------------
// One per address rather than one per chain, because several chains share a
// wallet and repeating the drawing would be several chances for the copies to
// stop agreeing. The address is printed INSIDE its own panel, so "the code
// encodes the string beside it" stays a property of the markup that check.mjs
// reads straight off the page rather than a claim about the generator.
const addresses = [...new Set(COINS.flatMap((c) => c.networks.map((n) => n.address)))];
const panels = addresses
  .map((address) => {
    const { d, size } = qrPath(address);
    return `        <div class="qrpanel" data-address="${esc(address)}" hidden>
          <div class="qrwrap"><svg class="qr" viewBox="0 0 ${size} ${size}" role="img" aria-label="QR code" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#000"/></svg></div>
          <p class="addr" dir="ltr">${esc(address)}</p>
        </div>`;
  })
  .join("\n");

// --- The chain rows, one per coin -------------------------------------------
// Rendered even for a coin with a single chain, and that is not filler: this is
// the line that SAYS which network the address on screen belongs to, and the
// one fact that decides whether the money arrives may not appear and disappear
// depending on which tile is lit.
const chainRows = COINS.map((c) => {
  const chips = c.networks
    .map(
      (n, i) =>
        `<button type="button" role="option" class="chain${i === 0 ? " is-on" : ""}"` +
        ` data-address="${esc(n.address)}" data-chain="${esc(n.id)}"` +
        `${n.note ? ` data-note="${esc(n.note)}"` : ""}` +
        ` aria-selected="${i === 0 ? "true" : "false"}">${esc(n.name)}</button>`
    )
    .join("");
  return `        <div class="chains" data-coin="${esc(c.id)}" role="listbox" aria-label="Network" hidden>${chips}</div>`;
}).join("\n");

// --- The picker -------------------------------------------------------------
const tiles = COINS.map((c, i) => {
  const m = MARKS[c.id];
  // A tile with no mark would ship as a bare ticker, which is the one thing
  // this grid exists to avoid. Failing the build is cheaper than noticing it
  // on the live page.
  if (!m) throw new Error(`no mark for coin "${c.id}"`);
  return `        <button type="button" role="option" class="coin${i === 0 ? " is-on" : ""}"` +
    ` data-coin="${esc(c.id)}" aria-selected="${i === 0 ? "true" : "false"}"` +
    ` title="${esc(c.name)}" aria-label="${esc(c.name)} (${esc(c.symbol)})">
          <svg viewBox="${m.box}" aria-hidden="true" style="fill:${m.color}"><path d="${m.d}"/></svg>
          <span>${esc(c.symbol)}</span>
        </button>`;
}).join("\n");

const template = readFileSync(join(__dir, "template.html"), "utf8");
const out = template
  .replace("<!--QRPANELS-->", panels)
  .replace("<!--CHAINROWS-->", chainRows)
  .replace("<!--COINTILES-->", tiles);

// A placeholder that survives means template.html and this file have drifted,
// and the page would ship with a piece missing and no error anywhere.
for (const marker of ["<!--QRPANELS-->", "<!--CHAINROWS-->", "<!--COINTILES-->"]) {
  if (out.includes(marker)) throw new Error(`${marker} was not replaced - template.html has drifted`);
}

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "index.html"), out, "utf8");

// --- A second door, whose only job is to be readable -------------------------
// GitHub's Sponsor button can carry a `custom` entry, and it prints that entry
// as the BARE URL: measured on syncthing/syncthing, whose menu reads
// "https://syncthing.net/donations/". There is no label field - the docs allow
// a URL and nothing else. So the only way to say something in that menu is to
// say it in the path, and this is the path.
//
// It is a redirect rather than a copy. A second copy of the page would be a
// second place for the addresses to live, which is the one thing this whole
// repository is arranged to avoid. The meta refresh does the work with no
// script, and the link under it is what somebody sees if it is disabled.
const DOOR = "more-ways-to-support";
mkdirSync(join(OUT, DOOR), { recursive: true });
writeFileSync(
  join(OUT, DOOR, "index.html"),
  `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Support the tools</title>
<meta name="robots" content="noindex">
<link rel="canonical" href="https://junkerderprovinz.github.io/junkerderprovinz/">
<meta http-equiv="refresh" content="0; url=../">
</head>
<body>
<p>Taking you to <a href="../">the donation page</a>.</p>
</body>
</html>
`,
  "utf8"
);
console.log(
  `docs/index.html gebaut: ${COINS.length} Muenzen, ` +
    `${COINS.reduce((n, c) => n + c.networks.length, 0)} Netzwerke, ${addresses.length} Adressen`
);
