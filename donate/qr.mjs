/**
 * One QR code, drawn as an SVG path.
 *
 * Shared by build.mjs and check.mjs deliberately: the checker rebuilds every
 * code from the address the page prints and demands the same path, and that
 * proof is only worth something if both sides draw it the same way. A second
 * copy of this function would let the two agree on a shared mistake.
 *
 * Inline, so the page makes no network request for an image, caches nothing,
 * and works with no internet at all.
 */
import { createRequire } from "node:module";
import { execSync } from "node:child_process";

const require = createRequire(import.meta.url);
const qrcode = require(`${execSync("npm root -g").toString().trim()}/qrcode-generator`);

/** The path data and the viewBox edge, for one string. */
export function qrPath(value) {
  const q = qrcode(0, "M");
  q.addData(value);
  q.make();
  const n = q.getModuleCount();
  // The quiet zone is part of the standard, not padding: a scanner needs clear
  // space around the symbol to find its edges.
  const QUIET = 2;
  let d = "";
  for (let row = 0; row < n; row++) {
    let run = -1;
    for (let col = 0; col <= n; col++) {
      const dark = col < n && q.isDark(row, col);
      if (dark && run < 0) run = col;
      else if (!dark && run >= 0) {
        d += `M${run + QUIET} ${row + QUIET}h${col - run}v1h-${col - run}z`;
        run = -1;
      }
    }
  }
  return { d, size: n + QUIET * 2 };
}
