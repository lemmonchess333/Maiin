/**
 * Tests for the pure muscle-name helpers in `exerciseDemo.ts`.
 *
 * The fetch/cache machinery (loadDemoCache, getDemo etc) requires
 * network mocking and isn't tested here — these are the three
 * standalone helpers used by the body-highlighter wire-up:
 *
 *   mapMuscles      — free-exercise-db muscle names → react-body-
 *                     highlighter ids, with VALID_MUSCLES whitelist.
 *   needsPosterior  — body diagram needs a back view?
 *   needsAnterior   — body diagram needs a front view?
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  mapMuscles,
  needsPosterior,
  needsAnterior,
  getExerciseDemo,
  demoMusclesForLabel,
} from "../exerciseDemo";
import { EXERCISES } from "@/lib/exercises";

describe("mapMuscles", () => {
  it("translates free-exercise-db names to react-body-highlighter ids", () => {
    expect(mapMuscles(["chest"])).toEqual(["chest"]);
    expect(mapMuscles(["biceps", "triceps"])).toEqual(["biceps", "triceps"]);
  });

  it("normalises case (input is lowercased before lookup)", () => {
    expect(mapMuscles(["Chest", "BICEPS"])).toEqual(["chest", "biceps"]);
  });

  it("collapses synonyms to canonical ids (lats → upper-back)", () => {
    /* free-exercise-db has both 'lats' and 'middle back' which the
       body-highlighter component renders as the same region. */
    expect(mapMuscles(["lats"])).toEqual(["upper-back"]);
    expect(mapMuscles(["middle back"])).toEqual(["upper-back"]);
  });

  it("drops unknown muscle names entirely (no nulls in the result)", () => {
    /* MUSCLE_MAP returns null for unknowns; the .filter strips them
       so callers don't have to handle nulls. */
    expect(mapMuscles(["chest", "not-a-real-muscle", "biceps"])).toEqual([
      "chest",
      "biceps",
    ]);
    expect(mapMuscles(["only-unknown"])).toEqual([]);
  });

  it("returns an empty array for empty input", () => {
    expect(mapMuscles([])).toEqual([]);
  });
});

describe("needsPosterior", () => {
  it("returns true when any muscle is on the posterior set", () => {
    expect(needsPosterior(["upper-back"])).toBe(true);
    expect(needsPosterior(["hamstring"])).toBe(true);
    expect(needsPosterior(["chest", "lower-back"])).toBe(true);
  });

  it("returns false when no muscle is posterior", () => {
    expect(needsPosterior(["chest", "biceps"])).toBe(false);
  });

  it("returns false for an empty input", () => {
    expect(needsPosterior([])).toBe(false);
  });
});

describe("needsAnterior", () => {
  it("returns true when any muscle is on the anterior set", () => {
    expect(needsAnterior(["chest"])).toBe(true);
    expect(needsAnterior(["abs", "obliques"])).toBe(true);
    expect(needsAnterior(["hamstring", "biceps"])).toBe(true);
  });

  it("returns false when no muscle is anterior", () => {
    expect(needsAnterior(["upper-back", "hamstring"])).toBe(false);
  });

  it("returns false for an empty input", () => {
    expect(needsAnterior([])).toBe(false);
  });
});

describe("getExerciseDemo — image merge (D-LIFT-18)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps authored instructions/tip but borrows free-exercise-db images (prefixed)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => [
        {
          name: "Bench Press",
          category: "strength",
          equipment: "barbell",
          primaryMuscles: ["chest"],
          secondaryMuscles: ["triceps"],
          instructions: ["remote step"],
          images: ["Bench_Press/0.jpg", "Bench_Press/1.jpg"],
        },
      ],
    });
    vi.stubGlobal("fetch", fetchMock);

    const demo = await getExerciseDemo("Bench Press");
    expect(demo).toBeTruthy();
    // Authored local content wins for text (Bench Press has multi-step
    // instructions + a tip), so it is NOT the single remote step.
    expect(demo!.instructions.length).toBeGreaterThanOrEqual(2);
    expect(demo!.tip).toBeTruthy();
    // …but the images are borrowed from free-exercise-db and prefixed to full
    // URLs (previously the authored path returned images: []).
    expect(demo!.images).toHaveLength(2);
    expect(demo!.images[0]).toMatch(
      /^https:\/\/raw\.githubusercontent\.com\/.*\/exercises\/Bench_Press\/0\.jpg$/
    );
  });

  it("carries commonMistakes from the authored exercise (D-LIFT-19/20)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => [] }));
    // Bench Press was backfilled with commonMistakes in D-LIFT-19.
    const demo = await getExerciseDemo("Bench Press");
    expect(demo?.commonMistakes?.length).toBeGreaterThan(0);
  });
});

