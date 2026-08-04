/**
 * What the race generator hands a runner who has been away.
 *
 * ── The defect ───────────────────────────────────────────────────────────
 *
 * `RacePlanV2Input` described the RACE and the user's static preferences, and
 * nothing about what they had actually run. So the week derived purely from
 * weeks-to-race and could not distinguish a runner who had trained ten weeks
 * from one who had trained zero. Measured on a marathon, 6 weeks out, same
 * race date, same schedule:
 *
 *     trained    tempo_40 | easy_40 | long_25k
 *     10wks off  tempo_40 | easy_40 | long_25k   ← identical
 *
 * A 40-minute tempo and a 25 km long run in week one back, roughly double the
 * longest run they were ever prescribed. In running that is the "too much too
 * soon" pattern behind stress fractures and tendinopathy, not merely a hard
 * week.
 *
 * ── What is asserted ─────────────────────────────────────────────────────
 *
 * Every test below holds the plan inputs FIXED and varies only
 * `recentLayoff`, so a failure can only mean the layoff policy moved. The
 * trained counterfactual is asserted alongside each claim — without it, a
 * generator that emitted all-easy weeks for EVERYONE would pass the whole
 * file.
 *
 * The taper cases exist because gating only the `build` branch was measurably
 * not enough: a detrained runner with a short horizon spends every week in
 * taper, so the build gate never fires and they were still handed `8x400`.
 */
import { describe, it, expect } from "vitest";

import { generateRacePlanV2, DEFAULT_RUN_TUNING } from "../runScheduler";
import type { LayoffClass } from "../layoffDetection";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import { generateSchedule } from "@/lib/scheduleUtils";
import {
  localDateString,
  localWeekKey,
  parseLocalDate,
} from "@/lib/dateHelpers";

const TEMPLATE = new Map(RUN_TEMPLATES.map((t) => [t.id, t]));
const RACE_DATE = "2026-11-01"; // a Sunday
const DISTANCES = ["5k", "10k", "half", "marathon"] as const;
type Distance = (typeof DISTANCES)[number];

const HARD = new Set(["tempo", "intervals"]);

function planAt(args: {
  distance: Distance;
  weeksOut: number;
  layoff: LayoffClass;
  planTotalWeeks?: number;
  runDays?: number;
}) {
  const runDays = args.runDays ?? 4;
  const d = parseLocalDate(RACE_DATE);
  d.setDate(d.getDate() - args.weeksOut * 7);
  const currentDate = localDateString(d);
  return generateRacePlanV2({
    raceGoal: { distance: args.distance, targetDate: RACE_DATE },
    weekSchedule: generateSchedule(2, runDays),
    weeklyRunDays: runDays,
    currentDate,
    weekStart: localWeekKey(parseLocalDate(currentDate)),
    tuning: DEFAULT_RUN_TUNING,
    recentLayoff: args.layoff,
    ...(args.planTotalWeeks != null
      ? { planTotalWeeks: args.planTotalWeeks }
      : {}),
  });
}

/** The week the runner is actually handed — callers persist `weeks[0]` only. */
const persisted = (p: ReturnType<typeof planAt>) => p.weeks[0] ?? [];

const hardSessions = (week: ReturnType<typeof persisted>) =>
  week.filter((d) => HARD.has(d.type));

const longestKm = (week: ReturnType<typeof persisted>) =>
  Math.max(
    0,
    ...week.map((d) => TEMPLATE.get(d.templateId)?.config.targetDistanceKm ?? 0)
  );

/**
 * Walk a block the way `useProgram` does — regenerate weekly with the block
 * length carried forward, keep `weeks[0]`. A test that reads `plan.weeks`
 * cannot see what a runner receives; see `persistedWeekProgression.test.ts`.
 */
function walk(distance: Distance, startWeeksOut: number, layoff: LayoffClass) {
  let blockWeeks: number | undefined;
  const out: ReturnType<typeof persisted>[] = [];
  for (let weeksOut = startWeeksOut; weeksOut >= 1; weeksOut--) {
    const p = planAt({
      distance,
      weeksOut,
      layoff,
      planTotalWeeks: blockWeeks,
    });
    if (blockWeeks === undefined) blockWeeks = p.totalWeeks;
    out.push(persisted(p));
  }
  return out;
}

describe("a returning runner gets no hard sessions", () => {
  it("no tempo and no intervals, in any week of any block", () => {
    // The build gate alone left `8x400` in the taper weeks. Walking the whole
    // block rather than sampling one week is what caught that.
    for (const distance of DISTANCES) {
      const season = walk(distance, 16, "detrained");
      const hard = season.flatMap(hardSessions);
      expect(
        hard.map((d) => d.templateId),
        `${distance}: hard sessions for a detrained runner`
      ).toEqual([]);
    }
  });

  it("…while the same runner, trained, gets plenty", () => {
    // The counterfactual. Without it, a generator that emitted all-easy for
    // everyone would satisfy the test above.
    for (const distance of DISTANCES) {
      const season = walk(distance, 16, "none");
      expect(
        season.flatMap(hardSessions).length,
        `${distance}: trained runner has no quality either — the assertion ` +
          `above is passing for the wrong reason`
      ).toBeGreaterThan(3);
    }
  });

  it("the taper's sharpening session is dropped too", () => {
    // Taper is not an exception: its session exists to sharpen an established
    // base, and a runner three weeks off the road has no base to sharpen.
    // Marathon taper is the final 3 weeks.
    for (const weeksOut of [2, 3, 4]) {
      const trained = persisted(
        planAt({
          distance: "marathon",
          weeksOut,
          layoff: "none",
          planTotalWeeks: 16,
        })
      );
      const detrained = persisted(
        planAt({
          distance: "marathon",
          weeksOut,
          layoff: "detrained",
          planTotalWeeks: 16,
        })
      );
      expect(hardSessions(trained).length, `wk-${weeksOut} trained`).toBe(1);
      expect(hardSessions(detrained), `wk-${weeksOut} detrained`).toEqual([]);
    }
  });
});

