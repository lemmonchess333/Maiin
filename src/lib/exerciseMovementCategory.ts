/* Canonical home of MovementCategory (moved from programTypes.ts, which
   re-exports it — audit batch 3 cycle break: programTypes imports the
   inference below, so this module must not import from programTypes). */
export type MovementCategory =
  | "horizontal_push"
  | "vertical_push"
  | "horizontal_pull"
  | "vertical_pull"
  | "knee_dominant"
  | "hip_dominant"
  | "arms_biceps"
  | "arms_triceps"
  | "core";

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

  /* Knee-dominant — squats, lunges, leg-press style. Includes "split"
     to catch Bulgarian Split Squat when "squat" hasn't already
     consumed the word. */
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

  /* Vertical pull — overhead pull patterns. */
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

  /* Horizontal pull — rows. "Face pull" lives here because it's a
     horizontal scapular retraction, not a true vertical pull. */
  { category: "horizontal_pull", keywords: ["row", "face pull"] },

  /* Vertical push — overhead presses. Match before horizontal_push so
     "Overhead Press" doesn't fall into the generic press bucket. */
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

  /* Horizontal push — bench, dips, push-ups. */
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

  /* Arm isolation. Biceps before triceps so "tricep curl" (rare
     variant) doesn't get the bicep stamp. */
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

  /* Core. Catches the common patterns; everything unmatched also
     falls through to this category as the default. */
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

const FALLBACK: MovementCategory = "core";

/**
 * Stored movement category, keyed by exercise id.
 *
 * Replaces name-string inference as the ANSWER; the keyword rules below stay
 * as the fallback for custom exercises that are not in the catalogue.
 *
 * Why this exists. Inference matched keywords against the display name,
 * first-match-wins, and got 27 of the 151 catalogue exercises wrong. The
 * expensive one: "fly"/"flye" sit under horizontal_push, so `Reverse Flyes`
 * and `Rear Delt Machine Fly` — both PULL movements — classified as PUSH.
 * `balancePushPull` keys on this category and exists specifically to keep
 * pull >= push for shoulder health, so it was counting rear-delt work as the
 * very thing it was protecting against. Others were merely absurd:
 * `Nordic Hamstring Curl` matched "curl" and became a biceps exercise,
 * `Cable Glute Kickback` matched "kickback" and became triceps, and 38
 * exercises fell through every rule into the `core` fallback — including
 * five chest presses and an Arnold press.
 *
 * A name is not an identifier. This table is, and every entry is reviewable
 * in one place rather than emergent from rule ordering. Pinned exhaustively
 * by `exerciseMovementCategory.test.ts` so all 151 assignments are explicit,
 * and mirrored in `functions/lib/exerciseMovementCategory.js`.
 *
 * Two deliberate non-corrections, so they are not read as oversights:
 *   - the four calf raises stay `knee_dominant`. There is no calves category
 *     in this nine-value taxonomy; adding one is the taxonomy split (13a).
 *   - Cardio and Full Body conditioning stay `core`. Same reason — there is
 *     no "not a resistance pattern" value. They are already excluded from the
 *     volume tally by `weeklyVolumeByMuscle`, so nothing downstream reads it.
 */
const STORED_CATEGORY: Record<string, MovementCategory> = {
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
  bike: "core",
  "bodyweight-lunge": "knee_dominant",
  "bodyweight-squat": "knee_dominant",
  "box-jumps": "core",
  "bulgarian-split": "knee_dominant",
  burpees: "core",
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
  crunches: "core",
  "cuban-press": "vertical_push",
  "db-bench": "horizontal_push",
  "db-curl": "arms_biceps",
  "db-flyes": "horizontal_push",
  "db-rdl": "hip_dominant",
  "db-row": "horizontal_pull",
  "db-shoulder-press": "vertical_push",
  "dead-bug": "core",
  deadlift: "hip_dominant",
  "decline-bench": "horizontal_push",
  "decline-db-press": "horizontal_push",
  "decline-sit-up": "core",
  "diamond-push-ups": "horizontal_push",
  dips: "horizontal_push",
  "donkey-calf-raise": "knee_dominant",
  "dragon-flag": "core",
  elliptical: "core",
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
  lunges: "knee_dominant",
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
  plank: "core",
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
  shrugs: "horizontal_pull",
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
  squat: "knee_dominant",
  stairmaster: "core",
  "standing-calf-raise": "knee_dominant",
  "straight-arm-pulldown": "vertical_pull",
  "sumo-deadlift": "hip_dominant",
  "superman-hold": "core",
  swimming: "core",
  "t-bar-row": "horizontal_pull",
  thrusters: "core",
  "toe-touches": "core",
  "trap-bar-deadlift": "hip_dominant",
  treadmill: "core",
  "tricep-dips": "horizontal_push",
  "tricep-kickback": "arms_triceps",
  "turkish-get-up": "core",
  "walking-dumbbell-lunges": "knee_dominant",
  "weighted-chest-dip": "horizontal_push",
  "weighted-plank": "core",
  "weighted-push-ups": "horizontal_push",
  "zercher-squat": "knee_dominant",
  "zottman-curl": "arms_biceps",
};

export function inferMovementCategory(
  name: string,
  exerciseId?: string
): MovementCategory {
  // The stored answer wins. Keyword matching is the fallback for custom
  // exercises the catalogue has never seen.
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

/**
 * User-facing label for a MovementCategory. Internal taxonomy keys
 * (e.g. "horizontal_push") were leaking into the activity-card chip
 * row — those are implementation tokens, not product copy.
 *
 * Mapping is deliberately short and scannable. Falls back to a
 * title-cased version of the raw key when no entry matches, so a
 * future category we forget to label still renders something
 * readable rather than a snake_case string.
 */
/* Session-level labels rather than per-pattern labels. The previous
   table mapped each movement category to a literal name ("Bench",
   "Press", "Row") which on activity-feed chips ended up restating the
   exercise name (e.g. a "Bench Press" workout got a "Bench" chip).
   Session-level labels — Push / Pull / Legs / Arms / Core — describe
   what *kind of session* it was, which is the social-card chip's job.
   Callers that render multiple categories from one workout should
   dedupe the resulting label list, since e.g. horizontal_push and
   vertical_push now collapse to the same chip. */
const MOVEMENT_CATEGORY_LABELS: Record<MovementCategory, string> = {
  horizontal_push: "Push",
  vertical_push: "Push",
  horizontal_pull: "Pull",
  vertical_pull: "Pull",
  knee_dominant: "Legs",
  hip_dominant: "Legs",
  arms_biceps: "Arms",
  arms_triceps: "Arms",
  core: "Core",
};

export function movementCategoryLabel(key: string): string {
  if (key in MOVEMENT_CATEGORY_LABELS) {
    return MOVEMENT_CATEGORY_LABELS[key as MovementCategory];
  }
  return key
    .split("_")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}
