/**
 * Builds ../docs/index.html from template.html and the list in coins.mjs.
 *
 * The build step exists for the QR codes. Nobody can proofread a payment address,
 * so each code is drawn from the same constant as the address printed beside it.
 *
 * The page lives in ../docs because GitHub Pages serves either that or the
 * repository root, and the root already holds the profile README.
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

// One QR panel per distinct address rather than per chain: several chains share a
// wallet, and every extra drawing is another copy that could disagree. The address
// is printed inside its own panel, so check.mjs can compare each code with the
// string beside it straight from the page.
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

// One chain row per coin, even for a coin with a single chain: the row says which
// network the address belongs to, and that decides whether the money arrives.
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

const tiles = COINS.map((c, i) => {
  const m = MARKS[c.id];
  // A tile without a mark would ship as a bare ticker.
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
  if (out.includes(marker)) throw new Error(`${marker} was not replaced, template.html has drifted`);
}

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "index.html"), out, "utf8");

// A redirect whose path reads as a label, for menus that print a link as its bare
// URL, such as GitHub's Sponsor button. It redirects rather than copies, so the
// addresses live in one place only. It lands on #ways: the page opens the crypto
// window on arrival, except for that fragment, where it shows the card with all
// three ways.
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
<meta http-equiv="refresh" content="0; url=../#ways">
</head>
<body>
<p>Taking you to <a href="../#ways">the donation page</a>.</p>
<script>
// location.replace leaves no history entry, so Back from the donation page skips
// this hop. The meta refresh is the fallback for a browser without script.
location.replace("../#ways");
</script>
</body>
</html>
`,
  "utf8"
);
console.log(
  `docs/index.html gebaut: ${COINS.length} Muenzen, ` +
    `${COINS.reduce((n, c) => n + c.networks.length, 0)} Netzwerke, ${addresses.length} Adressen`
);
