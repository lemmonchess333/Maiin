/**
 * Exercise demo data — fetches from free-exercise-db and maps to react-body-highlighter muscle IDs.
 * Falls back to local exercise data when external DB has no match.
 */

import { EXERCISES } from "@/lib/exercises";

/**
 * Provenance of `images` (Demo1 lock) — it decides what the player may DO:
 *   - "vetted-sequence":  human-reviewed coach frames (Exercise.media, the
 *     D-LIFT-20 pipeline). The only kind allowed to auto-animate (the
 *     #1444/#1465 ping-pong player).
 *   - "reference-photos": borrowed free-exercise-db photos. Never a coherent
 *     motion sequence — rendered as static labelled start/finish only
 *     ("a wrong demo is worse than no demo").
 *   - "none": no images.
 * The rig demo is its own media kind, resolved by ExerciseFormContent via
 * getBodyDemo (it outranks both photo kinds).
 */
export type DemoMediaKind = "vetted-sequence" | "reference-photos" | "none";

export interface ExerciseDemo {
  name: string;
  category: string;
  equipment: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
  images: string[];
  /** Provenance of `images` — see DemoMediaKind. */
  mediaKind: DemoMediaKind;
  /** Authored rep tempo "down-pause-up" seconds (Exercise.tempo) — drives the
   *  rig teaching-rep's phase durations via lib/exerciseTempo. */
  tempo?: string;
  tip?: string;
  /** Common form errors (D-LIFT-19) — surfaced as extra "watch out" cues. */
  commonMistakes?: string[];
}

/** Prefix an app-relative media path with the Vite base URL; pass http(s)
 *  URLs through unchanged. (D-LIFT-20 coach-demo assets live in /public.) */
