/**
 * The running and hybrid personas: running-evidence §6.5's people (A–D),
 * then the rest of the training-engine prompt's Phase 2 list. Race dates are
 * counted from the season's start, so a plan is the same length whatever day
 * the suite runs, and a benchmark is the race the runner's own VDOT runs.
 */
import {
  addLocalDays,
  localDateString,
  parseLocalDate,
} from "@/lib/dateHelpers";
import { DEFAULT_START, type LiftPersona } from "./liftSeason";
import type { LifterSetup } from "./lifter";
import { raceTimeS } from "./runSeason";

/** `weeks` whole weeks and `days` days after the default start (a Monday):
 *  `fromStart(n, 6)` is a Sunday. */
const fromStart = (weeks: number, days = 0) =>
  localDateString(
    addLocalDays(parseLocalDate(DEFAULT_START), weeks * 7 + days)
  );

/** The race a runner at `vdot` runs over `distanceM`, as Settings takes it. */
const raceAt = (vdot: number, distanceM: number) => ({
  distanceM,
  timeS: Math.round(raceTimeS(vdot, distanceM, 0)),
});

/** The VDOT whose marathon, by the model's race day (`raceTimeS`, with its
 *  low-volume correction), takes `timeS` on `weeklyKm` a week. */
function vdotForMarathon(timeS: number, weeklyKm: number): number {
  let lo = 20;
  let hi = 85;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (raceTimeS(mid, 42195, weeklyKm) > timeS) lo = mid;
    else hi = mid;
  }
  return Math.round(((lo + hi) / 2) * 10) / 10;
}

/** Someone who doesn't lift: the plan has no lifting days. */
const NO_LIFTING = {
  lifter: { trainingAge: "novice", start1RM: {}, seedRir: 3 } as LifterSetup,
  sessionShare: 0,
  calibrates: false,
  tracked: [] as string[],
};

const RUNNING_ONLY = {
  trainingActivity: "running",
  primaryGoal: "running",
  daysPerWeek: 0,
} as const;

const BIG_FOUR = ["squat", "bench-press", "deadlift", "overhead-press"];

/** An intermediate who lifts alongside the running. */
const INTERMEDIATE_LIFTER: LifterSetup = {
  trainingAge: "intermediate",
  start1RM: {
    "bench-press": 80,
    squat: 100,
    deadlift: 130,
    "overhead-press": 50,
  },
  seedRir: 2,
};

const NOVICE_LIFTER: LifterSetup = {
  trainingAge: "novice",
  start1RM: {
    "bench-press": 50,
    squat: 60,
    deadlift: 80,
    "overhead-press": 32.5,
  },
  seedRir: 3,
};

/** A. Sedentary to a 5K in about ten weeks, three runs a week, starting on
 *  a Thursday. First 5K expected in 30–40 minutes; 10–25% injured over
 *  6–12 weeks; 27.3% finish Couch to 5K (§6.5). */
export const COUCH_TO_5K: LiftPersona = {
  name: "couch-to-5k",
  start: fromStart(0, 3),
  answers: {
    ...RUNNING_ONLY,
    runFrequency: "new",
    runMode: "race_prep",
    weeklyRunDays: 3,
    raceDistance: "5k",
    raceTargetDate: fromStart(10, 6),
    experience: "beginner",
  },
  nutrition: "recomp",
  ...NO_LIFTING,
  running: {
    runner: { vdot: 24, weeklyMinutes: 20, runningWeeks: 0 },
    runShare: 0.8,
  },
};

/** C. A 3:45 marathoner after sub-3:30 in 16 weeks: +3.6 VDOT by the
 *  marathon's own equivalence, against a typical +1.5–3 (§6.5). The 3:45
 *  came on about 48 km a week, so their VDOT over shorter races is the one
 *  that runs 3:45 on that (`vdotForMarathon`). Entered the 3:45 and the
 *  goal. */
