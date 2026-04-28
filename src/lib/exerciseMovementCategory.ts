import type { MovementCategory } from "@/features/program/programTypes";

/**
 * Infer a MovementCategory from an exercise name (and optional id).
 *
 * The template system (`src/features/program/templates.ts`) doesn't
 * carry a movementCategory per exercise — it relies on
 * `templateExToProgEx` and `normalizeExercise` to fill the field. Both
 * previously hardcoded `"horizontal_push"` as a default, which made
 * every Pull/Legs/etc. day's activity card mis-tag the workout
 * (Pull A showing "horizontal_push" was the visible bug).
 *
 * Pure name-based inference: cheap, no new schema, covers the standard
 * exercise vocabulary in the project's templates. Catches everything
 * by keyword match in priority order — first match wins. Unmatched
 * names fall back to "core" (more semantically neutral than the old
 * "horizontal_push" default; surfaces clearly when the inference fails
 * rather than silently mis-categorising).
 */

interface Rule {
  category: MovementCategory;
  /** Lower-case substrings; any match selects this category. */
  keywords: string[];
}

// Order matters: more specific patterns first.
const RULES: Rule[] = [
  /* Hip-dominant lifts must come before "row" patterns since some
     exercises (e.g. "Romanian Deadlift") wouldn't trigger row keywords
     but should still resolve hip-dominant cleanly. */
  { category: "hip_dominant", keywords: ["deadlift", "rdl", "good morning", "hip thrust", "glute bridge", "kettlebell swing", "swing"] },

  /* Knee-dominant — squats, lunges, leg-press style. Includes "split"
     to catch Bulgarian Split Squat when "squat" hasn't already
     consumed the word. */
  { category: "knee_dominant", keywords: ["squat", "lunge", "leg press", "leg extension", "step up", "split squat", "pistol", "calf raise", "leg curl"] },

  /* Vertical pull — overhead pull patterns. */
  { category: "vertical_pull", keywords: ["pull-up", "pull up", "pullup", "chin-up", "chin up", "chinup", "lat pulldown", "pulldown"] },

  /* Horizontal pull — rows. "Face pull" lives here because it's a
     horizontal scapular retraction, not a true vertical pull. */
  { category: "horizontal_pull", keywords: ["row", "face pull"] },

  /* Vertical push — overhead presses. Match before horizontal_push so
     "Overhead Press" doesn't fall into the generic press bucket. */
  { category: "vertical_push", keywords: ["overhead press", "shoulder press", "military press", "push press", "ohp", "lateral raise", "front raise", "upright row"] },

  /* Horizontal push — bench, dips, push-ups. */
  { category: "horizontal_push", keywords: ["bench press", "bench", "chest press", "push-up", "push up", "pushup", "dip", "fly", "flye", "incline press", "decline press"] },

  /* Arm isolation. Biceps before triceps so "tricep curl" (rare
     variant) doesn't get the bicep stamp. */
  { category: "arms_triceps", keywords: ["tricep", "skullcrusher", "skull crusher", "pushdown", "kickback", "extension"] },
  { category: "arms_biceps", keywords: ["curl"] },

  /* Core. Catches the common patterns; everything unmatched also
     falls through to this category as the default. */
  { category: "core", keywords: ["plank", "crunch", "sit-up", "sit up", "situp", "leg raise", "ab", "russian twist", "rollout", "hollow"] },
];

const FALLBACK: MovementCategory = "core";

export function inferMovementCategory(name: string, exerciseId?: string): MovementCategory {
  const haystack = `${name} ${exerciseId ?? ""}`.toLowerCase();
  for (const rule of RULES) {
    for (const kw of rule.keywords) {
      if (haystack.includes(kw)) return rule.category;
    }
  }
  return FALLBACK;
}
