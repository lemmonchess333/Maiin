/**
 * Property-based guard for the PR-tracking engine.
 *
 * Example tests pin specific PR cases; this fuzzes random workout histories and
 * asserts the structural invariants a regression would break:
 *   - getRepBucket is monotonic — more reps never maps to a HEAVIER-rep bucket
 *     (1rm → 3rm → 5rm → 8rm → 10rm as reps rise)
 *   - buildPRMap records the TRUE max weight per exercise × bucket (an
 *     independently-computed max must equal the map's stored weight)
 *   - checkSetPR agrees with the map: a set flagged as a PR really does beat the
 *     stored record (and a non-beating set is not flagged), once the session
 *     gate is cleared
 *
 * Deterministic (seeded PRNG).
 */
import { describe, it, expect } from "vitest";
import {
  getRepBucket,
  buildPRMap,
  checkSetPR,
  type RepBucket,
} from "../prTracking";

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BUCKET_ORDER: RepBucket[] = ["1rm", "3rm", "5rm", "8rm", "10rm"];
const bucketIdx = (b: RepBucket) => BUCKET_ORDER.indexOf(b);

interface Workout {
  date: string;
  exercises: {
    exerciseName: string;
    sets: { weightKg: number; reps: number }[];
  }[];
}

function genHistory(rnd: () => number): Workout[] {
  const names = ["Bench", "Squat", "Deadlift"];
  const n = 1 + Math.floor(rnd() * 8);
  return Array.from({ length: n }, (_, w) => ({
    date: `2026-01-${String(1 + w).padStart(2, "0")}`,
    exercises: names
      .filter(() => rnd() < 0.7)
      .map((exerciseName) => ({
        exerciseName,
        sets: Array.from({ length: 1 + Math.floor(rnd() * 5) }, () => ({
          // Include zero/negative weights to exercise the skip guard.
          weightKg: rnd() < 0.1 ? 0 : Math.round(rnd() * 200),
          reps: Math.floor(rnd() * 15),
        })),
      })),
  }));
}

describe("getRepBucket monotonicity (property)", () => {
  it("never maps a higher rep count to an earlier (heavier-rep) bucket", () => {
    let prev = 0;
    for (let reps = 0; reps <= 40; reps++) {
      const idx = bucketIdx(getRepBucket(reps));
      expect(idx).toBeGreaterThanOrEqual(prev);
      prev = idx;
    }
  });
});

describe("buildPRMap records the true max (property)", () => {
  it("each exercise × bucket holds the heaviest qualifying set across the history", () => {
    const rnd = mulberry32(601);
    for (let i = 0; i < 1500; i++) {
      const history = genHistory(rnd);
      const map = buildPRMap(history);

      // Independently compute the expected max weight per exercise × bucket.
      const expected: Record<string, Record<string, number>> = {};
      for (const w of history) {
        for (const ex of w.exercises) {
          expected[ex.exerciseName] ??= {};
          for (const s of ex.sets) {
            if (s.weightKg <= 0) continue; // mirror the engine's skip guard
            const b = getRepBucket(s.reps);
            expected[ex.exerciseName][b] = Math.max(
              expected[ex.exerciseName][b] ?? 0,
              s.weightKg
            );
          }
        }
      }

      for (const [name, buckets] of Object.entries(map)) {
        for (const b of BUCKET_ORDER) {
          const rec = buckets[b];
          const exp = expected[name]?.[b];
          if (rec) expect(rec.weight).toBe(exp);
          else expect(exp).toBeUndefined(); // no qualifying set ⇒ null in map
        }
      }
    }
  });
});

describe("checkSetPR agrees with the recorded map (property)", () => {
  it("flags a PR iff the set genuinely beats the stored record (session gate cleared)", () => {
    const rnd = mulberry32(602);
    for (let i = 0; i < 1500; i++) {
      const history = genHistory(rnd);
      const map = buildPRMap(history);
      // Clear the session gate for all exercises.
      const sessions = { Bench: 9, Squat: 9, Deadlift: 9 };

      const name = ["Bench", "Squat", "Deadlift"][Math.floor(rnd() * 3)];
      const weight = Math.round(rnd() * 220);
      const reps = Math.floor(rnd() * 15);
      const flagged = checkSetPR(name, weight, reps, map, sessions, 3);

      if (weight <= 0) {
        expect(flagged).toBeNull();
        continue;
      }
      const rec = map[name]?.[getRepBucket(reps)];
      const genuinelyBeats =
        !rec ||
        weight > rec.weight ||
        (weight === rec.weight && reps > rec.reps);
      expect(flagged !== null).toBe(genuinelyBeats);
    }
  });
});