export const SUB_330: LiftPersona = {
  name: "sub-3-30",
  answers: {
    ...RUNNING_ONLY,
    runFrequency: "regular",
    runMode: "race_prep",
    weeklyRunDays: 5,
    raceDistance: "marathon",
    raceTargetDate: fromStart(15, 6),
    experience: "intermediate",
  },
  nutrition: "recomp",
  ...NO_LIFTING,
  running: {
    runner: {
      vdot: vdotForMarathon(13500, 48),
      weeklyMinutes: 280,
      runningWeeks: 200,
    },
    runShare: 0.92,
    benchmark: { distanceM: 42195, timeS: 13500 },
    goalTimeS: 12599,
  },
};

/** B. A 50-minute 10K on 30 km a week, a first marathon in a year, lifting
 *  three days: VDOT +2 to +5 expected, a finish about 3:45–3:50 (§6.5). Its
 *  year crosses both of Auckland's changes of clocks. */
export const YEAR_OUT_MARATHON: LiftPersona = {
  name: "year-out-marathon",
  answers: {
    trainingActivity: "both",
    primaryGoal: "general",
    daysPerWeek: 3,
    experience: "intermediate",
    runFrequency: "regular",
    runMode: "race_prep",
    weeklyRunDays: 4,
    raceDistance: "marathon",
    raceTargetDate: fromStart(51, 6),
    raceLegTrim: true,
  },
  nutrition: "recomp",
  lifter: INTERMEDIATE_LIFTER,
  sessionShare: 0.85,
  calibrates: true,
  tracked: BIG_FOUR,
  runsFirst: true,
  running: {
    runner: { vdot: 40, weeklyMinutes: 195, runningWeeks: 150, lifts: true },
    runShare: 0.85,
    benchmark: { distanceM: 10000, timeS: 3000 },
  },
};

/** D. A recreational runner off sick for six weeks in a 10K build: about
 *  −7% to −16% VO2max (§6.5); away from the app while ill. */
export const SICK_SIX_WEEKS: LiftPersona = {
  name: "sick-six-weeks",
  answers: {
    ...RUNNING_ONLY,
    runFrequency: "regular",
    runMode: "race_prep",
    weeklyRunDays: 4,
    raceDistance: "10k",
    raceTargetDate: fromStart(19, 6),
    experience: "intermediate",
  },
  nutrition: "recomp",
  ...NO_LIFTING,
  breaks: [6, 7, 8, 9, 10, 11],
  awayFromApp: true,
  running: {
    runner: { vdot: 44, weeklyMinutes: 220, runningWeeks: 150 },
    runShare: 0.9,
    benchmark: raceAt(44, 10000),
  },
};

/** A half marathon on three run days, a recreational runner on about 30 km
 *  a week who entered a 5K. */
export const HALF_ON_3_DAYS: LiftPersona = {
  name: "half-3-days",
  answers: {
    ...RUNNING_ONLY,
    runFrequency: "regular",
    runMode: "race_prep",
    weeklyRunDays: 3,
    raceDistance: "half",
    raceTargetDate: fromStart(13, 6),
    experience: "intermediate",
  },
  nutrition: "recomp",
  ...NO_LIFTING,
  running: {
    runner: { vdot: 42, weeklyMinutes: 175, runningWeeks: 100 },
    runShare: 0.9,
    benchmark: raceAt(42, 5000),
  },
};

/** "New to running" at setup's default of one run a week, with a marathon in
 *  twenty weeks (running-engine-audit §7 item 11). */
export const NEW_RUNNER_MARATHON: LiftPersona = {
  name: "new-runner-marathon",
  answers: {
    ...RUNNING_ONLY,
    runFrequency: "new",
    runMode: "race_prep",
    weeklyRunDays: 1,
    raceDistance: "marathon",
    raceTargetDate: fromStart(19, 6),
    experience: "beginner",
  },
  nutrition: "recomp",
  ...NO_LIFTING,
  running: {
    runner: { vdot: 30, weeklyMinutes: 40, runningWeeks: 4 },
    runShare: 0.85,
  },
};

