import { describe, it, expect } from "vitest";
import {
  getVerb,
  getVerbState,
  getLine,
  getEstablishingLine,
  VERB_LABEL,
  EMPTY_STATE_LINE,
  performanceEmptyCopy,
  scoreWindowLabel,
  takeMoreLine,
  USUAL_WEEK_FORMING,
  type VerbState,
} from "../performanceLine";
import {
  isEstablishingBaseline,
  MAX_LIFETIME_WEEKS,
} from "../performanceDocFields";
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
    expect(getVerb("deload", false)).toEqual({
      state: "recovering",
      label: "Recovering",
    });
    expect(getVerb("low", false)).toEqual({
      state: "building",
      label: "Building",
    });
    expect(getVerb("moderate", false)).toEqual({
      state: "cruising",
      label: "Steady",
    });
    expect(getVerb("high", false)).toEqual({
      state: "sharpening",
      label: "Sharpening",
    });
    expect(getVerb("overreach", false)).toEqual({
      state: "backing-off",
      label: "Backing off",
    });
    expect(getVerb("high", true)).toEqual({
      state: "backing-off",
      label: "Backing off",
    });
  });

  it("VERB_LABEL covers all 5 states", () => {
    const states: VerbState[] = [
      "recovering",
      "building",
      "cruising",
      "sharpening",
      "backing-off",
    ];
    states.forEach((s) => {
      expect(VERB_LABEL[s]).toBeTruthy();
      expect(VERB_LABEL[s].length).toBeGreaterThan(0);
    });
  });
});

/* The lines are about the person, not "load" (CODING_STANDARDS, the
   measured rules), and whether to ease off is the line under the bars
   (`takeMoreLine`), so it is not said twice. The recovery line names what
   the engine's recovery factor is made of, not a score the lead hides. */
describe("getLine — backing-off state", () => {
  it("recoveryWeak signal: what recovery is read from", () => {
    expect(
      getLine("backing-off", { ...ZERO_SIGNALS, recoveryWeak: true })
    ).toBe("Your recovery reads low from food, weight and sessions");
  });

  it("no recoveryWeak: you, against your usual week", () => {
    expect(getLine("backing-off", ZERO_SIGNALS)).toBe(
      "You trained more than your usual week"
    );
  });
});

/* The sharpening lines describe the score's window, which the card names
   above them ("Last 7 days"), so they no longer end "this week", which
   means Monday to Sunday (App1 Q13). */
describe("getLine — sharpening state", () => {
  it("bothLoadsStrong signal: hybrid celebration line", () => {
    expect(
      getLine("sharpening", { ...ZERO_SIGNALS, bothLoadsStrong: true })
    ).toBe("Lifting and running both strong");
  });

  it("liftAheadOfBaseline > 0.15: cites the percentage", () => {
    const line = getLine("sharpening", {
      ...ZERO_SIGNALS,
      liftAheadOfBaseline: 0.18,
    });
    expect(line).toBe("Lifting volume 18% above your usual week");
  });

  it("runAheadOfBaseline > 0.2: cites the percentage", () => {
    const line = getLine("sharpening", {
      ...ZERO_SIGNALS,
      runAheadOfBaseline: 0.25,
    });
    expect(line).toBe("Running distance 25% above your usual week");
  });

  it("bothLoadsStrong takes precedence over individual aheadOfBaseline", () => {
    const line = getLine("sharpening", {
      ...ZERO_SIGNALS,
      bothLoadsStrong: true,
      liftAheadOfBaseline: 0.2,
      runAheadOfBaseline: 0.3,
    });
    expect(line).toBe("Lifting and running both strong");
  });

  /* The band is the whole score, so a high one is no proof of more
     training: at 100% of the usual week the score is 79, high. The
     comparison is said only on the week's own figures
     (`trainedMoreThanUsual`, trainedMoreThanUsual.test.ts). */
  it("no signals: says you trained more only when you did", () => {
    expect(getLine("sharpening", ZERO_SIGNALS, true)).toBe(
      "You trained more than your usual week"
    );
    expect(getLine("sharpening", ZERO_SIGNALS, false)).toBe("A strong 7 days");
    expect(getLine("sharpening", ZERO_SIGNALS)).toBe("A strong 7 days");
  });

  it("liftAheadOfBaseline at exactly 0.15 falls through (strict >)", () => {
    expect(
      getLine(
        "sharpening",
        { ...ZERO_SIGNALS, liftAheadOfBaseline: 0.15 },
        true
      )
    ).toBe("You trained more than your usual week");
  });

  it("runAheadOfBaseline at exactly 0.2 falls through (strict >)", () => {
    expect(
      getLine("sharpening", { ...ZERO_SIGNALS, runAheadOfBaseline: 0.2 }, true)
    ).toBe("You trained more than your usual week");
  });
});