function resolveMediaUrl(p: string): string {
  if (/^https?:\/\//.test(p)) return p;
  const base = import.meta.env.BASE_URL || "/";
  return `${base.replace(/\/$/, "")}/${p.replace(/^\//, "")}`;
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
  pectorals: ["chest"],
  "upper chest": ["chest", "shoulders"],
  "lower chest": ["chest"],
  triceps: ["triceps"],
  biceps: ["biceps"],
  "front delts": ["shoulders"],
  "rear delts": ["shoulders"],
  deltoids: ["shoulders"],
  lats: ["lats"],
  "upper back": ["middle back"],
  "full back": ["lats", "lower back", "middle back"],
  "lower back": ["lower back"],
  traps: ["traps"],
  quads: ["quadriceps"],
  quadriceps: ["quadriceps"],
  hamstrings: ["hamstrings"],
  glutes: ["glutes"],
  calves: ["calves"],
  core: ["abdominals", "obliques"],
  abs: ["abdominals"],
  obliques: ["obliques"],
  forearms: ["forearms"],
  legs: ["quadriceps", "hamstrings", "glutes"],
  "full body": ["chest", "lats", "quadriceps", "shoulders", "abdominals"],
  shoulders: ["shoulders"],
  "hip flexors": ["quadriceps", "abdominals"],
  adductors: ["adductors"],
  abductors: ["abductors"],
  cardio: ["quadriceps", "hamstrings", "calves", "glutes"],
};

// Valid muscle IDs accepted by react-body-highlighter
const VALID_MUSCLES = new Set([
  "trapezius",
  "upper-back",
  "lower-back",
  "chest",
  "biceps",
  "triceps",
  "forearm",
  "back-deltoids",
  "front-deltoids",
  "abs",
  "obliques",
  "adductor",
  "hamstring",
  "quadriceps",
  "abductors",
  "calves",
  "gluteal",
  "head",
  "neck",
  "knees",
  "left-soleus",
  "right-soleus",
]);

export function mapMuscles(names: string[]): string[] {
  return names
    .map((n) => MUSCLE_MAP[n.toLowerCase()] ?? null)
    .filter((m): m is string => m !== null && VALID_MUSCLES.has(m));
}

export function needsPosterior(muscles: string[]): boolean {
  const posterior = new Set([
    "upper-back",
    "lower-back",
    "trapezius",
    "hamstring",
    "gluteal",
    "calves",
    "back-deltoids",
  ]);
  return muscles.some((m) => posterior.has(m));
}

export function needsAnterior(muscles: string[]): boolean {
  const anterior = new Set([
    "chest",
    "biceps",
    "forearm",
    "front-deltoids",
    "abs",
    "obliques",
    "adductor",
    "quadriceps",
    "abductors",
  ]);
  return muscles.some((m) => anterior.has(m));
}

// Module-level cache
let demoCache: Map<string, ExerciseDemo> | null = null;
let fetchPromise: Promise<void> | null = null;

const DEMO_URL =
  "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json";

// free-exercise-db `images` are repo-relative paths (e.g. "Bench_Press/0.jpg");
// the renderable URL is this base + the path. Prefixed at load so consumers get
// full URLs.
const IMAGE_BASE =
  "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/";

async function loadDemos(): Promise<Map<string, ExerciseDemo>> {
  if (demoCache) return demoCache;
  if (fetchPromise) {
    await fetchPromise;
    return demoCache!;
  }

  fetchPromise = (async () => {
    try {
      const res = await fetch(DEMO_URL);
      const data: {
        name: string;
        category?: string;
        equipment?: string;
        primaryMuscles?: string[];
        secondaryMuscles?: string[];
        instructions?: string[];
        images?: string[];
      }[] = await res.json();
      const map = new Map<string, ExerciseDemo>();
      for (const ex of data) {
        map.set(normaliseKey(ex.name), {
          name: ex.name,
          category: ex.category ?? "",
          equipment: ex.equipment ?? "",
          primaryMuscles: ex.primaryMuscles ?? [],
          secondaryMuscles: ex.secondaryMuscles ?? [],
          instructions: ex.instructions ?? [],
          images: (ex.images ?? []).map((p) =>
            p.startsWith("http") ? p : IMAGE_BASE + p
          ),
          // Everything from free-exercise-db is borrowed reference imagery,
          // never a vetted motion sequence (Demo1).
          mediaKind: (ex.images ?? []).length > 0 ? "reference-photos" : "none",
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
    (ex) => ex.name.toLowerCase() === key || ex.id === key.replace(/\s+/g, "-")
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
    // D-LIFT-20: reviewed coach-demo assets (Exercise.media) take precedence
    // over the free-exercise-db photos; left empty here when none so the
    // resolver can borrow the remote photos (D-LIFT-18).
    images: (match.media ?? []).map(resolveMediaUrl),
    // Exercise.media is the human-reviewed pipeline output — the only
    // provenance allowed to auto-animate (Demo1).
    mediaKind: (match.media ?? []).length > 0 ? "vetted-sequence" : "none",
    tempo: match.tempo,
    tip: match.tip,
    commonMistakes: match.commonMistakes,
  };
}

// Best free-exercise-db match for a name (exact → partial → word-overlap), or
// null. Pulled out so both the remote-preferred path AND the local-preferred
// path can reach it — the latter borrows the remote's demo IMAGES (D-LIFT-18).
function matchRemote(
  demos: Map<string, ExerciseDemo>,
  name: string
): ExerciseDemo | null {
  const key = normaliseKey(name);
  if (demos.has(key)) return demos.get(key)!;
  for (const [k, v] of demos) {
    if (k.includes(key) || key.includes(k)) return v;
  }
  const words = name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3);
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
  return null;
}

// Resolution order:
// 1. If the local EXERCISES entry has been upgraded to our coach-voice format
//    (multi-step instructions or a tip), prefer it for text/tip — but borrow
//    the free-exercise-db start/end IMAGES when a match exists (D-LIFT-18: the
//    images were fetched but never surfaced; the local fallback set images:[]).
// 2. Otherwise use the free-exercise-db match (it carries instructions+images).
// 3. Fall back to the raw local entry so at-least-something renders for
//    exercises free-exercise-db doesn't cover.
export async function getExerciseDemo(
  name: string
): Promise<ExerciseDemo | null> {
  const local = buildLocalFallback(name);
  const demos = await loadDemos();
  const remote = matchRemote(demos, name);

  if (local && (local.tip || local.instructions.length >= 2)) {
    // Authored text wins. Prefer the reviewed coach-demo media (already on
    // local.images via Exercise.media, D-LIFT-20); otherwise borrow the
    // free-exercise-db photos (D-LIFT-18) so the demo is still visual.
    if (local.images.length > 0) return local;
    return remote && remote.images.length > 0
      ? // Borrowed free-exercise-db photos keep their reference-only
        // provenance even when the text is ours (Demo1).
        { ...local, images: remote.images, mediaKind: "reference-photos" }
      : local;
  }

  if (remote) return remote;
  return local;
}
