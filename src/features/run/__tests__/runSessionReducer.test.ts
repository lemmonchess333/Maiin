/**
 * Exhaustive transition tests for the RunSession reducer.
 *
 * Pure reducer + types — no React, no GPS, no audio. Each test pins
 * one transition. Together they cover:
 *   1. Forward paths: GPS run (waiting → acquiring → active → paused
 *      → active → finished), a GPS run with its fix in hand and the
 *      non-GPS short-circuit (waiting → active → finished).
 *   2. Acquiring branches: GPS_ACQUIRED, START_ANYWAY, MANUAL_FALLBACK,
 *      CANCEL_ACQUIRING — each from acquiring only.
 *   3. Snapshot resume: RESUME_SNAPSHOT lands in the stored phase,
 *      and only from the initial waiting state.
 *   4. Defensive guards: every action is a no-op when dispatched
 *      from the wrong phase (stale UI events / double-taps).
 *   5. FINISH reachability: works from active/paused; a no-op
 *      elsewhere.
 *
 * When Run.tsx migrates from `useState<RunPhase>` + scattered
 * `setPhase` calls to `useReducer(runSessionReducer, ...)`, these
 * tests are the contract.
 */
import { describe, it, expect } from "vitest";
import {
  runSessionReducer,
  initialRunPhase,
  type RunPhase,
} from "../runSessionReducer";

describe("runSessionReducer — initial state", () => {
  it("exports an initial phase of 'waiting'", () => {
    expect(initialRunPhase).toBe("waiting");
  });
});

describe("runSessionReducer — START actions from waiting", () => {
  it("START_MANUAL: waiting → active (skips acquiring)", () => {
    expect(runSessionReducer("waiting", { type: "START_MANUAL" })).toBe(
      "active"
    );
  });

  it("START_GPS without a fix in hand: waiting → acquiring (Finding GPS)", () => {
    expect(
      runSessionReducer("waiting", { type: "START_GPS", fixInHand: false })
    ).toBe("acquiring");
  });

  it("START_GPS with a fix in hand: waiting → active (Run25 call 2)", () => {
    /* The run screen watched location before Start, and a good fix was
       there: the clock starts at the tap, with no waiting screen. */
    expect(
      runSessionReducer("waiting", { type: "START_GPS", fixInHand: true })
    ).toBe("active");
  });
});

describe("runSessionReducer — acquiring branches", () => {
  it("GPS_ACQUIRED: acquiring → active (the first good fix starts the clock)", () => {
    expect(runSessionReducer("acquiring", { type: "GPS_ACQUIRED" })).toBe(
      "active"
    );
  });

  it("START_ANYWAY: acquiring → active (the clock starts at the tap)", () => {
    expect(runSessionReducer("acquiring", { type: "START_ANYWAY" })).toBe(
      "active"
    );
  });

  it("MANUAL_FALLBACK: acquiring → active (15s+ no-lock escape hatch)", () => {
    /* "Track without GPS" or "On a treadmill" on the acquiring screen. */
    expect(runSessionReducer("acquiring", { type: "MANUAL_FALLBACK" })).toBe(
      "active"
    );
  });

  it("CANCEL_ACQUIRING: acquiring → waiting (re-opens setup modal)", () => {
    expect(runSessionReducer("acquiring", { type: "CANCEL_ACQUIRING" })).toBe(
      "waiting"
    );
  });
});

describe("runSessionReducer — pause / resume cycle", () => {
  it("PAUSE: active → paused", () => {
    expect(runSessionReducer("active", { type: "PAUSE" })).toBe("paused");
  });

  it("RESUME: paused → active", () => {
    expect(runSessionReducer("paused", { type: "RESUME" })).toBe("active");
  });

  it("multiple pause/resume cycles return to the right phase", () => {
    let state: RunPhase = "active";
    state = runSessionReducer(state, { type: "PAUSE" });
    state = runSessionReducer(state, { type: "RESUME" });
    state = runSessionReducer(state, { type: "PAUSE" });
    expect(state).toBe("paused");
  });
});

describe("runSessionReducer — FINISH from active / paused only", () => {
  /* The Finish control mounts in RunBottomSheet which only renders
     for active|paused. acquiring uses CANCEL_ACQUIRING to bail out;
     waiting has no run; finished is terminal. */
  it("FINISH from active → finished", () => {
    expect(runSessionReducer("active", { type: "FINISH" })).toBe("finished");
  });

  it("FINISH from paused → finished", () => {
    expect(runSessionReducer("paused", { type: "FINISH" })).toBe("finished");
  });

  it("FINISH is a no-op from waiting / acquiring / finished", () => {
    /* The Finish button doesn't exist on those screens, but the
       reducer guards in case a stale event slips through. */
    const phases: RunPhase[] = ["waiting", "acquiring", "finished"];
    for (const start of phases) {
      expect(runSessionReducer(start, { type: "FINISH" })).toBe(start);
    }
  });
});

