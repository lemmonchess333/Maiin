/**
 * The week a runner actually RECEIVES progresses across a block.
 *
 * ── The defect ───────────────────────────────────────────────────────────
 *
 * `generateRacePlanV2` returns `weeks[0..n]`, and every caller persists
 * `weeks[0]` and nothing else — `useProgram.ts`, `planBuilder.ts` and
 * `raceRunDaysReconcile.ts` are the only `.weeks[` consumers in non-test
 * source. The plan is regenerated on each weekly rollover with a horizon one
 * week shorter, so the runner sat at "week 0 of a fresh block" forever, and
 * `getPhaseForWeek(0, T, d)` is structurally always `"base"`
 * (`preTaperWeeks = max(1, …) >= 1`, so `0 < preTaperWeeks * 0.4` holds for
 * every plan longer than `taperWeeks + 1`).
 *
 * Measured before the fix, by simulating the real rollover on a 26-week
 * marathon plan — regenerate weekly, take `weeks[0]`:
 *
 *     26w out … 5w out   155 min   easy_30 ×3 + long_12k   (22 identical weeks)
 *      4w out … 2w out   120 min   easy_30 ×4
 *
 * No tempo, no interval, no long run past 12 km, then a marathon. The whole
 * periodisation — including the long-run ramp and the quality ramp — existed
 * only in `weeks[1..n]`, which nothing consumed.
 *
 * ── What is asserted ─────────────────────────────────────────────────────
 *
 * These tests drive the PERSISTED path, not the returned array: they walk a
 * season week by week the way `useProgram` does, carrying `totalWeeks`
 * forward, and assert on `weeks[0]` alone. A test that reads `plan.weeks`
 * cannot see this class of defect at all, which is why none of the existing
 * race-plan tests caught it.
 */
import { describe, it, expect } from "vitest";

import { generateRacePlanV2 } from "../runScheduler";
import { generateSchedule } from "@/lib/scheduleUtils";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import {
  localDateString,
  localWeekKey,
  parseLocalDate,
} from "@/lib/dateHelpers";

const RACE_DATE = "2026-12-06"; // a Sunday
const TEMPLATE = new Map(RUN_TEMPLATES.map((t) => [t.id, t]));

type Distance = "5k" | "10k" | "half" | "marathon";

interface PersistedWeek {
  weeksOut: number;
  templateIds: string[];
  minutes: number;
  types: string[];
}

/**
 * Simulate what a runner is actually handed, week by week.
 *
 * Mirrors `useProgram`'s regen recipe: a fresh `currentDate` each week, the
 * block length carried forward from creation, and only `weeks[0]` kept.
 */
function walkSeason(args: {
  distance: Distance;
  startWeeksOut: number;
  runDays?: number;
  carryBlockLength?: boolean;
}): PersistedWeek[] {
  const { distance, startWeeksOut } = args;
  const runDays = args.runDays ?? 4;
  const carryBlockLength = args.carryBlockLength ?? true;

  let blockWeeks: number | undefined;
  const out: PersistedWeek[] = [];

  for (let weeksOut = startWeeksOut; weeksOut >= 1; weeksOut--) {
    const d = parseLocalDate(RACE_DATE);
    d.setDate(d.getDate() - weeksOut * 7);
    const currentDate = localDateString(d);
    const plan = generateRacePlanV2({
      recentLayoff: "none",
      weekSchedule: generateSchedule(2, runDays),
      raceGoal: { distance, targetDate: RACE_DATE },
      weeklyRunDays: runDays,
      currentDate,
      weekStart: localWeekKey(parseLocalDate(currentDate)),
      planTotalWeeks: carryBlockLength ? blockWeeks : undefined,
    });
    // `useProgram.makeRunPlanRecord`: `totalWeeks: carry.totalWeeks ?? v2.totalWeeks`
    // — the block length is fixed at creation and carried thereafter.
    if (blockWeeks === undefined) blockWeeks = plan.totalWeeks;

    const week = plan.weeks[0] ?? [];
    out.push({
      weeksOut,
      templateIds: week.map((r) => r.templateId),
      types: week.map((r) => r.type),
      minutes: week.reduce(
        (s, r) => s + (TEMPLATE.get(r.templateId)?.estimatedDuration ?? 0),
        0
      ),
    });
  }
  return out;
}

