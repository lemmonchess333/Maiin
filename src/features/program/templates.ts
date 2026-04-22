export interface TemplateExercise {
  name: string;
  exerciseId: string;
  sets: number;
  reps: string;
  restSeconds: number;
  alternatives?: string[];
  contraindicated?: string[];
  notes?: string;
}

export interface TemplateDay {
  dayNumber: number;
  name: string;
  type: "lift" | "run" | "rest";
  exercises: TemplateExercise[];
}

export interface TemplateWeek {
  weekNumber: number;
  days: TemplateDay[];
}

export interface ProgramTemplate {
  id: string;
  name: string;
  split: "full_body" | "upper_lower" | "ppl" | "bro_split";
  daysPerWeek: number;
  goal: string;
  experience: string[];
  equipment: "full_gym" | "home_gym" | "minimal";
  gender: string[];
  runIntegration: boolean;
  weeks: TemplateWeek[];
}

// ─── Helper to reduce repetition ───────────────────────────────────────────
function ex(
  name: string,
  id: string,
  sets: number,
  reps: string,
  rest: number,
  opts?: { alt?: string[]; contra?: string[] },
): TemplateExercise {
  return {
    name,
    exerciseId: id,
    sets,
    reps,
    restSeconds: rest,
    ...(opts?.alt ? { alternatives: opts.alt } : {}),
    ...(opts?.contra ? { contraindicated: opts.contra } : {}),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. FULL BODY BEGINNER — 3 days, general, full gym
// ═══════════════════════════════════════════════════════════════════════════
const fullBodyBeginner: ProgramTemplate = {
  id: "full-body-beginner",
  name: "Full Body Beginner",
  split: "full_body",
  daysPerWeek: 3,
  goal: "general",
  experience: ["beginner"],
  equipment: "full_gym",
  gender: ["male", "female", "unspecified"],
  runIntegration: false,
  weeks: [{
    weekNumber: 1,
    days: [
      {
        dayNumber: 1, name: "Full Body A", type: "lift",
        exercises: [
          ex("Barbell Squat", "barbell-squat", 3, "8-10", 120, { alt: ["Leg Press"], contra: ["knee"] }),
          ex("Bench Press", "bench-press", 3, "8-10", 120, { alt: ["Chest Press Machine"] }),
          ex("Barbell Row", "barbell-row", 3, "8-10", 90, { alt: ["Seated Cable Row"], contra: ["lower_back"] }),
          ex("Overhead Press", "overhead-press", 3, "8-10", 90, { alt: ["Lateral Raise"], contra: ["shoulder"] }),
          ex("Plank", "plank", 3, "30-45s", 60),
        ],
      },
      {
        dayNumber: 2, name: "Full Body B", type: "lift",
        exercises: [
          ex("Deadlift", "deadlift", 3, "6-8", 150, { alt: ["Leg Curl"], contra: ["lower_back"] }),
          ex("Dumbbell Bench Press", "db-bench", 3, "10-12", 90),
          ex("Lat Pulldown", "lat-pulldown", 3, "10-12", 90),
          ex("Dumbbell Lateral Raise", "db-lateral-raise", 3, "12-15", 60),
          ex("Cable Crunch", "cable-crunch", 3, "12-15", 60),
        ],
      },
      {
        dayNumber: 3, name: "Full Body C", type: "lift",
        exercises: [
          ex("Leg Press", "leg-press", 3, "10-12", 90, { contra: ["knee"] }),
          ex("Incline Dumbbell Press", "incline-db-press", 3, "10-12", 90),
          ex("Dumbbell Row", "db-row", 3, "10-12", 90),
          ex("Face Pulls", "face-pulls", 3, "15-20", 60),
          ex("Bicep Curl", "barbell-curl", 2, "10-12", 60),
        ],
      },
    ],
  }],
};

// ═══════════════════════════════════════════════════════════════════════════
// 2. FULL BODY HOME — 3 days, general, home gym
// ═══════════════════════════════════════════════════════════════════════════
const fullBodyHome: ProgramTemplate = {
  id: "full-body-home",
  name: "Full Body Home",
  split: "full_body",
  daysPerWeek: 3,
  goal: "general",
  experience: ["beginner", "intermediate"],
  equipment: "home_gym",
  gender: ["male", "female", "unspecified"],
  runIntegration: false,
  weeks: [{
    weekNumber: 1,
    days: [
      {
        dayNumber: 1, name: "Full Body A", type: "lift",
        exercises: [
          ex("Goblet Squat", "goblet-squat", 3, "12-15", 90, { contra: ["knee"] }),
          ex("Dumbbell Bench Press", "db-bench", 3, "10-12", 90),
          ex("Dumbbell Row", "db-row", 3, "10-12", 90),
          ex("Dumbbell Overhead Press", "db-shoulder-press", 3, "10-12", 90, { alt: ["Lateral Raise"], contra: ["shoulder"] }),
          ex("Plank", "plank", 3, "30-60s", 60),
        ],
      },
      {
        dayNumber: 2, name: "Full Body B", type: "lift",
        exercises: [
          ex("Dumbbell Romanian Deadlift", "db-rdl", 3, "10-12", 90, { contra: ["lower_back"] }),
          ex("Incline Dumbbell Press", "incline-db-press", 3, "10-12", 90),
          ex("Pull-Ups", "pull-ups", 3, "6-10", 90, { alt: ["Inverted Row"] }),
          ex("Dumbbell Lateral Raise", "db-lateral-raise", 3, "12-15", 60),
          ex("Dumbbell Curl", "db-curl", 2, "10-12", 60),
        ],
      },
      {
        dayNumber: 3, name: "Full Body C", type: "lift",
        exercises: [
          ex("Dumbbell Lunge", "db-lunge", 3, "10/leg", 90, { alt: ["Goblet Squat"], contra: ["knee"] }),
          ex("Dumbbell Flyes", "db-flyes", 3, "12-15", 60),
          ex("Chest-Supported DB Row", "chest-supported-db-row", 3, "10-12", 90),
          ex("Dumbbell Tricep Extension", "db-overhead-tricep-ext", 2, "10-12", 60),
          ex("Bicycle Crunch", "bicycle-crunch", 3, "15-20", 60),
        ],
      },
    ],
  }],
};

// ═══════════════════════════════════════════════════════════════════════════
// 3. FULL BODY MINIMAL — 3 days, general, minimal equipment
// ═══════════════════════════════════════════════════════════════════════════
const fullBodyMinimal: ProgramTemplate = {
  id: "full-body-minimal",
  name: "Full Body Minimal",
  split: "full_body",
  daysPerWeek: 3,
  goal: "general",
  experience: ["beginner", "intermediate"],
  equipment: "minimal",
  gender: ["male", "female", "unspecified"],
  runIntegration: false,
  weeks: [{
    weekNumber: 1,
    days: [
      {
        dayNumber: 1, name: "Full Body A", type: "lift",
        exercises: [
          ex("Bodyweight Squat", "bodyweight-squat", 4, "15-20", 60, { contra: ["knee"] }),
          ex("Push-Ups", "push-ups", 4, "10-20", 60),
          ex("Inverted Row", "inverted-row", 3, "8-12", 60),
          ex("Pike Push-Up", "pike-push-up", 3, "8-12", 60, { alt: ["Push-Ups"], contra: ["shoulder"] }),
          ex("Plank", "plank", 3, "30-60s", 45),
        ],
      },
      {
        dayNumber: 2, name: "Full Body B", type: "lift",
        exercises: [
          ex("Lunge", "bodyweight-lunge", 3, "12/leg", 60, { contra: ["knee"] }),
          ex("Diamond Push-Ups", "diamond-push-ups", 3, "8-15", 60),
          ex("Pull-Ups", "pull-ups", 3, "5-10", 90, { alt: ["Inverted Row"] }),
          ex("Glute Bridge", "glute-bridge", 3, "15-20", 60),
          ex("Mountain Climbers", "mountain-climbers", 3, "20/side", 45),
        ],
      },
      {
        dayNumber: 3, name: "Full Body C", type: "lift",
        exercises: [
          ex("Bulgarian Split Squat", "bulgarian-split-squat", 3, "10/leg", 90, { contra: ["knee"] }),
          ex("Weighted Push-Ups", "weighted-push-ups", 3, "8-15", 60),
          ex("Chin-Ups", "chin-ups", 3, "5-10", 90, { alt: ["Inverted Row"] }),
          ex("Superman Hold", "superman-hold", 3, "20-30s", 45, { contra: ["lower_back"] }),
          ex("Dead Bug", "dead-bug", 3, "10/side", 45),
        ],
      },
    ],
  }],
};

// ═══════════════════════════════════════════════════════════════════════════
// 4. UPPER/LOWER HYPERTROPHY — 4 days, hypertrophy, full gym
// ═══════════════════════════════════════════════════════════════════════════
const upperLowerHypertrophy: ProgramTemplate = {
  id: "upper-lower-hypertrophy",
  name: "Upper/Lower Hypertrophy",
  split: "upper_lower",
  daysPerWeek: 4,
  goal: "hypertrophy",
  experience: ["intermediate", "advanced"],
  equipment: "full_gym",
  gender: ["male", "female", "unspecified"],
  runIntegration: false,
  weeks: [{
    weekNumber: 1,
    days: [
      {
        dayNumber: 1, name: "Upper A", type: "lift",
        exercises: [
          ex("Bench Press", "bench-press", 4, "8-10", 120),
          ex("Barbell Row", "barbell-row", 4, "8-10", 90, { contra: ["lower_back"] }),
          ex("Overhead Press", "overhead-press", 3, "8-12", 90, { alt: ["Lateral Raise"], contra: ["shoulder"] }),
          ex("Lat Pulldown", "lat-pulldown", 3, "10-12", 90),
          ex("Dumbbell Curl", "db-curl", 3, "10-12", 60),
          ex("Tricep Pushdown", "tricep-pushdown", 3, "10-12", 60),
        ],
      },
      {
        dayNumber: 2, name: "Lower A", type: "lift",
        exercises: [
          ex("Barbell Squat", "barbell-squat", 4, "6-8", 150, { alt: ["Leg Press"], contra: ["knee"] }),
          ex("Romanian Deadlift", "romanian-deadlift", 3, "8-10", 120, { contra: ["lower_back"] }),
          ex("Leg Press", "leg-press", 3, "10-12", 90, { contra: ["knee"] }),
          ex("Leg Curl", "leg-curl", 3, "10-12", 90),
          ex("Calf Raise", "standing-calf-raise", 4, "12-15", 60),
        ],
      },
      {
        dayNumber: 3, name: "Upper B", type: "lift",
        exercises: [
          ex("Incline Dumbbell Press", "incline-db-press", 4, "8-12", 90),
          ex("Seated Cable Row", "seated-row", 4, "10-12", 90),
          ex("Dumbbell Lateral Raise", "db-lateral-raise", 3, "12-15", 60),
          ex("Face Pulls", "face-pulls", 3, "15-20", 60),
          ex("Barbell Curl", "barbell-curl", 3, "8-12", 60),
          ex("Overhead Tricep Extension", "db-overhead-tricep-ext", 3, "10-12", 60),
        ],
      },
      {
        dayNumber: 4, name: "Lower B", type: "lift",
        exercises: [
          ex("Deadlift", "deadlift", 4, "5-6", 180, { contra: ["lower_back"] }),
          ex("Bulgarian Split Squat", "bulgarian-split-squat", 3, "8-10/leg", 90, { contra: ["knee"] }),
          ex("Leg Extension", "leg-extension", 3, "12-15", 60, { contra: ["knee"] }),
          ex("Leg Curl", "leg-curl", 3, "10-12", 90),
          ex("Seated Calf Raise", "seated-calf-raise", 3, "15-20", 60),
        ],
      },
    ],
  }],
};

// ═══════════════════════════════════════════════════════════════════════════
// 5. UPPER/LOWER + RUNS — 4 days, hypertrophy, full gym, run-aware
// ═══════════════════════════════════════════════════════════════════════════
const upperLowerRuns: ProgramTemplate = {
  id: "upper-lower-runs",
  name: "Upper/Lower + Runs",
  split: "upper_lower",
  daysPerWeek: 4,
  goal: "hypertrophy",
  experience: ["intermediate", "advanced"],
  equipment: "full_gym",
  gender: ["male", "female", "unspecified"],
  runIntegration: true,
  weeks: [{
    weekNumber: 1,
    days: [
      // Mon: Upper, Tue: Run, Wed: Lower, Thu: Run, Fri: Upper, Sat: Lower, Sun: Rest
      // Legs on Wed/Sat — away from long run day
      {
        dayNumber: 1, name: "Upper A", type: "lift",
        exercises: [
          ex("Bench Press", "bench-press", 4, "8-10", 120),
          ex("Barbell Row", "barbell-row", 4, "8-10", 90, { contra: ["lower_back"] }),
          ex("Overhead Press", "overhead-press", 3, "8-12", 90, { alt: ["Lateral Raise"], contra: ["shoulder"] }),
          ex("Lat Pulldown", "lat-pulldown", 3, "10-12", 90),
          ex("Dumbbell Curl", "db-curl", 3, "10-12", 60),
          ex("Tricep Pushdown", "tricep-pushdown", 3, "10-12", 60),
        ],
      },
      {
        dayNumber: 2, name: "Lower A", type: "lift",
        exercises: [
          ex("Barbell Squat", "barbell-squat", 3, "8-10", 120, { alt: ["Leg Press"], contra: ["knee"] }),
          ex("Romanian Deadlift", "romanian-deadlift", 3, "8-10", 120, { contra: ["lower_back"] }),
          ex("Leg Press", "leg-press", 3, "10-12", 90, { contra: ["knee"] }),
          ex("Leg Curl", "leg-curl", 3, "10-12", 90),
          ex("Calf Raise", "standing-calf-raise", 3, "12-15", 60),
        ],
      },
      {
        dayNumber: 3, name: "Upper B", type: "lift",
        exercises: [
          ex("Incline Dumbbell Press", "incline-db-press", 4, "8-12", 90),
          ex("Seated Cable Row", "seated-row", 4, "10-12", 90),
          ex("Dumbbell Lateral Raise", "db-lateral-raise", 3, "12-15", 60),
          ex("Face Pulls", "face-pulls", 3, "15-20", 60),
          ex("Barbell Curl", "barbell-curl", 3, "8-12", 60),
        ],
      },
      {
        dayNumber: 4, name: "Lower B", type: "lift",
        exercises: [
          ex("Bulgarian Split Squat", "bulgarian-split-squat", 3, "10/leg", 90, { contra: ["knee"] }),
          ex("Leg Extension", "leg-extension", 3, "12-15", 60, { contra: ["knee"] }),
          ex("Leg Curl", "leg-curl", 3, "10-12", 90),
          ex("Hip Thrust", "hip-thrust", 3, "10-12", 90),
          ex("Seated Calf Raise", "seated-calf-raise", 3, "15-20", 60),
        ],
      },
    ],
  }],
};

// ═══════════════════════════════════════════════════════════════════════════
// 6. PPL HYPERTROPHY — 6 days, hypertrophy, full gym
// ═══════════════════════════════════════════════════════════════════════════
// Formerly split into M/F variants. Gender-based template selection was
// removed in W1a — same hypertrophy stimulus produces equivalent
// relative gains across sexes at matched volume (Roberts 2020), so the
// F variant's hip-thrust-heavy "Legs & Glutes" framing was preference-
// dressed-as-physiology. Users who want more glute work can swap
// individual exercises via the existing variation bank.
const pplHypertrophy: ProgramTemplate = {
  id: "ppl-hypertrophy",
  name: "PPL Hypertrophy",
  split: "ppl",
  daysPerWeek: 6,
  goal: "hypertrophy",
  experience: ["intermediate", "advanced"],
  equipment: "full_gym",
  gender: ["male", "female", "unspecified"],
  runIntegration: false,
  weeks: [{
    weekNumber: 1,
    days: [
      {
        dayNumber: 1, name: "Push A", type: "lift",
        exercises: [
          ex("Bench Press", "bench-press", 4, "6-8", 150),
          ex("Overhead Press", "overhead-press", 3, "8-10", 120, { alt: ["Lateral Raise"], contra: ["shoulder"] }),
          ex("Incline Dumbbell Press", "incline-db-press", 3, "10-12", 90),
          ex("Cable Crossover", "cable-crossover", 3, "12-15", 60),
          ex("Tricep Pushdown", "tricep-pushdown", 3, "10-12", 60),
          ex("Overhead Tricep Extension", "db-overhead-tricep-ext", 3, "10-12", 60),
        ],
      },
      {
        dayNumber: 2, name: "Pull A", type: "lift",
        exercises: [
          ex("Deadlift", "deadlift", 4, "5-6", 180, { contra: ["lower_back"] }),
          ex("Pull-Ups", "pull-ups", 3, "6-10", 120),
          ex("Barbell Row", "barbell-row", 3, "8-10", 90, { contra: ["lower_back"] }),
          ex("Face Pulls", "face-pulls", 3, "15-20", 60),
          ex("Barbell Curl", "barbell-curl", 3, "8-12", 60),
          ex("Hammer Curl", "hammer-curl", 3, "10-12", 60),
        ],
      },
      {
        dayNumber: 3, name: "Legs A", type: "lift",
        exercises: [
          ex("Barbell Squat", "barbell-squat", 4, "6-8", 180, { alt: ["Leg Press"], contra: ["knee"] }),
          ex("Romanian Deadlift", "romanian-deadlift", 3, "8-10", 120, { contra: ["lower_back"] }),
          ex("Leg Press", "leg-press", 3, "10-12", 90, { contra: ["knee"] }),
          ex("Leg Curl", "leg-curl", 3, "10-12", 90),
          ex("Calf Raise", "standing-calf-raise", 4, "12-15", 60),
        ],
      },
      {
        dayNumber: 4, name: "Push B", type: "lift",
        exercises: [
          ex("Incline Bench Press", "incline-bench", 4, "8-10", 120),
          ex("Dumbbell Shoulder Press", "db-shoulder-press", 3, "8-12", 90, { alt: ["Lateral Raise"], contra: ["shoulder"] }),
          ex("Dumbbell Flyes", "db-flyes", 3, "12-15", 60),
          ex("Dumbbell Lateral Raise", "db-lateral-raise", 3, "12-15", 60),
          ex("Dip", "dip", 3, "8-12", 90),
        ],
      },
      {
        dayNumber: 5, name: "Pull B", type: "lift",
        exercises: [
          ex("Lat Pulldown", "lat-pulldown", 4, "8-12", 90),
          ex("Seated Cable Row", "seated-row", 4, "10-12", 90),
          ex("Chest-Supported DB Row", "chest-supported-db-row", 3, "10-12", 90),
          ex("Rear Delt Fly", "reverse-pec-deck", 3, "12-15", 60),
          ex("Dumbbell Curl", "db-curl", 3, "10-12", 60),
          ex("Preacher Curl", "preacher-curl", 3, "10-12", 60),
        ],
      },
      {
        dayNumber: 6, name: "Legs B", type: "lift",
        exercises: [
          ex("Leg Press", "leg-press", 4, "10-12", 90, { contra: ["knee"] }),
          ex("Bulgarian Split Squat", "bulgarian-split-squat", 3, "10/leg", 90, { contra: ["knee"] }),
          ex("Leg Extension", "leg-extension", 3, "12-15", 60, { contra: ["knee"] }),
          ex("Leg Curl", "leg-curl", 3, "10-12", 90),
          ex("Seated Calf Raise", "seated-calf-raise", 4, "15-20", 60),
        ],
      },
    ],
  }],
};

// Template 7 (`pplHypertrophyF`) removed in W1a. See comment on
// `pplHypertrophy` above for rationale. Hip-thrust-heavy "Legs & Glutes"
// framing was preference-dressed-as-physiology; removed from the default
// template matrix. Existing user `programState` docs already have their
// exercises denormalized, so deletion affects only future matches.

// ═══════════════════════════════════════════════════════════════════════════
// 8. PPL STRENGTH — 6 days, strength, full gym
// ═══════════════════════════════════════════════════════════════════════════
const pplStrength: ProgramTemplate = {
  id: "ppl-strength",
  name: "PPL Strength",
  split: "ppl",
  daysPerWeek: 6,
  goal: "strength",
  experience: ["intermediate", "advanced"],
  equipment: "full_gym",
  gender: ["male", "female", "unspecified"],
  runIntegration: false,
  weeks: [{
    weekNumber: 1,
    days: [
      {
        dayNumber: 1, name: "Push (Strength)", type: "lift",
        exercises: [
          ex("Bench Press", "bench-press", 5, "3-5", 240),
          ex("Overhead Press", "overhead-press", 4, "4-6", 180, { alt: ["Dumbbell Shoulder Press"], contra: ["shoulder"] }),
          ex("Incline Bench Press", "incline-bench", 3, "6-8", 120),
          ex("Dip", "dip", 3, "6-10", 120),
          ex("Tricep Pushdown", "tricep-pushdown", 3, "8-12", 60),
        ],
      },
      {
        dayNumber: 2, name: "Pull (Strength)", type: "lift",
        exercises: [
          ex("Deadlift", "deadlift", 5, "3-5", 300, { contra: ["lower_back"] }),
          ex("Barbell Row", "barbell-row", 4, "4-6", 150, { contra: ["lower_back"] }),
          ex("Pull-Ups", "pull-ups", 3, "5-8", 120),
          ex("Face Pulls", "face-pulls", 3, "15-20", 60),
          ex("Barbell Curl", "barbell-curl", 3, "6-10", 60),
        ],
      },
      {
        dayNumber: 3, name: "Legs (Strength)", type: "lift",
        exercises: [
          ex("Barbell Squat", "barbell-squat", 5, "3-5", 300, { alt: ["Leg Press"], contra: ["knee"] }),
          ex("Romanian Deadlift", "romanian-deadlift", 4, "5-8", 150, { contra: ["lower_back"] }),
          ex("Leg Press", "leg-press", 3, "6-10", 120, { contra: ["knee"] }),
          ex("Leg Curl", "leg-curl", 3, "8-10", 90),
          ex("Calf Raise", "standing-calf-raise", 4, "10-15", 60),
        ],
      },
      {
        dayNumber: 4, name: "Push (Volume)", type: "lift",
        exercises: [
          ex("Bench Press", "bench-press", 4, "6-8", 150),
          ex("Dumbbell Shoulder Press", "db-shoulder-press", 3, "8-10", 120, { alt: ["Lateral Raise"], contra: ["shoulder"] }),
          ex("Dumbbell Flyes", "db-flyes", 3, "10-12", 60),
          ex("Dumbbell Lateral Raise", "db-lateral-raise", 3, "12-15", 60),
          ex("Close Grip Bench Press", "close-grip-bench", 3, "8-10", 120),
        ],
      },
      {
        dayNumber: 5, name: "Pull (Volume)", type: "lift",
        exercises: [
          ex("Lat Pulldown", "lat-pulldown", 4, "8-12", 90),
          ex("Seated Cable Row", "seated-row", 4, "8-12", 90),
          ex("Dumbbell Row", "db-row", 3, "8-12", 90),
          ex("Rear Delt Fly", "reverse-pec-deck", 3, "12-15", 60),
          ex("Hammer Curl", "hammer-curl", 3, "10-12", 60),
        ],
      },
      {
        dayNumber: 6, name: "Legs (Volume)", type: "lift",
        exercises: [
          ex("Leg Press", "leg-press", 4, "8-12", 120, { contra: ["knee"] }),
          ex("Bulgarian Split Squat", "bulgarian-split-squat", 3, "8-10/leg", 90, { contra: ["knee"] }),
          ex("Leg Extension", "leg-extension", 3, "12-15", 60, { contra: ["knee"] }),
          ex("Leg Curl", "leg-curl", 3, "10-12", 90),
          ex("Seated Calf Raise", "seated-calf-raise", 4, "12-15", 60),
        ],
      },
    ],
  }],
};

// ═══════════════════════════════════════════════════════════════════════════
// 9. PPL HYBRID RUNNER — 5 days, hypertrophy, full gym, run-aware
// ═══════════════════════════════════════════════════════════════════════════
const pplHybridRunner: ProgramTemplate = {
  id: "ppl-hybrid-runner",
  name: "PPL Hybrid Runner",
  split: "ppl",
  daysPerWeek: 5,
  goal: "hypertrophy",
  experience: ["intermediate", "advanced"],
  equipment: "full_gym",
  gender: ["male", "female", "unspecified"],
  runIntegration: true,
  weeks: [{
    weekNumber: 1,
    days: [
      // Intended weekly mapping (scheduler handles the actual day-of-week):
      //   Mon: Legs (heavy, single leg day)
      //   Tue: Pull
      //   Wed: Push
      //   Thu: Upper (chest/back volume)
      //   Fri: Shoulders & Arms (NO leg work)
      //   Sat: Long run (96h after Monday's heavy legs)
      //   Sun: Rest
      //
      // Pre-W1a this template had two leg days (Wed moderate + Fri light)
      // and a comment claiming "Saturday long run has a day gap" — but
      // Fri→Sat was back-to-back. Running lit (Doma & Deakin 2013/2015)
      // shows heavy lower-body work within 24h of endurance work
      // compromises both. Collapsing to a single heavy leg day on Day 1
      // gives 96h of recovery before Saturday's long run and matches how
      // hybrid programs (Hybrid Athlete, Tactical Barbell) structure
      // leg work around endurance days.
      {
        dayNumber: 1, name: "Legs (Heavy)", type: "lift",
        exercises: [
          ex("Barbell Squat", "barbell-squat", 4, "6-8", 150, { alt: ["Leg Press"], contra: ["knee"] }),
          ex("Romanian Deadlift", "romanian-deadlift", 3, "8-10", 120, { contra: ["lower_back"] }),
          ex("Leg Press", "leg-press", 3, "10-12", 90, { contra: ["knee"] }),
          ex("Leg Curl", "leg-curl", 3, "10-12", 90),
          ex("Calf Raise", "standing-calf-raise", 3, "12-15", 60),
        ],
      },
      {
        dayNumber: 2, name: "Pull", type: "lift",
        exercises: [
          ex("Barbell Row", "barbell-row", 4, "8-10", 90, { contra: ["lower_back"] }),
          ex("Lat Pulldown", "lat-pulldown", 3, "10-12", 90),
          ex("Face Pulls", "face-pulls", 3, "15-20", 60),
          ex("Dumbbell Curl", "db-curl", 3, "10-12", 60),
          ex("Hammer Curl", "hammer-curl", 2, "10-12", 60),
        ],
      },
      {
        dayNumber: 3, name: "Push", type: "lift",
        exercises: [
          ex("Bench Press", "bench-press", 4, "8-10", 120),
          ex("Overhead Press", "overhead-press", 3, "8-12", 90, { alt: ["Lateral Raise"], contra: ["shoulder"] }),
          ex("Incline Dumbbell Press", "incline-db-press", 3, "10-12", 90),
          ex("Dumbbell Lateral Raise", "db-lateral-raise", 3, "12-15", 60),
          ex("Tricep Pushdown", "tricep-pushdown", 3, "10-12", 60),
        ],
      },
      {
        dayNumber: 4, name: "Upper — Chest & Back", type: "lift",
        exercises: [
          ex("Incline Bench Press", "incline-bench", 3, "8-10", 120),
          ex("Seated Cable Row", "seated-row", 3, "10-12", 90),
          ex("Chest-Supported DB Row", "chest-supported-db-row", 3, "10-12", 90),
          ex("Dumbbell Flyes", "db-flyes", 3, "12-15", 60),
          ex("Barbell Curl", "barbell-curl", 2, "10-12", 60),
          ex("Dip", "dip", 2, "8-12", 90),
        ],
      },
      {
        dayNumber: 5, name: "Shoulders & Arms", type: "lift",
        exercises: [
          ex("Dumbbell Shoulder Press", "db-shoulder-press", 4, "8-12", 90, { alt: ["Lateral Raise"], contra: ["shoulder"] }),
          ex("Dumbbell Lateral Raise", "db-lateral-raise", 4, "12-15", 60),
          ex("Rear Delt Fly", "reverse-pec-deck", 3, "12-15", 60),
          ex("Overhead Tricep Extension", "db-overhead-tricep-ext", 3, "10-12", 60),
          ex("Hammer Curl", "hammer-curl", 3, "10-12", 60),
        ],
      },
    ],
  }],
};

// ═══════════════════════════════════════════════════════════════════════════
// 10. BRO SPLIT CLASSIC — 5 days, hypertrophy, full gym, male
// ═══════════════════════════════════════════════════════════════════════════
const broSplitClassic: ProgramTemplate = {
  id: "bro-split-classic",
  name: "Bro Split Classic",
  split: "bro_split",
  daysPerWeek: 5,
  goal: "hypertrophy",
  experience: ["intermediate", "advanced"],
  equipment: "full_gym",
  // Gender array retained on templates for legacy programState-doc
  // compatibility, but gender is no longer used as a scoring input in
  // `matchTemplate` (see W1a comment there). All templates are available
  // to any gender.
  gender: ["male", "female", "unspecified"],
  runIntegration: false,
  weeks: [{
    weekNumber: 1,
    days: [
      {
        dayNumber: 1, name: "Chest", type: "lift",
        exercises: [
          ex("Bench Press", "bench-press", 4, "6-10", 120),
          ex("Incline Dumbbell Press", "incline-db-press", 4, "8-12", 90),
          ex("Cable Crossover", "cable-crossover", 3, "12-15", 60),
          ex("Dumbbell Flyes", "db-flyes", 3, "12-15", 60),
          ex("Pec Deck", "pec-deck", 3, "12-15", 60),
        ],
      },
      {
        dayNumber: 2, name: "Back", type: "lift",
        exercises: [
          ex("Deadlift", "deadlift", 4, "5-6", 180, { contra: ["lower_back"] }),
          ex("Barbell Row", "barbell-row", 4, "8-10", 90, { contra: ["lower_back"] }),
          ex("Lat Pulldown", "lat-pulldown", 3, "10-12", 90),
          ex("Seated Cable Row", "seated-row", 3, "10-12", 90),
          ex("Face Pulls", "face-pulls", 3, "15-20", 60),
        ],
      },
      {
        dayNumber: 3, name: "Shoulders", type: "lift",
        exercises: [
          ex("Overhead Press", "overhead-press", 4, "6-10", 120, { alt: ["Dumbbell Lateral Raise"], contra: ["shoulder"] }),
          ex("Dumbbell Lateral Raise", "db-lateral-raise", 4, "12-15", 60),
          ex("Rear Delt Fly", "reverse-pec-deck", 3, "12-15", 60),
          ex("Dumbbell Shoulder Press", "db-shoulder-press", 3, "8-12", 90, { alt: ["Lateral Raise"], contra: ["shoulder"] }),
          ex("Shrug", "barbell-shrug", 3, "10-12", 60),
        ],
      },
      {
        dayNumber: 4, name: "Arms", type: "lift",
        exercises: [
          ex("Barbell Curl", "barbell-curl", 4, "8-10", 60),
          ex("Close Grip Bench Press", "close-grip-bench", 4, "8-10", 90),
          ex("Dumbbell Curl", "db-curl", 3, "10-12", 60),
          ex("Tricep Pushdown", "tricep-pushdown", 3, "10-12", 60),
          ex("Hammer Curl", "hammer-curl", 3, "10-12", 60),
          ex("Overhead Tricep Extension", "db-overhead-tricep-ext", 3, "10-12", 60),
        ],
      },
      {
        dayNumber: 5, name: "Legs", type: "lift",
        exercises: [
          ex("Barbell Squat", "barbell-squat", 4, "6-10", 180, { alt: ["Leg Press"], contra: ["knee"] }),
          ex("Romanian Deadlift", "romanian-deadlift", 3, "8-10", 120, { contra: ["lower_back"] }),
          ex("Leg Press", "leg-press", 3, "10-12", 90, { contra: ["knee"] }),
          ex("Leg Curl", "leg-curl", 3, "10-12", 90),
          ex("Leg Extension", "leg-extension", 3, "12-15", 60, { contra: ["knee"] }),
          ex("Calf Raise", "standing-calf-raise", 4, "12-15", 60),
        ],
      },
    ],
  }],
};

// ═══════════════════════════════════════════════════════════════════════════
// 11. HOME DUMBBELL UL — 4 days, hypertrophy, home gym
// ═══════════════════════════════════════════════════════════════════════════
const homeDumbbellUL: ProgramTemplate = {
  id: "home-dumbbell-ul",
  name: "Home Dumbbell Upper/Lower",
  split: "upper_lower",
  daysPerWeek: 4,
  goal: "hypertrophy",
  experience: ["beginner", "intermediate"],
  equipment: "home_gym",
  gender: ["male", "female", "unspecified"],
  runIntegration: false,
  weeks: [{
    weekNumber: 1,
    days: [
      {
        dayNumber: 1, name: "Upper A", type: "lift",
        exercises: [
          ex("Dumbbell Bench Press", "db-bench", 4, "8-12", 90),
          ex("Dumbbell Row", "db-row", 4, "8-12", 90),
          ex("Dumbbell Shoulder Press", "db-shoulder-press", 3, "10-12", 90, { alt: ["Lateral Raise"], contra: ["shoulder"] }),
          ex("Pull-Ups", "pull-ups", 3, "6-10", 90, { alt: ["Inverted Row"] }),
          ex("Dumbbell Curl", "db-curl", 3, "10-12", 60),
          ex("Dumbbell Tricep Extension", "db-overhead-tricep-ext", 3, "10-12", 60),
        ],
      },
      {
        dayNumber: 2, name: "Lower A", type: "lift",
        exercises: [
          ex("Goblet Squat", "goblet-squat", 4, "10-15", 90, { contra: ["knee"] }),
          ex("Dumbbell Romanian Deadlift", "db-rdl", 3, "10-12", 90, { contra: ["lower_back"] }),
          ex("Dumbbell Lunge", "db-lunge", 3, "10/leg", 90, { contra: ["knee"] }),
          ex("Glute Bridge", "glute-bridge", 3, "15-20", 60),
          ex("Calf Raise", "standing-calf-raise", 3, "15-20", 60),
        ],
      },
      {
        dayNumber: 3, name: "Upper B", type: "lift",
        exercises: [
          ex("Incline Dumbbell Press", "incline-db-press", 4, "8-12", 90),
          ex("Chest-Supported DB Row", "chest-supported-db-row", 4, "10-12", 90),
          ex("Dumbbell Lateral Raise", "db-lateral-raise", 3, "12-15", 60),
          ex("Dumbbell Flyes", "db-flyes", 3, "12-15", 60),
          ex("Hammer Curl", "hammer-curl", 3, "10-12", 60),
        ],
      },
      {
        dayNumber: 4, name: "Lower B", type: "lift",
        exercises: [
          ex("Bulgarian Split Squat", "bulgarian-split-squat", 3, "10/leg", 90, { contra: ["knee"] }),
          ex("Dumbbell Romanian Deadlift", "db-rdl", 3, "10-12", 90, { contra: ["lower_back"] }),
          ex("Step Up", "step-up", 3, "10/leg", 90, { contra: ["knee"] }),
          ex("Hip Thrust", "hip-thrust", 3, "12-15", 60),
          ex("Plank", "plank", 3, "30-60s", 45),
        ],
      },
    ],
  }],
};

// ═══════════════════════════════════════════════════════════════════════════
// 12. FAT LOSS CIRCUIT — 4 days, fat loss, full gym
// ═══════════════════════════════════════════════════════════════════════════
const fatLossCircuit: ProgramTemplate = {
  id: "fat-loss-circuit",
  name: "Fat Loss Circuit",
  split: "full_body",
  daysPerWeek: 4,
  goal: "fat_loss",
  experience: ["beginner", "intermediate", "advanced"],
  equipment: "full_gym",
  gender: ["male", "female", "unspecified"],
  runIntegration: false,
  weeks: [{
    weekNumber: 1,
    days: [
      {
        dayNumber: 1, name: "Full Body Circuit A", type: "lift",
        exercises: [
          ex("Barbell Squat", "barbell-squat", 3, "12-15", 45, { alt: ["Leg Press"], contra: ["knee"] }),
          ex("Bench Press", "bench-press", 3, "12-15", 45),
          ex("Barbell Row", "barbell-row", 3, "12-15", 45, { contra: ["lower_back"] }),
          ex("Overhead Press", "overhead-press", 3, "12-15", 45, { alt: ["Lateral Raise"], contra: ["shoulder"] }),
          ex("Plank", "plank", 3, "30-45s", 30),
        ],
      },
      {
        dayNumber: 2, name: "Full Body Circuit B", type: "lift",
        exercises: [
          ex("Deadlift", "deadlift", 3, "10-12", 60, { contra: ["lower_back"] }),
          ex("Dumbbell Bench Press", "db-bench", 3, "12-15", 45),
          ex("Lat Pulldown", "lat-pulldown", 3, "12-15", 45),
          ex("Dumbbell Lateral Raise", "db-lateral-raise", 3, "15-20", 30),
          ex("Mountain Climbers", "mountain-climbers", 3, "20/side", 30),
        ],
      },
      {
        dayNumber: 3, name: "Full Body Circuit C", type: "lift",
        exercises: [
          ex("Leg Press", "leg-press", 3, "15-20", 45, { contra: ["knee"] }),
          ex("Incline Dumbbell Press", "incline-db-press", 3, "12-15", 45),
          ex("Seated Cable Row", "seated-row", 3, "12-15", 45),
          ex("Face Pulls", "face-pulls", 3, "15-20", 30),
          ex("Bicycle Crunch", "bicycle-crunch", 3, "15-20", 30),
        ],
      },
      {
        dayNumber: 4, name: "Full Body Circuit D", type: "lift",
        exercises: [
          ex("Bulgarian Split Squat", "bulgarian-split-squat", 3, "12/leg", 45, { contra: ["knee"] }),
          ex("Cable Crossover", "cable-crossover", 3, "12-15", 30),
          ex("Dumbbell Row", "db-row", 3, "12-15", 45),
          ex("Dumbbell Shoulder Press", "db-shoulder-press", 3, "12-15", 45, { alt: ["Lateral Raise"], contra: ["shoulder"] }),
          ex("Dead Bug", "dead-bug", 3, "10/side", 30),
        ],
      },
    ],
  }],
};

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT ALL TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════
export const PROGRAM_TEMPLATES: ProgramTemplate[] = [
  fullBodyBeginner,
  fullBodyHome,
  fullBodyMinimal,
  upperLowerHypertrophy,
  upperLowerRuns,
  pplHypertrophy,
  pplStrength,
  pplHybridRunner,
  broSplitClassic,
  homeDumbbellUL,
  fatLossCircuit,
];
