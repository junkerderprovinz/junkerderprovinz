/**
 * The Worker's arithmetic and its refusals, run with Node's own test runner:
 *   node --test donate/worker/test/worker.test.mjs
 *
 * The property that matters is not any single delay value but that two buttons
 * rendered at DIFFERENT moments still agree about where the band is. That is
 * what the "late image" tests check, because it is the whole reason the Worker
 * exists: a static file cannot know when it was loaded.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { phasedDelay, rephase, sourceFor } from "../src/index.js";

const CYCLE = 7;

/** Where in the loop an animation stands `tau` seconds after its image loaded. */
function phaseAt(delay, tau) {
  return (((tau - delay) % CYCLE) + CYCLE) % CYCLE;
}

test("a delay always lands in (-7, 0]", () => {
  for (let now = 0; now < 30; now += 0.37) {
    for (const offset of [0, 0.833, 1.665, 3.8, 4.493, 5.185]) {
      const d = phasedDelay(offset, now);
      assert.ok(d <= 0 && d > -CYCLE, `offset ${offset} at ${now}: ${d}`);
    }
  }
});

test("an image loaded late agrees with one loaded early", () => {
  // Button A is answered at t=100.0 and shown at once; button B, the same
  // schedule slot, is answered 1.2 s later - the worst spread measured over the
  // real network. Look at both at wall time t=105.
  const offset = 0.833;
  const a = phasedDelay(offset, 100.0);
  const b = phasedDelay(offset, 101.2);
  assert.ok(Math.abs(phaseAt(a, 105 - 100.0) - phaseAt(b, 105 - 101.2)) < 1e-9);
});

test("the schedule offset survives: neighbours stay one step apart", () => {
  // Two neighbouring buttons answered at different moments still sit exactly
  // one step apart on the wall clock, which is what makes the band hand off.
  const step = 0.833;
  const left = phasedDelay(0, 200.0);
  const right = phasedDelay(step, 200.9);
  const wall = 210;
  const diff = (phaseAt(left, wall - 200.0) - phaseAt(right, wall - 200.9) + CYCLE) % CYCLE;
  assert.ok(Math.abs(diff - step) < 1e-9, `got ${diff}`);
});

test("paths map onto the button folders by convention", () => {
  assert.equal(sourceFor("/give/paypal.svg"), "https://raw.githubusercontent.com/junkerderprovinz/junkerderprovinz/main/donate/buttons/button-paypal-live.svg");
  assert.equal(sourceFor("/give/buy-me-a-coffee.svg"), "https://raw.githubusercontent.com/junkerderprovinz/junkerderprovinz/main/donate/buttons/button-buy-me-a-coffee-live.svg");
  assert.equal(sourceFor("/bombvault/docs.svg"), "https://raw.githubusercontent.com/junkerderprovinz/bombvault/main/.github/assets/download-buttons/docs.svg");
  // A button added later needs no change here.
  assert.equal(sourceFor("/give/some-new-way.svg"), "https://raw.githubusercontent.com/junkerderprovinz/junkerderprovinz/main/donate/buttons/button-some-new-way-live.svg");
});

test("anything outside the two shapes is refused", () => {
  for (const bad of ["/../etc/passwd", "/bombvault/docs.png", "/bombvault/../x.svg", "/a/b/c.svg", "/", "/BombVault/docs.svg", "/give/-x.svg", "/give/.svg", "/%2e%2e/x.svg"]) {
    assert.equal(sourceFor(bad), null, bad);
  }
});

test("a file without the band animation is refused, not served", () => {
  assert.equal(rephase("<svg></svg>", 0), null);
});

test("a file on another loop is refused: no delay can put it in step", () => {
  assert.equal(rephase(".band { animation: pass 8s linear 0.833s infinite backwards; }", 10), null);
});

test("the stylesheet never gets -0.000", () => {
  // offset minus the wall phase lands a hair below zero
  const out = rephase(".band { animation: pass 7s linear 3.000s infinite backwards; }", 3.0002);
  assert.match(out, /linear 0\.000s/);
});

test("every donation button in this repo is one the Worker can phase", () => {
  // The Worker depends on the generators' exact wording. If a template changes
  // it, this fails here instead of every README showing a broken image.
  const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "buttons");
  const live = readdirSync(dir).filter((f) => f.endsWith("-live.svg"));
  assert.ok(live.length >= 3, `found ${live.length}`);
  for (const f of live) {
    assert.notEqual(rephase(readFileSync(join(dir, f), "utf8"), 0), null, f);
    assert.ok(sourceFor(`/give/${f.replace(/^button-/, "").replace(/-live\.svg$/, "")}.svg`), f);
  }
});

test("the rewrite touches the delay and nothing else", () => {
  const svg = `<style>.band { animation: pass 7s linear 3.800s infinite backwards; }</style><rect/>`;
  const out = rephase(svg, 10);
  assert.match(out, /animation: pass 7s linear -?\d+\.\d{3}s infinite backwards;/);
  assert.equal(out.replace(/-?\d+\.\d{3}s infinite/, "Xs infinite"), svg.replace("3.800s infinite", "Xs infinite"));
});