describe("getLine — cruising state", () => {
  it("adherenceWeak: 'Fewer sessions than usual'", () => {
    expect(getLine("cruising", { ...ZERO_SIGNALS, adherenceWeak: true })).toBe(
      "Fewer sessions than usual"
    );
  });

  it("no signals: 'Holding a steady rhythm'", () => {
    expect(getLine("cruising", ZERO_SIGNALS)).toBe("Holding a steady rhythm");
  });
});

describe("getLine — building state", () => {
  it("lifetimeWeeks >= 4: 'Building back up' (returning user)", () => {
    expect(getLine("building", { ...ZERO_SIGNALS, lifetimeWeeks: 4 })).toBe(
      "Building back up"
    );
    expect(getLine("building", { ...ZERO_SIGNALS, lifetimeWeeks: 12 })).toBe(
      "Building back up"
    );
  });

  it("lifetimeWeeks < 4: 'Establishing your week' (new user)", () => {
    expect(getLine("building", { ...ZERO_SIGNALS, lifetimeWeeks: 0 })).toBe(
      "Establishing your week"
    );
    expect(getLine("building", { ...ZERO_SIGNALS, lifetimeWeeks: 3 })).toBe(
      "Establishing your week"
    );
  });
});

describe("getLine — recovering state", () => {
  /* Under "Last 7 days" a line says 7 days, never "week" (App1 Q13). */
  it("daysSinceLastTraining > 7: nothing logged in these 7 days", () => {
    expect(
      getLine("recovering", { ...ZERO_SIGNALS, daysSinceLastTraining: 10 })
    ).toBe("Nothing logged in these 7 days. Log when you’re back");
  });

  it("daysSinceLastTraining <= 7: a light 7 days", () => {
    expect(
      getLine("recovering", { ...ZERO_SIGNALS, daysSinceLastTraining: 7 })
    ).toBe("A light 7 days, under your usual week");
    expect(
      getLine("recovering", { ...ZERO_SIGNALS, daysSinceLastTraining: 0 })
    ).toBe("A light 7 days, under your usual week");
  });
});

