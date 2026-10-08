/**
 * The lifting personas: lifting-evidence.md §4.5's illustrated people, with
 * their starting lifts, then the training-engine prompt's Phase 2 list (the
 * running and hybrid people are the run simulator's). Each says how the
 * person uses the app as well as who they are, since that decides more of
 * what happens than the plan does.
 */
import type { LiftPersona } from "./liftSeason";

const BIG_FOUR = ["squat", "bench-press", "deadlift", "overhead-press"];

export const NOVICE_MAN: LiftPersona = {
  name: "novice-man",
  answers: { experience: "beginner", primaryGoal: "strength", daysPerWeek: 3 },
  nutrition: "recomp",
  lifter: {
    trainingAge: "novice",
    start1RM: {
      "bench-press": 60,
      squat: 70,
      deadlift: 90,
      "overhead-press": 40,
    },
    seedRir: 3,
  },
  sessionShare: 0.95,
  calibrates: false,
  tracked: BIG_FOUR,
};

export const NOVICE_WOMAN: LiftPersona = {
  name: "novice-woman",
  answers: {
    experience: "beginner",
    primaryGoal: "general",
    daysPerWeek: 3,
    gender: "female",
    weightKg: 62,
    heightCm: 165,
  },
  nutrition: "recomp",
  lifter: {
    trainingAge: "novice",
    start1RM: {
      "bench-press": 30,
      squat: 45,
      deadlift: 55,
      "overhead-press": 20,
    },
    seedRir: 3,
  },
  sessionShare: 0.95,
  calibrates: false,
  tracked: BIG_FOUR,
};

/** Benches 100 kg and wants +10 kg in 16 weeks (§4.5). Knows their lifts. */
export const INTERMEDIATE_MAN: LiftPersona = {
  name: "intermediate-man",
  answers: {
    experience: "intermediate",
    primaryGoal: "strength",
    daysPerWeek: 4,
    weightKg: 85,
  },
  nutrition: "recomp",
  lifter: {
    trainingAge: "intermediate",
    start1RM: {
      "bench-press": 100,
      squat: 140,
      deadlift: 170,
      "overhead-press": 60,
    },
    seedRir: 3,
  },
  sessionShare: 0.95,
  calibrates: true,
  tracked: BIG_FOUR,
};

/** Training for size (§4.5). Knows her lifts. */
export const INTERMEDIATE_WOMAN: LiftPersona = {
  name: "intermediate-woman",
  answers: {
    experience: "intermediate",
    primaryGoal: "hypertrophy",
    daysPerWeek: 4,
    gender: "female",
    weightKg: 62,
    heightCm: 165,
  },
  nutrition: "lean bulk",
  lifter: {
    trainingAge: "intermediate",
    start1RM: {
      "bench-press": 50,
      squat: 85,
      deadlift: 110,
      "overhead-press": 35,
    },
    seedRir: 3,
  },
  sessionShare: 0.95,
  calibrates: true,
  tracked: BIG_FOUR,
};

/** Five days a week, years in. */
export const ADVANCED_MAN: LiftPersona = {
  name: "advanced-man",
  answers: {
    experience: "advanced",
    primaryGoal: "strength",
    daysPerWeek: 5,
    weightKg: 95,
  },
  nutrition: "recomp",
  lifter: {
    trainingAge: "advanced",
    start1RM: {
      "bench-press": 140,
      squat: 200,
      deadlift: 240,
      "overhead-press": 85,
    },
    seedRir: 2,
  },
  sessionShare: 0.95,
  calibrates: true,
  tracked: BIG_FOUR,
};

/** Wants size and strength both, so runs the plan on "Build muscle"... */
const POWERBUILDER = {
  lifter: {
    trainingAge: "intermediate" as const,
    start1RM: {
      "bench-press": 110,
      squat: 150,
      deadlift: 190,
      "overhead-press": 65,
    },
    seedRir: 3,
  },
  nutrition: "lean bulk" as const,
  sessionShare: 0.9,
  calibrates: true,
  picksUpHeavier: true,
  tracked: BIG_FOUR,
};

export const POWERBUILDER_SIZE: LiftPersona = {
  ...POWERBUILDER,
  name: "powerbuilder-size",
  answers: {
    experience: "intermediate",
    primaryGoal: "hypertrophy",
    daysPerWeek: 4,
    weightKg: 88,
  },
};

/** ...and the same person on "Get stronger". */
export const POWERBUILDER_STRENGTH: LiftPersona = {
  ...POWERBUILDER,
  name: "powerbuilder-strength",
  answers: {
    experience: "intermediate",
    primaryGoal: "strength",
    daysPerWeek: 4,
    weightKg: 88,
  },
};

/** Plans four days and does about two of them. */
export const LIGHT_TRAINER: LiftPersona = {
  name: "light-trainer",
  answers: { experience: "beginner", primaryGoal: "general", daysPerWeek: 4 },
  nutrition: "recomp",
  lifter: {
    trainingAge: "novice",
    start1RM: {
      "bench-press": 55,
      squat: 65,
      deadlift: 85,
      "overhead-press": 35,
    },
    seedRir: 3,
  },
  sessionShare: 0.5,
  calibrates: false,
  tracked: BIG_FOUR,
};

