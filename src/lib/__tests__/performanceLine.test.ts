import { describe, it, expect } from "vitest";
import {
  getVerb,
  getVerbState,
  getLine,
  VERB_LABEL,
  EMPTY_STATE_LINE,
  type VerbState,
} from "../performanceLine";
import type { PerformanceSignals } from "../performanceTypes";

const ZERO_SIGNALS: PerformanceSignals = {
  bothLoadsStrong: false,
  liftAheadOfBaseline: 0,
  runAheadOfBaseline: 0,
  recoveryWeak: false,
  adherenceWeak: false,
  deloadFlag: false,
  lifetimeWeeks: 0,
  daysSinceLastTraining: 0,
};

describe("getVerbState — verb derivation", () => {
  it("maps loadBand straightforwardly when no deload override", () => {
    expect(getVerbState("deload", false)).toBe("recovering");
    expect(getVerbState("low", false)).toBe("building");
    expect(getVerbState("moderate", false)).toBe("cruising");
    expect(getVerbState("high", false)).toBe("sharpening");
  });

  it("overreach maps to backing-off regardless of deloadRecommended", () => {
    expect(getVerbState("overreach", false)).toBe("backing-off");
    expect(getVerbState("overreach", true)).toBe("backing-off");
  });

  it("deloadRecommended overrides any other band to backing-off", () => {
    expect(getVerbState("deload", true)).toBe("backing-off");
    expect(getVerbState("low", true)).toBe("backing-off");
    expect(getVerbState("moderate", true)).toBe("backing-off");
    expect(getVerbState("high", true)).toBe("backing-off");
  });
});

describe("getVerb — state + label", () => {
  it("returns matching label for each state", () => {
    expect(getVerb("deload", false)).toEqual({ state: "recovering", label: "Recovering" });
    expect(getVerb("low", false)).toEqual({ state: "building", label: "Building" });
    expect(getVerb("moderate", false)).toEqual({ state: "cruising", label: "Cruising" });
    expect(getVerb("high", false)).toEqual({ state: "sharpening", label: "Sharpening" });
    expect(getVerb("overreach", false)).toEqual({ state: "backing-off", label: "Backing off" });
    expect(getVerb("high", true)).toEqual({ state: "backing-off", label: "Backing off" });
  });

  it("VERB_LABEL covers all 5 states", () => {
    const states: VerbState[] = ["recovering", "building", "cruising", "sharpening", "backing-off"];
    states.forEach((s) => {
      expect(VERB_LABEL[s]).toBeTruthy();
      expect(VERB_LABEL[s].length).toBeGreaterThan(0);
    });
  });
});

describe("getLine — backing-off state", () => {
  it("recoveryWeak signal: 'Recovery signals down — ease this week'", () => {
    expect(getLine("backing-off", { ...ZERO_SIGNALS, recoveryWeak: true }))
      .toBe("Recovery signals down — ease this week");
  });

  it("no recoveryWeak: generic 'Loads high — ease this week'", () => {
    expect(getLine("backing-off", ZERO_SIGNALS)).toBe("Loads high — ease this week");
  });
});

describe("getLine — sharpening state", () => {
  it("bothLoadsStrong signal: hybrid celebration line", () => {
    expect(getLine("sharpening", { ...ZERO_SIGNALS, bothLoadsStrong: true }))
      .toBe("Both loads strong — solid hybrid output");
  });

  it("liftAheadOfBaseline > 0.15: cites the percentage", () => {
    const line = getLine("sharpening", { ...ZERO_SIGNALS, liftAheadOfBaseline: 0.18 });
    expect(line).toBe("Lifting load 18% above baseline");
  });

  it("runAheadOfBaseline > 0.2: cites the percentage", () => {
    const line = getLine("sharpening", { ...ZERO_SIGNALS, runAheadOfBaseline: 0.25 });
    expect(line).toBe("Run volume 25% up");
  });

  it("bothLoadsStrong takes precedence over individual aheadOfBaseline", () => {
    const line = getLine("sharpening", {
      ...ZERO_SIGNALS,
      bothLoadsStrong: true,
      liftAheadOfBaseline: 0.2,
      runAheadOfBaseline: 0.3,
    });
    expect(line).toBe("Both loads strong — solid hybrid output");
  });

  it("no signals: generic 'Loads strong — keep the line'", () => {
    expect(getLine("sharpening", ZERO_SIGNALS)).toBe("Loads strong — keep the line");
  });

  it("liftAheadOfBaseline at exactly 0.15 falls through (strict >)", () => {
    expect(getLine("sharpening", { ...ZERO_SIGNALS, liftAheadOfBaseline: 0.15 }))
      .toBe("Loads strong — keep the line");
  });

  it("runAheadOfBaseline at exactly 0.2 falls through (strict >)", () => {
    expect(getLine("sharpening", { ...ZERO_SIGNALS, runAheadOfBaseline: 0.2 }))
      .toBe("Loads strong — keep the line");
  });
});

describe("getLine — cruising state", () => {
  it("adherenceWeak: 'Adherence dipped — focus on showing up'", () => {
    expect(getLine("cruising", { ...ZERO_SIGNALS, adherenceWeak: true }))
      .toBe("Adherence dipped — focus on showing up");
  });

  it("no signals: 'Holding a steady rhythm'", () => {
    expect(getLine("cruising", ZERO_SIGNALS)).toBe("Holding a steady rhythm");
  });
});

describe("getLine — building state", () => {
  it("lifetimeWeeks >= 4: 'Building back up' (returning user)", () => {
    expect(getLine("building", { ...ZERO_SIGNALS, lifetimeWeeks: 4 }))
      .toBe("Building back up");
    expect(getLine("building", { ...ZERO_SIGNALS, lifetimeWeeks: 12 }))
      .toBe("Building back up");
  });

  it("lifetimeWeeks < 4: 'Establishing your week' (new user)", () => {
    expect(getLine("building", { ...ZERO_SIGNALS, lifetimeWeeks: 0 }))
      .toBe("Establishing your week");
    expect(getLine("building", { ...ZERO_SIGNALS, lifetimeWeeks: 3 }))
      .toBe("Establishing your week");
  });
});

describe("getLine — recovering state", () => {
  it("daysSinceLastTraining > 7: 'Quiet week — log when you're back'", () => {
    expect(getLine("recovering", { ...ZERO_SIGNALS, daysSinceLastTraining: 10 }))
      .toBe("Quiet week — log when you're back");
  });

  it("daysSinceLastTraining <= 7: 'Light week — take it easy'", () => {
    expect(getLine("recovering", { ...ZERO_SIGNALS, daysSinceLastTraining: 7 }))
      .toBe("Light week — take it easy");
    expect(getLine("recovering", { ...ZERO_SIGNALS, daysSinceLastTraining: 0 }))
      .toBe("Light week — take it easy");
  });
});

describe("getLine — coverage across all states", () => {
  it("every state returns a non-empty string with zero signals", () => {
    const states: VerbState[] = ["recovering", "building", "cruising", "sharpening", "backing-off"];
    states.forEach((state) => {
      const line = getLine(state, ZERO_SIGNALS);
      expect(typeof line).toBe("string");
      expect(line.length).toBeGreaterThan(0);
    });
  });
});

describe("EMPTY_STATE_LINE", () => {
  it("is a non-empty string", () => {
    expect(EMPTY_STATE_LINE.length).toBeGreaterThan(0);
  });
});
