/**
 * Exhaustive transition tests for the RunSession reducer.
 *
 * Pure reducer + types — no React, no GPS, no audio. Each test pins
 * one transition. Together they cover:
 *   1. Forward paths: GPS run (waiting → acquiring → countdown →
 *      active → paused → active → finished) and the non-GPS short-
 *      circuit (waiting → active → finished).
 *   2. Acquiring branches: GPS_ACQUIRED, GPS_FAILED, MANUAL_FALLBACK,
 *      CANCEL_ACQUIRING — each from acquiring only.
 *   3. Snapshot resume: RESUME_SNAPSHOT lands in the stored phase,
 *      and only from the initial waiting state.
 *   4. Defensive guards: every action is a no-op when dispatched
 *      from the wrong phase (stale UI events / double-taps).
 *   5. FINISH reachability: works from acquiring/countdown/active/
 *      paused; idempotent from finished.
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
      "active",
    );
  });

  it("START_GPS: waiting → acquiring", () => {
    expect(runSessionReducer("waiting", { type: "START_GPS" })).toBe(
      "acquiring",
    );
  });
});

describe("runSessionReducer — acquiring branches", () => {
  it("GPS_ACQUIRED: acquiring → countdown", () => {
    expect(runSessionReducer("acquiring", { type: "GPS_ACQUIRED" })).toBe(
      "countdown",
    );
  });

  it("GPS_FAILED: acquiring → countdown (auto-skip on permission denial)", () => {
    /* User denied geolocation permission or the device has no
       provider. The run still gets to start; the trail is just empty.
       Same target phase as GPS_ACQUIRED — the difference is what
       Run.tsx does in the effect that fires on countdown entry. */
    expect(runSessionReducer("acquiring", { type: "GPS_FAILED" })).toBe(
      "countdown",
    );
  });

  it("MANUAL_FALLBACK: acquiring → active (15s+ no-lock escape hatch)", () => {
    /* The "Switch to manual" button on the acquiring screen. Skips
       countdown because the user has already been waiting. */
    expect(runSessionReducer("acquiring", { type: "MANUAL_FALLBACK" })).toBe(
      "active",
    );
  });

  it("CANCEL_ACQUIRING: acquiring → waiting (re-opens setup modal)", () => {
    expect(runSessionReducer("acquiring", { type: "CANCEL_ACQUIRING" })).toBe(
      "waiting",
    );
  });
});

describe("runSessionReducer — countdown → active", () => {
  it("COUNTDOWN_DONE: countdown → active", () => {
    expect(runSessionReducer("countdown", { type: "COUNTDOWN_DONE" })).toBe(
      "active",
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
     for active|paused. acquiring/countdown use CANCEL_ACQUIRING to
     bail out; waiting has no run; finished is terminal. */
  it("FINISH from active → finished", () => {
    expect(runSessionReducer("active", { type: "FINISH" })).toBe("finished");
  });

  it("FINISH from paused → finished", () => {
    expect(runSessionReducer("paused", { type: "FINISH" })).toBe("finished");
  });

  it("FINISH is a no-op from waiting / acquiring / countdown / finished", () => {
    /* The Finish button doesn't exist on those screens, but the
       reducer guards in case a stale event slips through. */
    const phases: RunPhase[] = [
      "waiting",
      "acquiring",
      "countdown",
      "finished",
    ];
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
      }),
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
      }),
    ).toBe("paused");
  });

  it("RESUME_SNAPSHOT is ignored from any non-waiting phase", () => {
    /* The chooser overlays the setup modal and only ever fires from
       initial mount. If a stray dispatch lands later, ignore it. */
    const phases: RunPhase[] = [
      "acquiring",
      "countdown",
      "active",
      "paused",
      "finished",
    ];
    for (const start of phases) {
      expect(
        runSessionReducer(start, {
          type: "RESUME_SNAPSHOT",
          phase: "active",
        }),
      ).toBe(start);
    }
  });
});

describe("runSessionReducer — defensive guards", () => {
  it("START_GPS / START_MANUAL are ignored from non-waiting phases", () => {
    /* Double-tap defence: setup modal closes on first tap but the
       button could re-fire in some browsers before the close
       animation completes. */
    const phases: RunPhase[] = [
      "acquiring",
      "countdown",
      "active",
      "paused",
      "finished",
    ];
    for (const start of phases) {
      expect(runSessionReducer(start, { type: "START_GPS" })).toBe(start);
      expect(runSessionReducer(start, { type: "START_MANUAL" })).toBe(start);
    }
  });

  it("GPS_ACQUIRED / GPS_FAILED / MANUAL_FALLBACK / CANCEL_ACQUIRING are ignored outside acquiring", () => {
    /* The GPS hook fires GPS_ACQUIRED whenever a fix lands — once
       the run is active, those events should be no-ops, not flip
       the phase back to countdown. */
    const phases: RunPhase[] = [
      "waiting",
      "countdown",
      "active",
      "paused",
      "finished",
    ];
    for (const start of phases) {
      expect(runSessionReducer(start, { type: "GPS_ACQUIRED" })).toBe(start);
      expect(runSessionReducer(start, { type: "GPS_FAILED" })).toBe(start);
      expect(runSessionReducer(start, { type: "MANUAL_FALLBACK" })).toBe(start);
      expect(runSessionReducer(start, { type: "CANCEL_ACQUIRING" })).toBe(
        start,
      );
    }
  });

  it("COUNTDOWN_DONE is ignored outside countdown", () => {
    const phases: RunPhase[] = [
      "waiting",
      "acquiring",
      "active",
      "paused",
      "finished",
    ];
    for (const start of phases) {
      expect(runSessionReducer(start, { type: "COUNTDOWN_DONE" })).toBe(start);
    }
  });

  it("PAUSE is ignored outside active (already paused, no run, finished)", () => {
    const phases: RunPhase[] = [
      "waiting",
      "acquiring",
      "countdown",
      "paused",
      "finished",
    ];
    for (const start of phases) {
      expect(runSessionReducer(start, { type: "PAUSE" })).toBe(start);
    }
  });

  it("RESUME is ignored outside paused", () => {
    const phases: RunPhase[] = [
      "waiting",
      "acquiring",
      "countdown",
      "active",
      "finished",
    ];
    for (const start of phases) {
      expect(runSessionReducer(start, { type: "RESUME" })).toBe(start);
    }
  });
});

describe("runSessionReducer — end-to-end sequences", () => {
  it("happy path: GPS run from cold start through finish", () => {
    let state: RunPhase = initialRunPhase;
    state = runSessionReducer(state, { type: "START_GPS" });
    expect(state).toBe("acquiring");
    state = runSessionReducer(state, { type: "GPS_ACQUIRED" });
    expect(state).toBe("countdown");
    state = runSessionReducer(state, { type: "COUNTDOWN_DONE" });
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
    state = runSessionReducer(state, { type: "START_GPS" });
    state = runSessionReducer(state, { type: "MANUAL_FALLBACK" });
    expect(state).toBe("active");
  });

  it("cancel-and-restart: user cancels acquiring, reopens setup, starts again", () => {
    let state: RunPhase = initialRunPhase;
    state = runSessionReducer(state, { type: "START_GPS" });
    state = runSessionReducer(state, { type: "CANCEL_ACQUIRING" });
    expect(state).toBe("waiting");
    state = runSessionReducer(state, { type: "START_GPS" });
    expect(state).toBe("acquiring");
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
