/**
 * The README buttons, served with their shine running on the world's clock.
 *
 * WHY THIS EXISTS. A README button is an SVG loaded through <img>, and every
 * such image runs its animation on its own clock, started the moment that one
 * image finished loading. That was measured, not assumed: even two <img> tags
 * with the identical URL get separate clocks. The buttons in a row carry
 * staggered delays so one band of light crosses the row button by button, and
 * rows run one after another - which only lines up if every image happens to
 * finish loading at the same instant. Over the real network on a first visit
 * the images of one row finished up to 1.2 s apart, more than a whole step from
 * one button to the next, so the band jumped, doubled or ran backwards.
 * Nothing inside a static file can fix that, and GitHub strips image maps, so a
 * row cannot be one image with several links either.
 *
 * WHAT THIS DOES INSTEAD. Every button keeps its own file in its own repository,
 * with its own place in the schedule baked into its animation delay. This
 * Worker fetches that file and, at the moment it answers, rewrites the delay so
 * the animation starts at the right point of its seven-second loop for the
 * CURRENT time. An image that loads late starts late on its own clock and at a
 * correspondingly later point of the loop, so all of them agree with the wall
 * clock and therefore with each other. What remains is the time between this
 * answer and the image appearing in the browser, which is small and about the
 * same for every button.
 *
 * NOTHING HERE MAY BE CACHED, and that is the whole trick rather than a detail:
 * a cached answer carries the phase of the moment it was made, and GitHub's
 * image proxy would hand that one stale phase to every visitor. So the response
 * says no-store and carries no ETag, which would otherwise invite a revalidation
 * that returns the old body. The source files ARE cached, at the edge, because
 * only the delay changes per request and GitHub should not see one fetch per
 * README view.
 */

/** Seconds in one full loop. Every button file uses the same period. */
const CYCLE = 7;

/** Only this owner's repositories, and only their button folders. */
const RAW = "https://raw.githubusercontent.com/junkerderprovinz";
const NAME = /^[a-z0-9][a-z0-9-]{0,60}$/;

/**
 * Where a request path's button lives, or null for anything else.
 *
 *   /give/<name>.svg     donate/buttons/button-<name>-live.svg in the profile repo
 *   /<repo>/<name>.svg   .github/assets/download-buttons/<name>.svg in that repo
 *
 * Both are conventions rather than lists, so a button the generators add later
 * is served without touching this file. Anything outside the two shapes is
 * refused, and so is a file that is not a phased button.
 *
 * The convention also covers this account's forks of other people's projects,
 * whose folders their upstreams control. That is why every answer carries a
 * sandboxing Content-Security-Policy (see HEADERS): whatever an SVG from there
 * contains, it cannot run a script on this domain.
 *
 * Always from main, so a README previewed on a branch shows main's buttons: a
 * button that exists only on that branch appears here once it is merged.
 */
export function sourceFor(pathname) {
  const m = pathname.match(/^\/([a-z0-9-]+)\/([a-z0-9-]+)\.svg$/);
  if (!m) return null;
  const [, first, second] = m;
  if (!NAME.test(first) || !NAME.test(second)) return null;
  if (first === "give") return `${RAW}/junkerderprovinz/main/donate/buttons/button-${second}-live.svg`;
  return `${RAW}/${first}/main/.github/assets/download-buttons/${second}.svg`;
}

/**
 * The delay that puts a button with schedule offset `offset` (seconds into the
 * loop) at the right point for wall-clock time `nowSeconds`.
 *
 * Returned in (-CYCLE, 0]: a negative delay starts the animation already part
 * way through, which is exactly "at the right point, right away". A positive
 * one would first hold the start frame for that long, which is correct too but
 * only after a wait nobody should see on a page that has just loaded.
 */
export function phasedDelay(offset, nowSeconds) {
  let d = (offset - (nowSeconds % CYCLE)) % CYCLE;
  if (d > 0) d -= CYCLE;
  return d;
}

/** The delay as the stylesheet gets it, never "-0.000", which reads like a bug. */
function seconds(d) {
  return (Math.round(d * 1000) / 1000 || 0).toFixed(3);
}

/**
 * The button's own period and schedule offset, read from the file rather than
 * kept here. The period is checked, not assumed: a file on a different loop
 * cannot be put in step with the others by any delay.
 */
const DELAY = /(animation:\s*pass\s+)([\d.]+)(s\s+linear\s+)(-?[\d.]+)s/;

/**
 * Rewrites the one animation delay in a button file. Returns null when the file
 * is not a button this Worker knows how to phase, so the caller can refuse it
 * rather than serve something it does not understand.
 */
export function rephase(svg, nowSeconds, { loud = false } = {}) {
  const m = svg.match(DELAY);
  if (!m || Number(m[2]) !== CYCLE) return null;
  const offset = Number(m[4]);
  let out = svg.replace(DELAY, `$1$2$3${seconds(phasedDelay(offset, nowSeconds))}s`);
  // A verification aid, never linked from a README: the band drawn opaque and
  // magenta-edged, so a screenshot shows where it is without squinting.
  if (loud) {
    out = out
      .replace(/stop-opacity="0\.28"/g, 'stop-opacity="1"')
      .replace(/stop-color="#fff" stop-opacity="0"/g, 'stop-color="#f0f" stop-opacity="0"');
  }
  return out;
}

const HEADERS = {
  "Content-Type": "image/svg+xml; charset=utf-8",
  "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
  "X-Content-Type-Options": "nosniff",
  // Inline <style> for the band, data: for the donation buttons' embedded
  // artwork, and nothing else. `sandbox` without allow-scripts is what keeps a
  // hostile SVG opened directly from running anything here.
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox",
};

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("method not allowed", { status: 405 });
    }
    const src = sourceFor(url.pathname);
    if (!src) return new Response("not found", { status: 404 });

    // A found source is cached at the edge for five minutes, the same lifetime
    // GitHub gives the raw file itself, so a regenerated button shows up here as
    // soon as it would anywhere else. A missing one only briefly, and a GitHub
    // failure not at all, so an outage does not outlive itself here.
    let upstream;
    try {
      upstream = await fetch(src, {
        // A negative TTL means "do not cache" to Cloudflare.
        cf: { cacheEverything: true, cacheTtlByStatus: { "200-299": 300, "300-403": -1, 404: 30, "405-599": -1 } },
      });
    } catch {
      return new Response("upstream unreachable", { status: 502 });
    }
    if (upstream.status === 404) return new Response("not found", { status: 404 });
    if (!upstream.ok) return new Response("upstream error", { status: 502 });
    const svg = await upstream.text();

    const body = rephase(svg, Date.now() / 1000, { loud: url.searchParams.has("loud") });
    if (body === null) return new Response("not a button", { status: 404 });

    return new Response(request.method === "HEAD" ? null : body, { headers: HEADERS });
  },
};
