import { describe, it, expect } from "vitest";
import {
  getRaceGoalPlannerState,
  newRunnerRaceNote,
  raceRunDaysNote,
  raceTargetVerdict,
  type RaceDistance,
  type RaceGoalPlannerInput,
} from "../raceGoalPlanner";
import { newRunnerUntil } from "@/features/program/newRunner";
import { addLocalDays, localDateString, parseLocalDate } from "../dateHelpers";

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
    // The compressed band packs the long-run build into fewer weeks, so its
    // jumps are the steepest in the system (racePlanSafetySweep): the copy
    // says so, as the race cockpit does, rather than "a shorter
    // long-run progression".
    expect(s.statusDescription).not.toMatch(/shorter long-run/);
    expect(s.statusDescription).toMatch(/fewer weeks/);
    // "Hard" is the effort word only (Run21 (4)): the family is "quality
    // sessions".
    expect(s.statusDescription).toMatch(/fewer quality sessions/);
    expect(s.statusDescription).not.toMatch(/\bhard\b/i);
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
    expect(s.statusDescription).toMatch(/no quality sessions/);
    expect(s.statusDescription).not.toMatch(/\bhard\b/i);
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

/* Run19: the preview shows what the save keeps. A plan made on a Thursday
   saves no run before the Thursday, so the first week's minutes are the
   remaining days' (the save's own), while the run days a week stay the
   plan's shape. */
describe("getRaceGoalPlannerState — a plan made mid-week", () => {
  const input = (currentDate: string) => ({
    ...base,
    distance: "10k" as const,
    currentDate,
    weeklyRunDays: 4,
    targetDate: "2026-09-01",
  });

  it("keeps the run days a week, and counts only the minutes from today", () => {
    const monday = getRaceGoalPlannerState(input(TODAY));
    const thursday = getRaceGoalPlannerState(input("2026-06-04"));
    expect(thursday.recommendedRunDays).toBe(monday.recommendedRunDays);
    expect(thursday.firstWeekMinutes).toBeLessThan(monday.firstWeekMinutes);
    expect(thursday.firstWeekMinutes).toBeGreaterThan(0);
  });
});

/* Run19: a plan made after its week's last run day starts on next week's
   runs, and the preview shows that week. */
describe("getRaceGoalPlannerState — a plan made after the week's last run", () => {
  const TUE_WED_SAT_RUNS = [
    { day: 0, type: "rest" as const },
    { day: 1, type: "lift" as const },
    { day: 2, type: "run" as const },
    { day: 3, type: "run" as const },
    { day: 4, type: "lift" as const },
    { day: 5, type: "lift" as const },
    { day: 6, type: "run" as const },
  ];
  const input = (currentDate: string): RaceGoalPlannerInput => ({
    ...base,
    distance: "10k",
    currentDate,
    weeklyRunDays: 3,
    targetDate: "2026-09-01",
    weekSchedule: TUE_WED_SAT_RUNS,
  });

  it("previews next week's runs, as a plan made that Monday", () => {
    const sunday = getRaceGoalPlannerState(input("2026-06-07"));
    const monday = getRaceGoalPlannerState(input("2026-06-08"));
    expect(sunday.firstWeekMinutes).toBeGreaterThan(0);
    expect(sunday.firstWeekMinutes).toBe(monday.firstWeekMinutes);
    expect(sunday.firstWeekPhase).toBe(monday.firstWeekPhase);
    expect(sunday.recommendedRunDays).toBe(3);
  });
});

/* Pgm7 A7: a race plan needs at least two run days a week, and a
   marathon's setup recommends three. */
describe("raceRunDaysNote", () => {
  it("says a race plan needs two runs a week, under two", () => {
    expect(raceRunDaysNote("5k", 1)).toMatch(/needs at least two runs a week/);
  });

  it("recommends three for a marathon, and offers a half or a later date", () => {
    expect(raceRunDaysNote("marathon", 2)).toBe(
      "A marathon plan works best on three runs a week. Add a day, or choose a half marathon or a later date."
    );
  });

  it("says nothing when the count suits the race", () => {
    expect(raceRunDaysNote("5k", 2)).toBeNull();
    expect(raceRunDaysNote("half", 2)).toBeNull();
    expect(raceRunDaysNote("marathon", 3)).toBeNull();
  });
});

