/**
 * give.svg must be exactly the sprite of the three single files next to it.
 *
 * The READMEs show give.svg; the single files are what the generator writes and
 * what the repositories with a download row copy into their own sprites. If
 * one is regenerated and the other is not, the donation row on most pages and
 * on those four would quietly differ. This rebuilds the sprite and compares.
 *
 *   node donate/buttons/check-sprite.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sprite } from "./sprite.mjs";

const dir = dirname(fileURLToPath(import.meta.url));
const parts = ["button-buy-me-a-coffee", "button-paypal", "button-crypto"].map((name) => ({
  svg: readFileSync(join(dir, `${name}-live.svg`), "utf8"),
  width: 841.9,
  height: 245.3,
}));
const built = sprite(parts).svg;
const published = readFileSync(join(dir, "give.svg"), "utf8");
if (built !== published) {
  console.error("give.svg is not the sprite of the three single files: run node donate/buttons/gen-live-buttons.mjs");
  process.exit(1);
}
console.log("give.svg matches the three single files");
