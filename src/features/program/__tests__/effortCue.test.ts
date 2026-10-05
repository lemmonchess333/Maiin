import { describe, it, expect } from "vitest";

import { effortCueFor, rpeReserveWords } from "../effortCue";
import type { MovementCategory } from "@/lib/exerciseMovementCategory";

/** A real catalogue exercise in a given slot: the cue reads the catalogue
 *  (whether it is an isolation, what equipment it uses) through
 *  `exerciseRole`, so these name exercises rather than bare categories. */
const ex = (
  exerciseId: string,
  movementCategory: MovementCategory,
  isAccessory?: boolean
) => ({ exerciseId, movementCategory, isAccessory });

const last = { isLastSet: true, deloadWeek: false };
const notLast = { isLastSet: false, deloadWeek: false };

describe("effortCueFor (backlog #4 — effort cues as words)", () => {
  it("main lifts get the reserve cue with a tooltip, on every set", () => {
    for (const opts of [notLast, last]) {
      const cue = effortCueFor(ex("squat", "knee_dominant", false), opts);
      expect(cue?.kind).toBe("reserve");
      expect(cue?.text).toBe("Finish with 2 reps to spare");
      expect(cue?.tooltip).toContain("2 more clean reps");
    }
  });

  it("an isolation gets the push cue on the LAST set only", () => {
    expect(
      effortCueFor(ex("db-curl", "arms_biceps", true), notLast)
    ).toBeNull();
    const cue = effortCueFor(ex("rope-tricep-pushdown", "arms_triceps"), last);
    expect(cue?.kind).toBe("push");
    expect(cue?.text).toBe("Last set — OK to go to your limit.");
    expect(cue?.tooltip).toBeUndefined();
  });

  it("reaches the isolations the arm categories missed", () => {
    // The lateral raise sits in vertical_push beside the overhead press, so
    // no category test could tell them apart; the catalogue can (Lift4).
    for (const [id, cat] of [
      ["lateral-raise", "vertical_push"],
      ["seated-leg-curl", "hip_dominant"],
      ["leg-extension", "knee_dominant"],
      ["cable-fly", "horizontal_push"],
    ] as const) {
      expect(effortCueFor(ex(id, cat, true), last)?.kind).toBe("push");
    }
  });

  it("pushes a supporting compound's last set only on a machine", () => {
    expect(
      effortCueFor(ex("leg-press", "knee_dominant", true), last)?.kind
    ).toBe("push");
    expect(
      effortCueFor(ex("leg-press", "knee_dominant", true), notLast)?.kind
    ).toBe("reserve");
    // The same machine as the day's main lift keeps its reps to spare.
    expect(
      effortCueFor(ex("leg-press", "knee_dominant", false), last)?.kind
    ).toBe("reserve");
  });

  it("never pushes a free-weight compound or a main press to the limit", () => {
    for (const [id, cat, accessory] of [
      ["romanian-deadlift", "hip_dominant", true],
      ["barbell-row", "horizontal_pull", true],
      ["overhead-press", "vertical_push", false],
      ["bench-press", "horizontal_push", undefined],
    ] as const) {
      expect(effortCueFor(ex(id, cat, accessory), last)?.kind).toBe("reserve");
    }
  });

  it("core gets no cue (timed holds make rep-reserve language nonsense)", () => {
    expect(effortCueFor(ex("plank", "core", true), last)).toBeNull();
    expect(effortCueFor(ex("cable-crunch", "core", true), last)).toBeNull();
  });

  it("the step-back week overrides everything", () => {
    for (const exercise of [
      ex("squat", "knee_dominant"),
      ex("db-curl", "arms_biceps", true),
      ex("plank", "core", true),
    ]) {
      const cue = effortCueFor(exercise, { isLastSet: true, deloadWeek: true });
      expect(cue?.kind).toBe("deload");
      expect(cue?.text).toBe(
        "Step-back week — keep everything comfortably easy."
      );
    }
  });
});

describe("rpeReserveWords", () => {
  it("covers every chip on the session RPE scale", () => {
    // Must match WorkoutSession's RPE_OPTIONS exactly — a new chip value
    // without words here would render a bare number scale, which the
    // presentation policy forbids.
    const RPE_OPTIONS = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];
    const words = RPE_OPTIONS.map(rpeReserveWords);
    expect(words).toEqual([
      "4+ to spare",
      "3–4 to spare",
      "3 to spare",
      "2–3 to spare",
      "2 to spare",
      "1–2 to spare",
      "1 to spare",
      "no full rep left",
      "nothing left",
    ]);
  });
});
