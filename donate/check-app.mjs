/**
 * Holds this page's wallets to the ones BombVault's own donation window shows.
 *
 * The five addresses exist twice: once in coins.mjs here, once in
 * web/src/lib/donate.ts over in the bombvault repository. Two copies of a
 * payment address is a real risk, and neither repo's test suite can close it,
 * because neither one has the other's files. So this reaches for the other copy
 * over the network and compares. It is the one check here that needs the
 * internet, which is why it lives in its own file rather than inside check.mjs.
 *
 * A mismatch is not necessarily a bug in this repo. It means the two have
 * drifted, and somebody has to decide which one is right - so the failure names
 * both sides rather than assuming.
 *
 * Run: node donate/check-app.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE =
  "https://raw.githubusercontent.com/junkerderprovinz/bombvault/main/web/src/lib/donate.ts";

const __dir = dirname(fileURLToPath(import.meta.url));

/** Anything shaped like one of the five chains' addresses, from any text. */
const SHAPES =
  /\b(?:bc1[a-z0-9]{20,}|0x[a-fA-F0-9]{40}|0x[a-fA-F0-9]{64}|r[1-9A-HJ-NP-Za-km-z]{24,34}|[1-9A-HJ-NP-Za-km-z]{43,44})\b/g;

const here = new Set(
  [...readFileSync(join(__dir, "coins.mjs"), "utf8").matchAll(SHAPES)].map((m) => m[0])
);

let failed = 0;
const fail = (msg) => {
  console.error(`FAIL  ${msg}`);
  failed++;
};

// Every exit below goes through `process.exitCode`, never `process.exit()`:
// fetch leaves a handle open, and tearing the event loop down under it aborts
// the process on Windows with a libuv assertion and a code of 127 - which is
// not the code this meant, and is indistinguishable from a broken command.
const response = await fetch(SOURCE);
if (!response.ok) {
  console.error(`FAIL  could not read ${SOURCE}: HTTP ${response.status}`);
  process.exitCode = 1;
  // Nothing further is knowable without the file.
  throw new Error(`unreachable: ${SOURCE}`);
}
const there = new Set([...(await response.text()).matchAll(SHAPES)].map((m) => m[0]));

if (there.size === 0) {
  // The app's file was reachable but carried nothing that looks like an
  // address. Silently passing here would defeat the whole check.
  fail("no address found in the app's donate.ts - has the file moved or changed shape?");
}

for (const address of here) {
  if (!there.has(address)) fail(`${address} is on the page but not in the app's window`);
}
for (const address of there) {
  if (!here.has(address)) fail(`${address} is in the app's window but not on the page`);
}

if (failed) {
  console.error(`\n${failed} problem(s). The page and the app disagree - decide which is right.`);
  process.exitCode = 1;
} else {
  console.log(`OK  ${here.size} addresses, identical to the app's donation window.`);
}
