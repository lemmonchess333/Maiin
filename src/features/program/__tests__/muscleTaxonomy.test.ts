/**
 * The fine muscle taxonomy (13a).
 *
 * Three properties, in order of how much they'd cost to get wrong:
 *
 *  1. **Every label in the exercise DB is known.** An unmapped label tallies
 *     ZERO — silently, with no error anywhere — so an exercise added with a new
 *     `muscleGroup` string trains nothing as far as the volume model is
 *     concerned. That is exactly the class of defect P1 found four of.
 *  2. **The roll-up is exact.** The canonical ten are a sum over the fine
 *     layer, so the published numbers must be unchanged to the set. The golden
 *     sweep proves it across 90 generated configurations; this proves the
 *     algebra directly, which is what localises the failure when it breaks.
 *  3. **The unresolvable residue is measured.** `*Unspecified` volume is volume
 *     the model cannot attribute to a part. It is handoff 11b's work-list, and
 *     a number nothing checks is a number that rots — so it's a ratchet.
 */
import { describe, it, expect } from "vitest";

import { EXERCISES } from "@/lib/exercises";
import {
  CANONICAL_MUSCLE_ORDER,
  FINE_TO_CANONICAL,
  LABEL_TO_FINE,
  fineToCanonical,
  toFine,
  type FineMuscle,
} from "../muscleTaxonomy";
import { weeklyVolumeByFineMuscle, weeklyVolumeByMuscle } from "../volumeModel";
import type { ProgramExercise, WorkoutDay } from "../programTypes";

/** Every distinct muscle label the DB actually uses, primary and secondary. */
function dbLabels(): string[] {
  const seen = new Set<string>();
  for (const ex of EXERCISES) {
    seen.add(ex.muscleGroup.toLowerCase().trim());
    for (const s of ex.secondaryMuscles ?? []) seen.add(s.toLowerCase().trim());
  }
  return [...seen].sort();
}

/** A week containing one set of every exercise in the DB — the widest input the
 *  attribution can be given, so nothing hides behind a builder's choices. */
function everyExerciseWeek(): WorkoutDay[] {
  return [
    {
      dayName: "All",
      exercises: EXERCISES.map(
        (ex) =>
          ({
            exerciseId: ex.id,
            name: ex.name,
            sets: 1,
            reps: 8,
            weight: 20,
            movementCategory: "core",
          }) as unknown as ProgramExercise
      ),
    } as WorkoutDay,
  ];
}

describe("muscle taxonomy — label coverage", () => {
  it("knows every muscle label the exercise DB uses", () => {
    const unknown = dbLabels().filter((label) => !(label in LABEL_TO_FINE));
    expect(
      unknown,
      `Unmapped labels tally ZERO volume, silently. Add each to LABEL_TO_FINE ` +
        `(or map it to null with a reason):\n  ${unknown.join("\n  ")}`
    ).toEqual([]);
  });

  it("scanned a real DB (guards the scan itself going vacuous)", () => {
    // If `dbLabels()` ever returns nothing — a parse change, an import that
    // resolves to an empty module — the assertion above passes over an empty
    // list and proves nothing.
    expect(dbLabels().length).toBeGreaterThan(25);
    expect(EXERCISES.length).toBeGreaterThan(100);
  });

  it("distinguishes 'no volume at all' from 'no home in the ten'", () => {
    // Two different nulls, and conflating them is how forearms disappeared.
    // Cardio and whole-body conditioning earn no resistance volume anywhere.
    for (const label of ["cardio", "full body", "legs", "arms"]) {
      expect(toFine(label), label).toBeNull();
    }
    // Forearms and hip flexors are REAL volume with no canonical group. They
    // resolve at the fine layer and drop at the roll-up.
    for (const label of ["forearms", "brachioradialis", "hip flexors"]) {
      const fine = toFine(label);
      expect(fine, label).not.toBeNull();
      expect(fineToCanonical(fine), label).toBeNull();
    }
  });

  it("is case- and whitespace-insensitive, like the map it replaced", () => {
    expect(toFine("  Rear Delts  ")).toBe("RearDelts");
    expect(toFine("REAR DELTS")).toBe("RearDelts");
    expect(toFine(undefined)).toBeNull();
    expect(toFine("not a muscle")).toBeNull();
  });
});

