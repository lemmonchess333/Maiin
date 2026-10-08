/**
 * The live run's two clocks — the timer and the GPS trace — stopping and
 * starting together, through the real Run page with device I/O stubbed.
 *
 * The trace is held (useGPS `pause`) whenever the timer is stopped, so a
 * pause records no drift and stamps the next point with the time held;
 * that is what lets splits and best efforts count moving time, as the
 * run's duration does. These pin the page's half of that: which phases
 * hold, what a restored run backdates its hold to, and that a manual pause
 * over an auto-pause does not stop the timer a second time.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import Run from "../Run";
import {
  writeStoredRun,
  RUN_RESUME_SCHEMA_VERSION,
  type StoredRun,
} from "@/lib/runResumeStorage";
import { freeformPlanMetadata } from "@/lib/runPlanMetadata";
import type { GPSPoint } from "@/lib/gps";

const h = vi.hoisted(() => ({
  gps: {
    points: [] as GPSPoint[],
    currentPoint: null as GPSPoint | null,
    distance: 0,
  },
  gpsCalls: [] as string[],
  pauseSince: [] as (number | undefined)[],
  timer: { isRunning: false },
  timerPause: vi.fn(),
  timerResume: vi.fn(),
}));

/* Stable across renders, as the real hook's useCallbacks are: the page's
   hold effect lists them as dependencies. */
const gpsControls = {
  preWarm: () => {},
  start: () => h.gpsCalls.push("start"),
  stop: () => h.gpsCalls.push("stop"),
  pause: (since?: number) => {
    h.gpsCalls.push("pause");
    h.pauseSince.push(since);
  },
  resume: () => h.gpsCalls.push("resume"),
  getPoints: () => h.gps.points,
  getRejectedFixCount: () => 0,
  appendPoints: () => h.gpsCalls.push("appendPoints"),
};

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ profile: { uid: "recording-test", runMode: "freeform" } }),
  // The first-run hint's seen flags, and its run count (read only while
  // the hint is owed, which it never is here: no walk has been seen).
  useUidForStorageKey: () => "recording-test",
  useUid: () => "recording-test",
}));
vi.mock("@/features/program/useProgram", () => ({
  useProgram: () => ({ programState: null, loading: false }),
}));
vi.mock("@/hooks/useDistanceUnit", () => ({ useDistanceUnit: () => "mi" }));
vi.mock("@/hooks/useLastRunType", () => ({ useLastRunType: () => null }));
vi.mock("@/hooks/useGPS", () => ({
  useGPS: () => ({
    ...h.gps,
    isTracking: true,
    error: null,
    gpsAccuracy: 5,
    permissionState: "granted",
    signalQuality: "strong",
    lastFixAt: null,
    ...gpsControls,
  }),
}));
vi.mock("@/hooks/useRunTimer", () => ({
  useRunTimer: () => ({
    elapsed: 600,
    isRunning: h.timer.isRunning,
    start: () => {},
    pause: h.timerPause,
    resume: h.timerResume,
    reset: () => {},
    rehydrate: ({ isRunning }: { isRunning: boolean }) => {
      h.timer.isRunning = isRunning;
    },
    recalcNow: () => {},
    formatTime: () => "10:00",
    getAccumulatedSeconds: () => 600,
  }),
}));
vi.mock("@/hooks/useWakeLock", () => ({
  useWakeLock: () => ({ request: vi.fn(), release: vi.fn() }),
}));
vi.mock("@/hooks/useHeartRate", () => ({
  useHeartRate: () => ({ bpm: null }),
}));
vi.mock("@/hooks/useAudioCues", () => ({
  useAudioCues: () => ({
    prime: () => {},
    speak: () => {},
    checkDistanceCue: () => {},
    checkTimeCue: () => {},
    checkPaceAlert: () => {},
    checkHalfway: () => {},
    checkFinal500: () => {},
  }),
}));
vi.mock("@/hooks/useSessionPlayer", () => ({
  useSessionPlayer: () => ({
    state: { index: 0 },
    segments: [],
    current: null,
    workPortion: () => null,
  }),
}));
vi.mock("@/components/run/RunMapLazy", () => ({ default: () => null }));
vi.mock("@/components/run/RunTilePicker", () => ({
  default: ({ onPickType }: { onPickType: (type: string) => void }) => (
    <button onClick={() => onPickType("easy")}>Easy run</button>
  ),
}));
vi.mock("@/components/run/RunBottomSheet", () => ({
  default: ({
    onPause,
    onResume,
    onLock,
    onStop,
  }: {
    onPause: () => void;
    onResume: () => void;
    onLock: () => void;
    onStop: () => void;
  }) => (
    <>
      <button onClick={onPause}>Pause</button>
      <button onClick={onResume}>Carry on</button>
      <button onClick={onLock}>Lock</button>
      <button onClick={onStop}>Finish</button>
    </>
  ),
}));

