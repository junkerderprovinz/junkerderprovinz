/**
 * One QR code, drawn as an SVG path.
 *
 * Shared by build.mjs and check.mjs: the checker rebuilds every code from the
 * address the page prints and demands the same path, which only proves something
 * if both sides draw it the same way.
 *
 * Inline, so the page makes no network request for an image, caches nothing,
 * and works with no internet at all.
 */
import { createRequire } from "node:module";
import { execSync } from "node:child_process";

const require = createRequire(import.meta.url);
const qrcode = require(`${execSync("npm root -g").toString().trim()}/qrcode-generator`);

/**
 * The path data and the viewBox edge, for one string.
 *
 * The drawing has no quiet zone; the margin a scanner needs is the white plate's
 * CSS padding. Measured in modules, with every code rendered to the same box, it
 * would be wide for a short address and narrow for a long one (a 29-module XRP
 * code against a 45-module Sui code). In pixels it is the same on every coin.
 */
export function qrPath(value) {
  const q = qrcode(0, "M");
  q.addData(value);
  q.make();
  const n = q.getModuleCount();
  let d = "";
  for (let row = 0; row < n; row++) {
    let run = -1;
    for (let col = 0; col <= n; col++) {
      const dark = col < n && q.isDark(row, col);
      if (dark && run < 0) run = col;
      else if (!dark && run >= 0) {
        d += `M${run} ${row}h${col - run}v1h-${col - run}z`;
        run = -1;
      }
    }
  }
  return { d, size: n, modules: n };
}
