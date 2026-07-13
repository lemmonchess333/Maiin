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

function inferMovementCategory(name, exerciseId) {
  const haystack = `${name} ${exerciseId ?? ""}`.toLowerCase();
  for (const rule of RULES) {
    for (const kw of rule.keywords) {
      if (haystack.includes(kw)) return rule.category;
    }
  }
  return FALLBACK;
}

module.exports = { inferMovementCategory };
