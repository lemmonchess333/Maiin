export interface Exercise {
  id: string;
  name: string;
  category: string;
  muscleGroup: string;
  equipment: string;
  caloriesPerMinute: number;
}

export const EXERCISE_CATEGORIES = [
  "Chest",
  "Back",
  "Shoulders",
  "Biceps",
  "Triceps",
  "Legs",
  "Core",
  "Full Body",
  "Cardio",
] as const;

export const EXERCISES: Exercise[] = [
  // ================= CHEST =================
  { id: "bench-press", name: "Bench Press", category: "Chest", muscleGroup: "Pectorals", equipment: "Barbell", caloriesPerMinute: 7.5 },
  { id: "incline-bench", name: "Incline Bench Press", category: "Chest", muscleGroup: "Upper Chest", equipment: "Barbell", caloriesPerMinute: 7.5 },
  { id: "decline-bench", name: "Decline Bench Press", category: "Chest", muscleGroup: "Lower Chest", equipment: "Barbell", caloriesPerMinute: 7.5 },
  { id: "db-bench", name: "Dumbbell Bench Press", category: "Chest", muscleGroup: "Pectorals", equipment: "Dumbbells", caloriesPerMinute: 7 },
  { id: "incline-db-press", name: "Incline Dumbbell Press", category: "Chest", muscleGroup: "Upper Chest", equipment: "Dumbbells", caloriesPerMinute: 7 },
  { id: "decline-db-press", name: "Decline Dumbbell Press", category: "Chest", muscleGroup: "Lower Chest", equipment: "Dumbbells", caloriesPerMinute: 7 },
  { id: "db-flyes", name: "Dumbbell Flyes", category: "Chest", muscleGroup: "Pectorals", equipment: "Dumbbells", caloriesPerMinute: 5 },
  { id: "cable-crossover", name: "Cable Crossover", category: "Chest", muscleGroup: "Pectorals", equipment: "Cable Machine", caloriesPerMinute: 5.5 },
  { id: "chest-press-machine", name: "Chest Press Machine", category: "Chest", muscleGroup: "Pectorals", equipment: "Machine", caloriesPerMinute: 6 },
  { id: "pec-deck", name: "Pec Deck", category: "Chest", muscleGroup: "Pectorals", equipment: "Machine", caloriesPerMinute: 5 },
  { id: "machine-chest-fly", name: "Machine Chest Fly", category: "Chest", muscleGroup: "Chest", equipment: "Machine", caloriesPerMinute: 5.5 },
  { id: "smith-bench-press", name: "Smith Machine Bench Press", category: "Chest", muscleGroup: "Chest", equipment: "Machine", caloriesPerMinute: 7 },
  { id: "push-ups", name: "Push-Ups", category: "Chest", muscleGroup: "Pectorals", equipment: "Bodyweight", caloriesPerMinute: 7 },
  { id: "weighted-push-ups", name: "Weighted Push-Ups", category: "Chest", muscleGroup: "Chest", equipment: "Bodyweight", caloriesPerMinute: 8 },
  { id: "barbell-floor-press", name: "Barbell Floor Press", category: "Chest", muscleGroup: "Chest", equipment: "Barbell", caloriesPerMinute: 7 },
  { id: "weighted-chest-dip", name: "Weighted Chest Dip", category: "Chest", muscleGroup: "Lower Chest", equipment: "Bodyweight", caloriesPerMinute: 8 },

  // ================= BACK =================
  { id: "deadlift", name: "Deadlift", category: "Back", muscleGroup: "Full Back", equipment: "Barbell", caloriesPerMinute: 9 },
  { id: "barbell-row", name: "Barbell Row", category: "Back", muscleGroup: "Lats", equipment: "Barbell", caloriesPerMinute: 7 },
  { id: "pendlay-row", name: "Pendlay Row", category: "Back", muscleGroup: "Lats", equipment: "Barbell", caloriesPerMinute: 7.5 },
  { id: "db-row", name: "Dumbbell Row", category: "Back", muscleGroup: "Lats", equipment: "Dumbbells", caloriesPerMinute: 6.5 },
  { id: "chest-supported-db-row", name: "Chest-Supported Dumbbell Row", category: "Back", muscleGroup: "Mid Back", equipment: "Dumbbells", caloriesPerMinute: 6.5 },
  { id: "meadows-row", name: "Meadows Row", category: "Back", muscleGroup: "Lats", equipment: "Barbell", caloriesPerMinute: 6.5 },
  { id: "pull-ups", name: "Pull-Ups", category: "Back", muscleGroup: "Lats", equipment: "Bodyweight", caloriesPerMinute: 8 },
  { id: "chin-ups", name: "Chin-Ups", category: "Back", muscleGroup: "Lats", equipment: "Bodyweight", caloriesPerMinute: 8 },
  { id: "lat-pulldown", name: "Lat Pulldown", category: "Back", muscleGroup: "Lats", equipment: "Cable Machine", caloriesPerMinute: 6 },
  { id: "single-arm-lat-pulldown", name: "Single-Arm Lat Pulldown", category: "Back", muscleGroup: "Lats", equipment: "Cable Machine", caloriesPerMinute: 6 },
  { id: "seated-row", name: "Seated Cable Row", category: "Back", muscleGroup: "Mid Back", equipment: "Cable Machine", caloriesPerMinute: 6 },
  { id: "t-bar-row", name: "T-Bar Row", category: "Back", muscleGroup: "Mid Back", equipment: "Barbell", caloriesPerMinute: 7 },
  { id: "face-pulls", name: "Face Pulls", category: "Back", muscleGroup: "Rear Delts", equipment: "Cable Machine", caloriesPerMinute: 4.5 },
  { id: "rack-pull", name: "Rack Pull", category: "Back", muscleGroup: "Posterior Chain", equipment: "Barbell", caloriesPerMinute: 8.5 },
  { id: "straight-arm-pulldown", name: "Straight-Arm Pulldown", category: "Back", muscleGroup: "Lats", equipment: "Cable Machine", caloriesPerMinute: 5.5 },
  { id: "inverted-row", name: "Inverted Row", category: "Back", muscleGroup: "Mid Back", equipment: "Bodyweight", caloriesPerMinute: 7 },

  // ================= SHOULDERS =================
  { id: "overhead-press", name: "Overhead Press", category: "Shoulders", muscleGroup: "Deltoids", equipment: "Barbell", caloriesPerMinute: 7 },
  { id: "db-shoulder-press", name: "Dumbbell Shoulder Press", category: "Shoulders", muscleGroup: "Deltoids", equipment: "Dumbbells", caloriesPerMinute: 6.5 },
  { id: "lateral-raise", name: "Lateral Raise", category: "Shoulders", muscleGroup: "Side Delts", equipment: "Dumbbells", caloriesPerMinute: 4.5 },
  { id: "cable-lateral-raise", name: "Cable Lateral Raise", category: "Shoulders", muscleGroup: "Side Delts", equipment: "Cable Machine", caloriesPerMinute: 4.5 },
  { id: "front-raise", name: "Front Raise", category: "Shoulders", muscleGroup: "Front Delts", equipment: "Dumbbells", caloriesPerMinute: 4.5 },
  { id: "reverse-flyes", name: "Reverse Flyes", category: "Shoulders", muscleGroup: "Rear Delts", equipment: "Dumbbells", caloriesPerMinute: 4.5 },
  { id: "rear-delt-machine-fly", name: "Rear Delt Machine Fly", category: "Shoulders", muscleGroup: "Rear Delts", equipment: "Machine", caloriesPerMinute: 4.5 },
  { id: "arnold-press", name: "Arnold Press", category: "Shoulders", muscleGroup: "Deltoids", equipment: "Dumbbells", caloriesPerMinute: 6.5 },
  { id: "shoulder-press-machine", name: "Shoulder Press Machine", category: "Shoulders", muscleGroup: "Deltoids", equipment: "Machine", caloriesPerMinute: 6 },
  { id: "smith-shoulder-press", name: "Smith Machine Shoulder Press", category: "Shoulders", muscleGroup: "Deltoids", equipment: "Machine", caloriesPerMinute: 6.5 },
  { id: "barbell-upright-row", name: "Barbell Upright Row", category: "Shoulders", muscleGroup: "Traps", equipment: "Barbell", caloriesPerMinute: 6 },
  { id: "shrugs", name: "Shrugs", category: "Shoulders", muscleGroup: "Traps", equipment: "Dumbbells", caloriesPerMinute: 5 },
  { id: "cuban-press", name: "Cuban Press", category: "Shoulders", muscleGroup: "Shoulders", equipment: "Dumbbells", caloriesPerMinute: 5 },
  { id: "lu-raise", name: "Lu Raise", category: "Shoulders", muscleGroup: "Deltoids", equipment: "Dumbbells", caloriesPerMinute: 5 },
  { id: "landmine-press", name: "Landmine Press", category: "Shoulders", muscleGroup: "Deltoids", equipment: "Barbell", caloriesPerMinute: 6.5 },

  // ================= BICEPS =================
  { id: "barbell-curl", name: "Barbell Curl", category: "Biceps", muscleGroup: "Biceps", equipment: "Barbell", caloriesPerMinute: 5 },
  { id: "ez-bar-curl", name: "EZ Bar Curl", category: "Biceps", muscleGroup: "Biceps", equipment: "Barbell", caloriesPerMinute: 5 },
  { id: "db-curl", name: "Dumbbell Curl", category: "Biceps", muscleGroup: "Biceps", equipment: "Dumbbells", caloriesPerMinute: 5 },
  { id: "incline-db-curl", name: "Incline Dumbbell Curl", category: "Biceps", muscleGroup: "Biceps", equipment: "Dumbbells", caloriesPerMinute: 5 },
  { id: "hammer-curl", name: "Hammer Curl", category: "Biceps", muscleGroup: "Biceps", equipment: "Dumbbells", caloriesPerMinute: 5 },
  { id: "cross-body-hammer-curl", name: "Cross-Body Hammer Curl", category: "Biceps", muscleGroup: "Biceps", equipment: "Dumbbells", caloriesPerMinute: 5 },
  { id: "zottman-curl", name: "Zottman Curl", category: "Biceps", muscleGroup: "Biceps", equipment: "Dumbbells", caloriesPerMinute: 5 },
  { id: "preacher-curl", name: "Preacher Curl", category: "Biceps", muscleGroup: "Biceps", equipment: "Barbell", caloriesPerMinute: 4.5 },
  { id: "cable-curl", name: "Cable Curl", category: "Biceps", muscleGroup: "Biceps", equipment: "Cable Machine", caloriesPerMinute: 4.5 },
  { id: "bayesian-cable-curl", name: "Bayesian Cable Curl", category: "Biceps", muscleGroup: "Biceps", equipment: "Cable Machine", caloriesPerMinute: 4.5 },
  { id: "concentration-curl", name: "Concentration Curl", category: "Biceps", muscleGroup: "Biceps", equipment: "Dumbbells", caloriesPerMinute: 4 },
  { id: "spider-db-curl", name: "Spider Dumbbell Curl", category: "Biceps", muscleGroup: "Biceps", equipment: "Dumbbells", caloriesPerMinute: 4.5 },
  { id: "reverse-barbell-curl", name: "Reverse Barbell Curl", category: "Biceps", muscleGroup: "Biceps", equipment: "Barbell", caloriesPerMinute: 4.5 },

  // ================= TRICEPS =================
  { id: "rope-tricep-pushdown", name: "Rope Tricep Pushdown", category: "Triceps", muscleGroup: "Triceps", equipment: "Cable Machine", caloriesPerMinute: 5 },
  { id: "skull-crushers", name: "Skull Crushers", category: "Triceps", muscleGroup: "Triceps", equipment: "Barbell", caloriesPerMinute: 5.5 },
  { id: "overhead-extension", name: "Overhead Tricep Extension", category: "Triceps", muscleGroup: "Triceps", equipment: "Dumbbells", caloriesPerMinute: 5 },
  { id: "overhead-cable-tricep-extension", name: "Overhead Cable Tricep Extension", category: "Triceps", muscleGroup: "Triceps", equipment: "Cable Machine", caloriesPerMinute: 5 },
  { id: "tricep-dips", name: "Tricep Dips", category: "Triceps", muscleGroup: "Triceps", equipment: "Bodyweight", caloriesPerMinute: 7 },
  { id: "bench-dips", name: "Bench Dips", category: "Triceps", muscleGroup: "Triceps", equipment: "Bodyweight", caloriesPerMinute: 6.5 },
  { id: "close-grip-bench", name: "Close Grip Bench Press", category: "Triceps", muscleGroup: "Triceps", equipment: "Barbell", caloriesPerMinute: 7 },
  { id: "tricep-kickback", name: "Tricep Kickback", category: "Triceps", muscleGroup: "Triceps", equipment: "Dumbbells", caloriesPerMinute: 4 },
  { id: "single-arm-cable-pushdown", name: "Single-Arm Cable Pushdown", category: "Triceps", muscleGroup: "Triceps", equipment: "Cable Machine", caloriesPerMinute: 4.5 },
  { id: "reverse-grip-cable-pushdown", name: "Reverse Grip Cable Pushdown", category: "Triceps", muscleGroup: "Triceps", equipment: "Cable Machine", caloriesPerMinute: 4.5 },
  { id: "jm-press", name: "JM Press", category: "Triceps", muscleGroup: "Triceps", equipment: "Barbell", caloriesPerMinute: 6 },
  { id: "diamond-push-ups", name: "Diamond Push-Ups", category: "Triceps", muscleGroup: "Triceps", equipment: "Bodyweight", caloriesPerMinute: 7 },

  // ================= LEGS =================
  { id: "squat", name: "Barbell Squat", category: "Legs", muscleGroup: "Quads", equipment: "Barbell", caloriesPerMinute: 9 },
  { id: "front-squat", name: "Front Squat", category: "Legs", muscleGroup: "Quads", equipment: "Barbell", caloriesPerMinute: 9 },
  { id: "goblet-squat", name: "Goblet Squat", category: "Legs", muscleGroup: "Quads", equipment: "Dumbbells", caloriesPerMinute: 7 },
  { id: "sissy-squat", name: "Sissy Squat", category: "Legs", muscleGroup: "Quads", equipment: "Bodyweight", caloriesPerMinute: 6 },
  { id: "smith-machine-squat", name: "Smith Machine Squat", category: "Legs", muscleGroup: "Quads", equipment: "Machine", caloriesPerMinute: 8 },
  { id: "hack-squat", name: "Hack Squat", category: "Legs", muscleGroup: "Quads", equipment: "Machine", caloriesPerMinute: 8 },
  { id: "leg-press", name: "Leg Press", category: "Legs", muscleGroup: "Quads", equipment: "Machine", caloriesPerMinute: 7.5 },
  { id: "leg-extension", name: "Leg Extension", category: "Legs", muscleGroup: "Quads", equipment: "Machine", caloriesPerMinute: 5 },
  { id: "seated-leg-curl", name: "Seated Leg Curl", category: "Legs", muscleGroup: "Hamstrings", equipment: "Machine", caloriesPerMinute: 5 },
  { id: "romanian-deadlift", name: "Romanian Deadlift", category: "Legs", muscleGroup: "Hamstrings", equipment: "Barbell", caloriesPerMinute: 8 },
  { id: "nordic-hamstring-curl", name: "Nordic Hamstring Curl", category: "Legs", muscleGroup: "Hamstrings", equipment: "Bodyweight", caloriesPerMinute: 7 },
  { id: "glute-ham-raise", name: "Glute-Ham Raise", category: "Legs", muscleGroup: "Hamstrings", equipment: "Machine", caloriesPerMinute: 7 },
  { id: "sumo-deadlift", name: "Sumo Deadlift", category: "Legs", muscleGroup: "Glutes", equipment: "Barbell", caloriesPerMinute: 9 },
  { id: "trap-bar-deadlift", name: "Trap Bar Deadlift", category: "Legs", muscleGroup: "Glutes", equipment: "Barbell", caloriesPerMinute: 9 },
  { id: "lunges", name: "Lunges", category: "Legs", muscleGroup: "Quads", equipment: "Dumbbells", caloriesPerMinute: 7 },
  { id: "walking-dumbbell-lunges", name: "Walking Dumbbell Lunges", category: "Legs", muscleGroup: "Quads", equipment: "Dumbbells", caloriesPerMinute: 7.5 },
  { id: "bulgarian-split", name: "Bulgarian Split Squat", category: "Legs", muscleGroup: "Quads", equipment: "Dumbbells", caloriesPerMinute: 7.5 },
  { id: "barbell-step-ups", name: "Barbell Step-Ups", category: "Legs", muscleGroup: "Quads", equipment: "Barbell", caloriesPerMinute: 7.5 },
  { id: "calf-raise", name: "Calf Raise", category: "Legs", muscleGroup: "Calves", equipment: "Machine", caloriesPerMinute: 4 },
  { id: "donkey-calf-raise", name: "Donkey Calf Raise", category: "Legs", muscleGroup: "Calves", equipment: "Machine", caloriesPerMinute: 4.5 },
  { id: "hip-thrust", name: "Hip Thrust", category: "Legs", muscleGroup: "Glutes", equipment: "Barbell", caloriesPerMinute: 7 },
  { id: "hip-abduction-machine", name: "Hip Abduction Machine", category: "Legs", muscleGroup: "Glutes", equipment: "Machine", caloriesPerMinute: 4.5 },
  { id: "hip-adduction-machine", name: "Hip Adduction Machine", category: "Legs", muscleGroup: "Adductors", equipment: "Machine", caloriesPerMinute: 4.5 },
  { id: "cable-glute-kickback", name: "Cable Glute Kickback", category: "Legs", muscleGroup: "Glutes", equipment: "Cable Machine", caloriesPerMinute: 4.5 },

  // ================= CORE =================
  { id: "plank", name: "Plank", category: "Core", muscleGroup: "Core", equipment: "Bodyweight", caloriesPerMinute: 4 },
  { id: "side-plank", name: "Side Plank", category: "Core", muscleGroup: "Obliques", equipment: "Bodyweight", caloriesPerMinute: 4 },
  { id: "weighted-plank", name: "Weighted Plank", category: "Core", muscleGroup: "Core", equipment: "Bodyweight", caloriesPerMinute: 5 },
  { id: "crunches", name: "Crunches", category: "Core", muscleGroup: "Abs", equipment: "Bodyweight", caloriesPerMinute: 5 },
  { id: "bicycle-crunch", name: "Bicycle Crunch", category: "Core", muscleGroup: "Obliques", equipment: "Bodyweight", caloriesPerMinute: 5.5 },
  { id: "decline-sit-up", name: "Decline Sit-Up", category: "Core", muscleGroup: "Abs", equipment: "Bodyweight", caloriesPerMinute: 5.5 },
  { id: "leg-raise", name: "Hanging Leg Raise", category: "Core", muscleGroup: "Lower Abs", equipment: "Bodyweight", caloriesPerMinute: 6 },
  { id: "toe-touches", name: "Toe Touches", category: "Core", muscleGroup: "Abs", equipment: "Bodyweight", caloriesPerMinute: 5 },
  { id: "russian-twist", name: "Russian Twist", category: "Core", muscleGroup: "Obliques", equipment: "Bodyweight", caloriesPerMinute: 5.5 },
  { id: "mountain-climbers", name: "Mountain Climbers", category: "Core", muscleGroup: "Core", equipment: "Bodyweight", caloriesPerMinute: 8 },
  { id: "cable-crunch", name: "Cable Crunch", category: "Core", muscleGroup: "Abs", equipment: "Cable Machine", caloriesPerMinute: 5 },
  { id: "cable-woodchopper", name: "Cable Woodchopper", category: "Core", muscleGroup: "Obliques", equipment: "Cable Machine", caloriesPerMinute: 5 },
  { id: "pallof-press", name: "Pallof Press", category: "Core", muscleGroup: "Core", equipment: "Cable Machine", caloriesPerMinute: 4.5 },
  { id: "dead-bug", name: "Dead Bug", category: "Core", muscleGroup: "Core", equipment: "Bodyweight", caloriesPerMinute: 4 },
  { id: "dragon-flag", name: "Dragon Flag", category: "Core", muscleGroup: "Core", equipment: "Bodyweight", caloriesPerMinute: 7 },
  { id: "ab-wheel", name: "Ab Wheel Rollout", category: "Core", muscleGroup: "Core", equipment: "Ab Wheel", caloriesPerMinute: 6 },

  // ================= FULL BODY =================
  { id: "clean-and-press", name: "Clean and Press", category: "Full Body", muscleGroup: "Full Body", equipment: "Barbell", caloriesPerMinute: 10 },
  { id: "kettlebell-swing", name: "Kettlebell Swing", category: "Full Body", muscleGroup: "Full Body", equipment: "Kettlebell", caloriesPerMinute: 10 },
  { id: "burpees", name: "Burpees", category: "Full Body", muscleGroup: "Full Body", equipment: "Bodyweight", caloriesPerMinute: 10 },
  { id: "thrusters", name: "Thrusters", category: "Full Body", muscleGroup: "Full Body", equipment: "Barbell", caloriesPerMinute: 9.5 },
  { id: "farmers-carry", name: "Farmer's Carry", category: "Full Body", muscleGroup: "Full Body", equipment: "Dumbbells", caloriesPerMinute: 9 },
  { id: "sled-push-pull", name: "Sled Push/Pull", category: "Full Body", muscleGroup: "Full Body", equipment: "Machine", caloriesPerMinute: 10 },
  { id: "landmine-squat", name: "Landmine Squat", category: "Full Body", muscleGroup: "Full Body", equipment: "Barbell", caloriesPerMinute: 8.5 },
  { id: "zercher-squat", name: "Zercher Squat", category: "Full Body", muscleGroup: "Full Body", equipment: "Barbell", caloriesPerMinute: 9 },
  { id: "turkish-get-up", name: "Turkish Get-Up", category: "Full Body", muscleGroup: "Full Body", equipment: "Kettlebell", caloriesPerMinute: 8 },
  { id: "man-maker", name: "Man Maker", category: "Full Body", muscleGroup: "Full Body", equipment: "Dumbbells", caloriesPerMinute: 11 },
  { id: "battle-ropes", name: "Battle Ropes", category: "Full Body", muscleGroup: "Full Body", equipment: "Battle Ropes", caloriesPerMinute: 11 },
  { id: "box-jumps", name: "Box Jumps", category: "Full Body", muscleGroup: "Full Body", equipment: "Box", caloriesPerMinute: 9 },

  // ================= CARDIO =================
  { id: "treadmill", name: "Treadmill", category: "Cardio", muscleGroup: "Cardio", equipment: "Machine", caloriesPerMinute: 10 },
  { id: "incline-treadmill-walk", name: "Incline Treadmill Walking", category: "Cardio", muscleGroup: "Cardio", equipment: "Machine", caloriesPerMinute: 7 },
  { id: "elliptical", name: "Elliptical", category: "Cardio", muscleGroup: "Cardio", equipment: "Machine", caloriesPerMinute: 8 },
  { id: "rowing-machine", name: "Rowing Machine", category: "Cardio", muscleGroup: "Cardio", equipment: "Machine", caloriesPerMinute: 9 },
  { id: "stairmaster", name: "Stairmaster", category: "Cardio", muscleGroup: "Cardio", equipment: "Machine", caloriesPerMinute: 9 },
  { id: "bike", name: "Stationary Bike", category: "Cardio", muscleGroup: "Cardio", equipment: "Machine", caloriesPerMinute: 7.5 },
  { id: "spin-bike", name: "Spin Bike", category: "Cardio", muscleGroup: "Cardio", equipment: "Machine", caloriesPerMinute: 9 },
  { id: "assault-bike", name: "Assault Bike", category: "Cardio", muscleGroup: "Cardio", equipment: "Machine", caloriesPerMinute: 12 },
  { id: "ski-erg", name: "Ski Erg", category: "Cardio", muscleGroup: "Cardio", equipment: "Machine", caloriesPerMinute: 10 },
  { id: "jump-rope", name: "Jump Rope", category: "Cardio", muscleGroup: "Cardio", equipment: "Jump Rope", caloriesPerMinute: 11 },
  { id: "swimming", name: "Swimming", category: "Cardio", muscleGroup: "Cardio", equipment: "Pool", caloriesPerMinute: 9 },
];

export function getExercisesByCategory(category: string): Exercise[] {
  return EXERCISES.filter((e) => e.category === category);
}

export function getExerciseById(id: string): Exercise | undefined {
  return EXERCISES.find((e) => e.id === id);
}

export function estimateCalories(
  exerciseId: string,
  sets: number,
  reps: number,
  weightKg: number
): number {
  const exercise = getExerciseById(exerciseId);
  if (!exercise) return 0;
  const minutesPerSet = (reps * 3) / 60 + 1;
  const totalMinutes = minutesPerSet * sets;
  const weightMultiplier = 1 + (weightKg / 100) * 0.3;
  return Math.round(exercise.caloriesPerMinute * totalMinutes * weightMultiplier);
}