/** Two 30-minute sessions a week with dumbbells at home. */
export const DUMBBELL_BEGINNER: LiftPersona = {
  name: "dumbbell-beginner",
  answers: {
    experience: "beginner",
    primaryGoal: "general",
    daysPerWeek: 2,
    sessionMinutes: 30,
    equipment: "home_gym",
    gender: "female",
    weightKg: 70,
    heightCm: 168,
  },
  nutrition: "cut",
  lifter: { trainingAge: "novice", start1RM: {}, seedRir: 4 },
  sessionShare: 0.9,
  calibrates: false,
  tracked: ["db-bench", "goblet-squat", "db-rdl", "db-shoulder-press"],
};

/** Four weeks off in the middle (weeks 9–12), then "Ease back in". */
export const LAYOFF_EASES_BACK: LiftPersona = {
  name: "layoff-eases-back",
  answers: {
    experience: "intermediate",
    primaryGoal: "general",
    daysPerWeek: 3,
  },
  nutrition: "recomp",
  lifter: {
    trainingAge: "intermediate",
    start1RM: {
      "bench-press": 90,
      squat: 120,
      deadlift: 150,
      "overhead-press": 55,
    },
    seedRir: 3,
  },
  sessionShare: 0.95,
  calibrates: true,
  breaks: [9, 10, 11, 12],
  awayFromApp: true,
  easesBackIn: true,
  tracked: BIG_FOUR,
};

/** The same four weeks off, then "Keep my old weights". */
export const LAYOFF_KEEPS_WEIGHTS: LiftPersona = {
  ...LAYOFF_EASES_BACK,
  name: "layoff-keeps-weights",
  easesBackIn: false,
};

/** Six weeks off sick (weeks 7–12), still opening the app now and then. */
export const OFF_SICK: LiftPersona = {
  name: "off-sick",
  answers: { experience: "beginner", primaryGoal: "general", daysPerWeek: 3 },
  nutrition: "recomp",
  lifter: {
    trainingAge: "novice",
    start1RM: {
      "bench-press": 50,
      squat: 60,
      deadlift: 80,
      "overhead-press": 32,
    },
    seedRir: 3,
  },
  sessionShare: 0.9,
  calibrates: false,
  breaks: [7, 8, 9, 10, 11, 12],
  easesBackIn: true,
  tracked: BIG_FOUR,
};

/** A week away twice (weeks 8 and 17), not opening the app. */
export const HOLIDAYS: LiftPersona = {
  name: "holidays",
  answers: {
    experience: "intermediate",
    primaryGoal: "hypertrophy",
    daysPerWeek: 4,
  },
  nutrition: "recomp",
  lifter: {
    trainingAge: "intermediate",
    start1RM: {
      "bench-press": 85,
      squat: 115,
      deadlift: 145,
      "overhead-press": 50,
    },
    seedRir: 3,
  },
  sessionShare: 0.9,
  calibrates: true,
  breaks: [8, 17],
  awayFromApp: true,
  easesBackIn: false,
  tracked: BIG_FOUR,
};

/** Lifting through a cut. */
export const CUTTING: LiftPersona = {
  name: "cutting",
  answers: {
    experience: "intermediate",
    primaryGoal: "fat_loss",
    daysPerWeek: 3,
    weightKg: 92,
  },
  nutrition: "cut",
  lifter: {
    trainingAge: "intermediate",
    start1RM: {
      "bench-press": 95,
      squat: 130,
      deadlift: 160,
      "overhead-press": 55,
    },
    seedRir: 3,
  },
  sessionShare: 0.9,
  calibrates: true,
  tracked: BIG_FOUR,
};

/** Over 55, new to lifting. Starts in July, so the season crosses
 *  Auckland's change of clocks on 27 September. */
export const OVER_55: LiftPersona = {
  name: "over-55",
  answers: {
    experience: "beginner",
    primaryGoal: "general",
    daysPerWeek: 3,
    ageRange: "55+",
    gender: "female",
    weightKg: 68,
    heightCm: 163,
  },
  nutrition: "recomp",
  lifter: {
    trainingAge: "novice",
    start1RM: {
      "bench-press": 25,
      squat: 35,
      deadlift: 45,
      "overhead-press": 15,
    },
    seedRir: 4,
  },
  sessionShare: 0.9,
  calibrates: false,
  start: "2026-07-13",
  tracked: BIG_FOUR,
};

export const LIFT_PERSONAS: readonly LiftPersona[] = [
  NOVICE_MAN,
  NOVICE_WOMAN,
  INTERMEDIATE_MAN,
  INTERMEDIATE_WOMAN,
  ADVANCED_MAN,
  POWERBUILDER_SIZE,
  POWERBUILDER_STRENGTH,
  LIGHT_TRAINER,
  DUMBBELL_BEGINNER,
  LAYOFF_EASES_BACK,
  LAYOFF_KEEPS_WEIGHTS,
  OFF_SICK,
  HOLIDAYS,
  CUTTING,
  OVER_55,
];