const T0 = Date.parse("2026-10-04T08:00:00Z");

function point(metresNorth: number, timestamp: number): GPSPoint {
  const lat = 51.5 + metresNorth / 111_195;
  return {
    lat,
    lon: -0.12,
    altitude: null,
    accuracy: 5,
    speed: 3,
    timestamp,
    rawLat: lat,
    rawLon: -0.12,
  };
}

/** An interrupted outdoor run with auto-pause on, saved 2 s after its
 *  last fix. */
function saveInterruptedRun(phase: "active" | "paused") {
  const points = [point(0, T0 - 62_000), point(3, T0 - 61_000)];
  const snapshot: StoredRun = {
    v: RUN_RESUME_SCHEMA_VERSION,
    config: {
      activityType: "easy",
      autoPause: true,
      audioCues: true,
      audioCueFrequency: "every_km",
      paceAlerts: true,
      voiceRate: 0.9,
      displayStats: ["pace", "distance", "time"],
      target: { type: "none" },
      planMetadata: freeformPlanMetadata("freeform"),
    },
    startedAt: T0 - 700_000,
    lastWriteAt: T0 - 59_000,
    accumulatedSeconds: 600,
    isRunning: phase === "active",
    phase,
    points,
  };
  expect(writeStoredRun("recording-test", snapshot)).toBe(true);
  return snapshot;
}

/** Stands in for the finish screen: shows what the run handed it. */
function Summary() {
  const state = useLocation().state as {
    routeQuality: { gapCount: number; confidence: string } | null;
  };
  return (
    <p>
      {`gaps ${state.routeQuality?.gapCount} · ${state.routeQuality?.confidence}`}
    </p>
  );
}

function tree() {
  return (
    <MemoryRouter initialEntries={["/run"]}>
      <Routes>
        <Route path="/run" element={<Run />} />
        <Route path="/run-summary" element={<Summary />} />
      </Routes>
    </MemoryRouter>
  );
}

async function resumeFromSnapshot(phase: "active" | "paused") {
  const snapshot = saveInterruptedRun(phase);
  h.gps.points = snapshot.points;
  const view = render(tree());
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Resume run" }));
  });
  return { snapshot, view };
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({
    toFake: [
      "setTimeout",
      "clearTimeout",
      "setInterval",
      "clearInterval",
      "Date",
    ],
  });
  vi.setSystemTime(T0);
  h.gps.points = [];
  h.gps.currentPoint = null;
  h.gps.distance = 0;
  h.gpsCalls.length = 0;
  h.pauseSince.length = 0;
  h.timer.isRunning = false;
  h.timerPause.mockReset().mockImplementation(() => {
    h.timer.isRunning = false;
  });
  h.timerResume.mockReset().mockImplementation(() => {
    h.timer.isRunning = true;
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  localStorage.clear();
});

