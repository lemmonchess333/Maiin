import { describe, it, expect } from "vitest";
import { exerciseRole } from "../exerciseRole";
import { EXERCISES } from "@/lib/exercises";

describe("exerciseRole", () => {
  it("calls an isolation an isolation in any slot", () => {
    for (const isAccessory of [true, false, undefined]) {
      expect(exerciseRole({ exerciseId: "lateral-raise", isAccessory })).toBe(
        "isolation"
      );
      expect(exerciseRole({ exerciseId: "db-curl", isAccessory })).toBe(
        "isolation"
      );
    }
  });

  it("calls a compound in a supporting slot another compound", () => {
    expect(
      exerciseRole({ exerciseId: "romanian-deadlift", isAccessory: true })
    ).toBe("compound");
    expect(exerciseRole({ exerciseId: "leg-press", isAccessory: true })).toBe(
      "compound"
    );
  });

  it("calls a compound in a main slot, or with no slot recorded, a main lift", () => {
    expect(exerciseRole({ exerciseId: "squat", isAccessory: false })).toBe(
      "main"
    );
    expect(exerciseRole({ exerciseId: "bench-press" })).toBe("main");
  });

  it("reads an exercise the catalogue doesn't know by its slot alone", () => {
    expect(exerciseRole({ exerciseId: "my-own-lift", isAccessory: true })).toBe(
      "compound"
    );
    expect(exerciseRole({ exerciseId: "my-own-lift" })).toBe("main");
  });

  it("marks only strength exercises as isolations, never cardio", () => {
    const isolations = EXERCISES.filter((e) => e.mechanic === "isolation");
    expect(isolations.length).toBeGreaterThan(40);
    expect(isolations.some((e) => e.category === "Cardio")).toBe(false);
    // Every curl, raise, fly and calf raise in the catalogue is marked.
    for (const e of EXERCISES) {
      if (/curl|raise|fly|flyes|pushdown|kickback|extension$/i.test(e.name))
        expect(`${e.id}:${e.mechanic}`).toBe(`${e.id}:isolation`);
    }
  });
});
