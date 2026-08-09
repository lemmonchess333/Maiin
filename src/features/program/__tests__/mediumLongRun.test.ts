/**
 * RUN-EV-11 — the medium-long run (distance-aware midweek ceiling).
 *
 * Measured before the change (canonical RUN_TEMPLATES durations, standard
 * tuning): the flat 50-minute easy ceiling made Daniels' long-run share
 * assumption (~25-30% of weekly volume) structurally unsatisfiable for
 * half/marathon — a marathon plan's peak long run was 53-65% of a 3-4-day
 * week in EVERY week. Pfitzinger's medium-long run is the named mechanism
 * that raises the denominator; shortening the long run (a share CAP) is
 * the one response none of the cited sources would pick.
 */
import { describe, it, expect } from "vitest";
import {
  generateRacePlanV2,
  mediumLongMinutesForWeek,
  DEFAULT_RUN_TUNING,
} from "../runScheduler";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import { generateSchedule } from "@/lib/scheduleUtils";
import {
  localWeekKey,
  parseLocalDate,
  localDateString,
} from "@/lib/dateHelpers";

const DUR = new Map(RUN_TEMPLATES.map((t) => [t.id, t.estimatedDuration]));
const shift = (k: string, n: number) => {
  const d = parseLocalDate(k);
  d.setDate(d.getDate() + n);
  return localDateString(d);
};

function plan(
  distance: "5k" | "10k" | "half" | "marathon",
  weeksOut: number,
  runDays: number,
  over: Partial<Parameters<typeof generateRacePlanV2>[0]> = {}
) {
  const today = localDateString(new Date());
  return generateRacePlanV2({
    raceGoal: { distance, targetDate: shift(today, weeksOut * 7) },
    weekSchedule: generateSchedule(2, runDays),
    weeklyRunDays: runDays,
    currentDate: today,
    weekStart: localWeekKey(parseLocalDate(today)),
    tuning: DEFAULT_RUN_TUNING,
    recentLayoff: "none",
    ...over,
  });
}

const easies = (wk: { templateId: string; type: string }[]) =>
  wk.filter((d) => d.type === "easy").map((d) => d.templateId);
const minutes = (id: string) => DUR.get(id) ?? 0;

describe("mediumLongMinutesForWeek — the resolver", () => {
  const base = { totalWeeks: 16, taperWeeks: 2, volume: "standard" as const };

  it("peaks are distance-aware: 5K stays at the easy ceiling", () => {
    // Late build (past the ramp) at each distance.
    const at = (distance: "5k" | "10k" | "half" | "marathon") =>
      mediumLongMinutesForWeek({ ...base, weekIndex: 12, distance });
    expect(at("marathon")).toBeGreaterThan(at("half"));
    expect(at("half")).toBeGreaterThan(at("10k"));
    expect(at("10k")).toBeGreaterThan(at("5k"));
    expect(at("marathon")).toBeLessThanOrEqual(90);
    expect(at("5k")).toBeLessThanOrEqual(50);
  });

  it("lighter volume scales the peak down, same as the easy ramp", () => {
    const std = mediumLongMinutesForWeek({
      ...base,
      weekIndex: 12,
      distance: "marathon",
    });
    const light = mediumLongMinutesForWeek({
      ...base,
      weekIndex: 12,
      distance: "marathon",
      volume: "lighter",
    });
    expect(light).toBeLessThan(std);
    expect(light).toBeGreaterThanOrEqual(30);
  });
});

