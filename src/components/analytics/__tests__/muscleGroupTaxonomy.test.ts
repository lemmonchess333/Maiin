/**
 * Every movement key a saved workout can carry must reach a drawn muscle
 * group — and a recovery chip.
 *
 * `useProgram.onCompleteDay` is the only production writer of
 * `WorkoutExercise.category`, and it stores `ex.movementCategory`. So the
 * nine MovementCategory values ARE the saved vocabulary; the catalogue's
 * coarser groups ("Chest" / "Legs") reach the heat map only through
 * History's lookup-by-exercise-name, which it prefers precisely because the
 * stored field speaks the other language.
 *
 * Three separate comments described that backwards — calling the movement
 * keys "legacy", "older", and translations "of old workout docs". Nothing
 * was wrong at runtime; the hazard was that the tables were maintained
 * against an inverted mental model. Anyone trimming "legacy aliases" would
 * have dropped every custom exercise (the only path where the catalogue
 * lookup misses) out of the body diagram and off the recovery legend, with
 * no test failing and no visible error — just a quietly emptier chart.
 *
 * This makes the claim executable instead of asserted. It is a coverage
 * pin, not an equality pin: the tables may grow, and the catalogue half
 * (`Legs`, `Full Body`, `Cardio`) has no `CATEGORY_DISPLAY` counterpart by
 * design.
 */
import { describe, it, expect } from "vitest";
import { CATEGORY_DISPLAY, MUSCLE_MAP } from "../muscleGroupTaxonomy";
import { recoveryForHeatMapGroups } from "@/lib/muscleRecovery";
import type { MovementCategory } from "@/lib/exerciseMovementCategory";

/* Written out rather than derived from the type, so adding a tenth
   MovementCategory fails HERE with a name to look up rather than silently
   widening whatever the test derives from. */
const ALL_MOVEMENT_CATEGORIES: MovementCategory[] = [
  "horizontal_push",
  "vertical_push",
  "horizontal_pull",
  "vertical_pull",
  "knee_dominant",
  "hip_dominant",
  "arms_biceps",
  "arms_triceps",
  "core",
];

describe("muscle-group taxonomy — both live vocabularies resolve", () => {
  it("every MovementCategory has a display name", () => {
    const missing = ALL_MOVEMENT_CATEGORIES.filter(
      (c) => !CATEGORY_DISPLAY[c]
    );
    expect(
      missing,
      `These are written to WorkoutExercise.category by ` +
        `useProgram.onCompleteDay but have no display name, so the heat map ` +
        `would label the legend row with the raw key (e.g. "hip_dominant")`
    ).toEqual([]);
  });

  it("every display name maps to muscles on the body diagram", () => {
    const unmapped = Object.entries(CATEGORY_DISPLAY)
      .filter(([, friendly]) => MUSCLE_MAP[friendly] === undefined)
      .map(([key, friendly]) => `${key} → "${friendly}"`);
    expect(
      unmapped,
      `MUSCLE_MAP has no entry for these, so the group renders in the legend ` +
        `but highlights NOTHING on the body diagram. Deleting them as ` +
        `"legacy aliases" is the specific mistake this test exists to catch`
    ).toEqual([]);
  });

  it("every display name can carry a recovery chip", () => {
    /* The sibling table in muscleRecovery.ts is keyed on the same friendly
       names and drifts independently — it was written from the same
       inverted comment. "Full Body" is deliberately absent there (a single
       readiness state for it would be dishonest) and has no
       CATEGORY_DISPLAY counterpart, so it is out of scope here. */
    const entries = Object.values(CATEGORY_DISPLAY).map((friendly) => friendly);
    const covered = recoveryForHeatMapGroups(
      // One fully-recovered entry per canonical muscle; the mapping, not the
      // status, is what is under test.
      (
        [
          "Chest",
          "Back",
          "Shoulders",
          "Biceps",
          "Triceps",
          "Quads",
          "Hamstrings",
          "Glutes",
          "Calves",
          "Core",
        ] as const
      ).map((muscle) => ({
        muscle,
        status: "ready" as const,
        fraction: 1,
        lastTrained: null,
        readyInDays: 0,
      }))
    );
    const missing = entries.filter((g) => covered[g] === undefined);
    expect(
      missing,
      `HEAT_MAP_GROUP_MUSCLES in src/lib/muscleRecovery.ts has no entry for ` +
        `these display names, so their legend row silently gets no recovery ` +
        `chip: ${missing.join(", ")}`
    ).toEqual([]);
  });

  it("the catalogue half is still present too", () => {
    // Guards the guard. The assertions above only exercise the
    // CATEGORY_DISPLAY route; a MUSCLE_MAP stripped down to exactly those
    // nine names would pass them all while breaking History's primary path.
    for (const group of ["Chest", "Back", "Legs", "Core", "Full Body"]) {
      expect(MUSCLE_MAP[group], `${group} missing from MUSCLE_MAP`).toBeTruthy();
    }
    expect(MUSCLE_MAP["Cardio"]).toEqual([]);
  });
});