/* ─── The body diagram shades every exercise (11b) ───────────────────────
   `LOCAL_MUSCLE_MAP` was a hand-maintained table over raw muscle labels, and
   an unmapped label silently produced `[]` — the exercise contributed nothing
   to the diagram and nothing reported it. Twelve exercises highlighted NO
   primary muscle: a lateral raise with no shoulder, four chest machines, four
   rows, a leg raise and a rack pull. Thirty-six secondary attributions were
   dropped on top, including `rhomboids` on twelve rows.

   It is now keyed off `FineMuscle`, so `toFine` owns label normalisation and
   the taxonomy's own coverage test is what catches an unknown label. These
   pin the property that motivated the change. ── */
describe("demoMusclesForLabel — every DB label shades something", () => {
  it("no exercise has an unshadeable PRIMARY muscle", () => {
    const blank = EXERCISES.filter(
      (ex) => demoMusclesForLabel(ex.muscleGroup).length === 0
    ).map((ex) => `${ex.id} (${ex.muscleGroup})`);
    expect(
      blank,
      `These render an empty body diagram:\n  ${blank.join("\n  ")}`
    ).toEqual([]);
    expect(EXERCISES.length).toBeGreaterThan(100); // the scan is not empty
  });

  it("no SECONDARY muscle is silently dropped", () => {
    const blank = new Set<string>();
    for (const ex of EXERCISES) {
      for (const s of ex.secondaryMuscles ?? []) {
        if (demoMusclesForLabel(s).length === 0) blank.add(s);
      }
    }
    expect([...blank].sort()).toEqual([]);
  });

  it("everything it emits survives the highlighter whitelist", () => {
    // A label mapping to a free-exercise-db name that MUSCLE_MAP doesn't know,
    // or that isn't in VALID_MUSCLES, is the same silent blank one layer down.
    const labels = new Set<string>();
    for (const ex of EXERCISES) {
      labels.add(ex.muscleGroup);
      for (const s of ex.secondaryMuscles ?? []) labels.add(s);
    }
    for (const label of labels) {
      const names = demoMusclesForLabel(label);
      expect(mapMuscles(names).length, `${label} → ${names.join("/")}`).toBe(
        names.length
      );
    }
  });

  it("the specific rows that rendered blank now shade the right thing", () => {
    // Named cases, so a future regression says WHICH exercise broke.
    expect(demoMusclesForLabel("Side Delts")).toEqual(["shoulders"]);
    expect(demoMusclesForLabel("Chest")).toEqual(["chest"]);
    expect(demoMusclesForLabel("Mid Back")).toEqual(["middle back"]);
    expect(demoMusclesForLabel("Lower Abs")).toEqual(["abdominals"]);
    expect(demoMusclesForLabel("Rhomboids")).toEqual(["middle back"]);
    expect(demoMusclesForLabel("Soleus")).toEqual(["calves"]);
    expect(demoMusclesForLabel("Posterior Chain")).toEqual([
      "hamstrings",
      "glutes",
      "lower back",
    ]);
    // A region label still shades, via the coarse fallback.
    expect(demoMusclesForLabel("Cardio").length).toBeGreaterThan(0);
    // …and an unknown string still yields nothing rather than throwing.
    expect(demoMusclesForLabel("not a muscle")).toEqual([]);
  });
});
