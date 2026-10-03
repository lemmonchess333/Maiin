import { describe, it, expect } from "vitest";
import { runRecordRows, type RunRecordRows } from "../historyFigures";
import { addLocalDays, localDateString } from "../dateHelpers";
import type { DistanceUnit } from "../distanceUnits";

/**
 * What a PR row's LABEL is allowed to claim, and what its VALUE must say.
 *
 * Two rules, from two rounds of the same defect.
 *
 * The first: "Fastest 5K" rendered `paceMinSec`, a bare `M:SS`. A 5.2 km
 * run at 5:35/km published "Fastest 5K — 5:35" — read as what the label
 * says, a 5K finish time two and a half times the world record. The row
 * beside it hid that, because at one kilometre a pace and a finish time
 * are the same number. Fixed by appending the unit.
 *
 * The second is the half that fix left standing. Both pace rows read
 * `avgPace`, the average over a WHOLE run, from a pool filtered by a
 * distance floor — so "Fastest 1K" was the average pace of a run of at
 * least a kilometre. For a 20 km steady run that is not a kilometre
 * time, and for a runner who has only ever covered 10 km it names a
 * distance they have never run on its own. The rows are also the same
 * number and date whenever the best-paced run was 5 km or longer, since
 * one pool contains the other. A label may not name a race distance for
 * a figure measured over something else.
 *
 * A third rule joined them from a capture of the rich account: the two
 * pace rows were rewritten to sentence case by that second fix and the
 * distance row was not, so the card rendered one Title-Cased row among
 * sentence-cased siblings. That is the shape a copy pass leaves behind
 * when it touches a list one row at a time, and it is worth a rule
 * because the next row added here will be written by someone reading
 * whichever sibling they happen to look at.
 *
 * Held against what the builder (`runRecordRows`) returns, in both units,
 * for every card it feeds: all-time, last 30 days and indoor.
 */

const NOW = new Date(2026, 8, 16, 14, 30, 0);
const RANGE = {
  recentSinceKey: localDateString(addLocalDays(NOW, -29)),
  newSinceKey: localDateString(addLocalDays(NOW, -7)),
};

function run(
  id: string,
  daysAgo: number,
  km: number,
  pace: number,
  type = "easy"
) {
  const day = addLocalDays(NOW, -daysAgo);
  return {
    id,
    date: localDateString(day),
    completedAt: new Date(day.getFullYear(), day.getMonth(), day.getDate(), 7),
    distance: km * 1000,
    duration: km * pace,
    avgPace: pace,
    activityType: type,
  };
}

/* A short blast holds the best pace and a longer run the best over 5 km,
   so every row the builder can write is written, on every card. */
const RUNS = [
  run("blast", 2, 1.2, 290),
  run("steady", 3, 10, 320),
  run("long", 5, 21, 340),
  run("belt-short", 4, 1.5, 280, "treadmill"),
  run("belt-long", 6, 8, 300, "treadmill"),
];

const cards = (unit: DistanceUnit): RunRecordRows =>
  runRecordRows(RUNS, RANGE, unit);
const allRows = (unit: DistanceUnit) => {
  const { lifetime, recent30d, indoor } = cards(unit);
  return [...lifetime, ...recent30d, ...indoor];
};

describe("PR rows labelled by distance", () => {
  it("finds the rows at all", () => {
    // Without this the sweeps below pass vacuously the moment the
    // builder is reshaped or the labels are reworded.
    const { lifetime, recent30d, indoor } = cards("km");
    expect(lifetime.map((r) => r.label)).toEqual([
      "Best pace",
      "Best pace · 5K+",
      "Longest run",
    ]);
    expect(recent30d.map((r) => r.label)).toEqual([
      "Best pace",
      "Best pace · 5K+",
      "Longest run",
    ]);
    expect(indoor.map((r) => r.label)).toEqual([
      "Best pace",
      "Best pace · 5K+",
    ]);
  });

  it.each(["km", "mi"] as const)("every value names its unit (%s)", (unit) => {
    const paceUnit = unit === "mi" ? "/mi" : "/km";
    for (const row of allRows(unit)) {
      if (row.label === "Longest run") {
        expect(row.value, row.label).toMatch(new RegExp(` ${unit}$`));
      } else {
        expect(
          row.value,
          "A bare M:SS is ambiguous between per-kilometre and per-mile " +
            "wherever it sits."
        ).toMatch(new RegExp(`^\\d+:\\d{2} ${paceUnit}$`));
      }
    }
  });

  it("no label claims a race distance for a whole-run average", () => {
    /* The regression this exists to stop: a row whose value is a pace —
       always `avgPace`, the average over an entire run — under a label
       naming a fixed race distance. "Fastest 1K" said a runner had
       covered a kilometre at that pace; what it measured was any run of
       at least a kilometre, whole. A real fastest kilometre needs the
       stored per-km splits, not a different label. A trailing '+' reads
       as a floor on the pool rather than a claim about the effort. */
    const RACE_DISTANCE = /\b\d+\s?(?:K|km|M|mi|mile)\b/i;
    const offenders = allRows("km")
      .filter((r) => r.value.endsWith("/km"))
      .filter((r) => RACE_DISTANCE.test(r.label) && !/\+/.test(r.label))
      .map((r) => r.label);
    expect(offenders).toEqual([]);
  });
});

describe("PR row labels are sentence case", () => {
  it("no label Title-Cases a word after the first", () => {
    /* A capital starting any word but the first. "5K+" does not match —
       a digit is not [A-Z] — so a distance shorthand stays legal while
       an ordinary Title-Cased word is caught. */
    const offenders = allRows("km")
      .map((r) => r.label)
      .filter((l) => /\s[A-Z][a-z]/.test(l));
    expect(
      offenders,
      "Title Case in a list whose other rows are sentence case"
    ).toEqual([]);
  });

  it("the rule recognises the shape it is written for", () => {
    // A rule that matched nothing would report a clean list forever.
    expect(/\s[A-Z][a-z]/.test("Longest Run")).toBe(true);
    expect(/\s[A-Z][a-z]/.test("Longest run")).toBe(false);
    expect(/\s[A-Z][a-z]/.test("Best pace · 5K+")).toBe(false);
  });
});
