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

/**
 * The path data and the viewBox edge, for one string.
 *
 * NO QUIET ZONE INSIDE THE DRAWING (changed 2026-09-11, jdp: "der weiße
 * hintergrund hinter dem QR code ist bei den meisten zu groß"). The clear
 * margin a scanner needs is still there, but it is now the white plate's CSS
 * padding rather than modules baked into the viewBox.
 *
 * The reason is the word "bei den meisten". With the margin measured in
 * MODULES and every code rendered to the same pixel box, the margin is wide
 * for a short address and narrow for a long one: a 29-module XRP code and a
 * 45-module Sui code differ by half again. Measured in PIXELS by the plate, it
 * is identical on every coin, which is what makes the grid look deliberate.
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
