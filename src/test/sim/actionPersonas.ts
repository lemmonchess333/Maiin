/**
 * People who use the app's buttons besides Start (training-engine prompt,
 * Phase 2: "the person's actions … as the commands the app sends"). Each is
 * one of the lifting or running personas tapping one thing more, so its
 * trace reads against theirs: Skip, a swap kept and one not, Train's
 * Replace Exercise, "Easier today" on dumbbells and on a light barbell, a
 * lighter week taken after a bad one (alone and with a race plan), and a
 * runner who moves the long run to Sunday, skips the runs they miss and
 * says "Not now" to falling behind.
 */
import {
  DUMBBELL_BEGINNER,
  INTERMEDIATE_MAN,
  INTERMEDIATE_WOMAN,
  LIGHT_TRAINER,
  NOVICE_MAN,
  NOVICE_WOMAN,
} from "./liftPersonas";
import type { LiftPersona } from "./liftSeason";
import { HALF_ON_3_DAYS, HYBRID_3_4_TRIM } from "./runPersonas";

/** The light trainer, tapping "Skip this lift" on each lift day they
 *  don't train, where the light trainer leaves the session to wait. */
export const LIGHT_TRAINER_SKIPS: LiftPersona = {
  ...LIGHT_TRAINER,
  name: "light-trainer-skips",
  actions: { skipsLifts: 1 },
};

/** A sore shoulder from week 3: dumbbells in the barbell bench's place,
 *  kept in the plan at Finish. The plan already has a dumbbell bench as an
 *  accessory, so the kept swap makes it two slots. */
export const SWAPS_AND_KEEPS: LiftPersona = {
  ...INTERMEDIATE_MAN,
  name: "swaps-bench-keeps",
  actions: {
    swap: {
      fromWeek: 3,
      exerciseId: "bench-press",
      replacementId: "db-bench",
      keep: true,
    },
  },
  tracked: [...INTERMEDIATE_MAN.tracked, "db-bench"],
};

/** No rack free from week 5: the leg press for today in the squat's place,
 *  every session, never kept. */
export const SWAPS_FOR_TODAY: LiftPersona = {
  ...INTERMEDIATE_WOMAN,
  name: "swaps-squat-today",
  actions: {
    swap: {
      fromWeek: 5,
      exerciseId: "squat",
      replacementId: "leg-press",
      keep: false,
    },
  },
  tracked: [...INTERMEDIATE_WOMAN.tracked, "leg-press"],
};

/** Train's "Replace Exercise" in week 2: a seated cable row for the
 *  barbell row. */
export const REPLACES_ROW: LiftPersona = {
  ...NOVICE_MAN,
  name: "replaces-row",
  actions: {
    replace: {
      week: 2,
      exerciseId: "barbell-row",
      replacementId: "seated-row",
    },
  },
  tracked: [...NOVICE_MAN.tracked, "seated-row"],
};

/** "Easier today" on about a third of the sessions, on dumbbells… */
export const DUMBBELL_EASIER_DAYS: LiftPersona = {
  ...DUMBBELL_BEGINNER,
  name: "dumbbell-easier-days",
  actions: { easierToday: 0.3 },
};

/** …and on a barbell plan whose lightest lifts sit at the bar. */
export const BARBELL_EASIER_DAYS: LiftPersona = {
  ...NOVICE_WOMAN,
  name: "barbell-easier-days",
  actions: { easierToday: 0.3 },
};

/** A lighter week from Train's menu after a week with three misses or
 *  lowered lifts, where the menu offers one. */
export const LIGHTER_AFTER_MISSES: LiftPersona = {
  ...INTERMEDIATE_MAN,
  name: "lighter-after-misses",
  actions: { lighterWeekAfterMisses: 3 },
};

/** The same, as a hybrid on a race plan: the lighter week eases the
 *  week's runs a rung too. */
export const HYBRID_LIGHTER_WEEK: LiftPersona = {
  ...HYBRID_3_4_TRIM,
  name: "hybrid-lighter-week",
  actions: { lighterWeekAfterMisses: 2 },
};

/** The half marathoner on three days who wants the long run on Sunday,
 *  skips the runs they miss, and says "Not now" to falling behind. They
 *  miss week 8, in the build, so the Monday check has a week to flag:
 *  until the race plan waited for its race to end (F6), its only flags
 *  came after race day. */
export const HALF_MOVES_LONG_RUN: LiftPersona = {
  ...HALF_ON_3_DAYS,
  name: "half-moves-long-run",
  breaks: [8],
  actions: { longRunOn: 0, skipsRuns: 1, dismissesFellBehind: true },
};

export const ACTION_PERSONAS: readonly {
  persona: LiftPersona;
  weeks: number;
}[] = [
  { persona: LIGHT_TRAINER_SKIPS, weeks: 26 },
  { persona: SWAPS_AND_KEEPS, weeks: 26 },
  { persona: SWAPS_FOR_TODAY, weeks: 26 },
  { persona: REPLACES_ROW, weeks: 26 },
  { persona: DUMBBELL_EASIER_DAYS, weeks: 26 },
  { persona: BARBELL_EASIER_DAYS, weeks: 26 },
  { persona: LIGHTER_AFTER_MISSES, weeks: 26 },
  { persona: HYBRID_LIGHTER_WEEK, weeks: 22 },
  { persona: HALF_MOVES_LONG_RUN, weeks: 20 },
];