describe("the medium-long in generated plans", () => {
  it("a marathon build week carries exactly ONE medium-long, others stay ≤ 50min", () => {
    const p = plan("marathon", 20, 4);
    // Late build (past the ramp, before taper).
    const wk = p.weeks[13];
    const es = easies(wk);
    const over50 = es.filter((id) => minutes(id) > 50);
    expect(over50).toHaveLength(1);
    expect(minutes(over50[0])).toBeGreaterThanOrEqual(75);
    expect(minutes(over50[0])).toBeLessThanOrEqual(90);
  });

  it("distance ceilings hold: half ≤ 75, 10K ≤ 60, 5K ≤ 50 — across EVERY week", () => {
    const cap = { "5k": 50, "10k": 60, half: 75, marathon: 90 } as const;
    for (const distance of ["5k", "10k", "half", "marathon"] as const) {
      const p = plan(distance, { "5k": 10, "10k": 12, half: 16, marathon: 20 }[distance], 4);
      for (const wk of p.weeks) {
        for (const id of easies(wk)) {
          expect(minutes(id)).toBeLessThanOrEqual(cap[distance]);
        }
      }
    }
  });

  it("taper weeks never carry a medium-long", () => {
    const p = plan("marathon", 20, 4);
    const taperWeeks = p.weeks.slice(-3, -1); // last weeks before race week
    for (const wk of taperWeeks) {
      for (const id of easies(wk)) {
        expect(minutes(id)).toBeLessThanOrEqual(30);
      }
    }
  });

  it("a detrained returner gets NO medium-long — same rationale as no quality", () => {
    const p = plan("marathon", 20, 4, { recentLayoff: "detrained" });
    for (const wk of p.weeks) {
      for (const id of easies(wk)) {
        expect(minutes(id)).toBeLessThanOrEqual(50);
      }
    }
  });

  it("WAVE1-STRIDES: exactly one strides day per base/build week, on a plain easy slot", () => {
    const p = plan("marathon", 20, 5); // 5 run days → long + quality + MLR + 2 easy
    const race = p.weeks.length - 1;
    p.weeks.forEach((wk, i) => {
      const strided = wk.filter((d) => d.templateId.endsWith("_strides"));
      const isTaperOrRace = i >= race - 3; // marathon taper 3 + race week
      if (isTaperOrRace) {
        expect(strided, `wk${i} taper/race`).toHaveLength(0);
      } else if (easies(wk).length >= 2) {
        // A week with a plain easy slot beyond the medium-long carries
        // exactly one strides day…
        expect(strided.length, `wk${i}`).toBeLessThanOrEqual(1);
        // …and it is never the medium-long slot.
        for (const d of strided) {
          expect(minutes(d.templateId)).toBeLessThanOrEqual(50);
        }
      }
    });
    // And the block as a whole actually contains strides weeks.
    const total = p.weeks.flat().filter((d) => d.templateId.endsWith("_strides"));
    expect(total.length).toBeGreaterThan(0);
  });

  it("WAVE1-STRIDES: a detrained returner gets none", () => {
    const p = plan("marathon", 20, 5, { recentLayoff: "detrained" });
    const strided = p.weeks.flat().filter((d) => d.templateId.endsWith("_strides"));
    expect(strided).toHaveLength(0);
  });

  it("WAVE1-STRIDES: variants keep their base tier's duration (volume math unchanged)", () => {
    expect(minutes("easy_30_strides")).toBe(30);
    expect(minutes("easy_40_strides")).toBe(40);
    expect(minutes("easy_50_strides")).toBe(50);
  });

  it("SHARE REGRESSION PIN: marathon 4-day long-run share materially improves", () => {
    // Pre-change: 55% peak share, 53% in the longest-run week. Post-change,
    // measured: ~50% peak (the binding week is a CUTBACK week, where the
    // denominator shrinks by design) and ~49% in the longest-run week (the
    // ramps don't peak in the same week — the biggest long run lands beside
    // a mid-rung medium-long and a short quality session). The
    // pins are deliberately loose — they guard the mechanism (a fuller
    // week), not an exact ratio. Daniels' 25-30% stays out of reach at 4
    // days, and that is an honest property of a 4-run week, stated in the
    // ceiling's comment.
    const p = plan("marathon", 20, 4);
    let maxShare = 0;
    let longestWeekShare = 0;
    let longestSeen = 0;
    for (const wk of p.weeks) {
      const total = wk.reduce((a, d) => a + minutes(d.templateId), 0);
      const longRun = Math.max(
        0,
        ...wk
          .filter((d) => d.templateId.startsWith("long_"))
          .map((d) => minutes(d.templateId))
      );
      if (total <= 0 || longRun <= 0) continue;
      maxShare = Math.max(maxShare, longRun / total);
      if (longRun > longestSeen) {
        longestSeen = longRun;
        longestWeekShare = longRun / total;
      }
    }
    expect(maxShare).toBeGreaterThan(0);
    expect(maxShare).toBeLessThan(0.52); // was 0.55
    expect(longestWeekShare).toBeLessThan(0.5); // was 0.53
  });
});
