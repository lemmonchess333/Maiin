import { describe, it, expect } from "vitest";
import { recalibrationCheckIn } from "../recalibrationCheckIn";

describe("recalibrationCheckIn", () => {
  it("returns null on a normal mid-block week with no gap", () => {
    expect(
      recalibrationCheckIn({ weekNumber: 3, daysSinceLastTraining: 1 })
    ).toBeNull();
    expect(recalibrationCheckIn({ weekNumber: 5 })).toBeNull();
    expect(recalibrationCheckIn({})).toBeNull();
  });

  it("prompts a block check-in every 4 weeks (with a per-week key)", () => {
    const w4 = recalibrationCheckIn({ weekNumber: 4 });
    expect(w4?.tipKey).toBe("recal-block-w4");
    expect(w4?.title).toMatch(/track/i);
    expect(recalibrationCheckIn({ weekNumber: 8 })?.tipKey).toBe(
      "recal-block-w8"
    );
    // weeks 1–3 / 5–7 don't fire
    for (const w of [1, 2, 3, 5, 6, 7]) {
      expect(recalibrationCheckIn({ weekNumber: w })).toBeNull();
    }
  });

  it("the gap seam takes precedence and re-surfaces per week", () => {
    const g = recalibrationCheckIn({
      weekNumber: 6,
      daysSinceLastTraining: 14,
    });
    expect(g?.tipKey).toBe("recal-return-w6");
    expect(g?.title).toMatch(/still fit/i);
    // gap wins even on a non-block week
    expect(
      recalibrationCheckIn({ weekNumber: 3, daysSinceLastTraining: 10 })?.tipKey
    ).toBe("recal-return-w3");
    // just under the gap threshold → fall through (block week 4 still prompts)
    expect(
      recalibrationCheckIn({ weekNumber: 4, daysSinceLastTraining: 9 })?.tipKey
    ).toBe("recal-block-w4");
  });

  it("clamps a missing/negative week safely", () => {
    expect(
      recalibrationCheckIn({ weekNumber: -1, daysSinceLastTraining: 20 })
        ?.tipKey
    ).toBe("recal-return-w0");
  });
});