/* Pgm8 (R14c): when someone new to running picks a race the plan can't
   build to, setup says so and suggests run-walking it or a later date. The
   plan can't build to a race that would take them more than twice the
   longest run it reaches before race week (a Tropos heuristic). A new
   runner's runs are run-walk for six weeks, ending at 20 minutes non-stop,
   then grow five minutes a week (Run20 (5)). */
describe("newRunnerRaceNote", () => {
  // TODAY is a Monday, so the six weeks end on the Monday of 13 July.
  const until = newRunnerUntil("new", TODAY);
  const weeksOut = (weeks: number, from = TODAY) =>
    localDateString(addLocalDays(parseLocalDate(from), weeks * 7));
  const note = (
    distance: RaceDistance,
    targetDate: string,
    newRunner: string | null = until,
    currentDate = TODAY
  ) =>
    newRunnerRaceNote({
      distance,
      targetDate,
      currentDate,
      newRunnerUntil: newRunner,
    });

  it("says so for a half twelve weeks out, with run-walking it or a later date", () => {
    // Set up on a Sunday for a Sunday race: the plan's runs build to 45
    // minutes by the week before race week, and the half takes about two
    // and a half hours at a new runner's pace.
    const sunday = "2026-06-07";
    expect(
      note("half", weeksOut(12, sunday), newRunnerUntil("new", sunday), sunday)
    ).toBe(
      "Your plan builds to about 45 min of running by then, and a half marathon takes about 2 h 30 min. You can run-walk it, or choose a later date."
    );
    // From a Monday to a Monday the plan has one more week to build in.
    expect(note("half", weeksOut(12))).toMatch(
      /^Your plan builds to about 50 min of running by then, and a half marathon takes about 2 h 30 min\./
    );
  });

  it("says nothing for a 5K eight weeks out", () => {
    // Built to 30 minutes by then, and the 5K takes about 35.
    expect(note("5k", weeksOut(8))).toBeNull();
  });

  it("says nothing for anyone who isn't new to running", () => {
    expect(note("half", weeksOut(12), null)).toBeNull();
    expect(
      note("half", weeksOut(12), newRunnerUntil("occasional", TODAY))
    ).toBeNull();
    expect(
      note("half", weeksOut(12), newRunnerUntil("regular", TODAY))
    ).toBeNull();
  });

  it("says nothing for a marathon a year out, and says so half a year out", () => {
    // A year out the runs have built far past half the marathon's five
    // hours by race week; half a year out they reach two.
    expect(note("marathon", weeksOut(52))).toBeNull();
    expect(note("marathon", weeksOut(26))).toBe(
      "Your plan builds to about 2 h of running by then, and a marathon takes about 4 h 55 min. You can run-walk it, or choose a later date."
    );
  });

  it("says the plan is still run-walk when the race comes in its first weeks", () => {
    expect(note("5k", weeksOut(4))).toBe(
      "Your plan is still run-walk by then, and a 5K takes about 35 min. You can run-walk it, or choose a later date."
    );
    // The week before a race six weeks out runs 20 minutes non-stop: enough
    // for a 5K by the rule, not for a 10K.
    expect(note("5k", weeksOut(6))).toBeNull();
    expect(note("10k", weeksOut(6))).toBe(
      "Your plan is still run-walk by then, and a 10K takes about 1 h 10 min. You can run-walk it, or choose a later date."
    );
  });

  it("reads this week's runs when the race is this week", () => {
    // No week comes before race week, and this week is the first run-walk.
    expect(note("5k", TODAY)).toMatch(/^Your plan is still run-walk by then/);
    expect(note("5k", "2026-06-07")).toMatch(
      /^Your plan is still run-walk by then/
    );
    // Past the run-walk weeks, as in Settings: this week's 65 minutes, not
    // last week's 60.
    expect(note("marathon", "2026-09-10", until, "2026-09-07")).toBe(
      "Your plan builds to about 1 h 5 min of running by then, and a marathon takes about 4 h 55 min. You can run-walk it, or choose a later date."
    );
  });

  it("asks for more than twice the longest run, not twice", () => {
    // A 10K takes 70 minutes: built to 35, it is exactly twice.
    expect(note("10k", weeksOut(9))).toBeNull();
    expect(note("10k", weeksOut(8))).toBe(
      "Your plan builds to about 30 min of running by then, and a 10K takes about 1 h 10 min. You can run-walk it, or choose a later date."
    );
  });

  it("says nothing without a race date, or for one already past", () => {
    expect(note("half", "")).toBeNull();
    expect(note("half", "2026-05-31")).toBeNull();
  });

  it("is the planner's line, and only for a new runner", () => {
    const plan = (newRunner: string | null) =>
      getRaceGoalPlannerState({
        ...base,
        distance: "half",
        targetDate: weeksOut(12),
        newRunnerUntil: newRunner,
      });
    // Six run-walk weeks end at 20 minutes non-stop; five more a week from
    // 13 July makes 50 by the week of 17 August, the one before race week.
    // The half at 7:00 /km is 21.0975 × 7 ≈ 148 min, more than twice 50.
    expect(plan(until).newRunnerNote).toBe(
      "Your plan builds to about 50 min of running by then, and a half marathon takes about 2 h 30 min. You can run-walk it, or choose a later date."
    );
    expect(plan(null).newRunnerNote).toBeNull();
    expect(getRaceGoalPlannerState(base).newRunnerNote).toBeNull();
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
    expect(km.line).toContain("Goal pace 5:00 /km");
    expect(mi.line).toContain("Goal pace 8:03 /mi");
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

/* C (owner, 1 November 2026): "Good runway" counted weeks only. The verdict
   now weighs where the long run starts against what the race's plan
   reaches in the weeks left. */
describe("getRaceGoalPlannerState — the runway from the running starting point", () => {
  const monday = "2026-11-02";
  const start = {
    version: 1 as const,
    experience: "building" as const,
    weeklyMinutes: 25,
    longestRunMinutes: 25,
    confirmedAt: monday,
    source: "recorded" as const,
  };
  const weeksOut = (weeks: number, weekday = 5) =>
    localDateString(addLocalDays(parseLocalDate(monday), weeks * 7 + weekday));
  const at = (
    distance: RaceDistance,
    targetDate: string,
    runningBaseline: typeof start | null
  ) =>
    getRaceGoalPlannerState({
      ...base,
      distance,
      targetDate,
      currentDate: monday,
      liftDays: 4,
      weeklyRunDays: 6,
      runningBaseline,
    });

  it("says plainly when the long run can't climb to the race's in the weeks left", () => {
    // A marathon thirteen weeks out is a full build by the weeks alone...
    const plain = at("marathon", weeksOut(12), null);
    expect(plain.status).toBe("healthy");
    expect(plain.statusTitle).toBe("Good runway");
    // ...but from a 25-minute longest run the long run reaches 15 km.
    const s = at("marathon", weeksOut(12), start);
    expect(s.status).toBe("healthy");
    expect(s.shortOfRace).toEqual({ reaches: "15 km", raceNeeds: "25 km" });
    expect(s.statusTitle).toBe("Short runway for your running");
    expect(s.statusDescription).toBe(
      "Starting from your running now, the long run builds to about 15 km before race week, where a marathon plan with these weeks builds to 25 km. A later race or a shorter one gives it time."
    );
  });

  it("is a good runway when there's time to climb, as for the owner's April marathon", () => {
    const s = at("marathon", "2027-04-24", start);
    expect(s.shortOfRace).toBeNull();
    expect(s.statusTitle).toBe("Good runway");
    const half = at("half", weeksOut(12), start);
    expect(half.shortOfRace).toBeNull();
  });

  it("adds the line to a compressed plan's", () => {
    const s = at("marathon", weeksOut(9), start);
    expect(s.status).toBe("compressed");
    expect(s.statusTitle).toBe("Short runway");
    expect(s.statusDescription).toMatch(
      /^Tropos will compress the plan.*Starting from your running now, the long run builds to about/
    );
  });
});
