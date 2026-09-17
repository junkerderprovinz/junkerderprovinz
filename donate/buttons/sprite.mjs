/**
 * Several buttons as ONE image file, each shown through its own #svgView fragment.
 *
 * WHY ONE FILE. A button's shine is a CSS animation inside its SVG, and the
 * browser runs it on a clock that starts when that <img> gets its file. Separate
 * files arrive at separate moments, so a band meant to cross a row button by
 * button jumps, doubles or runs backwards. Rewriting each file's delay against
 * the wall clock as it is served did not hold either: the time between serving
 * and arriving varies per file, and Firefox reuses an image it already has when
 * GitHub swaps the page without a reload, starting a fresh clock on a delay that
 * was computed for an earlier moment. One file for every button on a page
 * arrives once, for all of them at the same moment, and every <img> of it is
 * inserted in the same step, so all clocks start together. Chrome even runs them
 * on one shared clock. Measured on github.com in Firefox, freshly loaded, after
 * in-page navigation and with the file reused from memory.
 *
 * HOW. Every button keeps its own document inside the sprite, as a nested <svg>
 * at its own x. Its ids, its class and its keyframes get a per-button prefix,
 * because the CSS inside one SVG document is shared: without it the last
 * button's delay would win for all of them. A README shows one button with
 *
 *   <a href="..."><img src=".../give.svg#svgView(viewBox(x,0,w,h))" width="160" height="46.62"></a>
 *
 * so every button still links where it should. width AND height are both set,
 * because the image's own proportions are the whole sprite's, not the button's.
 */

/**
 * The names a button document defines. Every one is prefixed per button, and a
 * sprite is refused if any is left without a prefix, so a template that starts
 * using another name fails here instead of quietly handing one button's delay or
 * clip to all of them.
 */
const UNPREFIXED = /id="(?!b\d+-)|url\(#(?!b\d+-)|href="#(?!b\d+-)|class="(?!b\d+-)|@keyframes (?!b\d+-)|animation: (?!b\d+-|none)/;

/**
 * parts: [{ svg, width, height }], in the order they are laid out.
 * Returns the sprite and, per part, the viewBox a README points at.
 */
export function sprite(parts) {
  let x = 0;
  const views = [];
  const body = parts.map(({ svg, width, height }, i) => {
    const pre = `b${i}-`;
    const inner = svg
      .replace(/<\?xml[^>]*>\s*/, "")
      .replace(/<!--[\s\S]*?-->\s*/g, "")
      .replace(/id="(edge|sheen)"/g, `id="${pre}$1"`)
      .replace(/url\(#(edge|sheen)\)/g, `url(#${pre}$1)`)
      .replace(/class="band"/g, `class="${pre}band"`)
      .replace(/\.band\b/g, `.${pre}band`)
      .replace(/@keyframes pass\b/g, `@keyframes ${pre}pass`)
      .replace(/animation: pass /g, `animation: ${pre}pass `)
      .replace(/<svg\b/, `<svg x="${x}" y="0"`);
    const left = inner.match(UNPREFIXED);
    if (left) throw new Error(`button ${i} still has an unprefixed name near ${JSON.stringify(inner.slice(left.index, left.index + 40))}`);
    views.push({ x, width, height });
    x = Math.round((x + width) * 1000) / 1000;
    return inner.trim();
  });
  const height = Math.max(...parts.map((p) => p.height));
  const svg =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${x} ${height}">\n` +
    body.join("\n") +
    `\n</svg>\n`;
  return { svg, views };
}

/** The #svgView fragment for one part of a sprite. */
export function view({ x, width, height }) {
  return `#svgView(viewBox(${x},0,${width},${height}))`;
}
