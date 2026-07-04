/**
 * Post-run pace verdict (Runna-style plan-vs-actual). Pins the tolerance
 * band, the "easy days easy" coaching rule (faster on an easy/recovery/long
 * run is a nudge, not praise), the adherence-neutral slow framing, and the
 * garbage-input guards.
 */
import { describe, it, expect } from "vitest";
import { resolvePaceVerdict, ON_TARGET_TOLERANCE_S } from "../paceVerdict";

describe("resolvePaceVerdict", () => {
  it("within ±10s/km reads on-target", () => {
    const v = resolvePaceVerdict({
      templateType: "tempo",
      actualPaceS: 344,
      targetPaceS: 350,
    })!;
    expect(v.tone).toBe("on");
    expect(v.line).toContain("Right on target");
    expect(v.line).toContain("5:44");
    expect(v.line).toContain("5:50");
  });

  it("boundary: exactly the tolerance still counts as on-target", () => {
    const v = resolvePaceVerdict({
      templateType: "tempo",
      actualPaceS: 350 + ON_TARGET_TOLERANCE_S,
      targetPaceS: 350,
    })!;
    expect(v.tone).toBe("on");
  });

  it("faster on a HARD session is a strong day", () => {
    const v = resolvePaceVerdict({
      templateType: "tempo",
      actualPaceS: 330,
      targetPaceS: 350,
    })!;
    expect(v.tone).toBe("fast");
    expect(v.line).toContain("Strong day");
  });

  it("faster on an EASY session gets the easy-days-easy nudge, not praise", () => {
    for (const type of ["easy", "recovery", "longrun"]) {
      const v = resolvePaceVerdict({
        templateType: type,
        actualPaceS: 330,
        targetPaceS: 360,
      })!;
      expect(v.tone).toBe("easy-too-fast");
      expect(v.line).toContain("easy days easy");
    }
  });

  it("slower is framed calmly — no shame register", () => {
    const v = resolvePaceVerdict({
      templateType: "tempo",
      actualPaceS: 375,
      targetPaceS: 350,
    })!;
    expect(v.tone).toBe("slow");
    expect(v.line.toLowerCase()).not.toContain("behind");
    expect(v.line.toLowerCase()).not.toContain("fail");
  });

  it("garbage inputs → null", () => {
    expect(
      resolvePaceVerdict({
        templateType: "easy",
        actualPaceS: 0,
        targetPaceS: 350,
      })
    ).toBeNull();
    expect(
      resolvePaceVerdict({
        templateType: "easy",
        actualPaceS: 350,
        targetPaceS: NaN,
      })
    ).toBeNull();
  });
});