describe("muscle taxonomy — the roll-up is bounded by its fine parts", () => {
  it("every canonical group ≤ the sum of its fine parts, less only the intra-exercise dedupe", () => {
    // Exact equality was this test's pin until the ADR-0010 dedupe: summing
    // fine credits DOUBLE-COUNTED any exercise whose primary and a secondary
    // roll up to the same canonical bucket (a barbell row booked 1.5 Back
    // sets per physical set). The canonical view now counts a set once per
    // muscle at the strongest relationship, so it may only be LESS than the
    // fine sum — never more (that would be invented volume) — and the exact
    // per-exercise rule is pinned in volumeModel.test.ts's dedupe block.
    const week = everyExerciseWeek();
    const canonical = new Map(
      weeklyVolumeByMuscle(week).map((v) => [v.muscle, v.sets])
    );

    const rolled = new Map<string, number>();
    for (const { muscle, sets, canonical: parent } of weeklyVolumeByFineMuscle(
      week
    )) {
      // The `canonical` field on each row must agree with the table, or the
      // two are separate sources of truth and can disagree.
      expect(parent, muscle).toBe(FINE_TO_CANONICAL[muscle]);
      if (!parent) continue;
      rolled.set(parent, (rolled.get(parent) ?? 0) + sets);
    }

    for (const m of CANONICAL_MUSCLE_ORDER) {
      expect(canonical.get(m) ?? 0, `${m} roll-up`).toBeLessThanOrEqual(
        rolled.get(m) ?? 0
      );
    }
    // The dedupe is real over the every-exercise week: at least one bucket
    // must differ, or the guard above is vacuous and the double-count could
    // silently return as an "exact" roll-up.
    const anyDeduped = CANONICAL_MUSCLE_ORDER.some(
      (m) => (canonical.get(m) ?? 0) < (rolled.get(m) ?? 0)
    );
    expect(anyDeduped).toBe(true);
    // …over a week that actually produced volume in every group.
    expect(canonical.size).toBe(CANONICAL_MUSCLE_ORDER.length);
  });

  it("surfaces volume the canonical view discards, rather than inventing any", () => {
    const fine = weeklyVolumeByFineMuscle(everyExerciseWeek());
    const homeless = fine.filter((v) => v.canonical === null);

    // Forearms and hip flexors are the two, and they carry real volume —
    // before 13a this was attributed nowhere and could not be seen at all.
    expect(homeless.map((v) => v.muscle).sort()).toEqual([
      "Forearms",
      "HipFlexors",
    ]);
    for (const v of homeless) expect(v.sets, v.muscle).toBeGreaterThan(0);

    // And nothing was invented on the way in: every fine row traces back to a
    // label some exercise actually carries.
    const reachable = new Set(Object.values(LABEL_TO_FINE).filter(Boolean));
    for (const v of fine) expect(reachable.has(v.muscle), v.muscle).toBe(true);
  });
});

describe("muscle taxonomy — the unresolvable residue (11b's work-list)", () => {
  /* `*Unspecified` means the exercise's own label names a parent, not a part:
     `Deltoids` rather than a head, `Pectorals` rather than a region. A response
     engine cannot titrate a muscle whose volume it cannot resolve, so this is
     the gap 11b closes — re-labelling those rows, not editing this taxonomy.

     Held as a RATCHET: the bounds are today's actuals, so re-labelling can only
     push them down, and a new exercise added with a coarse label pushes one up
     and fails. Tighten whenever they improve. */
  const UNSPECIFIED: FineMuscle[] = [
    "ChestUnspecified",
    "BackUnspecified",
    "DeltsUnspecified",
    "CoreUnspecified",
    "PosteriorChainUnspecified",
  ];

  it("is bounded and must only shrink", () => {
    const fine = weeklyVolumeByFineMuscle(everyExerciseWeek());
    const total = fine.reduce((n, v) => n + v.sets, 0);
    const unresolved = fine
      .filter((v) => UNSPECIFIED.includes(v.muscle))
      .reduce((n, v) => n + v.sets, 0);

    // Today: 62.5 of 263 attributed sets, 23.8%.
    const pct = Math.round((unresolved / total) * 1000) / 10;
    expect(
      pct,
      `${pct}% of attributed volume cannot be resolved to a muscle part`
    ).toBeLessThanOrEqual(23.8);

    // …and it is genuinely not solved, so the ratchet is never read as a pass.
    expect(unresolved).toBeGreaterThan(0);
  });

  it("shoulders are the worst case, which is why the delt split is the cited one", () => {
    const fine = new Map(
      weeklyVolumeByFineMuscle(everyExerciseWeek()).map((v) => [
        v.muscle,
        v.sets,
      ])
    );
    const heads =
      (fine.get("FrontDelts") ?? 0) +
      (fine.get("SideDelts") ?? 0) +
      (fine.get("RearDelts") ?? 0) +
      (fine.get("RotatorCuff") ?? 0);
    const unspecified = fine.get("DeltsUnspecified") ?? 0;

    // Nine exercises are labelled `Deltoids` and one `Shoulders`, against a
    // handful labelled by head — so 17 of 43.5 shoulder sets still can't be
    // split front/side/rear. Schoenfeld pp.186-187 is precisely about that
    // distinction, so this residue is the one that most limits 13b.
    expect(unspecified).toBeGreaterThan(0);
    expect(heads).toBeGreaterThan(0);
    expect(
      unspecified / heads,
      `${unspecified} unheaded delt sets against ${heads} headed`
    ).toBeLessThanOrEqual(0.642);
  });
});
