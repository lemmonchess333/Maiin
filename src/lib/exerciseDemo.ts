/**
 * Exercise demo data — fetches from free-exercise-db and maps to react-body-highlighter muscle IDs.
 */

export interface ExerciseDemo {
  name: string;
  category: string;
  equipment: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
  images: string[];
}

// Mapping from free-exercise-db muscle names → react-body-highlighter IDs
const MUSCLE_MAP: Record<string, string> = {
  // Upper
  chest: "chest",
  biceps: "biceps",
  triceps: "triceps",
  forearms: "forearm",
  shoulders: "front-deltoids",
  "middle back": "upper-back",
  "lower back": "lower-back",
  lats: "upper-back",
  traps: "trapezius",
  neck: "neck",
  abdominals: "abs",
  obliques: "obliques",
  // Lower
  quadriceps: "quadriceps",
  hamstrings: "hamstring",
  glutes: "gluteal",
  calves: "calves",
  adductors: "adductor",
  abductors: "abductors",
};

// Valid muscle IDs accepted by react-body-highlighter
const VALID_MUSCLES = new Set([
  "trapezius", "upper-back", "lower-back", "chest", "biceps", "triceps",
  "forearm", "back-deltoids", "front-deltoids", "abs", "obliques",
  "adductor", "hamstring", "quadriceps", "abductors", "calves", "gluteal",
  "head", "neck", "knees", "left-soleus", "right-soleus",
]);

export function mapMuscles(names: string[]): string[] {
  return names
    .map((n) => MUSCLE_MAP[n.toLowerCase()] ?? null)
    .filter((m): m is string => m !== null && VALID_MUSCLES.has(m));
}

export function needsPosterior(muscles: string[]): boolean {
  const posterior = new Set(["upper-back", "lower-back", "trapezius", "hamstring", "gluteal", "calves"]);
  return muscles.some((m) => posterior.has(m));
}

// Module-level cache
let demoCache: Map<string, ExerciseDemo> | null = null;
let fetchPromise: Promise<void> | null = null;

const DEMO_URL =
  "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json";

async function loadDemos(): Promise<Map<string, ExerciseDemo>> {
  if (demoCache) return demoCache;
  if (fetchPromise) {
    await fetchPromise;
    return demoCache!;
  }

  fetchPromise = (async () => {
    try {
      const res = await fetch(DEMO_URL);
      const data: any[] = await res.json();
      const map = new Map<string, ExerciseDemo>();
      for (const ex of data) {
        map.set(normaliseKey(ex.name), {
          name: ex.name,
          category: ex.category ?? "",
          equipment: ex.equipment ?? "",
          primaryMuscles: ex.primaryMuscles ?? [],
          secondaryMuscles: ex.secondaryMuscles ?? [],
          instructions: ex.instructions ?? [],
          images: ex.images ?? [],
        });
      }
      demoCache = map;
    } catch {
      demoCache = new Map();
    }
  })();

  await fetchPromise;
  return demoCache!;
}

function normaliseKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Fuzzy match: try exact, then stripped, then partial
export async function getExerciseDemo(name: string): Promise<ExerciseDemo | null> {
  const demos = await loadDemos();
  const key = normaliseKey(name);

  // Exact
  if (demos.has(key)) return demos.get(key)!;

  // Partial match
  for (const [k, v] of demos) {
    if (k.includes(key) || key.includes(k)) return v;
  }

  // Word overlap
  const words = key.match(/.{3,}/g) ?? [];
  let bestMatch: ExerciseDemo | null = null;
  let bestScore = 0;
  for (const [k, v] of demos) {
    const score = words.filter((w) => k.includes(w)).length;
    if (score > bestScore) {
      bestScore = score;
      bestMatch = v;
    }
  }
  return bestScore >= 2 ? bestMatch : null;
}
