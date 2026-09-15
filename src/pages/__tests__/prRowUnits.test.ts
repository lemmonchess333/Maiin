import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * A PR row whose LABEL names a distance must carry a unit in its VALUE.
 *
 * "Fastest 5K" rendered `paceMinSec`, which is a bare `M:SS`. So a 5.2 km
 * run at 5:35/km published "Fastest 5K — 5:35": read as what the label
 * says, a 5K finish time two and a half times the world record. The
 * "Fastest 1K" row beside it hid the problem, because at one kilometre
 * the pace and the finish time are the same number.
 *
 * Everywhere ELSE in the app a bare `paceMinSec` is safe, because the
 * label names the metric — "Avg pace", "BEST", a split row — so nothing
 * has to be inferred. These rows are the one place the label names a
 * distance, which is exactly the case that reads as a time. The
 * race-predictions card on the same page already gets it right: the
 * distance's finish TIME as the headline, the pace beneath it with its
 * unit. Two cards on one screen were saying 5K in two different
 * currencies, and only one of them said which.
 *
 * Scanned rather than rendered because the rows are built inside a
 * `useMemo` in a 1,900-line page; the rule is about what the builder
 * emits, and `buildPRBucket` feeds all three buckets (lifetime, last 30
 * days, indoor) from this one literal.
 */
const here = dirname(fileURLToPath(import.meta.url));
const history = readFileSync(resolve(here, "../../pages/History.tsx"), "utf8");

/** `label: "Fastest 5K",` … up to the end of that row's `value:` line. */
const DISTANCE_ROW =
  /label:\s*"((?:Fastest|Longest)[^"]*)",\s*\n\s*value:([\s\S]*?)\n\s*date:/g;

function rows(): { label: string; value: string }[] {
  DISTANCE_ROW.lastIndex = 0;
  return [...history.matchAll(DISTANCE_ROW)].map((m) => ({
    label: m[1],
    value: m[2],
  }));
}

describe("PR rows labelled by distance", () => {
  it("finds the rows at all", () => {
    // Without this the sweep passes vacuously the moment the builder is
    // reshaped or the labels are reworded.
    const labels = rows().map((r) => r.label);
    expect(labels).toEqual(["Fastest 1K", "Fastest 5K", "Longest Run"]);
  });

  it("every one names its unit in the value", () => {
    const bare = rows()
      .filter((r) => !/paceUnitLabel|distanceLabel/.test(r.value))
      .map((r) => r.label);
    expect(
      bare,
      "A row whose label is a DISTANCE and whose value has no unit reads " +
        "as a finish time for that distance. Append paceUnitLabel for a " +
        "pace, or use distanceLabel for a distance."
    ).toEqual([]);
  });

  it("the two pace rows are paces, not times", () => {
    // The distinction the label cannot make on its own: these read from
    // `avgPace`, so the unit is the only thing telling a reader that
    // "5:35" is per-kilometre rather than a 5K result.
    for (const label of ["Fastest 1K", "Fastest 5K"]) {
      const row = rows().find((r) => r.label === label);
      expect(row?.value, label).toMatch(/avgPace/);
      expect(row?.value, label).toMatch(/paceUnitLabel/);
    }
  });
});