describe("the trace's clock follows the run's", () => {
  it("holds a restored moving run's trace from its last write, then releases it", async () => {
    /* Nothing was recorded while the app was gone, and the timer leaves
       that time out. The trace must too, from the same moment — or the
       line to the first new fix is timed as a minute of slow running. */
    const { snapshot } = await resumeFromSnapshot("active");
    expect(h.gpsCalls).toEqual(["appendPoints", "pause", "start", "resume"]);
    expect(h.pauseSince).toEqual([snapshot.lastWriteAt]);
  });

  it("keeps a restored paused run held from its last point until Resume", async () => {
    const { snapshot } = await resumeFromSnapshot("paused");
    expect(h.pauseSince[0]).toBe(snapshot.points[1].timestamp);
    expect(h.gpsCalls).not.toContain("resume");
    fireEvent.click(screen.getByRole("button", { name: "Carry on" }));
    expect(h.gpsCalls.slice(-2)).toEqual(["start", "resume"]);
  });

  it("holds the trace through the 3-2-1 countdown and releases it at Go", async () => {
    /* The first fix lands while acquiring and starts the countdown; the
       timer starts at Go. Fixes in between (a runner shuffling to the
       line) are not the run, and km 1 is not three seconds slower. */
    h.gps.points = [point(0, T0)];
    render(tree());
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Easy run" }));
    });
    expect(h.gpsCalls).toEqual(["start", "pause"]);
    // 3, 2, 1, Go — each second re-arms the next, so one step at a time.
    for (let tick = 0; tick < 2; tick++) {
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(h.gpsCalls).toEqual(["start", "pause"]);
    }
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(h.gpsCalls).toEqual(["start", "pause", "resume"]);
  });

  it("holds the trace for a pause and releases it on resume", async () => {
    await resumeFromSnapshot("active");
    h.gpsCalls.length = 0;
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(h.gpsCalls).toEqual(["stop", "pause"]);
    fireEvent.click(screen.getByRole("button", { name: "Carry on" }));
    expect(h.gpsCalls).toEqual(["stop", "pause", "start", "resume"]);
  });

  it("holds the trace for an auto-pause, and does not stop the timer twice when Pause is pressed during one", async () => {
    const { view } = await resumeFromSnapshot("active");
    expect(h.timer.isRunning).toBe(true);
    h.gpsCalls.length = 0;

    // Standing at a crossing: auto-pause stops the timer after 5 s.
    h.gps.currentPoint = { ...point(3, T0), speed: 0 };
    view.rerender(tree());
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(h.timerPause).toHaveBeenCalledTimes(1);
    expect(h.gpsCalls).toEqual(["pause"]);

    /* Pressing Pause now. `timer.pause()` banks the time since the last
       start and is not idempotent: a second call added all of it to the
       run's duration again. */
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(h.timerPause).toHaveBeenCalledTimes(1);

    // Resuming by hand ends the auto-pause with it: the trace records again.
    fireEvent.click(screen.getByRole("button", { name: "Carry on" }));
    expect(h.timerResume).toHaveBeenCalledTimes(1);
    expect(h.gpsCalls.slice(-2)).toEqual(["start", "resume"]);
  });
});

describe("the figures a pause must not move", () => {
  it("offers a restored run at the distance the run will resume with", async () => {
    /* Paused, given a lift 2 km up the road, and the app died after the
       next fix. The prompt and the resumed run count by one rule
       (totalDistance): the lift is not distance in either. */
    const snapshot = saveInterruptedRun("active");
    writeStoredRun("recording-test", {
      ...snapshot,
      points: [
        point(0, T0 - 700_000),
        { ...point(2000, T0 - 98_000), pausedMs: 600_000 },
      ],
    });
    render(tree());
    // 2 s of running either side of the hold, at most 12 m/s: 24 m, 0.01 mi.
    expect(screen.getByText("0.01 mi")).toBeInTheDocument();
  });

  it("does not read the stops on a run as gaps in its GPS", async () => {
    /* Two one-minute stops at crossings: nothing was recorded during
       either. On the wall clock those were two 61 s gaps between fixes —
       "patchy" for a run whose reception never faltered. */
    await resumeFromSnapshot("active");
    const run: GPSPoint[] = [];
    let t = T0;
    let held = 0;
    for (let i = 0; i < 30; i++) {
      if (i === 10 || i === 20) {
        t += 60_000;
        held += 60_000;
      }
      run.push({ ...point(i * 3, t), ...(held ? { pausedMs: held } : {}) });
      t += 1000;
    }
    h.gps.points = run;
    h.gps.distance = 87;
    fireEvent.click(screen.getByRole("button", { name: "Finish" }));
    expect(screen.getByText("gaps 0 · good")).toBeInTheDocument();
  });
});

describe("the lock screen", () => {
  it("shows the distance in the runner's unit", async () => {
    // It said "km" over a kilometre figure to a runner who reads miles.
    h.gps.distance = 1609.344 * 2.5;
    await resumeFromSnapshot("active");
    fireEvent.click(screen.getByRole("button", { name: "Lock" }));
    expect(screen.getByText("2.50 mi")).toBeInTheDocument();
    expect(screen.queryByText(/km/)).toBeNull();
  });
});
