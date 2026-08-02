"use strict";

/**
 * Movement-category inference (packet 18) — server mirror of
 * inferMovementCategory in src/lib/exerciseMovementCategory.ts.
 *
 * The programme reducer's addExercises / replaceExercise commands derive a new
 * ProgramExercise's movementCategory from the exercise name + id (the client
 * does the same via normalizeExercise). That module is Vite/TS; this is its
 * dependency-free CommonJS mirror.
 *
 * MUST return identical output to the client inferMovementCategory for
 * identical input. Pinned in lockstep by
 * src/features/program/__tests__/exerciseMovementCategory.cross.test.ts (runs
 * both over every catalog exercise name). Any rule change must land on both
 * copies in the same commit.
 */

// Order matters: more specific patterns first. Mirror of RULES in the client.
const RULES = [
  {
    category: "hip_dominant",
    keywords: [
      "deadlift",
      "rdl",
      "good morning",
      "hip thrust",
      "glute bridge",
      "kettlebell swing",
      "swing",
    ],
  },
  {
    category: "knee_dominant",
    keywords: [
      "squat",
      "lunge",
      "leg press",
      "leg extension",
      "step up",
      "split squat",
      "pistol",
      "calf raise",
      "leg curl",
    ],
  },
  {
    category: "vertical_pull",
    keywords: [
      "pull-up",
      "pull up",
      "pullup",
      "chin-up",
      "chin up",
      "chinup",
      "lat pulldown",
      "pulldown",
    ],
  },
  { category: "horizontal_pull", keywords: ["row", "face pull"] },
  {
    category: "vertical_push",
    keywords: [
      "overhead press",
      "shoulder press",
      "military press",
      "push press",
      "ohp",
      "lateral raise",
      "front raise",
      "upright row",
    ],
  },
  {
    category: "horizontal_push",
    keywords: [
      "bench press",
      "bench",
      "chest press",
      "push-up",
      "push up",
      "pushup",
      "dip",
      "fly",
      "flye",
      "incline press",
      "decline press",
    ],
  },
  {
    category: "arms_triceps",
    keywords: [
      "tricep",
      "skullcrusher",
      "skull crusher",
      "pushdown",
      "kickback",
      "extension",
    ],
  },
  { category: "arms_biceps", keywords: ["curl"] },
  {
    category: "core",
    keywords: [
      "plank",
      "crunch",
      "sit-up",
      "sit up",
      "situp",
      "leg raise",
      "ab",
      "russian twist",
      "rollout",
      "hollow",
    ],
  },
];

const FALLBACK = "core";

