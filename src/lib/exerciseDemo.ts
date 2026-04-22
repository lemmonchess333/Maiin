/**
 * Exercise demo data — fetches from free-exercise-db and maps to react-body-highlighter muscle IDs.
 * Falls back to local exercise data when external DB has no match.
 */

import { EXERCISES } from "@/lib/exercises";

export interface ExerciseDemo {
  name: string;
  category: string;
  equipment: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
  images: string[];
  tip?: string;
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

// Mapping from local exercises.ts muscleGroup/secondaryMuscles names → free-exercise-db names
// (which then get mapped through MUSCLE_MAP to highlighter IDs)
const LOCAL_MUSCLE_MAP: Record<string, string[]> = {
  "pectorals": ["chest"],
  "upper chest": ["chest", "shoulders"],
  "lower chest": ["chest"],
  "triceps": ["triceps"],
  "biceps": ["biceps"],
  "front delts": ["shoulders"],
  "rear delts": ["shoulders"],
  "deltoids": ["shoulders"],
  "lats": ["lats"],
  "upper back": ["middle back"],
  "full back": ["lats", "lower back", "middle back"],
  "lower back": ["lower back"],
  "traps": ["traps"],
  "quads": ["quadriceps"],
  "quadriceps": ["quadriceps"],
  "hamstrings": ["hamstrings"],
  "glutes": ["glutes"],
  "calves": ["calves"],
  "core": ["abdominals", "obliques"],
  "abs": ["abdominals"],
  "obliques": ["obliques"],
  "forearms": ["forearms"],
  "legs": ["quadriceps", "hamstrings", "glutes"],
  "full body": ["chest", "lats", "quadriceps", "shoulders", "abdominals"],
  "shoulders": ["shoulders"],
  "hip flexors": ["quadriceps", "abdominals"],
  "adductors": ["adductors"],
  "abductors": ["abductors"],
  "cardio": ["quadriceps", "hamstrings", "calves", "glutes"],
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
  const posterior = new Set(["upper-back", "lower-back", "trapezius", "hamstring", "gluteal", "calves", "back-deltoids"]);
  return muscles.some((m) => posterior.has(m));
}

export function needsAnterior(muscles: string[]): boolean {
  const anterior = new Set(["chest", "biceps", "forearm", "front-deltoids", "abs", "obliques", "adductor", "quadriceps", "abductors"]);
  return muscles.some((m) => anterior.has(m));
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
      const data: { name: string; category?: string; equipment?: string; primaryMuscles?: string[]; secondaryMuscles?: string[]; instructions?: string[]; images?: string[] }[] = await res.json();
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

// Build a fallback ExerciseDemo from local exercises.ts data
function buildLocalFallback(name: string): ExerciseDemo | null {
  const key = name.toLowerCase().trim();
  const match = EXERCISES.find(
    (ex) => ex.name.toLowerCase() === key || ex.id === key.replace(/\s+/g, "-"),
  );
  if (!match) return null;

  // Map local muscleGroup name to free-exercise-db muscle names
  const mapLocal = (label: string): string[] =>
    LOCAL_MUSCLE_MAP[label.toLowerCase()] ?? [];

  return {
    name: match.name,
    category: match.category,
    equipment: match.equipment,
    primaryMuscles: mapLocal(match.muscleGroup),
    secondaryMuscles: (match.secondaryMuscles ?? []).flatMap(mapLocal),
    instructions: match.instructions ?? [],
    images: [],
    tip: match.tip,
  };
}

// Resolution order:
// 1. If the local EXERCISES entry has been upgraded to our coach-voice format
//    (multi-step instructions or a tip), prefer it — this is the authored
//    content and the only path that surfaces tips in the UI.
// 2. Otherwise try free-exercise-db via exact / partial / word-overlap match.
// 3. Fall back to the raw local entry (single-paragraph pre-rewrite content)
//    so at-least-something renders for exercises free-exercise-db doesn't cover.
export async function getExerciseDemo(name: string): Promise<ExerciseDemo | null> {
  const local = buildLocalFallback(name);
  if (local && (local.tip || local.instructions.length >= 2)) {
    return local;
  }

  const demos = await loadDemos();
  const key = normaliseKey(name);

  // Exact
  if (demos.has(key)) return demos.get(key)!;

  // Partial match
  for (const [k, v] of demos) {
    if (k.includes(key) || key.includes(k)) return v;
  }

  // Word overlap — split on actual words (not arbitrary 3-char chunks)
  const words = name.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
  if (words.length >= 2) {
    let bestMatch: ExerciseDemo | null = null;
    let bestScore = 0;
    for (const [k, v] of demos) {
      const score = words.filter((w) => k.includes(w)).length;
      if (score > bestScore) {
        bestScore = score;
        bestMatch = v;
      }
    }
    if (bestScore >= 2) return bestMatch;
  }

  // Raw local fallback for anything remote doesn't cover
  return local;
}
