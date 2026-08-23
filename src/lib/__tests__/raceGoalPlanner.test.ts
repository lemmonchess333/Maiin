import { describe, it, expect } from "vitest";
import {
  getRaceGoalPlannerState,
  raceTargetVerdict,
  type RaceGoalPlannerInput,
} from "../raceGoalPlanner";

// Deterministic "today" — the helper never reads the wall clock.
const TODAY = "2026-06-01"; // a Monday

const base: RaceGoalPlannerInput = {
  distance: "marathon",
  targetDate: "",
  currentDate: TODAY,
  liftDays: 3,
  weeklyRunDays: 3,
};

describe("getRaceGoalPlannerState", () => {
  // ── State A — no date ──────────────────────────────────────────────
  it("State A: empty date → empty status, no CTA, calm prompt", () => {
    const s = getRaceGoalPlannerState(base);
    expect(s.status).toBe("empty");
    expect(s.ctaLabel).toBe("");
    expect(s.statusDescription).toBe(
      "Choose your race date to preview the plan."
    );
    expect(s.weeksOut).toBe(0);
    expect(s.daysOut).toBe(0);
    // Distance-only fields are valid even with no date.
    expect(s.idealWeeks).toBe(12);
    expect(s.floorWeeks).toBe(4);
    expect(s.recoveryWeeks).toBe(4);
    expect(s.distanceLabel).toBe("Marathon");
  });

  // ── State B — past date ────────────────────────────────────────────
  it("State B: past date → invalid status, no CTA", () => {
    const s = getRaceGoalPlannerState({ ...base, targetDate: "2026-05-01" });
    expect(s.status).toBe("invalid");
    expect(s.ctaLabel).toBe("");
    expect(s.statusDescription).toBe("Pick a future race date.");
  });

  it("race date == today is VALID (mirrors raceDateInvalid: past-or-empty only)", () => {
    const s = getRaceGoalPlannerState({ ...base, targetDate: TODAY });
    expect(s.status).not.toBe("invalid");
    expect(s.daysOut).toBe(0);
    // Marathon with ~0 weeks is below the floor → mostly-easy.
    expect(s.status).toBe("below-floor");
  });

  // ── State C — healthy build ────────────────────────────────────────
  it("State C: marathon far out → healthy, full progression, Save race plan", () => {
    const s = getRaceGoalPlannerState({ ...base, targetDate: "2026-12-01" });
    expect(s.status).toBe("healthy");
    expect(s.compressed).toBe(false);
    expect(s.belowFloor).toBe(false);
    expect(s.ctaLabel).toBe("Save race plan");
    expect(s.statusTitle).toBe("Good runway");
    expect(s.firstWeekPhase).toBe("Base");
    expect(s.weeksOut).toBeGreaterThanOrEqual(12);
  });

  // ── State D — compressed but workable ──────────────────────────────
  it("State D: marathon 6 weeks out → compressed, Save compressed plan", () => {
    const s = getRaceGoalPlannerState({ ...base, targetDate: "2026-07-13" });
    expect(s.daysOut).toBe(42);
    expect(s.weeksOut).toBe(6);
    expect(s.status).toBe("compressed");
    expect(s.compressed).toBe(true);
    expect(s.belowFloor).toBe(false);
    expect(s.ctaLabel).toBe("Save compressed plan");
    expect(s.statusTitle).toBe("Short runway");
  });

  // ── State E — below floor / finish safely ──────────────────────────
  it("State E: marathon 3 weeks out → below-floor, Save mostly-easy plan", () => {
    const s = getRaceGoalPlannerState({ ...base, targetDate: "2026-06-22" });
    expect(s.daysOut).toBe(21);
    expect(s.weeksOut).toBe(3);
    expect(s.status).toBe("below-floor");
    expect(s.belowFloor).toBe(true);
    expect(s.ctaLabel).toBe("Save mostly-easy plan");
    expect(s.statusTitle).toBe("Very tight");
    expect(s.statusDescription).toContain("mostly-easy");
  });

  // ── Distance-awareness: same window, different status by distance ──
  it("is distance-aware: a 5-week window is healthy for 5k but compressed for marathon", () => {
    const fiveWeeks = "2026-07-06"; // 35 days out
    const fiveK = getRaceGoalPlannerState({
      ...base,
      distance: "5k",
      targetDate: fiveWeeks,
    });
    const marathon = getRaceGoalPlannerState({
      ...base,
      distance: "marathon",
      targetDate: fiveWeeks,
    });
    expect(fiveK.daysOut).toBe(35);
    expect(fiveK.status).toBe("healthy"); // 5 >= 5k minWeeks (4)
    expect(marathon.status).toBe("compressed"); // 5 < marathon minWeeks (12), >= floor (4)
  });

  it("5k 3 weeks out is compressed (3 < 5k ideal 4), not healthy", () => {
    const s = getRaceGoalPlannerState({
      ...base,
      distance: "5k",
      targetDate: "2026-06-22",
    });
    expect(s.status).toBe("compressed");
  });

  // ── Double days arithmetic ─────────────────────────────────────────
  it("reports double days when lift + run days overflow the week", () => {
    const s = getRaceGoalPlannerState({
      ...base,
      liftDays: 6,
      weeklyRunDays: 3,
      targetDate: "2026-12-01",
    });
    expect(s.doubleDays).toBe(2); // 6 + 3 - 7
  });

  it("reports zero double days when lift + run days fit in the week", () => {
    const s = getRaceGoalPlannerState({
      ...base,
      liftDays: 3,
      weeklyRunDays: 3,
      targetDate: "2026-12-01",
    });
    expect(s.doubleDays).toBe(0);
  });

  // ── Single-source headline: weeksOut is natural, never the clamped floor ──
  it("displays truthful days/weeks for a sub-2-week race (not the engine's floor of 2)", () => {
    const s = getRaceGoalPlannerState({ ...base, targetDate: "2026-06-05" });
    expect(s.daysOut).toBe(4);
    expect(s.weeksOut).toBe(1); // ceil(4/7) — NOT the engine's clamped totalWeeks (2)
    expect(s.status).toBe("below-floor");
  });

  it("recommendedRunDays reflects the run days the plan builds", () => {
    const s = getRaceGoalPlannerState({
      ...base,
      weeklyRunDays: 4,
      targetDate: "2026-12-01",
    });
    expect(s.recommendedRunDays).toBeGreaterThan(0);
    expect(s.recommendedRunDays).toBeLessThanOrEqual(7);
  });
});

