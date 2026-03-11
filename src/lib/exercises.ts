export interface Exercise {
  id: string;
  name: string;
  category: string;
  muscleGroup: string;
  secondaryMuscles?: string[];
  equipment: string;
  caloriesPerMinute: number;
  instructions?: string;
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
  { id: "bench-press", name: "Bench Press", category: "Chest", muscleGroup: "Pectorals", secondaryMuscles: ["Triceps", "Front Delts"], equipment: "Barbell", caloriesPerMinute: 7.5, instructions: "Lie on a flat bench with feet flat on the floor. Grip the barbell slightly wider than shoulder-width, lower it to your mid-chest, then press back up to lockout. Keep your shoulder blades retracted and maintain a slight arch in your lower back." },
  { id: "incline-bench", name: "Incline Bench Press", category: "Chest", muscleGroup: "Upper Chest", secondaryMuscles: ["Triceps", "Front Delts"], equipment: "Barbell", caloriesPerMinute: 7.5, instructions: "Set the bench to a 30-45 degree incline. Grip the barbell slightly wider than shoulder-width and lower it to your upper chest. Press the bar back up to lockout, keeping your shoulder blades pinched together." },
  { id: "decline-bench", name: "Decline Bench Press", category: "Chest", muscleGroup: "Lower Chest", secondaryMuscles: ["Triceps", "Front Delts"], equipment: "Barbell", caloriesPerMinute: 7.5, instructions: "Secure your legs at the end of a decline bench. Grip the barbell slightly wider than shoulder-width and lower it to your lower chest. Press the bar back up to full extension while maintaining control." },
  { id: "db-bench", name: "Dumbbell Bench Press", category: "Chest", muscleGroup: "Pectorals", secondaryMuscles: ["Triceps", "Front Delts"], equipment: "Dumbbells", caloriesPerMinute: 7, instructions: "Lie on a flat bench holding a dumbbell in each hand at chest level. Press the dumbbells up until your arms are fully extended, then lower them back to chest level. Keep your wrists neutral and elbows at roughly 45 degrees from your torso." },
  { id: "incline-db-press", name: "Incline Dumbbell Press", category: "Chest", muscleGroup: "Upper Chest", secondaryMuscles: ["Triceps", "Front Delts"], equipment: "Dumbbells", caloriesPerMinute: 7, instructions: "Set the bench to a 30-45 degree incline and hold a dumbbell in each hand at shoulder level. Press the dumbbells up and slightly inward until your arms are extended. Lower them back under control, feeling a stretch in your upper chest." },
  { id: "decline-db-press", name: "Decline Dumbbell Press", category: "Chest", muscleGroup: "Lower Chest", secondaryMuscles: ["Triceps", "Front Delts"], equipment: "Dumbbells", caloriesPerMinute: 7, instructions: "Secure your legs on a decline bench and hold a dumbbell in each hand at chest level. Press the dumbbells up to full extension, then lower them back down with control. Focus on squeezing your lower chest at the top." },
  { id: "db-flyes", name: "Dumbbell Flyes", category: "Chest", muscleGroup: "Pectorals", secondaryMuscles: ["Front Delts"], equipment: "Dumbbells", caloriesPerMinute: 5, instructions: "Lie on a flat bench holding dumbbells above your chest with a slight bend in your elbows. Lower the dumbbells out to the sides in a wide arc until you feel a stretch in your chest. Bring them back together above your chest, maintaining the same elbow angle." },
  { id: "cable-crossover", name: "Cable Crossover", category: "Chest", muscleGroup: "Pectorals", secondaryMuscles: ["Front Delts"], equipment: "Cable Machine", caloriesPerMinute: 5.5, instructions: "Set both pulleys to the highest position and grab a handle in each hand. Step forward and lean slightly, then bring your hands together in front of your body in a downward arc. Squeeze your chest at the bottom and slowly return to the start." },
  { id: "chest-press-machine", name: "Chest Press Machine", category: "Chest", muscleGroup: "Pectorals", secondaryMuscles: ["Triceps", "Front Delts"], equipment: "Machine", caloriesPerMinute: 6, instructions: "Adjust the seat so the handles align with your mid-chest. Grip the handles and press forward until your arms are fully extended. Return to the starting position under control, keeping your back flat against the pad." },
  { id: "pec-deck", name: "Pec Deck", category: "Chest", muscleGroup: "Pectorals", secondaryMuscles: ["Front Delts"], equipment: "Machine", caloriesPerMinute: 5, instructions: "Sit with your back against the pad and place your forearms on the padded arms. Bring the arms together in front of your chest, squeezing your pecs at the peak. Slowly return to the starting position, feeling a stretch in your chest." },
  { id: "machine-chest-fly", name: "Machine Chest Fly", category: "Chest", muscleGroup: "Chest", secondaryMuscles: ["Front Delts"], equipment: "Machine", caloriesPerMinute: 5.5, instructions: "Sit with your back flat against the pad and grip the handles at chest height. Bring the handles together in front of you with slightly bent elbows, squeezing your chest. Slowly return to the starting position with control." },
  { id: "smith-bench-press", name: "Smith Machine Bench Press", category: "Chest", muscleGroup: "Chest", secondaryMuscles: ["Triceps", "Front Delts"], equipment: "Machine", caloriesPerMinute: 7, instructions: "Position a flat bench under the Smith machine bar. Grip the bar slightly wider than shoulder-width, unrack it, and lower it to your mid-chest. Press the bar back up to lockout, keeping your feet flat on the floor." },
  { id: "push-ups", name: "Push-Ups", category: "Chest", muscleGroup: "Pectorals", secondaryMuscles: ["Triceps", "Front Delts", "Core"], equipment: "Bodyweight", caloriesPerMinute: 7, instructions: "Start in a high plank position with hands slightly wider than shoulder-width. Lower your body until your chest nearly touches the floor, keeping your core tight and body in a straight line. Push back up to the starting position." },
  { id: "weighted-push-ups", name: "Weighted Push-Ups", category: "Chest", muscleGroup: "Chest", secondaryMuscles: ["Triceps", "Front Delts", "Core"], equipment: "Bodyweight", caloriesPerMinute: 8, instructions: "Place a weight plate on your upper back and assume a push-up position. Lower your body to the floor while maintaining a straight line from head to heels. Press back up to the starting position, keeping the weight stable." },
  { id: "barbell-floor-press", name: "Barbell Floor Press", category: "Chest", muscleGroup: "Chest", secondaryMuscles: ["Triceps", "Front Delts"], equipment: "Barbell", caloriesPerMinute: 7, instructions: "Lie on the floor under a barbell in a rack. Lower the bar until your upper arms touch the floor, pause briefly, then press the bar back up. This limits the range of motion and emphasizes lockout strength." },
  { id: "weighted-chest-dip", name: "Weighted Chest Dip", category: "Chest", muscleGroup: "Lower Chest", secondaryMuscles: ["Triceps", "Front Delts"], equipment: "Bodyweight", caloriesPerMinute: 8, instructions: "Attach a weight belt or hold a dumbbell between your feet on parallel bars. Lean your torso forward and lower yourself until your upper arms are parallel to the floor. Press back up to full arm extension, maintaining the forward lean." },

  // ================= BACK =================
  { id: "deadlift", name: "Deadlift", category: "Back", muscleGroup: "Full Back", secondaryMuscles: ["Glutes", "Hamstrings", "Core", "Traps"], equipment: "Barbell", caloriesPerMinute: 9, instructions: "Stand with feet hip-width apart, barbell over mid-foot. Hinge at the hips, grip the bar just outside your knees, and drive through the floor to stand up. Keep your back flat, chest up, and the bar close to your body throughout." },
  { id: "barbell-row", name: "Barbell Row", category: "Back", muscleGroup: "Lats", secondaryMuscles: ["Rhomboids", "Rear Delts", "Biceps"], equipment: "Barbell", caloriesPerMinute: 7, instructions: "Hinge at the hips with a slight knee bend, holding the barbell with an overhand grip. Pull the bar toward your lower chest, squeezing your shoulder blades together at the top. Lower the bar under control and repeat." },
  { id: "pendlay-row", name: "Pendlay Row", category: "Back", muscleGroup: "Lats", secondaryMuscles: ["Rhomboids", "Rear Delts", "Biceps", "Core"], equipment: "Barbell", caloriesPerMinute: 7.5, instructions: "Set up with your torso parallel to the floor and the barbell on the ground. Explosively row the bar to your lower chest, then lower it back to the floor for a dead stop. Keep your back flat and reset between each rep." },
  { id: "db-row", name: "Dumbbell Row", category: "Back", muscleGroup: "Lats", secondaryMuscles: ["Rhomboids", "Rear Delts", "Biceps"], equipment: "Dumbbells", caloriesPerMinute: 6.5, instructions: "Place one hand and knee on a bench for support, holding a dumbbell in the other hand. Pull the dumbbell toward your hip, squeezing your lat at the top. Lower it under control and repeat before switching sides." },
  { id: "chest-supported-db-row", name: "Chest-Supported Dumbbell Row", category: "Back", muscleGroup: "Mid Back", secondaryMuscles: ["Rhomboids", "Rear Delts", "Biceps"], equipment: "Dumbbells", caloriesPerMinute: 6.5, instructions: "Lie face down on an incline bench set to 30-45 degrees, holding a dumbbell in each hand. Row both dumbbells toward your hips, squeezing your shoulder blades together. Lower under control, allowing a full stretch at the bottom." },
  { id: "meadows-row", name: "Meadows Row", category: "Back", muscleGroup: "Lats", secondaryMuscles: ["Rhomboids", "Rear Delts", "Biceps"], equipment: "Barbell", caloriesPerMinute: 6.5, instructions: "Stand perpendicular to a landmine attachment and stagger your stance. Grip the end of the barbell with an overhand grip and row it toward your hip. Focus on driving your elbow back and squeezing your lat at the top." },
  { id: "pull-ups", name: "Pull-Ups", category: "Back", muscleGroup: "Lats", secondaryMuscles: ["Biceps", "Rear Delts", "Core"], equipment: "Bodyweight", caloriesPerMinute: 8, instructions: "Hang from a pull-up bar with an overhand grip slightly wider than shoulder-width. Pull yourself up until your chin clears the bar, then lower back down with control. Avoid swinging and keep your core engaged throughout." },
  { id: "chin-ups", name: "Chin-Ups", category: "Back", muscleGroup: "Lats", secondaryMuscles: ["Biceps", "Core"], equipment: "Bodyweight", caloriesPerMinute: 8, instructions: "Hang from a bar with an underhand grip at shoulder-width. Pull yourself up until your chin clears the bar, engaging your lats and biceps. Lower yourself under control to a full dead hang and repeat." },
  { id: "lat-pulldown", name: "Lat Pulldown", category: "Back", muscleGroup: "Lats", secondaryMuscles: ["Biceps", "Rear Delts"], equipment: "Cable Machine", caloriesPerMinute: 6, instructions: "Sit at a lat pulldown machine and grip the bar wider than shoulder-width. Pull the bar down to your upper chest, squeezing your lats at the bottom. Slowly return the bar to the starting position with control." },
  { id: "single-arm-lat-pulldown", name: "Single-Arm Lat Pulldown", category: "Back", muscleGroup: "Lats", secondaryMuscles: ["Biceps", "Rear Delts"], equipment: "Cable Machine", caloriesPerMinute: 6, instructions: "Attach a single handle to a high pulley and sit or kneel at the cable station. Pull the handle down toward your side, focusing on contracting your lat. Return to the top under control and complete all reps before switching sides." },
  { id: "seated-row", name: "Seated Cable Row", category: "Back", muscleGroup: "Mid Back", secondaryMuscles: ["Rhomboids", "Biceps", "Rear Delts"], equipment: "Cable Machine", caloriesPerMinute: 6, instructions: "Sit at a cable row station with your feet on the platform and knees slightly bent. Pull the handle toward your lower chest, squeezing your shoulder blades together. Slowly extend your arms back without rounding your back." },
  { id: "t-bar-row", name: "T-Bar Row", category: "Back", muscleGroup: "Mid Back", secondaryMuscles: ["Lats", "Rhomboids", "Biceps"], equipment: "Barbell", caloriesPerMinute: 7, instructions: "Straddle the T-bar row machine or landmine setup and grip the handles. With your torso at roughly 45 degrees, row the weight toward your chest. Squeeze your back at the top and lower the weight under control." },
  { id: "face-pulls", name: "Face Pulls", category: "Back", muscleGroup: "Rear Delts", secondaryMuscles: ["Rhomboids", "Traps", "Rotator Cuff"], equipment: "Cable Machine", caloriesPerMinute: 4.5, instructions: "Attach a rope to a high cable pulley. Pull toward your face, separating the rope ends past your ears. Squeeze your rear delts and external rotators at the peak." },
  { id: "rack-pull", name: "Rack Pull", category: "Back", muscleGroup: "Posterior Chain", secondaryMuscles: ["Traps", "Glutes", "Core"], equipment: "Barbell", caloriesPerMinute: 8.5, instructions: "Set the barbell on safety pins in a power rack at knee height. Grip the bar, brace your core, and stand up by driving your hips forward. Lower the bar back to the pins under control, keeping your back straight." },
  { id: "straight-arm-pulldown", name: "Straight-Arm Pulldown", category: "Back", muscleGroup: "Lats", secondaryMuscles: ["Teres Major", "Core"], equipment: "Cable Machine", caloriesPerMinute: 5.5, instructions: "Stand facing a high cable pulley and grip the bar with straight arms. Push the bar down in an arc toward your thighs, keeping your arms straight and squeezing your lats. Slowly return to the starting position." },
  { id: "inverted-row", name: "Inverted Row", category: "Back", muscleGroup: "Mid Back", secondaryMuscles: ["Rhomboids", "Biceps", "Core"], equipment: "Bodyweight", caloriesPerMinute: 7, instructions: "Set a barbell in a rack at waist height and hang underneath it with an overhand grip. Pull your chest up to the bar, squeezing your shoulder blades together. Lower yourself back down with control, keeping your body straight." },

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
  { id: "clean-and-press", name: "Clean and Press", category: "Full Body", muscleGroup: "Full Body", secondaryMuscles: ["Shoulders", "Legs", "Core"], equipment: "Barbell", caloriesPerMinute: 10, instructions: "Start with the barbell on the floor. Pull it to your shoulders in one explosive motion (clean), then press it overhead. Lower back to shoulders, then to the floor and repeat." },
  { id: "kettlebell-swing", name: "Kettlebell Swing", category: "Full Body", muscleGroup: "Full Body", secondaryMuscles: ["Glutes", "Hamstrings", "Core"], equipment: "Kettlebell", caloriesPerMinute: 10, instructions: "Stand with feet shoulder-width apart, kettlebell between your feet. Hinge at the hips, grip the bell, and swing it forward by driving your hips. Let it swing to chest height, then control the descent." },
  { id: "burpees", name: "Burpees", category: "Full Body", muscleGroup: "Full Body", secondaryMuscles: ["Chest", "Legs", "Core"], equipment: "Bodyweight", caloriesPerMinute: 10, instructions: "From standing, drop into a squat with hands on the floor. Jump your feet back into a push-up position, perform a push-up, jump feet forward, then explode upward into a jump." },
  { id: "thrusters", name: "Thrusters", category: "Full Body", muscleGroup: "Full Body", secondaryMuscles: ["Quads", "Shoulders", "Core"], equipment: "Barbell", caloriesPerMinute: 9.5, instructions: "Hold the barbell at shoulder height in a front rack position. Squat down, then drive up explosively and press the bar overhead in one fluid movement. Lower and repeat." },
  { id: "farmers-carry", name: "Farmer's Carry", category: "Full Body", muscleGroup: "Full Body", secondaryMuscles: ["Forearms", "Traps", "Core"], equipment: "Dumbbells", caloriesPerMinute: 9, instructions: "Pick up heavy dumbbells or kettlebells in each hand. Stand tall with shoulders back and core braced. Walk forward with controlled steps, maintaining an upright posture throughout." },
  { id: "sled-push-pull", name: "Sled Push/Pull", category: "Full Body", muscleGroup: "Full Body", secondaryMuscles: ["Quads", "Glutes", "Core"], equipment: "Machine", caloriesPerMinute: 10, instructions: "For push: grip the sled handles at chest height and drive forward with powerful leg strides. For pull: attach a rope, face the sled, and pull it toward you hand over hand." },
  { id: "landmine-squat", name: "Landmine Squat", category: "Full Body", muscleGroup: "Full Body", secondaryMuscles: ["Quads", "Glutes", "Core"], equipment: "Barbell", caloriesPerMinute: 8.5, instructions: "Hold the end of a landmine barbell at chest height with both hands. Squat down keeping your torso upright, then drive through your heels to stand back up." },
  { id: "zercher-squat", name: "Zercher Squat", category: "Full Body", muscleGroup: "Full Body", secondaryMuscles: ["Quads", "Glutes", "Biceps", "Core"], equipment: "Barbell", caloriesPerMinute: 9, instructions: "Cradle the barbell in the crooks of your elbows with arms bent. Squat down keeping elbows inside your knees, maintaining an upright torso. Drive up through your heels." },
  { id: "turkish-get-up", name: "Turkish Get-Up", category: "Full Body", muscleGroup: "Full Body", secondaryMuscles: ["Shoulders", "Core", "Glutes"], equipment: "Kettlebell", caloriesPerMinute: 8, instructions: "Lie on your back holding a kettlebell straight up with one arm. Rise to a standing position through a series of controlled movements while keeping the weight overhead. Reverse the steps to return." },
  { id: "man-maker", name: "Man Maker", category: "Full Body", muscleGroup: "Full Body", secondaryMuscles: ["Chest", "Shoulders", "Back", "Legs"], equipment: "Dumbbells", caloriesPerMinute: 11, instructions: "Start in push-up position gripping dumbbells. Perform a push-up, row each dumbbell, jump feet to hands, clean the dumbbells to shoulders, then press overhead. Return to start." },
  { id: "battle-ropes", name: "Battle Ropes", category: "Full Body", muscleGroup: "Full Body", secondaryMuscles: ["Shoulders", "Arms", "Core"], equipment: "Battle Ropes", caloriesPerMinute: 11, instructions: "Hold one end of the rope in each hand. Create waves by alternating arms up and down rapidly, or slam both arms simultaneously. Keep a slight squat and engaged core throughout." },
  { id: "box-jumps", name: "Box Jumps", category: "Full Body", muscleGroup: "Full Body", secondaryMuscles: ["Quads", "Glutes", "Calves"], equipment: "Box", caloriesPerMinute: 9, instructions: "Stand facing a sturdy box. Swing your arms and jump explosively onto the box, landing softly with both feet. Stand fully upright, then step or jump back down and repeat." },

  // ================= CARDIO =================
  { id: "treadmill", name: "Treadmill", category: "Cardio", muscleGroup: "Cardio", secondaryMuscles: ["Quads", "Calves"], equipment: "Machine", caloriesPerMinute: 10, instructions: "Set your desired speed and incline. Walk or run at a steady pace, maintaining good posture with arms swinging naturally." },
  { id: "incline-treadmill-walk", name: "Incline Treadmill Walking", category: "Cardio", muscleGroup: "Cardio", secondaryMuscles: ["Glutes", "Calves"], equipment: "Machine", caloriesPerMinute: 7, instructions: "Set treadmill to a steep incline (10-15%). Walk at a moderate pace without holding the handrails. Keep your core engaged and lean slightly forward." },
  { id: "elliptical", name: "Elliptical", category: "Cardio", muscleGroup: "Cardio", secondaryMuscles: ["Quads", "Glutes"], equipment: "Machine", caloriesPerMinute: 8, instructions: "Stand on the pedals and grip the handles. Move in a smooth elliptical motion, pushing and pulling with both arms and legs." },
  { id: "rowing-machine", name: "Rowing Machine", category: "Cardio", muscleGroup: "Cardio", secondaryMuscles: ["Back", "Legs", "Core"], equipment: "Machine", caloriesPerMinute: 9, instructions: "Sit with feet strapped in and grip the handle. Drive through your legs first, then lean back and pull the handle to your chest. Return in reverse order." },
  { id: "stairmaster", name: "Stairmaster", category: "Cardio", muscleGroup: "Cardio", secondaryMuscles: ["Quads", "Glutes", "Calves"], equipment: "Machine", caloriesPerMinute: 9, instructions: "Step onto the machine and set your pace. Climb steadily without leaning on the handrails. Keep an upright posture throughout." },
  { id: "bike", name: "Stationary Bike", category: "Cardio", muscleGroup: "Cardio", secondaryMuscles: ["Quads", "Hamstrings"], equipment: "Machine", caloriesPerMinute: 7.5, instructions: "Adjust the seat height so your leg has a slight bend at the bottom. Pedal at a steady cadence, adjusting resistance as needed." },
  { id: "spin-bike", name: "Spin Bike", category: "Cardio", muscleGroup: "Cardio", secondaryMuscles: ["Quads", "Hamstrings", "Core"], equipment: "Machine", caloriesPerMinute: 9, instructions: "Set up the bike with proper seat and handlebar height. Pedal at high intensity, alternating between seated and standing positions." },
  { id: "assault-bike", name: "Assault Bike", category: "Cardio", muscleGroup: "Cardio", secondaryMuscles: ["Full Body"], equipment: "Machine", caloriesPerMinute: 12, instructions: "Grip both handles and place feet on pedals. Push and pull the handles while pedalling for a full-body cardio effort." },
  { id: "ski-erg", name: "Ski Erg", category: "Cardio", muscleGroup: "Cardio", secondaryMuscles: ["Lats", "Core", "Triceps"], equipment: "Machine", caloriesPerMinute: 10, instructions: "Stand facing the machine and grip both handles overhead. Pull down explosively while hinging at the hips, driving through your core and lats." },
  { id: "jump-rope", name: "Jump Rope", category: "Cardio", muscleGroup: "Cardio", secondaryMuscles: ["Calves", "Shoulders"], equipment: "Jump Rope", caloriesPerMinute: 11, instructions: "Hold handles at hip height with elbows close to your body. Swing the rope with your wrists and jump just high enough to clear it." },
  { id: "swimming", name: "Swimming", category: "Cardio", muscleGroup: "Cardio", secondaryMuscles: ["Full Body"], equipment: "Pool", caloriesPerMinute: 9, instructions: "Choose your stroke and swim continuous laps. Focus on breathing rhythm and maintaining a streamlined body position in the water." },
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