describe("a returning runner's long run ramps toward base, not peak", () => {
  it("never exceeds the block's base long run", () => {
    // `RACE_CONFIGS` base long runs are 5k 4 km, 10k 6, half 10, marathon 14 —
    // but the ceiling here is what the TEMPLATE LIBRARY can express. `long_6k`
    // is the shortest long template that exists, so a 5k's 4 km base floors at
    // 6. Asserting the config number would fail against a correct generator.
    const baseKm: Record<Distance, number> = {
      "5k": 6,
      "10k": 6,
      half: 10,
      marathon: 14,
    };
    for (const distance of DISTANCES) {
      const season = walk(distance, 16, "detrained");
      const longest = Math.max(...season.map(longestKm));
      expect(longest, `${distance}: detrained longest`).toBeLessThanOrEqual(
        baseKm[distance]
      );
    }
  });

  it("…while the trained runner reaches a genuinely longer peak", () => {
    for (const distance of DISTANCES) {
      const trained = Math.max(...walk(distance, 16, "none").map(longestKm));
      const detrained = Math.max(
        ...walk(distance, 16, "detrained").map(longestKm)
      );
      expect(trained, `${distance}`).toBeGreaterThan(detrained);
    }
  });

  it("the reported case: 6 weeks out, marathon, back from ten weeks off", () => {
    // The exact measurement in this file's header.
    const args = {
      distance: "marathon" as const,
      weeksOut: 6,
      planTotalWeeks: 16,
    };
    const trained = persisted(planAt({ ...args, layoff: "none" }));
    const detrained = persisted(planAt({ ...args, layoff: "detrained" }));

    expect(longestKm(trained)).toBeGreaterThanOrEqual(25);
    expect(longestKm(detrained)).toBeLessThanOrEqual(14);
    expect(hardSessions(trained).length).toBeGreaterThan(0);
    expect(hardSessions(detrained)).toEqual([]);
    // Same number of run days — this softens the week, it does not delete it.
    expect(detrained).toHaveLength(trained.length);
  });
});

describe("the policy is scoped to `detrained` alone", () => {
  it("`gap` is byte-identical to `none`", () => {
    // A missed fortnight is a SCHEDULING problem — the existing fell-behind
    // realign owns it. If `gap` ever starts changing the plan, that decision
    // should be made deliberately, not inherited from this branch.
    for (const distance of DISTANCES) {
      for (const weeksOut of [2, 6, 12]) {
        const args = { distance, weeksOut, planTotalWeeks: 16 };
        expect(
          planAt({ ...args, layoff: "gap" }).weeks,
          `${distance} @ ${weeksOut}w`
        ).toEqual(planAt({ ...args, layoff: "none" }).weeks);
      }
    }
  });

  it("the race day itself is untouched", () => {
    // A detrained runner still races. The policy softens the RUN-UP; it does
    // not quietly remove the thing the plan exists for.
    //
    // Searched across the whole plan rather than `weeks[0]`: `RACE_DATE` is a
    // Sunday, so a currentDate an exact number of weeks earlier is also a
    // Sunday and the race falls in a later week bucket. Where the race day
    // LANDS is `raceRunDayDate.run-m2`'s job; this test's job is that the
    // layoff policy leaves it alone.
    for (const distance of DISTANCES) {
      for (const weeksOut of [1, 3, 8]) {
        const trained = planAt({ distance, weeksOut, layoff: "none" });
        const detrained = planAt({ distance, weeksOut, layoff: "detrained" });
        const raceDays = (p: typeof trained) =>
          p.weeks.flat().filter((d) => d.type === "race");
        expect(
          raceDays(detrained).map((d) => [d.templateId, d.date]),
          `${distance} @ ${weeksOut}w`
        ).toEqual(raceDays(trained).map((d) => [d.templateId, d.date]));
        expect(raceDays(detrained), `${distance} @ ${weeksOut}w`).toHaveLength(
          1
        );
      }
    }
  });

  it("`belowFloor` stays stricter — the safety caps compose, not compete", () => {
    // A marathon declared 3 weeks out is below the floor, and that shape must
    // win: `belowFloor` short-circuits BEFORE the detrained branch. Asserting
    // both flags agree keeps a future edit from letting the softer of two
    // caps take precedence.
    const below = planAt({ distance: "marathon", weeksOut: 3, layoff: "none" });
    const both = planAt({
      distance: "marathon",
      weeksOut: 3,
      layoff: "detrained",
    });
    expect(below.belowFloor).toBe(true);
    expect(both.belowFloor).toBe(true);
    expect(both.weeks).toEqual(below.weeks);
  });
});
