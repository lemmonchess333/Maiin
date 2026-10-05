import { describe, it, expect } from "vitest";
import {
  isHighRepIsolation,
  mainRepAnchor,
  roleReps,
  roleRepsFor,
} from "../roleTable";

const row = (r: { sets: number; bottom: number; top?: number }) =>
  `${r.sets}×${r.top === undefined ? r.bottom : `${r.bottom}–${r.top}`}`;

describe("roleReps — sets and reps by role, goal and level (Lift4 (5))", () => {
  it("Build muscle: mains 6–10, other compounds 8–12, isolations 10–15", () => {
    expect(row(roleReps("hypertrophy", "main", "intermediate", false))).toBe(
      "3×6–10"
    );
    expect(
      row(roleReps("hypertrophy", "compound", "intermediate", false))
    ).toBe("3×8–12");
    expect(
      row(roleReps("hypertrophy", "isolation", "intermediate", false))
    ).toBe("3×10–15");
  });

  it("Build muscle's calves, side delts and abs take 12–20", () => {
    expect(
      row(roleReps("hypertrophy", "isolation", "intermediate", true))
    ).toBe("3×12–20");
    // Only Build muscle's: general fitness keeps 10–15.
    expect(row(roleReps("general", "isolation", "intermediate", true))).toBe(
      "3×10–15"
    );
  });

  it("Get stronger: fixed 5s on 4 sets for its mains, 6–10 and 8–12 elsewhere", () => {
    expect(row(roleReps("strength", "main", "intermediate", false))).toBe(
      "4×5"
    );
    expect(row(roleReps("strength", "main", "advanced", false))).toBe("4×5");
    expect(row(roleReps("strength", "compound", "intermediate", false))).toBe(
      "3×6–10"
    );
    expect(row(roleReps("strength", "isolation", "intermediate", false))).toBe(
      "3×8–12"
    );
  });

  it("General fitness and Support my running", () => {
    expect(row(roleReps("general", "main", "intermediate", false))).toBe(
      "3×8–12"
    );
    expect(row(roleReps("running", "main", "intermediate", false))).toBe("3×5");
    expect(row(roleReps("running", "compound", "intermediate", false))).toBe(
      "3×6–10"
    );
  });

  it("beginners: fixed main lifts on 3 sets, and 2 sets of everything else", () => {
    expect(row(roleReps("hypertrophy", "main", "beginner", false))).toBe("3×8");
    expect(row(roleReps("general", "main", "beginner", false))).toBe("3×8");
    expect(row(roleReps("strength", "main", "beginner", false))).toBe("3×5");
    expect(row(roleReps("hypertrophy", "compound", "beginner", false))).toBe(
      "2×8–12"
    );
    expect(row(roleReps("hypertrophy", "isolation", "beginner", true))).toBe(
      "2×12–20"
    );
  });

  it("builds Lose fat as Build muscle", () => {
    for (const role of ["main", "compound", "isolation"] as const) {
      expect(roleReps("fat_loss", role, "intermediate", false)).toEqual(
        roleReps("hypertrophy", role, "intermediate", false)
      );
    }
  });
});

describe("roleRepsFor — an exercise's row", () => {
  it("reads the role and the muscle from the catalogue", () => {
    expect(isHighRepIsolation("standing-calf-raise")).toBe(true);
    expect(isHighRepIsolation("lateral-raise")).toBe(true);
    expect(isHighRepIsolation("barbell-curl")).toBe(false);
    expect(
      row(
        roleRepsFor(
          "hypertrophy",
          { exerciseId: "lateral-raise" },
          "intermediate"
        )
      )
    ).toBe("3×12–20");
    expect(
      row(
        roleRepsFor(
          "hypertrophy",
          { exerciseId: "romanian-deadlift", isAccessory: true },
          "intermediate"
        )
      )
    ).toBe("3×8–12");
  });

  it("anchors a plan's starting loads on its main lifts' bottom", () => {
    expect(mainRepAnchor("hypertrophy", "intermediate")).toBe(6);
    expect(mainRepAnchor("hypertrophy", "beginner")).toBe(8);
    expect(mainRepAnchor("strength", "intermediate")).toBe(5);
  });
});
