/**
 * What the LIVE run screen is allowed to carry.
 *
 * The expanded sheet had accreted eight live values plus a growing strip of
 * finished-split chips, and nothing tested any of it — this file is new
 * because the density pass that removed three of them found zero coverage to
 * update, which is its own finding. A screen you look at for half a second
 * while moving is exactly the kind of surface that accretes quietly.
 *
 * The rule these assertions encode: a live value has to be something the
 * runner can ACT on now. Elevation gained, a count of finished splits, and a
 * scrolling history of past splits are all review metrics — nothing you do in
 * the next kilometre changes because of them, and the post-run summary
 * already carries all three.
 *
 * Source-scanned rather than rendered. Rendering this sheet needs the GPS
 * hook, a live timer, framer-motion's drag machinery and a snap offset; the
 * property here is "which fields exist", which is a source-level fact. The
 * arithmetic behind those fields (`calculateSplits`, `slidingPaceSeconds`)
 * has its own unit tests in lib.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(
  resolve(here, "../RunBottomSheet.tsx"),
  "utf8"
);

/** Comments are not markup — this file's own rationale names the old
 *  fields, and so does the component's. */
const markup = src
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/\/\/[^\n]*/g, " ");

describe("live run screen — only what a runner can act on", () => {
  it("carries the LAST completed split, not a history of them", () => {
    /* Garmin's shipped answer, from the most metric-dense watch vendor
       there is: a lap banner that CLEARS, plus exactly one persistent
       field ("Last Lap Pace"). The chip row's value decayed to nothing
       seconds after each split landed while its screen cost grew with run
       length. */
    expect(markup).toMatch(/LAST \{distanceUnitLabel\(unit\)\.toUpperCase\(\)\}/);
    expect(markup).toMatch(/lastSplitPace/);
    expect(markup).not.toMatch(/SplitsStrip/);
  });

  it("still computes the full split list for the record", () => {
    /* The positive control. Deleting `calculateSplits` outright would
       satisfy the assertion above and quietly break the saved run — the
       strip was a VIEW of this data, not its only reason to exist. */
    expect(markup).toMatch(/calculateSplits\(points, lapMetresFor\(unit\)\)/);
  });

  it("shows no elevation on the live screen", () => {
    /* 0 of 4 reference apps show live elevation on a road run; Strava
       scopes it explicitly to trail, hike, cycling and winter sports. The
       summary carries it, which is where the analysis case lives. */
    expect(markup).not.toMatch(/ELEV/);
    expect(markup).not.toMatch(/elevationLabel/);
    expect(markup).not.toMatch(/totalElevationGain/);
  });

  it("shows no count of completed splits", () => {
    /* No reference app shows one anywhere, and it restated the distance
       readout three lines above it. */
    expect(markup).not.toMatch(/SPLITS\b/);
    expect(markup).not.toMatch(/\{splits\.length\}/);
  });

  it("keeps the secondary pill to a readable number of fields", () => {
    /* The pill is a fixed-width row with hairline dividers, so each extra
       field narrows every other one. Two fields plus an optional heart
       rate is the budget; the dividers are the cheapest thing to count. */
    const dividers = markup.match(/width: 1,\s*height: 28,/g) || [];
    expect(dividers.length).toBeLessThanOrEqual(2);
  });

  it("blanks the last-split field before the first split lands", () => {
    /* A run under one lap has no last split. Rendering 0:00 there would
       read as an impossibly fast one — the same class of lie as the
       standing-start pace `slidingPaceSeconds` returns null for. */
    expect(markup).toMatch(/lastSplitPace === null\s*\?\s*"--:--"/);
  });
});