// Stored movement category by exercise id — mirror of STORED_CATEGORY in
// src/lib/exerciseMovementCategory.ts. See that file for why a name is not an
// identifier. Pinned by exerciseMovementCategory.cross.test.ts.
const STORED_CATEGORY = {
  "ab-wheel": "core",
  "arnold-press": "vertical_push",
  "assault-bike": "core",
  "barbell-curl": "arms_biceps",
  "barbell-floor-press": "horizontal_push",
  "barbell-row": "horizontal_pull",
  "barbell-shrug": "horizontal_pull",
  "barbell-step-ups": "knee_dominant",
  "barbell-upright-row": "vertical_push",
  "battle-ropes": "core",
  "bayesian-cable-curl": "arms_biceps",
  "bench-dips": "horizontal_push",
  "bench-press": "horizontal_push",
  "bicycle-crunch": "core",
  "bike": "core",
  "bodyweight-lunge": "knee_dominant",
  "bodyweight-squat": "knee_dominant",
  "box-jumps": "core",
  "bulgarian-split": "knee_dominant",
  "burpees": "core",
  "cable-crossover": "horizontal_push",
  "cable-crunch": "core",
  "cable-curl": "arms_biceps",
  "cable-fly": "horizontal_push",
  "cable-glute-kickback": "hip_dominant",
  "cable-lateral-raise": "vertical_push",
  "cable-woodchopper": "core",
  "calf-raise": "knee_dominant",
  "chest-press-machine": "horizontal_push",
  "chest-supported-db-row": "horizontal_pull",
  "chin-ups": "vertical_pull",
  "clean-and-press": "core",
  "close-grip-bench": "horizontal_push",
  "concentration-curl": "arms_biceps",
  "cross-body-hammer-curl": "arms_biceps",
  "crunches": "core",
  "cuban-press": "vertical_push",
  "db-bench": "horizontal_push",
  "db-curl": "arms_biceps",
  "db-flyes": "horizontal_push",
  "db-rdl": "hip_dominant",
  "db-row": "horizontal_pull",
  "db-shoulder-press": "vertical_push",
  "dead-bug": "core",
  "deadlift": "hip_dominant",
  "decline-bench": "horizontal_push",
  "decline-db-press": "horizontal_push",
  "decline-sit-up": "core",
  "diamond-push-ups": "horizontal_push",
  "dips": "horizontal_push",
  "donkey-calf-raise": "knee_dominant",
  "dragon-flag": "core",
  "elliptical": "core",
  "ez-bar-curl": "arms_biceps",
  "face-pulls": "horizontal_pull",
  "farmers-carry": "core",
  "front-raise": "vertical_push",
  "front-squat": "knee_dominant",
  "glute-bridge": "hip_dominant",
  "glute-ham-raise": "hip_dominant",
  "goblet-squat": "knee_dominant",
  "hack-squat": "knee_dominant",
  "hammer-curl": "arms_biceps",
  "handstand-push-ups": "vertical_push",
  "hip-abduction-machine": "hip_dominant",
  "hip-adduction-machine": "hip_dominant",
  "hip-thrust": "hip_dominant",
  "incline-bench": "horizontal_push",
  "incline-db-curl": "arms_biceps",
  "incline-db-press": "horizontal_push",
  "incline-treadmill-walk": "core",
  "inverted-row": "horizontal_pull",
  "jm-press": "arms_triceps",
  "jump-rope": "core",
  "kettlebell-swing": "hip_dominant",
  "l-sit": "core",
  "landmine-press": "vertical_push",
  "landmine-squat": "knee_dominant",
  "lat-pulldown": "vertical_pull",
  "lateral-raise": "vertical_push",
  "leg-extension": "knee_dominant",
  "leg-press": "knee_dominant",
  "leg-raise": "core",
  "lu-raise": "vertical_push",
  "lunges": "knee_dominant",
  "machine-chest-fly": "horizontal_push",
  "man-maker": "core",
  "meadows-row": "horizontal_pull",
  "mountain-climbers": "core",
  "muscle-ups": "core",
  "nordic-hamstring-curl": "hip_dominant",
  "overhead-cable-tricep-extension": "arms_triceps",
  "overhead-extension": "arms_triceps",
  "overhead-press": "vertical_push",
  "pallof-press": "core",
  "pec-deck": "horizontal_push",
  "pendlay-row": "horizontal_pull",
  "pike-push-up": "vertical_push",
  "pistol-squat": "knee_dominant",
  "plank": "core",
  "preacher-curl": "arms_biceps",
  "pull-ups": "vertical_pull",
  "push-ups": "horizontal_push",
  "rack-pull": "hip_dominant",
  "rear-delt-machine-fly": "horizontal_pull",
  "reverse-barbell-curl": "arms_biceps",
  "reverse-flyes": "horizontal_pull",
  "reverse-grip-cable-pushdown": "arms_triceps",
  "reverse-pec-deck": "horizontal_pull",
  "romanian-deadlift": "hip_dominant",
  "rope-tricep-pushdown": "arms_triceps",
  "rowing-machine": "core",
  "russian-twist": "core",
  "seated-calf-raise": "knee_dominant",
  "seated-leg-curl": "hip_dominant",
  "seated-row": "horizontal_pull",
  "shoulder-press-machine": "vertical_push",
  "shrugs": "horizontal_pull",
  "side-plank": "core",
  "single-arm-cable-pushdown": "arms_triceps",
  "single-arm-lat-pulldown": "vertical_pull",
  "sissy-squat": "knee_dominant",
  "ski-erg": "core",
  "skull-crushers": "arms_triceps",
  "sled-push-pull": "core",
  "smith-bench-press": "horizontal_push",
  "smith-machine-squat": "knee_dominant",
  "smith-shoulder-press": "vertical_push",
  "spider-db-curl": "arms_biceps",
  "spin-bike": "core",
  "squat": "knee_dominant",
  "stairmaster": "core",
  "standing-calf-raise": "knee_dominant",
  "straight-arm-pulldown": "vertical_pull",
  "sumo-deadlift": "hip_dominant",
  "superman-hold": "core",
  "swimming": "core",
  "t-bar-row": "horizontal_pull",
  "thrusters": "core",
  "toe-touches": "core",
  "trap-bar-deadlift": "hip_dominant",
  "treadmill": "core",
  "tricep-dips": "arms_triceps",
  "tricep-kickback": "arms_triceps",
  "turkish-get-up": "core",
  "walking-dumbbell-lunges": "knee_dominant",
  "weighted-chest-dip": "horizontal_push",
  "weighted-plank": "core",
  "weighted-push-ups": "horizontal_push",
  "zercher-squat": "knee_dominant",
  "zottman-curl": "arms_biceps",
};

function inferMovementCategory(name, exerciseId) {
  // The stored answer wins; keyword matching is the fallback for custom
  // exercises the catalogue has never seen. Mirrors the client exactly.
  if (exerciseId) {
    const stored = STORED_CATEGORY[exerciseId];
    if (stored) return stored;
  }
  const haystack = `${name} ${exerciseId ?? ""}`.toLowerCase();
  for (const rule of RULES) {
    for (const kw of rule.keywords) {
      if (haystack.includes(kw)) return rule.category;
    }
  }
  return FALLBACK;
}

module.exports = { inferMovementCategory };
