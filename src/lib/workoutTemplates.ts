export interface RunTemplate {
  id: string;
  name: string;
  type: 'easy' | 'tempo' | 'intervals' | 'long' | 'race';
  icon: string;
  description: string;
  estimatedDuration: number;
  config: {
    targetPace?: number;
    targetDistance?: number;
    intervals?: {
      reps: number;
      workDistance?: number;
      workDuration?: number;
      restDuration: number;
      warmupDuration?: number;
      cooldownDuration?: number;
    };
  };
}

export const RUN_TEMPLATES: RunTemplate[] = [
  { id: 'easy_30', name: 'Easy 30', type: 'easy', icon: 'person-standing', description: '30 min easy pace — recovery day', estimatedDuration: 30, config: {} },
  { id: 'tempo_20', name: '20 Min Tempo', type: 'tempo', icon: 'zap', description: '5 min warmup → 20 min tempo → 5 min cooldown', estimatedDuration: 30, config: { targetPace: 270 } },
  { id: '5x1k', name: '5×1K Intervals', type: 'intervals', icon: 'refresh-cw', description: '5 reps of 1km hard with 90s rest', estimatedDuration: 35, config: { intervals: { reps: 5, workDistance: 1000, restDuration: 90, warmupDuration: 300, cooldownDuration: 300 } } },
  { id: '8x400', name: '8×400m Speed', type: 'intervals', icon: 'wind', description: '8 reps of 400m with 60s rest', estimatedDuration: 25, config: { intervals: { reps: 8, workDistance: 400, restDuration: 60, warmupDuration: 300, cooldownDuration: 300 } } },
  { id: 'long_10k', name: 'Long 10K', type: 'long', icon: 'route', description: '10km at easy-to-moderate pace', estimatedDuration: 55, config: { targetDistance: 10 } },
  { id: 'long_15k', name: 'Long 15K', type: 'long', icon: 'route', description: '15km steady state', estimatedDuration: 80, config: { targetDistance: 15 } },
  { id: '5k_race', name: '5K Race', type: 'race', icon: 'flag', description: 'All-out 5km effort', estimatedDuration: 25, config: { targetDistance: 5 } },
  { id: '10k_race', name: '10K Race', type: 'race', icon: 'flag', description: 'All-out 10km effort', estimatedDuration: 50, config: { targetDistance: 10 } },
  { id: 'half_race', name: 'Half Marathon Race', type: 'race', icon: 'flag', description: 'All-out half-marathon effort', estimatedDuration: 110, config: { targetDistance: 21.1 } },
  { id: 'marathon_race', name: 'Marathon Race', type: 'race', icon: 'flag', description: 'All-out marathon effort', estimatedDuration: 240, config: { targetDistance: 42.2 } },
];

/**
 * Predefined workout templates users can quickly load.
 */

export interface WorkoutTemplate {
  id: string;
  name: string;
  category: 'push' | 'pull' | 'legs' | 'upper' | 'lower' | 'full-body' | 'cardio';
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  estimatedMinutes: number;
  exercises: TemplateExercise[];
}

export interface TemplateExercise {
  name: string;
  sets: number;
  reps: string;
  restSeconds: number;
}