describe("the persisted week progresses across a block", () => {
  it("a marathon block is no longer 22 identical weeks", () => {
    const season = walkSeason({ distance: "marathon", startWeeksOut: 26 });
    const distinct = new Set(season.map((w) => w.templateIds.join(",")));
    // Pre-fix this was 2: one 155-min base week and one 120-min all-easy week.
    expect(distinct.size).toBeGreaterThan(6);
  });

  it("the runner is actually given quality sessions", () => {
    // Pre-fix: zero tempo and zero interval sessions across the whole season,
    // for every distance. The quality ramp was generated and discarded.
    for (const distance of ["5k", "10k", "half", "marathon"] as const) {
      const season = walkSeason({ distance, startWeeksOut: 26 });
      const quality = season.flatMap((w) =>
        w.types.filter((t) => t === "tempo" || t === "intervals")
      );
      expect(
        quality.length,
        `${distance}: no quality all season`
      ).toBeGreaterThan(4);
    }
  });

  it("the long run reaches the block's peak, not just its base", () => {
    const season = walkSeason({ distance: "marathon", startWeeksOut: 26 });
    const longKm = season.flatMap((w) =>
      w.templateIds
        .map((id) => TEMPLATE.get(id))
        .filter((t) => t?.type === "long")
        .map((t) => t!.config.targetDistanceKm ?? 0)
    );
    // Pre-fix every long run was long_12k — baseLongKm, forever.
    expect(Math.max(...longKm)).toBeGreaterThanOrEqual(25);
    expect(Math.min(...longKm)).toBeLessThan(Math.max(...longKm));
  });

  it("weekly volume rises then falls — a block shape, not a flat line", () => {
    const season = walkSeason({ distance: "marathon", startWeeksOut: 26 });
    const mins = season.map((w) => w.minutes);
    const peak = Math.max(...mins);
    const first = mins[0];
    const raceWeekIdx = mins.length - 1;
    expect(peak).toBeGreaterThan(first * 1.4);
    // And the taper is genuinely lower than the peak.
    const taperish = mins.slice(raceWeekIdx - 3, raceWeekIdx);
    for (const m of taperish) expect(m).toBeLessThan(peak);
  });

  it("a real marathon taper keeps its quality session", () => {
    // The `compressed` flag used to be derived from weeks REMAINING, so every
    // plan became "compressed" in its final weeks and the taper branch's
    // `!compressed` gate dropped the one session Bosquet et al. (2007) say a
    // taper must keep: volume down, INTENSITY maintained.
    const season = walkSeason({ distance: "marathon", startWeeksOut: 26 });
    const taperWeeks = season.filter((w) => w.weeksOut >= 2 && w.weeksOut <= 4);
    expect(taperWeeks).toHaveLength(3);
    const withQuality = taperWeeks.filter((w) =>
      w.types.some((t) => t === "tempo" || t === "intervals")
    );
    expect(withQuality.length).toBeGreaterThan(0);
  });
});

describe("the fallback is exactly the old behaviour", () => {
  it("without a carried block length, every week is the old flat base week", () => {
    // This is the pre-fix behaviour, preserved deliberately: a caller with no
    // carry genuinely IS at position 0. Asserting it keeps the fallback from
    // silently acquiring the fix and hiding a caller that forgot to thread.
    const season = walkSeason({
      distance: "marathon",
      startWeeksOut: 26,
      carryBlockLength: false,
    });
    const preTaper = season.filter((w) => w.weeksOut >= 5);
    const distinct = new Set(preTaper.map((w) => w.templateIds.join(",")));
    expect(distinct.size).toBe(1);
    expect([...distinct][0]).toContain("long_");
    expect([...distinct][0]).not.toContain("tempo");
  });

  it("a fresh plan's first week is identical either way", () => {
    // At creation there is nothing to carry, so the two paths must agree —
    // this is what makes the change additive rather than a behaviour break
    // for every existing caller and test.
    const d = parseLocalDate(RACE_DATE);
    d.setDate(d.getDate() - 26 * 7);
    const currentDate = localDateString(d);
    const args = {
      weekSchedule: generateSchedule(2, 4),
      raceGoal: { distance: "marathon" as const, targetDate: RACE_DATE },
      weeklyRunDays: 4,
      currentDate,
      weekStart: localWeekKey(parseLocalDate(currentDate)),
      recentLayoff: "none" as const,
    };
    const fresh = generateRacePlanV2(args);
    const carried = generateRacePlanV2({
      ...args,
      planTotalWeeks: fresh.totalWeeks,
    });
    expect(carried.weeks).toEqual(fresh.weeks);
    expect(carried.compressed).toBe(fresh.compressed);
    expect(carried.belowFloor).toBe(fresh.belowFloor);
  });

  it("a stale or corrupt carry shorter than the time left is ignored", () => {
    // Trusting it would place the runner PAST the end of their own block.
    const d = parseLocalDate(RACE_DATE);
    d.setDate(d.getDate() - 20 * 7);
    const currentDate = localDateString(d);
    const args = {
      weekSchedule: generateSchedule(2, 4),
      raceGoal: { distance: "marathon" as const, targetDate: RACE_DATE },
      weeklyRunDays: 4,
      currentDate,
      weekStart: localWeekKey(parseLocalDate(currentDate)),
      recentLayoff: "none" as const,
    };
    expect(
      generateRacePlanV2({
        ...args,
        planTotalWeeks: 3,
      }).weeks
    ).toEqual(generateRacePlanV2(args).weeks);
  });
});

describe("a genuinely short block still reads as compressed", () => {
  it("compressed/belowFloor describe the BLOCK, not the days remaining", () => {
    // A runner who declares a marathon 3 weeks out has a below-floor block and
    // must keep the finish-safely shape for its whole (short) life — the flag
    // must not decay just because time passes.
    const season = walkSeason({ distance: "marathon", startWeeksOut: 3 });
    for (const w of season) {
      expect(w.types).not.toContain("tempo");
      expect(w.types).not.toContain("intervals");
    }
  });
});
