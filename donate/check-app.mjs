/**
 * Holds this page's wallets to the ones BombVault's donation window shows.
 *
 * The five addresses exist twice: in coins.mjs here and in web/src/lib/donate.ts in
 * the bombvault repository. Neither repository's tests can see the other's files,
 * so this fetches the other copy and compares. It is the only check that needs the
 * network, so it lives apart from check.mjs.
 *
 * A mismatch means the two have drifted, not necessarily that this side is wrong,
 * so the failure names both sides.
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

// Exits go through `process.exitCode` rather than `process.exit()`: fetch leaves a
// handle open, and tearing the event loop down under it aborts the process on
// Windows with a libuv assertion and exit code 127.
const response = await fetch(SOURCE);
if (!response.ok) {
  console.error(`FAIL  could not read ${SOURCE}: HTTP ${response.status}`);
  process.exitCode = 1;
  // Nothing further is knowable without the file.
  throw new Error(`unreachable: ${SOURCE}`);
}
const there = new Set([...(await response.text()).matchAll(SHAPES)].map((m) => m[0]));

if (there.size === 0) {
  // Without this the comparison below would pass on an empty set.
  fail("no address found in the app's donate.ts; has the file moved or changed shape?");
}

for (const address of here) {
  if (!there.has(address)) fail(`${address} is on the page but not in the app's window`);
}
for (const address of there) {
  if (!here.has(address)) fail(`${address} is in the app's window but not on the page`);
}

if (failed) {
  console.error(`\n${failed} problem(s). The page and the app disagree; decide which is right.`);
  process.exitCode = 1;
} else {
  console.log(`OK  ${here.size} addresses, identical to the app's donation window.`);
}