/** Running with no plan for twenty weeks, three runs a week of their own. */
export const FREEFORM_RUNNER: LiftPersona = {
  name: "freeform-runner",
  answers: {
    ...RUNNING_ONLY,
    runFrequency: "regular",
    runMode: "freeform",
    weeklyRunDays: 0,
    experience: "intermediate",
  },
  nutrition: "recomp",
  ...NO_LIFTING,
  running: {
    // Their Sunday 75 minutes, at their easy pace.
    runner: {
      vdot: 38,
      weeklyMinutes: 150,
      runningWeeks: 80,
      longestRunKm: 11.4,
    },
    runShare: 1,
    freeRuns: [
      { day: 2, minutes: 40 },
      { day: 4, minutes: 40 },
      { day: 0, minutes: 75 },
    ],
  },
};

/** A hybrid on three lifts and four runs, a half in sixteen weeks: with the
 *  leg trim, and without. */
function hybrid34(trim: boolean): LiftPersona {
  return {
    name: trim ? "hybrid-3-4-trim" : "hybrid-3-4-no-trim",
    answers: {
      trainingActivity: "both",
      primaryGoal: "general",
      daysPerWeek: 3,
      experience: "intermediate",
      runFrequency: "regular",
      runMode: "race_prep",
      weeklyRunDays: 4,
      raceDistance: "half",
      raceTargetDate: fromStart(15, 6),
      raceLegTrim: trim,
    },
    nutrition: "recomp",
    lifter: INTERMEDIATE_LIFTER,
    sessionShare: 0.9,
    calibrates: true,
    tracked: BIG_FOUR,
    runsFirst: true,
    running: {
      runner: { vdot: 40, weeklyMinutes: 180, runningWeeks: 100, lifts: true },
      runShare: 0.9,
      benchmark: raceAt(40, 5000),
    },
  };
}

/** A hybrid on two lifts and three runs, a 10K in twelve weeks, lifting
 *  before running: with the leg trim, and without. */
function hybrid23(trim: boolean): LiftPersona {
  return {
    name: trim ? "hybrid-2-3-trim" : "hybrid-2-3-no-trim",
    answers: {
      trainingActivity: "both",
      primaryGoal: "general",
      daysPerWeek: 2,
      experience: "beginner",
      runFrequency: "occasional",
      runMode: "race_prep",
      weeklyRunDays: 3,
      raceDistance: "10k",
      raceTargetDate: fromStart(11, 6),
      raceLegTrim: trim,
    },
    nutrition: "recomp",
    lifter: NOVICE_LIFTER,
    sessionShare: 0.9,
    calibrates: false,
    tracked: BIG_FOUR,
    running: {
      runner: { vdot: 36, weeklyMinutes: 120, runningWeeks: 30, lifts: true },
      runShare: 0.85,
    },
  };
}

export const HYBRID_3_4_TRIM = hybrid34(true);
export const HYBRID_3_4_NO_TRIM = hybrid34(false);
export const HYBRID_2_3_TRIM = hybrid23(true);
export const HYBRID_2_3_NO_TRIM = hybrid23(false);

/** Each persona, with the weeks its season runs: to its race, through the
 *  recovery after it (1–4 weeks by distance) and three weeks on, where the
 *  plan has to have let the race go. */
export const RUN_PERSONAS: readonly { persona: LiftPersona; weeks: number }[] =
  [
    { persona: COUCH_TO_5K, weeks: 15 },
    { persona: HALF_ON_3_DAYS, weeks: 20 },
    { persona: SUB_330, weeks: 23 },
    { persona: SICK_SIX_WEEKS, weeks: 25 },
    { persona: NEW_RUNNER_MARATHON, weeks: 27 },
    { persona: FREEFORM_RUNNER, weeks: 20 },
    { persona: YEAR_OUT_MARATHON, weeks: 59 },
    { persona: HYBRID_3_4_TRIM, weeks: 22 },
    { persona: HYBRID_3_4_NO_TRIM, weeks: 22 },
    { persona: HYBRID_2_3_TRIM, weeks: 17 },
    { persona: HYBRID_2_3_NO_TRIM, weeks: 17 },
  ];