export const WORKOUT_TEMPLATES: WorkoutTemplate[] = [
  {
    id: 'push-beginner',
    name: 'Push Day (Beginner)',
    category: 'push',
    difficulty: 'beginner',
    estimatedMinutes: 40,
    exercises: [
      { name: 'Bench Press', sets: 3, reps: '8-10', restSeconds: 120 },
      { name: 'Overhead Press', sets: 3, reps: '8-10', restSeconds: 90 },
      { name: 'Incline Dumbbell Press', sets: 3, reps: '10-12', restSeconds: 90 },
      { name: 'Lateral Raise', sets: 3, reps: '12-15', restSeconds: 60 },
      { name: 'Tricep Pushdown', sets: 3, reps: '10-12', restSeconds: 60 },
    ],
  },
  {
    id: 'pull-beginner',
    name: 'Pull Day (Beginner)',
    category: 'pull',
    difficulty: 'beginner',
    estimatedMinutes: 40,
    exercises: [
      { name: 'Barbell Row', sets: 3, reps: '8-10', restSeconds: 120 },
      { name: 'Lat Pulldown', sets: 3, reps: '10-12', restSeconds: 90 },
      { name: 'Seated Cable Row', sets: 3, reps: '10-12', restSeconds: 90 },
      { name: 'Face Pull', sets: 3, reps: '15-20', restSeconds: 60 },
      { name: 'Barbell Curl', sets: 3, reps: '10-12', restSeconds: 60 },
    ],
  },
  {
    id: 'legs-beginner',
    name: 'Leg Day (Beginner)',
    category: 'legs',
    difficulty: 'beginner',
    estimatedMinutes: 45,
    exercises: [
      { name: 'Barbell Squat', sets: 3, reps: '6-8', restSeconds: 180 },
      { name: 'Romanian Deadlift', sets: 3, reps: '8-10', restSeconds: 120 },
      { name: 'Leg Press', sets: 3, reps: '10-12', restSeconds: 90 },
      { name: 'Walking Lunge', sets: 3, reps: '12 each', restSeconds: 90 },
      { name: 'Calf Raise', sets: 4, reps: '15-20', restSeconds: 60 },
    ],
  },
  {
    id: 'upper-intermediate',
    name: 'Upper Body',
    category: 'upper',
    difficulty: 'intermediate',
    estimatedMinutes: 55,
    exercises: [
      { name: 'Bench Press', sets: 4, reps: '6-8', restSeconds: 150 },
      { name: 'Barbell Row', sets: 4, reps: '6-8', restSeconds: 150 },
      { name: 'Overhead Press', sets: 3, reps: '8-10', restSeconds: 120 },
      { name: 'Weighted Pull-up', sets: 3, reps: '6-8', restSeconds: 120 },
      { name: 'Incline Dumbbell Press', sets: 3, reps: '10-12', restSeconds: 90 },
      { name: 'Cable Row', sets: 3, reps: '10-12', restSeconds: 90 },
      { name: 'Lateral Raise', sets: 3, reps: '12-15', restSeconds: 60 },
    ],
  },
  {
    id: 'lower-intermediate',
    name: 'Lower Body',
    category: 'lower',
    difficulty: 'intermediate',
    estimatedMinutes: 55,
    exercises: [
      { name: 'Barbell Squat', sets: 4, reps: '5-6', restSeconds: 180 },
      { name: 'Romanian Deadlift', sets: 4, reps: '8-10', restSeconds: 120 },
      { name: 'Bulgarian Split Squat', sets: 3, reps: '8-10 each', restSeconds: 90 },
      { name: 'Leg Curl', sets: 3, reps: '10-12', restSeconds: 60 },
      { name: 'Leg Extension', sets: 3, reps: '10-12', restSeconds: 60 },
      { name: 'Calf Raise', sets: 4, reps: '12-15', restSeconds: 60 },
    ],
  },
  {
    id: 'full-body-advanced',
    name: 'Full Body Power',
    category: 'full-body',
    difficulty: 'advanced',
    estimatedMinutes: 70,
    exercises: [
      { name: 'Deadlift', sets: 5, reps: '3-5', restSeconds: 240 },
      { name: 'Bench Press', sets: 4, reps: '5-6', restSeconds: 180 },
      { name: 'Barbell Squat', sets: 4, reps: '5-6', restSeconds: 180 },
      { name: 'Weighted Pull-up', sets: 4, reps: '5-6', restSeconds: 120 },
      { name: 'Overhead Press', sets: 3, reps: '6-8', restSeconds: 120 },
      { name: 'Barbell Row', sets: 3, reps: '8-10', restSeconds: 90 },
    ],
  },
];

export function getTemplatesByCategory(category: WorkoutTemplate['category']): WorkoutTemplate[] {
  return WORKOUT_TEMPLATES.filter(t => t.category === category);
}

export function getTemplatesByDifficulty(difficulty: WorkoutTemplate['difficulty']): WorkoutTemplate[] {
  return WORKOUT_TEMPLATES.filter(t => t.difficulty === difficulty);
}

export function getTemplateById(id: string): WorkoutTemplate | undefined {
  return WORKOUT_TEMPLATES.find(t => t.id === id);
}

export function estimateTotalSets(template: WorkoutTemplate): number {
  return template.exercises.reduce((sum, ex) => sum + ex.sets, 0);
}

export function estimateRestTime(template: WorkoutTemplate): number {
  return template.exercises.reduce((sum, ex) => sum + (ex.sets - 1) * ex.restSeconds, 0);
}