describe("raceTargetVerdict — A2 feasibility (display register)", () => {
  // A 20:00 5K benchmark ≈ VDOT 49.8.
  const fitness = { benchmark: { distanceM: 5000, timeS: 1200 }, vdot: null };

  it("null without a target time or without a benchmark", () => {
    expect(
      raceTargetVerdict({
        unit: "km",
        distance: "5k",
        targetTimeS: undefined,
        runFitness: fitness,
      })
    ).toBeNull();
    expect(
      raceTargetVerdict({
        unit: "km",
        distance: "5k",
        targetTimeS: 1200,
        runFitness: null,
      })
    ).toBeNull();
  });

  it("bands order with the gap, and the line stays in the honest register", () => {
    const at = (timeS: number) =>
      raceTargetVerdict({
        unit: "km",
        distance: "5k",
        targetTimeS: timeS,
        runFitness: fitness,
      })!;
    // Gaps measured against the real VDOT curve (current = 49.8):
    expect(at(1260).band).toBe("on_track"); // 21:00 → gap −2.8
    expect(at(1170).band).toBe("within_reach"); // 19:30 → gap +1.5
    expect(at(1130).band).toBe("stretch"); // 18:50 → gap +3.6
    expect(at(1090).band).toBe("long_shot"); // 18:10 → gap +5.9
    const line = at(1130).line;
    expect(line).toMatch(/Tropos estimate, not a promise/);
    expect(line).not.toMatch(/guarantee|will run|safe/i);
    // A2 feasibility gate: ONLY the long_shot line carries the pace-hold
    // note (the enrichment gate declines the goal pace on the same band).
    expect(at(1090).line).toMatch(/paces stay on your current fitness/i);
    expect(at(1130).line).not.toMatch(/paces stay on your current fitness/i);
  });

  it("the band is unit-free; only the quoted goal pace converts", () => {
    /* Feasibility comes from VDOT, so a goal cannot become more
       achievable by being read in miles. 50:00 for 10K is 5:00/km =
       8:03/mi. */
    const args = {
      distance: "10k" as const,
      targetTimeS: 3000,
      runFitness: fitness,
    };
    const km = raceTargetVerdict({ ...args, unit: "km" })!;
    const mi = raceTargetVerdict({ ...args, unit: "mi" })!;
    expect(mi.band).toBe(km.band);
    expect(mi.goalPaceS).toBe(km.goalPaceS); // stored value stays sec/km
    expect(km.line).toContain("Goal pace 5:00/km");
    expect(mi.line).toContain("Goal pace 8:03/mi");
  });

  it("goal pace is the target spread over the distance", () => {
    const v = raceTargetVerdict({
      unit: "km",
      distance: "10k",
      targetTimeS: 3000, // 50:00 → 5:00/km
      runFitness: fitness,
    })!;
    expect(Math.round(v.goalPaceS)).toBe(300);
  });
});