describe("getLine — coverage across all states", () => {
  it("every state returns a non-empty string with zero signals", () => {
    const states: VerbState[] = [
      "recovering",
      "building",
      "cruising",
      "sharpening",
      "backing-off",
    ];
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

describe("performanceEmptyCopy", () => {
  /* The two branches are asserted as whole literal objects rather than
     field-by-field against the exported constants: an expectation computed
     from the values under test pins consistency, not behaviour. These pin
     the words. */
  it("nothing logged: says so, and offers the next step", () => {
    expect(performanceEmptyCopy(false)).toEqual({
      headline: "No sessions logged yet",
      sub: "Your last 7 days against your usual week appear after your first session",
      showAction: true,
    });
  });

  it("a session IS logged: does not claim otherwise, and offers no action", () => {
    expect(performanceEmptyCopy(true)).toEqual({
      headline: "Performance is still catching up",
      sub: "Your last 7 days appear here shortly after a session is saved",
      showAction: false,
    });
  });

  it("never tells a user with a logged session that they have none", () => {
    /* The defect this function exists for. The doc is server-written, so
       `!currentWeek` covers the window between saving a first session and
       the trigger landing — stated independently of the exact wording so a
       future copy edit cannot reintroduce the claim. */
    const copy = performanceEmptyCopy(true);
    expect(copy.headline.toLowerCase()).not.toContain("no sessions");
    expect(copy.sub.toLowerCase()).not.toContain("first session");
  });

  it("the two branches differ in every field", () => {
    const cold = performanceEmptyCopy(false);
    const pending = performanceEmptyCopy(true);
    expect(pending.headline).not.toBe(cold.headline);
    expect(pending.sub).not.toBe(cold.sub);
    expect(pending.showAction).not.toBe(cold.showAction);
  });
});

describe("getEstablishingLine — while the baseline forms", () => {
  it("never compares a new account with a usual week it doesn't have", () => {
    expect(getEstablishingLine({ ...ZERO_SIGNALS, lifetimeWeeks: 1 })).toBe(
      "Establishing your week"
    );
    expect(getEstablishingLine({ ...ZERO_SIGNALS, lifetimeWeeks: 2 })).toBe(
      "Settling in"
    );
    // A strong week that getLine would call "97% above your usual week".
    const ahead = {
      ...ZERO_SIGNALS,
      lifetimeWeeks: 1,
      liftAheadOfBaseline: 0.97,
    };
    expect(getEstablishingLine(ahead)).not.toMatch(/usual/);
  });

  it("asks for a session after more than a week off", () => {
    expect(
      getEstablishingLine({ ...ZERO_SIGNALS, daysSinceLastTraining: 9 })
    ).toBe("Re-engaging. Log a session to refresh");
  });
});

describe("the supporting line's shape", () => {
  it("joins two statements with a full stop, never an em dash", () => {
    /* It renders after the verb ("Recovering. Quiet week. Log when you're
       back"), so a dash read as a second rhythm in the same sentence. */
    const variants: PerformanceSignals[] = [
      ZERO_SIGNALS,
      { ...ZERO_SIGNALS, daysSinceLastTraining: 9 },
      { ...ZERO_SIGNALS, recoveryWeak: true },
      { ...ZERO_SIGNALS, bothLoadsStrong: true },
      { ...ZERO_SIGNALS, liftAheadOfBaseline: 0.4 },
      { ...ZERO_SIGNALS, runAheadOfBaseline: 0.4 },
      { ...ZERO_SIGNALS, adherenceWeak: true },
      { ...ZERO_SIGNALS, lifetimeWeeks: 6 },
    ];
    const states = Object.keys(VERB_LABEL) as VerbState[];
    for (const signals of variants) {
      expect(getEstablishingLine(signals)).not.toMatch(/\u2014/);
      for (const state of states) {
        expect(getLine(state, signals), state).not.toMatch(/\u2014/);
      }
    }
  });
});

describe("scoreWindowLabel — the score's window by name (App1 Q13)", () => {
  // A Thursday, so a Monday-to-Sunday week and the rolling seven differ.
  const today = new Date(2026, 10, 12, 9, 0);

  it("calls a window ending today or yesterday the last 7 days", () => {
    expect(scoreWindowLabel("2026-11-12", today)).toBe("Last 7 days");
    expect(scoreWindowLabel("2026-11-11", today)).toBe("Last 7 days");
  });

  it("names an older window by its last day", () => {
    expect(scoreWindowLabel("2026-11-10", today)).toBe("7 days to 10 Nov");
    expect(scoreWindowLabel("2026-08-02", today)).toBe("7 days to 2 Aug");
  });

  it("gives that day its year when it is not this year's", () => {
    expect(scoreWindowLabel("2025-12-28", today)).toBe("7 days to 28 Dec 2025");
  });

  it("never calls it this week, which means Monday to Sunday", () => {
    for (const key of ["2026-11-12", "2026-11-09", "2026-10-01"]) {
      expect(scoreWindowLabel(key, today)).not.toMatch(/this week/i);
    }
  });
});

describe("takeMoreLine — whether you can take more (App1 Q10)", () => {
  it("says ease off only where the engine does: Backing off", () => {
    expect(takeMoreLine("backing-off")).toBe(
      "Ease off this week rather than add more"
    );
  });

  it("claims no room the engine never measured: carry on with the plan", () => {
    for (const state of [
      "recovering",
      "building",
      "cruising",
      "sharpening",
    ] as VerbState[]) {
      const line = takeMoreLine(state);
      expect(line).toBe("No sign to ease off. Carry on with your plan");
      expect(line).not.toMatch(/room|more sessions|add more|harder/i);
    }
  });

  it("while the baseline forms, says when the usual week will", () => {
    expect(takeMoreLine(null)).toBe(USUAL_WEEK_FORMING);
    expect(USUAL_WEEK_FORMING).toBe(
      "Your usual week forms once you’ve trained in 3 of 4 weeks. Until then, follow your plan"
    );
  });

  it("names the numbers the establishing gate really uses", () => {
    // 3 of 4: below 3 active weeks of the baseline's 4 it is establishing.
    expect(
      isEstablishingBaseline({ docsAvailable: 10, lifetimeWeeks: 2 })
    ).toBe(true);
    expect(
      isEstablishingBaseline({ docsAvailable: 10, lifetimeWeeks: 3 })
    ).toBe(false);
    expect(MAX_LIFETIME_WEEKS).toBe(4);
  });
});
