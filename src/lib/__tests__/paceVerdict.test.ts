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
    for (const type of ["easy", "recovery", "long", "longrun"]) {
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

describe("resolvePaceVerdict — band-aware (Runna teardown #2)", () => {
  const band: [number, number] = [325, 345]; // 5:25–5:45 /km

  it("anywhere INSIDE the band is on-target and the copy speaks the window", () => {
    for (const actual of [325, 335, 345]) {
      const v = resolvePaceVerdict({
        templateType: "tempo",
        actualPaceS: actual,
        targetPaceS: 335,
        targetBandS: band,
      })!;
      expect(v.tone).toBe("on");
      expect(v.line).toContain("5:25\u20135:45 /km");
    }
  });

  it("edge grace: tolerance past the slow edge still reads on-target", () => {
    const v = resolvePaceVerdict({
      templateType: "tempo",
      actualPaceS: 345 + ON_TARGET_TOLERANCE_S,
      targetPaceS: 335,
      targetBandS: band,
    })!;
    expect(v.tone).toBe("on");
  });

  it("faster than the band's fast edge on a hard session is a strong day", () => {
    const v = resolvePaceVerdict({
      templateType: "tempo",
      actualPaceS: 310,
      targetPaceS: 335,
      targetBandS: band,
    })!;
    expect(v.tone).toBe("fast");
    expect(v.line).toContain("window");
  });

  it("a hot LONG run inside easy-band vocabulary gets the nudge (the 'long' fix)", () => {
    const v = resolvePaceVerdict({
      templateType: "long",
      actualPaceS: 340,
      targetPaceS: 385,
      targetBandS: [370, 400],
    })!;
    expect(v.tone).toBe("easy-too-fast");
    expect(v.line).toContain("easy days easy");
  });

  it("slower than the band is calm and quotes the window", () => {
    const v = resolvePaceVerdict({
      templateType: "tempo",
      actualPaceS: 370,
      targetPaceS: 335,
      targetBandS: band,
    })!;
    expect(v.tone).toBe("slow");
    expect(v.line).toContain("5:25\u20135:45 /km");
  });

  it("a malformed band falls back to single-target judgement", () => {
    const v = resolvePaceVerdict({
      templateType: "tempo",
      actualPaceS: 335,
      targetPaceS: 335,
      targetBandS: [0, -5],
    })!;
    expect(v.tone).toBe("on");
    expect(v.line).toContain("5:35");
  });
});
