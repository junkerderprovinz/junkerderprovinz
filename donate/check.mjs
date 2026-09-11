/**
 * Holds the built page to the things nobody can proofread.
 *
 * A wrong address here is the most expensive mistake this page can make, and it
 * is silent: money leaves, nothing errors, and the person it happens to is a
 * stranger who tried to give something away. There are three ways to get it
 * wrong and only one of them is catchable by eye.
 *
 *   1. The ADDRESS is wrong. A reader can compare it to a wallet, and so can I.
 *   2. The QR CODE does not encode the address printed beside it. Nobody can
 *      see this. A phone reads the code, not the characters, so a mismatch
 *      sends the money somewhere else and the page still looks perfect.
 *   3. A CHAIN points at an address that does not live on it. This is the one
 *      that loses the money outright, and it hides twice over: the address is
 *      well-formed, the code matches it, and only the network is wrong. The
 *      app's own donate.ts carries the near miss that made this a rule.
 *
 * So this rebuilds every code from the address the page prints, demands the
 * same path, and checks every chain against ADDRESS_BY_CHAIN, which coins.mjs
 * writes out BY HAND. That hand-written map is the whole point of check 3:
 * derived from the list it guards, it would agree with any mistake in it.
 *
 * It reads the data from coins.mjs rather than from build.mjs, and that is not
 * a detail: importing the builder would REBUILD the page before this read it,
 * and a hand-edit of the generated file - the obvious shortcut somebody takes
 * once - would be erased a moment before it was looked for.
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

// --- 1 + 2: every panel's code encodes the address printed inside it ---------
const panels = [
  ...html.matchAll(
    /<div class="qrpanel" data-address="([^"]+)"[^>]*>[\s\S]*?<path d="([^"]+)"[\s\S]*?<p class="addr"[^>]*>([^<]+)<\/p>/g
  ),
];

if (panels.length === 0) fail("no QR panels found in docs/index.html - did build.mjs run?");

for (const [, dataAddress, path, printed] of panels) {
  if (printed.trim() !== dataAddress) {
    fail(`the panel for ${dataAddress} prints a different address: ${printed.trim()}`);
  }
  if (qrPath(dataAddress).d !== path) {
    fail(`the QR code beside ${dataAddress} does not encode it`);
  }
}

// --- 3: every chain resolves to the wallet that lives on it ------------------
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

// --- 4: the page's coins are the list's coins, each with its own chain row ---
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

// Every chip belongs to a coin that actually offers that chain, in that order.
// Catches a row copied from one coin to another, which is exactly how ETH would
// end up offered on BNB Smart Chain again - the trap donate.ts names by hand.
for (const m of html.matchAll(/<div class="chains" data-coin="([^"]+)"[^>]*>([\s\S]*?)<\/div>/g)) {
  const coin = COINS.find((c) => c.id === m[1]);
  if (!coin) continue;
  const want = coin.networks.map((n) => n.id).join(", ");
  const got = [...m[2].matchAll(/data-chain="([^"]+)"/g)].map((x) => x[1]).join(", ");
  if (want !== got) fail(`coin "${m[1]}" offers [${got}] on the page but [${want}] in the list`);
}

// --- 5: every address still fits on ONE line --------------------------------
// An address is read back by eye before somebody sends to it, and a string
// broken across two lines is one nobody can check at a glance. It broke once
// already and by a single character: the Sui address wanted 442px in a window
// that offered 440, two pixels short, and nothing in the build noticed.
//
// The four measurements come from the page's own CSS tokens, so this and the
// stylesheet cannot drift apart: change --window-max there and this follows.
//
// PER_CHAR is deliberately pessimistic. The face this renders in measures 0.55em
// per character; the widest monospace in the fallback stack is 0.60em, so a
// viewer on another system needs about nine percent more room for the same
// string, and the check has to pass for THEM, not for the machine it runs on.
const PER_CHAR = 0.62;
const rem = (name) => {
  const m = html.match(new RegExp(`--${name}:\\s*([\\d.]+)rem`));
  if (!m) {
    fail(`the stylesheet has no --${name} token - the width check cannot run`);
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
          `${Math.floor(room)}px - widen --window-max past ${
            Math.ceil((needs + 2 * bodyPad + 2 * answerPad) / 16 * 10) / 10
          }rem`
      );
    }
  }
}

// --- 6: a mark on every tile, so nothing ships as a bare ticker --------------
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
