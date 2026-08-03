/**
 * Stored movement category — all 152 catalogue exercises, pinned explicitly.
 *
 * Name-string inference got 27 of them wrong, and the errors were not evenly
 * distributed noise: 38 exercises fell through every keyword rule into the
 * `core` fallback (including five chest presses), and `Reverse Flyes` /
 * `Rear Delt Machine Fly` classified as PUSH because "fly" sits under
 * horizontal_push — corrupting `balancePushPull`, whose entire job is keeping
 * pull ≥ push for the shoulder.
 *
 * A snapshot would pin these too, but not readably: the point of the table is
 * that a human can review one line per exercise. So this asserts the shape and
 * the cases that carry the reasoning, and leaves the exhaustive list to the
 * table itself.
 */
import { describe, it, expect } from "vitest";

import { EXERCISES } from "@/lib/exercises";
import { inferMovementCategory } from "@/lib/exerciseMovementCategory";

describe("stored movement category", () => {
  it("covers every catalogue exercise (no silent fallback)", () => {
    // The anti-vacuous guard. If the table were empty, every assertion below
    // would still pass via the keyword rules — this is what notices.
    const uncovered = EXERCISES.filter(
      (e) =>
        inferMovementCategory(e.name, e.id) !== inferMovementCategory("", e.id)
    ).map((e) => e.id);
    expect(
      uncovered,
      `not in STORED_CATEGORY: ${uncovered.join(", ")}`
    ).toEqual([]);
    expect(EXERCISES.length).toBe(152);
  });

  it("rear-delt work is PULL, not push (the balancePushPull corruption)", () => {
    expect(inferMovementCategory("Reverse Flyes", "reverse-flyes")).toBe(
      "horizontal_pull"
    );
    expect(
      inferMovementCategory("Rear Delt Machine Fly", "rear-delt-machine-fly")
    ).toBe("horizontal_pull");
    expect(inferMovementCategory("Reverse Pec Deck", "reverse-pec-deck")).toBe(
      "horizontal_pull"
    );
  });

  it("no longer files leg and glute work under the arms", () => {
    // Matched "curl" and "kickback" respectively.
    expect(
      inferMovementCategory("Nordic Hamstring Curl", "nordic-hamstring-curl")
    ).toBe("hip_dominant");
    expect(
      inferMovementCategory("Cable Glute Kickback", "cable-glute-kickback")
    ).toBe("hip_dominant");
  });

  it("chest presses are not core", () => {
    // Five of them fell through every rule into the fallback.
    for (const [name, id] of [
      ["Incline Dumbbell Press", "incline-db-press"],
      ["Decline Dumbbell Press", "decline-db-press"],
      ["Cable Crossover", "cable-crossover"],
      ["Pec Deck", "pec-deck"],
      ["Barbell Floor Press", "barbell-floor-press"],
    ]) {
      expect(inferMovementCategory(name, id), id).toBe("horizontal_push");
    }
  });

  it("overhead pressing is vertical whatever the name says", () => {
    expect(inferMovementCategory("Pike Push-Up", "pike-push-up")).toBe(
      "vertical_push"
    );
    expect(
      inferMovementCategory("Handstand Push-Ups", "handstand-push-ups")
    ).toBe("vertical_push");
    expect(inferMovementCategory("Arnold Press", "arnold-press")).toBe(
      "vertical_push"
    );
  });

  it("keyword inference still answers for an unknown custom exercise", () => {
    // The fallback must survive — a user-authored lift has no stored entry.
    expect(inferMovementCategory("My Custom Bench Press")).toBe(
      "horizontal_push"
    );
    expect(inferMovementCategory("Weird Thing Nobody Named")).toBe("core");
  });

  /* Deliberate non-corrections, asserted so they read as decisions.
     Both need a taxonomy value that does not exist yet (13a). */
  it("calf raises stay knee_dominant — there is no calves category", () => {
    expect(
      inferMovementCategory("Standing Calf Raise", "standing-calf-raise")
    ).toBe("knee_dominant");
  });

  it("cardio stays core — there is no not-a-resistance-pattern value", () => {
    // Harmless: weeklyVolumeByMuscle excludes cardio by category anyway.
    expect(inferMovementCategory("Treadmill", "treadmill")).toBe("core");
  });
});
