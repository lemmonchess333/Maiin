/**
 * Post-run pace verdict (Runna-style plan-vs-actual). Pins the tolerance
 * band, the "easy running works best slower" coaching rule (faster on an easy/recovery/long
 * run is a nudge, not praise), the adherence-neutral slow framing, and the
 * garbage-input guards.
 */
import { describe, it, expect } from "vitest";
import { resolvePaceVerdict, ON_TARGET_TOLERANCE_S } from "../paceVerdict";

describe("resolvePaceVerdict", () => {
  it("within ±10s/km reads on-target", () => {
    const v = resolvePaceVerdict({
      unit: "km",
      templateType: "tempo",
      actualPaceS: 344,
      targetPaceS: 350,
    })!;
    expect(v.tone).toBe("on");
    expect(v.line).toContain("Right on target");
    expect(v.line).toContain("5:44");
    expect(v.line).toContain("5:50");
    // Run21 (6): a run that matched its type gets no line.
    expect(v.speaks).toBe(false);
  });

  it("boundary: exactly the tolerance still counts as on-target", () => {
    const v = resolvePaceVerdict({
      unit: "km",
      templateType: "tempo",
      actualPaceS: 350 + ON_TARGET_TOLERANCE_S,
      targetPaceS: 350,
    })!;
    expect(v.tone).toBe("on");
  });

  it("a tempo quicker than its pace says so, without praise (Run21 (6))", () => {
    const v = resolvePaceVerdict({
      unit: "km",
      templateType: "tempo",
      actualPaceS: 330,
      targetPaceS: 350,
    })!;
    expect(v.tone).toBe("fast");
    expect(v.speaks).toBe(true);
    expect(v.line).toBe(
      "Quicker than a tempo today: 5:30 /km, against a 5:50 /km target. It works best held a little back, so you can keep it up for longer."
    );
  });

  it("faster on an EASY session gets the easy-days-easy nudge, not praise", () => {
    for (const type of ["easy", "recovery", "long", "longrun"]) {
      const v = resolvePaceVerdict({
        unit: "km",
        templateType: type,
        actualPaceS: 330,
        targetPaceS: 360,
      })!;
      expect(v.tone).toBe("easy-too-fast");
      expect(v.speaks).toBe(true);
      expect(v.line).toContain("Easy running works best slower");
    }
  });

  it("slower is framed calmly — no shame register", () => {
    const v = resolvePaceVerdict({
      unit: "km",
      templateType: "tempo",
      actualPaceS: 375,
      targetPaceS: 350,
    })!;
    expect(v.tone).toBe("slow");
    expect(v.speaks).toBe(true);
    expect(v.line.toLowerCase()).not.toContain("behind");
    expect(v.line.toLowerCase()).not.toContain("fail");
    expect(v.line).toContain("It still counts.");
  });

  it("Run21 (6): quiet when the run matched its type, and for a race", () => {
    const quiet = [
      // An easy or long run slower than its window: slower is fine.
      { templateType: "easy", actualPaceS: 400, targetPaceS: 360 },
      { templateType: "long", actualPaceS: 400, targetPaceS: 360 },
      // A race, quicker or slower: its result says it.
      { templateType: "race", actualPaceS: 300, targetPaceS: 330 },
      { templateType: "race", actualPaceS: 360, targetPaceS: 330 },
    ];
    for (const args of quiet) {
      const v = resolvePaceVerdict({ unit: "km", ...args })!;
      expect(v.speaks, JSON.stringify(args)).toBe(false);
      expect(v.line).not.toMatch(/deposit|bank|strong day/i);
    }
  });

  it("garbage inputs → null", () => {
    expect(
      resolvePaceVerdict({
        unit: "km",
        templateType: "easy",
        actualPaceS: 0,
        targetPaceS: 350,
      })
    ).toBeNull();
    expect(
      resolvePaceVerdict({
        unit: "km",
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
        unit: "km",
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
      unit: "km",
      templateType: "tempo",
      actualPaceS: 345 + ON_TARGET_TOLERANCE_S,
      targetPaceS: 335,
      targetBandS: band,
    })!;
    expect(v.tone).toBe("on");
  });

  it("faster than the band's fast edge on a hard session is a strong day", () => {
    const v = resolvePaceVerdict({
      unit: "km",
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
      unit: "km",
      templateType: "long",
      actualPaceS: 340,
      targetPaceS: 385,
      targetBandS: [370, 400],
    })!;
    expect(v.tone).toBe("easy-too-fast");
    expect(v.line).toContain("Easy running works best slower");
  });

  it("slower than the band is calm and quotes the window", () => {
    const v = resolvePaceVerdict({
      unit: "km",
      templateType: "tempo",
      actualPaceS: 370,
      targetPaceS: 335,
      targetBandS: band,
    })!;
    expect(v.tone).toBe("slow");
    expect(v.line).toContain("5:25\u20135:45 /km");
  });

  it("the unit reaches the copy but never the verdict", () => {
    /* The judgement compares sec/km to sec/km, so the tone must be
       identical in both units — a run does not become on-target because
       the reader prefers miles. Only the quoted paces move. */
    const args = {
      templateType: "easy",
      actualPaceS: 330,
      targetPaceS: 360,
      targetBandS: [350, 370] as [number, number],
    };
    const km = resolvePaceVerdict({ ...args, unit: "km" as const })!;
    const mi = resolvePaceVerdict({ ...args, unit: "mi" as const })!;
    expect(mi.tone).toBe(km.tone);
    expect(km.line).toContain("5:50\u20136:10 /km");
    expect(mi.line).toContain("9:23\u20139:55 /mi");
    expect(mi.line).not.toMatch(/\/km/);
  });

  it("a malformed band falls back to single-target judgement", () => {
    const v = resolvePaceVerdict({
      unit: "km",
      templateType: "tempo",
      actualPaceS: 335,
      targetPaceS: 335,
      targetBandS: [0, -5],
    })!;
    expect(v.tone).toBe("on");
    expect(v.line).toContain("5:35");
  });
});
