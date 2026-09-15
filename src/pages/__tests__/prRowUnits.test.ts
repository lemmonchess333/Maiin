import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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
 * Scanned rather than rendered because the rows are built inside a
 * `useMemo` in a 1,900-line page; the rule is about what the builder
 * emits, and `buildPRBucket` feeds all three buckets (lifetime, last 30
 * days, indoor) from this one literal.
 */
const here = dirname(fileURLToPath(import.meta.url));
const history = readFileSync(resolve(here, "../../pages/History.tsx"), "utf8");

/** `label: "…",` … up to the end of that row's `value:` line. */
const DISTANCE_ROW = /label:\s*"([^"]*)",\s*\n\s*value:([\s\S]*?)\n\s*date:/g;

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
    expect(labels).toEqual(["Best pace", "Best pace · 5K+", "Longest Run"]);
  });

  it("every one names its unit in the value", () => {
    const bare = rows()
      .filter((r) => !/paceUnitLabel|distanceLabel/.test(r.value))
      .map((r) => r.label);
    expect(
      bare,
      "A bare M:SS is ambiguous between per-kilometre and per-mile " +
        "wherever it sits. Append paceUnitLabel for a pace, or use " +
        "distanceLabel for a distance."
    ).toEqual([]);
  });

  it("the two pace rows are paces, not times", () => {
    // These read from `avgPace`, so the unit is the only thing telling a
    // reader that "5:32" is per-kilometre rather than a result.
    for (const label of ["Best pace", "Best pace · 5K+"]) {
      const row = rows().find((r) => r.label === label);
      expect(row?.value, label).toMatch(/avgPace/);
      expect(row?.value, label).toMatch(/paceUnitLabel/);
    }
  });

  it("no label claims a race distance for a whole-run average", () => {
    /* The regression this exists to stop: a row reading `avgPace` — the
       average over an entire run — under a label naming a fixed race
       distance. "Fastest 1K" said a runner had covered a kilometre at
       that pace; what it measured was any run of at least a kilometre,
       whole. A real fastest-kilometre needs the stored per-km `splits`,
       not a different label. */
    const RACE_DISTANCE = /\b\d+\s?(?:K|km|M|mi|mile)\b/i;
    const offenders = rows()
      .filter((r) => /avgPace/.test(r.value))
      .filter((r) => RACE_DISTANCE.test(r.label) && !/\+/.test(r.label))
      .map((r) => r.label);
    expect(
      offenders,
      "This row's value is a whole-run average pace, so its label must " +
        "not name a race distance as though the figure were measured " +
        "over it. A trailing '+' reads as a floor on the pool rather " +
        "than a claim about the effort."
    ).toEqual([]);
  });
});