describe("runSessionReducer — snapshot resume", () => {
  it("RESUME_SNAPSHOT to active: waiting → active", () => {
    expect(
      runSessionReducer("waiting", {
        type: "RESUME_SNAPSHOT",
        phase: "active",
      })
    ).toBe("active");
  });

  it("RESUME_SNAPSHOT to paused: waiting → paused", () => {
    /* A run that was paused at the moment the user backgrounded
       the tab restores paused — they continue with an explicit
       Resume tap. */
    expect(
      runSessionReducer("waiting", {
        type: "RESUME_SNAPSHOT",
        phase: "paused",
      })
    ).toBe("paused");
  });

  it("RESUME_SNAPSHOT is ignored from any non-waiting phase", () => {
    /* The chooser overlays the setup modal and only ever fires from
       initial mount. If a stray dispatch lands later, ignore it. */
    const phases: RunPhase[] = ["acquiring", "active", "paused", "finished"];
    for (const start of phases) {
      expect(
        runSessionReducer(start, {
          type: "RESUME_SNAPSHOT",
          phase: "active",
        })
      ).toBe(start);
    }
  });
});

describe("runSessionReducer — defensive guards", () => {
  it("START_GPS / START_MANUAL are ignored from non-waiting phases", () => {
    /* Double-tap defence: setup modal closes on first tap but the
       button could re-fire in some browsers before the close
       animation completes. */
    const phases: RunPhase[] = ["acquiring", "active", "paused", "finished"];
    for (const start of phases) {
      expect(
        runSessionReducer(start, { type: "START_GPS", fixInHand: false })
      ).toBe(start);
      expect(
        runSessionReducer(start, { type: "START_GPS", fixInHand: true })
      ).toBe(start);
      expect(runSessionReducer(start, { type: "START_MANUAL" })).toBe(start);
    }
  });

  it("GPS_ACQUIRED / START_ANYWAY / MANUAL_FALLBACK / CANCEL_ACQUIRING are ignored outside acquiring", () => {
    /* A good fix and a tap of Start anyway can land together: whichever
       comes second must not start the run a second time. */
    const phases: RunPhase[] = ["waiting", "active", "paused", "finished"];
    for (const start of phases) {
      expect(runSessionReducer(start, { type: "GPS_ACQUIRED" })).toBe(start);
      expect(runSessionReducer(start, { type: "START_ANYWAY" })).toBe(start);
      expect(runSessionReducer(start, { type: "MANUAL_FALLBACK" })).toBe(start);
      expect(runSessionReducer(start, { type: "CANCEL_ACQUIRING" })).toBe(
        start
      );
    }
  });

  it("PAUSE is ignored outside active (already paused, no run, finished)", () => {
    const phases: RunPhase[] = ["waiting", "acquiring", "paused", "finished"];
    for (const start of phases) {
      expect(runSessionReducer(start, { type: "PAUSE" })).toBe(start);
    }
  });

  it("RESUME is ignored outside paused", () => {
    const phases: RunPhase[] = ["waiting", "acquiring", "active", "finished"];
    for (const start of phases) {
      expect(runSessionReducer(start, { type: "RESUME" })).toBe(start);
    }
  });
});

describe("runSessionReducer — end-to-end sequences", () => {
  it("happy path: GPS run from cold start through finish", () => {
    let state: RunPhase = initialRunPhase;
    state = runSessionReducer(state, { type: "START_GPS", fixInHand: false });
    expect(state).toBe("acquiring");
    state = runSessionReducer(state, { type: "GPS_ACQUIRED" });
    expect(state).toBe("active");
    state = runSessionReducer(state, { type: "PAUSE" });
    expect(state).toBe("paused");
    state = runSessionReducer(state, { type: "RESUME" });
    expect(state).toBe("active");
    state = runSessionReducer(state, { type: "FINISH" });
    expect(state).toBe("finished");
  });

  it("treadmill path: no GPS, straight to active", () => {
    let state: RunPhase = initialRunPhase;
    state = runSessionReducer(state, { type: "START_MANUAL" });
    expect(state).toBe("active");
    state = runSessionReducer(state, { type: "FINISH" });
    expect(state).toBe("finished");
  });

  it("manual fallback path: started GPS, gave up after 15s, switched to manual", () => {
    let state: RunPhase = initialRunPhase;
    state = runSessionReducer(state, { type: "START_GPS", fixInHand: false });
    state = runSessionReducer(state, { type: "MANUAL_FALLBACK" });
    expect(state).toBe("active");
  });

  it("start anyway path: started GPS, no good fix, started the clock anyway", () => {
    let state: RunPhase = initialRunPhase;
    state = runSessionReducer(state, { type: "START_GPS", fixInHand: false });
    state = runSessionReducer(state, { type: "START_ANYWAY" });
    expect(state).toBe("active");
    // The good fix that lands after is not a second start.
    expect(runSessionReducer(state, { type: "GPS_ACQUIRED" })).toBe("active");
  });

  it("cancel-and-restart: user cancels acquiring, reopens setup, starts again", () => {
    let state: RunPhase = initialRunPhase;
    state = runSessionReducer(state, { type: "START_GPS", fixInHand: false });
    state = runSessionReducer(state, { type: "CANCEL_ACQUIRING" });
    expect(state).toBe("waiting");
    state = runSessionReducer(state, { type: "START_GPS", fixInHand: true });
    expect(state).toBe("active");
  });

  it("snapshot resume into paused, then user resumes and finishes", () => {
    let state: RunPhase = initialRunPhase;
    state = runSessionReducer(state, {
      type: "RESUME_SNAPSHOT",
      phase: "paused",
    });
    expect(state).toBe("paused");
    state = runSessionReducer(state, { type: "RESUME" });
    expect(state).toBe("active");
    state = runSessionReducer(state, { type: "FINISH" });
    expect(state).toBe("finished");
  });
});
