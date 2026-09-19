/**
 * Holds the built page to the things nobody can proofread. A wrong address sends
 * a stranger's donation elsewhere without any error, and there are three ways to
 * get one:
 *
 *   1. The address itself is wrong. A reader can compare it with a wallet.
 *   2. The QR code does not encode the address printed beside it. A phone reads
 *      the code, not the characters, so the page still looks right.
 *   3. A chain points at an address that does not live on it. The address is
 *      well-formed and the code matches it; only the network is wrong. The app's
 *      donate.ts records the near miss behind this rule.
 *
 * So this rebuilds every code from the address the page prints, demands the same
 * path, and checks every chain against ADDRESS_BY_CHAIN, which coins.mjs writes
 * out by hand: a map derived from the list it guards would agree with any mistake
 * in it.
 *
 * It imports coins.mjs rather than build.mjs, because importing the builder would
 * rebuild the page and erase a hand-edit of the output just before looking for it.
 *
 * Run: node donate/check.mjs   (build first, this reads the built page)
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { COINS, ADDRESS_BY_CHAIN } from "./coins.mjs";
import { qrPath } from "./qr.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(__dir, "..", "docs", "index.html"), "utf8");

let failed = 0;
const fail = (msg) => {
  console.error(`FAIL  ${msg}`);
  failed++;
};

// Checks 1 and 2: every panel's code encodes the address printed inside it.
const panels = [
  ...html.matchAll(
    /<div class="qrpanel" data-address="([^"]+)"[^>]*>[\s\S]*?<path d="([^"]+)"[\s\S]*?<p class="addr"[^>]*>([^<]+)<\/p>/g
  ),
];

if (panels.length === 0) fail("no QR panels found in docs/index.html; did build.mjs run?");

for (const [, dataAddress, path, printed] of panels) {
  if (printed.trim() !== dataAddress) {
    fail(`the panel for ${dataAddress} prints a different address: ${printed.trim()}`);
  }
  if (qrPath(dataAddress).d !== path) {
    fail(`the QR code beside ${dataAddress} does not encode it`);
  }
}

// Check 3: every chain resolves to the wallet that lives on it.
const chips = [
  ...html.matchAll(/<button [^>]*class="chain[^"]*"[^>]*data-address="([^"]+)" data-chain="([^"]+)"/g),
];

if (chips.length === 0) fail("no chain chips found in docs/index.html");

for (const [, address, chain] of chips) {
  const expected = ADDRESS_BY_CHAIN[chain];
  if (!expected) fail(`the page offers chain "${chain}", which ADDRESS_BY_CHAIN does not name`);
  else if (expected !== address) {
    fail(`chain "${chain}" points at ${address}, but its wallet is ${expected}`);
  }
}

// Every declared chain has to reach the page, or one was silently dropped.
const onPage = new Set(chips.map(([, , chain]) => chain));
for (const chain of Object.keys(ADDRESS_BY_CHAIN)) {
  if (!onPage.has(chain)) fail(`chain "${chain}" is declared but reaches no chip`);
}

// Check 4: the page's coins are the list's coins, each with its own chain row.
const tiles = [...html.matchAll(/<button [^>]*class="coin[^"]*"[^>]*data-coin="([^"]+)"/g)].map(
  (m) => m[1]
);
const rows = [...html.matchAll(/<div class="chains" data-coin="([^"]+)"/g)].map((m) => m[1]);

for (const coin of COINS) {
  if (!tiles.includes(coin.id)) fail(`coin "${coin.id}" is in the list but has no tile`);
  if (!rows.includes(coin.id)) fail(`coin "${coin.id}" has no chain row`);
}
for (const id of tiles) {
  if (!COINS.some((c) => c.id === id)) {
    fail(`the page shows a tile for "${id}", which is not in the list`);
  }
}

// Every chip belongs to a coin that offers that chain, in that order.
// Catches a row copied from one coin to another, the way ETH could end up offered
// on BNB Smart Chain, the trap donate.ts names.
for (const m of html.matchAll(/<div class="chains" data-coin="([^"]+)"[^>]*>([\s\S]*?)<\/div>/g)) {
  const coin = COINS.find((c) => c.id === m[1]);
  if (!coin) continue;
  const want = coin.networks.map((n) => n.id).join(", ");
  const got = [...m[2].matchAll(/data-chain="([^"]+)"/g)].map((x) => x[1]).join(", ");
  if (want !== got) fail(`coin "${m[1]}" offers [${got}] on the page but [${want}] in the list`);
}

// Check 5: every address fits on one line. An address is read back by eye before
// somebody sends to it, and one broken across two lines cannot be checked at a
// glance.
//
// The four measurements come from the page's own CSS tokens, so this and the
// stylesheet cannot drift apart.
//
// PER_CHAR is pessimistic: the page's face measures 0.55em per character and the
// widest monospace in the fallback stack 0.60em, and the check has to pass for a
// viewer on another system, not for the machine it runs on.
const PER_CHAR = 0.62;
const rem = (name) => {
  const m = html.match(new RegExp(`--${name}:\\s*([\\d.]+)rem`));
  if (!m) {
    fail(`the stylesheet has no --${name} token; the width check cannot run`);
    return null;
  }
  return parseFloat(m[1]) * 16;
};

const windowMax = rem("window-max");
const bodyPad = rem("body-pad");
const answerPad = rem("answer-pad");
const addrSize = rem("addr-size");

if (windowMax && bodyPad && answerPad && addrSize) {
  const room = windowMax - 2 * bodyPad - 2 * answerPad;
  for (const address of new Set(COINS.flatMap((c) => c.networks.map((n) => n.address)))) {
    const needs = address.length * addrSize * PER_CHAR;
    if (needs > room) {
      fail(
        `${address} needs ${Math.ceil(needs)}px on one line but the window offers ` +
          `${Math.floor(room)}px; widen --window-max past ${
            Math.ceil((needs + 2 * bodyPad + 2 * answerPad) / 16 * 10) / 10
          }rem`
      );
    }
  }
}

// Check 6: a mark on every tile, so nothing ships as a bare ticker.
for (const m of html.matchAll(
  /<button [^>]*class="coin[^"]*"[^>]*data-coin="([^"]+)"([\s\S]*?)<\/button>/g
)) {
  if (!/<path d="/.test(m[2])) fail(`the tile for "${m[1]}" carries no mark`);
}

if (failed) {
  console.error(`\n${failed} problem(s).`);
  process.exitCode = 1;
} else {
  console.log(
    `OK  ${tiles.length} coins, ${chips.length} chains, ${panels.length} addresses. ` +
      "Every QR encodes the address printed beside it, and every chain points at its own wallet."
  );
}
