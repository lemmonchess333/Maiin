import { describe, it, expect } from "vitest";

import { effortCueFor, rpeReserveWords } from "../effortCue";
import type { MovementCategory } from "@/lib/exerciseMovementCategory";

const ex = (movementCategory: MovementCategory) => ({ movementCategory });

describe("effortCueFor (backlog #4 — effort cues as words)", () => {
  it("compounds get the reserve cue with a tooltip, on every set", () => {
    for (const isLastSet of [false, true]) {
      const cue = effortCueFor(ex("knee_dominant"), {
        isLastSet,
        deloadWeek: false,
      });
      expect(cue?.kind).toBe("reserve");
      expect(cue?.text).toBe("Finish with 2 reps to spare");
      expect(cue?.tooltip).toContain("2 more clean reps");
    }
  });

  it("single-joint arm work gets the push cue on the LAST set only", () => {
    expect(
      effortCueFor(ex("arms_biceps"), { isLastSet: false, deloadWeek: false })
    ).toBeNull();
    const last = effortCueFor(ex("arms_triceps"), {
      isLastSet: true,
      deloadWeek: false,
    });
    expect(last?.kind).toBe("push");
    expect(last?.text).toBe("Last set — OK to go to your limit.");
    expect(last?.tooltip).toBeUndefined();
  });

  it("never offers the push cue outside the arm categories", () => {
    // isAccessory alone can't distinguish a lateral raise from an RDL —
    // hinges and presses must never be pushed to the limit (all sources).
    for (const cat of [
      "hip_dominant",
      "vertical_push",
      "horizontal_pull",
    ] as MovementCategory[]) {
      const cue = effortCueFor(ex(cat), { isLastSet: true, deloadWeek: false });
      expect(cue?.kind).toBe("reserve");
    }
  });

  it("core gets no cue (timed holds make rep-reserve language nonsense)", () => {
    expect(
      effortCueFor(ex("core"), { isLastSet: true, deloadWeek: false })
    ).toBeNull();
  });

  it("the step-back week overrides everything", () => {
    for (const cat of ["knee_dominant", "arms_biceps", "core"] as const) {
      const cue = effortCueFor(ex(cat), { isLastSet: true, deloadWeek: true });
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
