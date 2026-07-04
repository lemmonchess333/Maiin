/**
 * Interval step model — pins the shell's derivations: the step-list shape
 * (no rest after the final rep), the live-index mapping for every machine
 * phase, the band-first work headline, and the up-next chain.
 */
import { describe, it, expect } from "vitest";
import {
  stepListFromConfig,
  currentStepIndex,
  stepHeadline,
  upNextHeadline,
  stepDurationLabel,
} from "../intervalSteps";
import type {
  IntervalConfig,
  IntervalState,
} from "../../hooks/useIntervalWorkout";

const FULL: IntervalConfig = {
  reps: 3,
  workDistance: 1000,
  restDuration: 90,
  warmupDuration: 300,
  cooldownDuration: 300,
};

function stateAt(phase: IntervalState["phase"], currentRep = 0): IntervalState {
  return {
    phase,
    currentRep,
    totalReps: FULL.reps,
    phaseElapsed: 0,
    phaseTarget: 0,
    phaseDistanceCovered: 0,
    isDistanceBased: true,
  };
}

describe("stepListFromConfig", () => {
  it("orders warmup, alternating work/rest with NO rest after the last rep, cooldown", () => {
    expect(stepListFromConfig(FULL).map((s) => s.kind)).toEqual([
      "warmup",
      "work",
      "rest",
      "work",
      "rest",
      "work",
      "cooldown",
    ]);
  });

  it("omits warmup/cooldown when the config has none", () => {
    expect(
      stepListFromConfig({ reps: 2, workDuration: 45, restDuration: 60 }).map(
        (s) => s.kind
      )
    ).toEqual(["work", "rest", "work"]);
  });
});

describe("currentStepIndex", () => {
  it("maps every live phase onto the step list", () => {
    expect(currentStepIndex(stateAt("idle"), FULL)).toBe(-1);
    expect(currentStepIndex(stateAt("warmup"), FULL)).toBe(0);
    expect(currentStepIndex(stateAt("work", 1), FULL)).toBe(1);
    expect(currentStepIndex(stateAt("rest", 1), FULL)).toBe(2);
    expect(currentStepIndex(stateAt("work", 3), FULL)).toBe(5);
    expect(currentStepIndex(stateAt("cooldown", 3), FULL)).toBe(6);
    expect(currentStepIndex(stateAt("complete", 3), FULL)).toBe(7);
  });

  it("shifts down when there is no warmup", () => {
    const cfg: IntervalConfig = {
      reps: 2,
      workDistance: 400,
      restDuration: 60,
    };
    expect(currentStepIndex(stateAt("work", 1), cfg)).toBe(0);
    expect(currentStepIndex(stateAt("rest", 1), cfg)).toBe(1);
    expect(currentStepIndex(stateAt("work", 2), cfg)).toBe(2);
  });
});

describe("stepHeadline", () => {
  it("work leads with the effort and the BAND when the runner has one", () => {
    expect(stepHeadline({ kind: "work", rep: 1 }, FULL, [305, 312])).toBe(
      "1K at 5:05–5:12 /km"
    );
  });

  it("falls back to the single work pace, then to bare effort", () => {
    expect(stepHeadline({ kind: "work" }, { ...FULL, workPace: 310 })).toBe(
      "1K at 5:10 /km"
    );
    expect(stepHeadline({ kind: "work" }, FULL)).toBe("1K hard");
  });

  it("formats sub-km and duration-based work", () => {
    expect(stepHeadline({ kind: "work" }, { ...FULL, workDistance: 400 })).toBe(
      "400m hard"
    );
    expect(
      stepHeadline(
        { kind: "work" },
        { reps: 4, workDuration: 45, restDuration: 60 }
      )
    ).toBe("45s hard");
  });

  it("rest speaks the configured duration; warmup/cooldown are plain", () => {
    expect(stepHeadline({ kind: "rest" }, FULL)).toBe("90s rest");
    expect(stepHeadline({ kind: "warmup" }, FULL)).toBe("Warm up");
    expect(stepHeadline({ kind: "cooldown" }, FULL)).toBe("Cool down");
  });
});

describe("upNextHeadline", () => {
  it("chains warmup → work → rest → … → cooldown → null", () => {
    expect(upNextHeadline(stateAt("warmup"), FULL)).toBe("1K hard");
    expect(upNextHeadline(stateAt("work", 1), FULL)).toBe("90s rest");
    expect(upNextHeadline(stateAt("rest", 2), FULL)).toBe("1K hard");
    expect(upNextHeadline(stateAt("work", 3), FULL)).toBe("Cool down");
    expect(upNextHeadline(stateAt("cooldown", 3), FULL)).toBeNull();
    expect(upNextHeadline(stateAt("complete", 3), FULL)).toBeNull();
  });
});

describe("stepDurationLabel", () => {
  it("seconds under 3 minutes, m:ss beyond", () => {
    expect(stepDurationLabel(90)).toBe("90s");
    expect(stepDurationLabel(45)).toBe("45s");
    expect(stepDurationLabel(210)).toBe("3:30");
  });
});
