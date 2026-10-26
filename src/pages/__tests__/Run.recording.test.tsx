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
import { restoreRealTimers } from "@/test/fakeTimers";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import Run from "../Run";
import {
  writeStoredRun,
  readStoredRun,
  runResumeKey,
  RUN_RESUME_SCHEMA_VERSION,
  type StoredRun,
} from "@/lib/runResumeStorage";
import { freeformPlanMetadata } from "@/lib/runPlanMetadata";
import {
  segmentsFromRunWalk,
  segmentsFromIntervals,
  type SessionSegment,
} from "@/lib/runSegments";
import { sessionPlayerSignature } from "@/lib/sessionPlayerCheckpoint";
import { requiresManualDistance } from "@/lib/runGuards";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import type { GPSPoint } from "@/lib/gps";

const h = vi.hoisted(() => ({
  gps: {
    points: [] as GPSPoint[],
    currentPoint: null as GPSPoint | null,
    distance: 0,
    error: null as string | null,
    permissionState: "granted" as PermissionState,
  },
  gpsCalls: [] as string[],
  pauseSince: [] as (number | undefined)[],
  timer: { isRunning: false, elapsed: 600 },
  unit: "mi" as "km" | "mi",
  timerPause: vi.fn(),
  timerResume: vi.fn(),
  timerStart: vi.fn(),
  distanceCue: vi.fn(),
  timeCue: vi.fn(),
  speak: vi.fn(),
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
vi.mock("@/hooks/useDistanceUnit", () => ({ useDistanceUnit: () => h.unit }));
vi.mock("@/lib/weather", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/weather")>()),
  getCurrentWeather: vi.fn(async () => null),
}));
vi.mock("@/components/run/ShoeSelector", () => ({ default: () => null }));
// Route storage/privacy I/O is unrelated to these setup and coaching flows.
vi.mock("@/components/run/RouteSetupSection", () => ({ default: () => null }));
vi.mock("@/hooks/useLastRunType", () => ({ useLastRunType: () => null }));
vi.mock("@/hooks/useGPS", () => ({
  useGPS: () => ({
    ...h.gps,
    isTracking: true,
    error: h.gps.error,
    gpsAccuracy: 5,
    permissionState: h.gps.permissionState,
    signalQuality: "strong",
    lastFixAt: null,
    ...gpsControls,
  }),
}));
vi.mock("@/hooks/useRunTimer", () => ({
  useRunTimer: () => ({
    elapsed: h.timer.elapsed,
    isRunning: h.timer.isRunning,
    start: h.timerStart,
    pause: h.timerPause,
    resume: h.timerResume,
    reset: () => {},
    rehydrate: ({ isRunning }: { isRunning: boolean }) => {
      h.timer.isRunning = isRunning;
    },
    recalcNow: () => {},
    formatTime: () => "10:00",
    getAccumulatedSeconds: () => h.timer.elapsed,
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
    speak: h.speak,
    checkDistanceCue: h.distanceCue,
    checkTimeCue: h.timeCue,
    checkPaceAlert: () => {},
    checkHalfway: () => {},
    checkFinal500: () => {},
  }),
}));
vi.mock("@/components/run/RunMapLazy", () => ({ default: () => null }));
vi.mock("@/components/run/RunTilePicker", () => ({
  default: ({
    onPickType,
    onMoreOptions,
  }: {
    onPickType: (type: string) => void;
    onMoreOptions: () => void;
  }) => (
    <>
      <button onClick={() => onPickType("easy")}>Easy run</button>
      <button onClick={onMoreOptions}>More options</button>
    </>
  ),
}));
vi.mock("@/components/run/RunBottomSheet", () => ({
  default: ({
    onPause,
    onResume,
    onLock,
    onStop,
    intervalDisplay,
    isPaused,
  }: {
    onPause: () => void;
    onResume: () => void;
    onLock: () => void;
    onStop: () => void;
    intervalDisplay?: import("react").ReactNode;
    isPaused: boolean;
  }) => (
    <>
      {intervalDisplay}
      {isPaused ? (
        <button onClick={onResume}>Carry on</button>
      ) : (
        <button onClick={onPause}>Pause</button>
      )}
      <button onClick={onLock}>Lock</button>
      <button onClick={onStop}>Finish</button>
    </>
  ),
}));

const T0 = Date.parse("2026-10-04T08:00:00Z");

/** A figure and its unit are two faces in one line (the unit is the text
 *  face), so a line like "2.50 mi" is matched whole, not as one text node. */
const figureLine = (text: string) => (_: string, el: Element | null) =>
  el?.tagName === "P" && el.textContent === text;

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
function saveInterruptedRun(
  phase: "active" | "paused",
  config: Partial<StoredRun["config"]> = {}
) {
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
      ...config,
    },
    startedAt: T0 - 700_000,
    lastWriteAt: T0 - 59_000,
    accumulatedSeconds: 600,
    isRunning: phase === "active",
    phase,
    points,
  };
  // These fixtures exercise the real player, not the legacy fallback.
  // Legacy/invalid coaching checkpoints have their own explicit cases below.
  const segments = snapshot.config.segments?.length
    ? snapshot.config.segments
    : snapshot.config.activityType === "intervals" && snapshot.config.intervals
      ? segmentsFromIntervals(snapshot.config.intervals, h.unit)
      : null;
  if (segments) {
    snapshot.playerCheckpoint = {
      version: 1,
      signature: sessionPlayerSignature(
        segments,
        requiresManualDistance(snapshot.config) ? "manual" : "gps"
      ),
      index: 0,
      segmentStarts: [{ elapsed: 0, distance: 0 }],
    };
  }
  expect(writeStoredRun("recording-test", snapshot)).toBe(true);
  return snapshot;
}

/** Stands in for the finish screen: shows what the run handed it. */
function Summary() {
  const state = useLocation().state as {
    routeQuality: { gapCount: number; confidence: string } | null;
    distance: number;
    points: GPSPoint[];
    workPortion: { seconds: number; meters: number } | null;
    runConfig: { activityType: string; segments?: unknown[] };
  };
  return (
    <>
      <p>{`gaps ${state.routeQuality?.gapCount} · ${state.routeQuality?.confidence}`}</p>
      <output data-testid="finish-payload">{JSON.stringify(state)}</output>
    </>
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

async function resumeFromSnapshot(
  phase: "active" | "paused",
  config: Partial<StoredRun["config"]> = {}
) {
  const snapshot = saveInterruptedRun(phase, config);
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
  h.gps.error = null;
  h.gps.permissionState = "granted";
  h.gpsCalls.length = 0;
  h.pauseSince.length = 0;
  h.timer.isRunning = false;
  h.timer.elapsed = 600;
  h.unit = "mi";
  h.timerPause.mockReset().mockImplementation(() => {
    h.timer.isRunning = false;
  });
  h.timerResume.mockReset().mockImplementation(() => {
    h.timer.isRunning = true;
  });
  h.timerStart.mockReset().mockImplementation(() => {
    h.timer.isRunning = true;
  });
  h.distanceCue.mockReset();
  h.timeCue.mockReset();
  h.speak.mockReset();
});
afterEach(async () => {
  await restoreRealTimers();
  cleanup();
  localStorage.clear();
});

describe("recovering coaching and checkpoint durability", () => {
  const segments: SessionSegment[] = [
    {
      type: "warmup",
      label: "Warm-up",
      instruction: "Warm up",
      target: { kind: "duration", seconds: 60 },
    },
    {
      type: "hard",
      label: "Rep one",
      instruction: "Run",
      cue: "First rep",
      target: { kind: "distance", meters: 400 },
      rep: 1,
      totalReps: 3,
    },
    {
      type: "recovery",
      label: "Recovery one",
      instruction: "Recover",
      target: { kind: "duration", seconds: 30 },
    },
    {
      type: "hard",
      label: "Rep two",
      instruction: "Run",
      cue: "Second rep",
      target: { kind: "distance", meters: 400 },
      rep: 2,
      totalReps: 3,
    },
    {
      type: "recovery",
      label: "Recovery two",
      instruction: "Recover",
      cue: "Second recovery",
      target: { kind: "duration", seconds: 30 },
    },
    {
      type: "hard",
      label: "Rep three",
      instruction: "Run",
      cue: "Third rep",
      target: { kind: "distance", meters: 400 },
      rep: 3,
      totalReps: 3,
    },
    {
      type: "cooldown",
      label: "Cool-down",
      instruction: "Cool down",
      target: { kind: "duration", seconds: 60 },
    },
  ];

  it.each(["active", "paused"] as const)(
    "restores the second recovery, work accounting and cues after a real %s remount",
    async (savedPhase) => {
      const seed = saveInterruptedRun("active", {
        activityType: "intervals",
        autoPause: false,
        segments,
      });
      expect(
        writeStoredRun("recording-test", {
          ...seed,
          accumulatedSeconds: 0,
          points: [point(0, T0)],
          lastWriteAt: T0,
        })
      ).toBe(true);
      h.timer.elapsed = 0;
      h.gps.points = [point(0, T0)];
      const view = render(tree());
      await act(async () =>
        fireEvent.click(screen.getByRole("button", { name: "Resume run" }))
      );
      expect(
        screen.getByText("Warm-up", { selector: "p.text-lg.font-bold" })
      ).toBeInTheDocument();
      for (const [elapsed, metres] of [
        [60, 200],
        [180, 600],
        [210, 650],
        [330, 1050],
        [345, 1100],
      ]) {
        vi.setSystemTime(T0 + elapsed * 1000);
        h.timer.elapsed = elapsed;
        h.gps.distance = metres;
        h.gps.points = [point(0, T0), point(metres, T0 + elapsed * 1000)];
        view.rerender(tree());
      }
      expect(
        screen.getByText("Recovery two", { selector: "p.text-lg.font-bold" })
      ).toBeInTheDocument();
      expect(screen.getByText("0:15")).toBeInTheDocument();
      if (savedPhase === "paused")
        fireEvent.click(screen.getByRole("button", { name: "Pause" }));
      const saved = readStoredRun("recording-test")!;
      expect(saved.playerCheckpoint?.index).toBe(4);
      expect(saved.accumulatedSeconds).toBe(345);
      const spokenBefore = h.speak.mock.calls.length;
      view.unmount();
      const restoredView = render(tree());
      await act(async () =>
        fireEvent.click(screen.getByRole("button", { name: "Resume run" }))
      );
      expect(
        screen.getByText("Recovery two", { selector: "p.text-lg.font-bold" })
      ).toBeInTheDocument();
      expect(screen.getByText("0:15")).toBeInTheDocument();
      expect(h.speak).toHaveBeenCalledTimes(spokenBefore);
      expect(h.timer.isRunning).toBe(savedPhase === "active");
      if (savedPhase === "paused")
        fireEvent.click(screen.getByRole("button", { name: "Carry on" }));
      h.timer.elapsed = 360;
      h.gps.distance = 1150;
      restoredView.rerender(tree());
      expect(
        screen.getByText("Rep three", { selector: "p.text-lg.font-bold" })
      ).toBeInTheDocument();
      expect(
        h.speak.mock.calls.filter(([cue]) => cue === "Third rep")
      ).toHaveLength(1);
      fireEvent.click(screen.getByRole("button", { name: "Finish" }));
      const payload = JSON.parse(
        screen.getByTestId("finish-payload").textContent!
      );
      expect(payload.workPortion).toEqual({ seconds: 240, meters: 800 });
      expect(payload.runConfig.activityType).toBe("intervals");
    }
  );

  it.each(["legacy", "invalid", "mismatched"] as const)(
    "offers an honest uncoached continuation for a %s planned snapshot",
    async (kind) => {
      const template = RUN_TEMPLATES.find((t) => t.type === "tempo")!;
      const seed = saveInterruptedRun("active", {
        activityType: "tempo",
        autoPause: false,
        segments,
        target: { type: "pace", value: 300 },
        planMetadata: {
          ...freeformPlanMetadata("race_prep"),
          scheduledRunId: "original-planned-slot",
          plannedTemplateId: template.id,
          plannedTemplateType: "tempo",
          actualTemplateId: template.id,
          matchedPlanExact: true,
          matchedPlanType: true,
        },
      });
      const checkpoint =
        kind === "legacy"
          ? undefined
          : kind === "invalid"
            ? null
            : { ...seed.playerCheckpoint!, signature: "changed structure" };
      expect(
        writeStoredRun("recording-test", {
          ...seed,
          playerCheckpoint: checkpoint,
        })
      ).toBe(true);
      h.gps.points = seed.points;
      render(tree());
      expect(
        screen.getByText(/Session guidance couldn't be restored/)
      ).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Resume run" })).toBeNull();
      await act(async () =>
        fireEvent.click(
          screen.getByRole("button", { name: "Continue without coaching" })
        )
      );
      expect(
        screen.getByText(/Continuing without coaching/)
      ).toBeInTheDocument();
      expect(
        document.querySelector("p.text-lg.font-bold.leading-tight")
      ).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Finish" }));
      const payload = JSON.parse(
        screen.getByTestId("finish-payload").textContent!
      );
      expect(payload.points).toEqual(seed.points);
      expect(payload.workPortion).toBeNull();
      expect(payload.runConfig.activityType).toBe("freerun");
      expect(payload.runConfig.target).toEqual({ type: "none" });
      expect(payload.runConfig.paceAlerts).toBe(false);
      expect(payload.runConfig.segments).toBeUndefined();
      expect(payload.runConfig.planMetadata).toMatchObject({
        scheduledRunId: "original-planned-slot",
        plannedTemplateId: template.id,
        actualTemplateId: null,
        matchedPlanExact: false,
        matchedPlanType: false,
      });
    }
  );

  it.each([
    { activityType: "intervals" as const, place: "treadmill" as const },
    {
      activityType:
        "treadmill" as unknown as StoredRun["config"]["activityType"],
    },
    { activityType: "manual" as const },
  ])(
    "keeps non-GPS input on an uncoached legacy continuation: %j",
    async (mode) => {
      const seed = saveInterruptedRun("active", {
        ...mode,
        segments,
        autoPause: false,
      });
      expect(
        writeStoredRun("recording-test", {
          ...seed,
          playerCheckpoint: undefined,
          points: [],
        })
      ).toBe(true);
      render(tree());
      await act(async () =>
        fireEvent.click(
          screen.getByRole("button", { name: "Continue without coaching" })
        )
      );
      const manual = mode.activityType === "manual";
      expect(
        screen.getByRole("textbox", {
          name: manual ? "Distance covered" : "Distance from treadmill",
        })
      ).toBeInTheDocument();
      expect(h.gpsCalls).not.toContain("start");
      expect(
        screen.getByRole("button", { name: "Pause run" })
      ).toBeInTheDocument();
    }
  );

  it.each([
    { activityType: "easy", locked: false },
    { activityType: "manual", locked: false },
    { activityType: "easy", locked: true },
  ] as const)(
    "reports refused checkpoint writes and clears after a real successful write: %j",
    async ({ activityType, locked }) => {
      const { view } = await resumeFromSnapshot("active", {
        activityType,
        autoPause: false,
      });
      if (locked) fireEvent.click(screen.getByRole("button", { name: "Lock" }));
      const before = readStoredRun("recording-test")!;
      const originalSet = Storage.prototype.setItem;
      const refused = vi
        .spyOn(Storage.prototype, "setItem")
        .mockImplementation(function (this: Storage, key, value) {
          if (key.startsWith(runResumeKey("recording-test")))
            throw new DOMException("quota", "QuotaExceededError");
          return originalSet.call(this, key, value);
        });
      try {
        h.timer.elapsed = 900;
        view.rerender(tree());
        const notice = screen.getByText(
          /Latest progress couldn't be saved for recovery/
        );
        expect(notice.closest('[role="status"]')).not.toBeNull();
        if (locked)
          expect(
            screen.getByRole("button", { name: "Unlock run controls" })
          ).toBeInTheDocument();
        expect(readStoredRun("recording-test")?.accumulatedSeconds).toBe(
          before.accumulatedSeconds
        );
        const attempts = refused.mock.calls.length;
        expect(attempts).toBeLessThan(10);
        refused.mockRestore();
        h.timer.elapsed = 901;
        view.rerender(tree());
        expect(
          screen.queryByText(/Latest progress couldn't be saved for recovery/)
        ).toBeNull();
        expect(readStoredRun("recording-test")?.accumulatedSeconds).toBe(901);
        if (locked) {
          fireEvent.click(
            screen.getByRole("button", { name: "Unlock run controls" }),
            { detail: 0 }
          );
          expect(
            screen.getByRole("button", { name: "Finish" })
          ).toBeInTheDocument();
        }
      } finally {
        refused.mockRestore();
      }
    }
  );
});

describe("a structured run's real player", () => {
  it("settles between timer ticks instead of repeatedly rendering", async () => {
    const originalError = console.error;
    const errors = vi.spyOn(console, "error").mockImplementation((...args) => {
      // Stop a regression safely instead of allowing an infinite effect loop.
      if (String(args[0]).includes("Maximum update depth exceeded")) {
        throw new Error("Structured run exceeded React's update depth");
      }
      originalError(...args);
    });
    try {
      await resumeFromSnapshot("active", {
        segments: [
          {
            type: "easy",
            label: "Easy",
            instruction: "Run at an easy pace",
            target: { kind: "duration", seconds: 1200 },
          },
        ],
      });
      expect(
        screen.getByRole("button", { name: "Finish" })
      ).toBeInTheDocument();
      expect(
        errors.mock.calls.some(([message]) =>
          String(message).includes("Maximum update depth exceeded")
        )
      ).toBe(false);
    } finally {
      errors.mockRestore();
    }
  });
});

describe("GPS acquisition recovery", () => {
  it.each([
    ["Permission denied", "denied"],
    ["Position unavailable", "granted"],
    ["Geolocation not supported", "granted"],
  ] as const)(
    "keeps %s recoverable until the runner chooses manual tracking",
    async (error, permission) => {
      h.gps.error = error;
      h.gps.permissionState = permission;
      render(tree());
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Easy run" }));
      });
      expect(h.timerStart).not.toHaveBeenCalled();
      expect(screen.queryByRole("button", { name: "Finish" })).toBeNull();
      const manual = screen.getByRole("button", { name: "Track without GPS" });
      act(() => vi.advanceTimersByTime(3000));
      expect(h.timerStart).not.toHaveBeenCalled();
      fireEvent.click(manual);
      expect(h.timerStart).toHaveBeenCalledOnce();
      expect(
        screen.getByRole("textbox", { name: "Distance covered" })
      ).toBeInTheDocument();
    }
  );

  it("still offers manual tracking after a silent 15-second wait", async () => {
    render(tree());
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Easy run" }));
    });
    expect(
      screen.queryByRole("button", { name: "Track without GPS" })
    ).toBeNull();
    act(() => vi.advanceTimersByTime(15000));
    expect(
      screen.getByRole("button", { name: "Track without GPS" })
    ).toBeInTheDocument();
    expect(h.timerStart).not.toHaveBeenCalled();
  });

  it("can acquire a later fix and start normally after an error", async () => {
    h.gps.error = "Position unavailable";
    const view = render(tree());
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Easy run" }));
    });
    expect(h.timerStart).not.toHaveBeenCalled();
    h.gps.error = null;
    h.gps.points = [point(0, T0)];
    view.rerender(tree());
    for (let tick = 0; tick < 3; tick++) {
      act(() => vi.advanceTimersByTime(1000));
    }
    expect(h.timerStart).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Finish" })).toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: "Distance covered" })
    ).toBeNull();
  });
});

/* Run20 (5): a run-walk's pace is an average over its runs and its walks,
   which is no one's running pace, and each step speaks its own line. A
   split or a time cue read that pace out, and cut off the step's line. */
describe("a run-walk's announcements", () => {
  it("leave out the splits and the times", async () => {
    const runWalk = RUN_TEMPLATES.find((t) => t.id === "run_walk_1")!;
    await resumeFromSnapshot("active", {
      target: { type: "time", value: 29 * 60 },
      segments: segmentsFromRunWalk(runWalk.config.runWalk!),
      planMetadata: {
        ...freeformPlanMetadata("freeform"),
        planSource: "url_template",
        actualTemplateId: "run_walk_1",
      },
    });
    expect(h.distanceCue).not.toHaveBeenCalled();
    expect(h.timeCue).not.toHaveBeenCalled();
  });

  it("leave them out when the run type was changed and the steps still play", async () => {
    // Free run picked on a run-walk day: the run-walk's steps stay, the
    // started template is cleared, and the plan's is the run-walk (review
    // of #2655).
    const runWalk = RUN_TEMPLATES.find((t) => t.id === "run_walk_1")!;
    await resumeFromSnapshot("active", {
      activityType: "freerun",
      segments: segmentsFromRunWalk(runWalk.config.runWalk!),
      planMetadata: {
        ...freeformPlanMetadata("race_prep"),
        planSource: "today_plan",
        plannedTemplateId: "run_walk_1",
        plannedTemplateType: "easy",
        actualTemplateId: null,
      },
    });
    expect(h.distanceCue).not.toHaveBeenCalled();
    expect(h.timeCue).not.toHaveBeenCalled();
  });

  it("are an easy run's as before", async () => {
    await resumeFromSnapshot("active");
    expect(h.distanceCue).toHaveBeenCalled();
    expect(h.timeCue).toHaveBeenCalled();
  });
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

  it("restores an actual auto-paused snapshot as paused until an explicit Resume", async () => {
    const { view } = await resumeFromSnapshot("active");
    h.gps.currentPoint = { ...point(3, T0), speed: 0 };
    view.rerender(tree());
    act(() => vi.advanceTimersByTime(5000));
    expect(
      screen.getByText(/Auto-paused · start moving to resume/)
    ).toBeInTheDocument();
    expect(h.timer.isRunning).toBe(false);
    expect(readStoredRun("recording-test")).toMatchObject({
      phase: "active",
      isRunning: false,
    });

    view.unmount();
    h.gps.currentPoint = null;
    h.gpsCalls.length = 0;
    const restoredView = render(tree());
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Resume run" }))
    );
    expect(h.timer.isRunning).toBe(false);
    expect(h.gpsCalls).not.toContain("start");
    expect(h.gpsCalls).not.toContain("resume");
    expect(
      screen.getByRole("button", { name: "Carry on" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pause" })).toBeNull();
    expect(readStoredRun("recording-test")).toMatchObject({
      phase: "paused",
      isRunning: false,
    });

    // A new moving fix must not silently restart a run restored as paused.
    h.gps.currentPoint = { ...point(3, T0), speed: 3 };
    restoredView.rerender(tree());
    expect(h.timer.isRunning).toBe(false);
    expect(h.gpsCalls).not.toContain("resume");
    fireEvent.click(screen.getByRole("button", { name: "Carry on" }));
    expect(h.timerResume).toHaveBeenCalledOnce();
    expect(h.timer.isRunning).toBe(true);
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
    expect(screen.getByText(figureLine("0.01 mi"))).toBeInTheDocument();
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
  it("offers a focused keyboard unlock without accepting a single pointer tap", async () => {
    await resumeFromSnapshot("active");
    fireEvent.click(screen.getByRole("button", { name: "Lock" }));
    const unlock = screen.getByRole("button", { name: "Unlock run controls" });
    expect(unlock).toHaveFocus();
    fireEvent.click(unlock, { detail: 1 });
    expect(screen.getByText("Double-tap to unlock")).toBeInTheDocument();
    // Keyboard and assistive-technology button activation have detail zero.
    fireEvent.click(unlock, { detail: 0 });
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
  });

  it("keeps the existing double-tap unlock gesture", async () => {
    await resumeFromSnapshot("active");
    fireEvent.click(screen.getByRole("button", { name: "Lock" }));
    fireEvent.doubleClick(screen.getByText("Double-tap to unlock"));
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
  });

  it("shows the distance in the runner's unit", async () => {
    // It said "km" over a kilometre figure to a runner who reads miles.
    h.gps.distance = 1609.344 * 2.5;
    await resumeFromSnapshot("active");
    fireEvent.click(screen.getByRole("button", { name: "Lock" }));
    expect(screen.getByText(figureLine("2.50 mi"))).toBeInTheDocument();
    expect(screen.queryByText(/km/)).toBeNull();
  });
});

describe("interrupted manual distance entry", () => {
  it.each([
    { mode: "treadmill", phase: "active" },
    { mode: "manual", phase: "paused" },
  ] as const)(
    "retains exact typed miles and their unit after a real remount: %j",
    async ({ mode, phase }) => {
      h.unit = "mi";
      const config =
        mode === "manual"
          ? { activityType: "manual" as const }
          : { activityType: "long" as const, place: "treadmill" as const };
      const seed = saveInterruptedRun(phase, config);
      expect(writeStoredRun("recording-test", { ...seed, points: [] })).toBe(
        true
      );
      const view = render(tree());
      await act(async () =>
        fireEvent.click(screen.getByRole("button", { name: "Resume run" }))
      );
      const label =
        mode === "manual" ? "Distance covered" : "Distance from treadmill";
      const input = screen.getByLabelText(label) as HTMLInputElement;
      act(() => {
        fireEvent.change(input, { target: { value: "3.10" } });
        // Before the outer act commits the render/effects, the keystroke is durable.
        expect(readStoredRun("recording-test")?.manualDistanceDraft).toEqual({
          version: 1,
          raw: "3.10",
          unit: "mi",
        });
      });
      expect(input.value).toBe("3.10");
      expect(readStoredRun("recording-test")?.manualDistanceDraft).toEqual({
        version: 1,
        raw: "3.10",
        unit: "mi",
      });
      expect(
        document.getElementById("treadmill-distance-unit")
      ).toHaveTextContent("mi");
      view.unmount();
      h.unit = "km";
      render(tree());
      await act(async () =>
        fireEvent.click(screen.getByRole("button", { name: "Resume run" }))
      );
      expect((screen.getByLabelText(label) as HTMLInputElement).value).toBe(
        "3.10"
      );
      expect(
        document.getElementById("treadmill-distance-unit")
      ).toHaveTextContent("mi");
      expect(h.timer.isRunning).toBe(phase === "active");
      expect(h.gpsCalls).not.toContain("start");
      fireEvent.click(
        screen.getByRole("button", {
          name: mode === "manual" ? "Save manual run" : "Save treadmill run",
        })
      );
      const payload = JSON.parse(
        screen.getByTestId("finish-payload").textContent!
      );
      expect(payload.distance).toBeCloseTo(4988.9664, 6);
      expect(payload.points).toEqual([]);
      expect(payload.workPortion).toBeNull();
      // The first Save only navigates; recovery survives until durable acceptance.
      expect(readStoredRun("recording-test")?.manualDistanceDraft?.raw).toBe(
        "3.10"
      );
    }
  );

  it.each(["3.", "-", "1e", "0.01", "100001", "0x10"])(
    "retains editable unsavable text %j after a paused remount",
    async (raw) => {
      const seed = saveInterruptedRun("paused", { activityType: "manual" });
      expect(writeStoredRun("recording-test", { ...seed, points: [] })).toBe(
        true
      );
      const view = render(tree());
      await act(async () =>
        fireEvent.click(screen.getByRole("button", { name: "Resume run" }))
      );
      const input = screen.getByRole("textbox", { name: "Distance covered" });
      fireEvent.change(input, { target: { value: raw } });
      expect(readStoredRun("recording-test")?.manualDistanceDraft?.raw).toBe(
        raw
      );
      view.unmount();
      render(tree());
      await act(async () =>
        fireEvent.click(screen.getByRole("button", { name: "Resume run" }))
      );
      expect(
        screen.getByRole("textbox", { name: "Distance covered" })
      ).toHaveValue(raw);
      expect(
        screen.getByRole("button", { name: "Save manual run" })
      ).toBeDisabled();
      expect(h.timer.isRunning).toBe(false);
      expect(h.gpsCalls).not.toContain("start");
    }
  );

  it("keeps the previous committed draft on refusal and immediately persists correction and clear", async () => {
    const seed = saveInterruptedRun("paused", { activityType: "manual" });
    expect(writeStoredRun("recording-test", { ...seed, points: [] })).toBe(
      true
    );
    const view = render(tree());
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Resume run" }))
    );
    const input = screen.getByRole("textbox", { name: "Distance covered" });
    fireEvent.change(input, { target: { value: "1.25" } });
    const originalSet = Storage.prototype.setItem;
    const refused = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(function (this: Storage, key, value) {
        if (key.startsWith(runResumeKey("recording-test")))
          throw new DOMException("quota", "QuotaExceededError");
        return originalSet.call(this, key, value);
      });
    try {
      fireEvent.change(input, { target: { value: "2.50" } });
      expect(input).toHaveValue("2.50");
      expect(readStoredRun("recording-test")?.manualDistanceDraft?.raw).toBe(
        "1.25"
      );
      expect(
        screen.getByText(/Latest progress couldn't be saved for recovery/)
      ).toBeInTheDocument();
      expect(refused.mock.calls.length).toBeLessThan(10);
      refused.mockRestore();
      fireEvent.change(input, { target: { value: "2.51" } });
      expect(readStoredRun("recording-test")?.manualDistanceDraft?.raw).toBe(
        "2.51"
      );
      expect(
        screen.queryByText(/Latest progress couldn't be saved for recovery/)
      ).toBeNull();
      h.unit = "km";
      view.rerender(tree());
      fireEvent.change(input, { target: { value: "" } });
      expect(
        readStoredRun("recording-test")?.manualDistanceDraft
      ).toBeUndefined();
      expect(
        document.getElementById("treadmill-distance-unit")
      ).toHaveTextContent("km");
      view.unmount();
      render(tree());
      await act(async () =>
        fireEvent.click(screen.getByRole("button", { name: "Resume run" }))
      );
      expect(
        screen.getByRole("textbox", { name: "Distance covered" })
      ).toHaveValue("");
    } finally {
      refused.mockRestore();
    }
  });

  it("clears the recovery draft on confirmed discard", async () => {
    const seed = saveInterruptedRun("active", { activityType: "manual" });
    expect(writeStoredRun("recording-test", { ...seed, points: [] })).toBe(
      true
    );
    render(tree());
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Resume run" }))
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "Distance covered" }),
      { target: { value: "3.10" } }
    );
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    const confirmation = screen.getByRole("alertdialog", {
      name: "Discard this run?",
    });
    fireEvent.click(
      within(confirmation).getByRole("button", { name: "Discard" })
    );
    expect(readStoredRun("recording-test")).toBeNull();
    act(() => vi.advanceTimersByTime(5000));
    expect(readStoredRun("recording-test")).toBeNull();
  });

  it("starts a new manual run with an empty draft after replacing the previous run", async () => {
    const seed = saveInterruptedRun("active", { activityType: "manual" });
    expect(
      writeStoredRun("recording-test", {
        ...seed,
        points: [],
        manualDistanceDraft: { version: 1, raw: "3.10", unit: "mi" },
      })
    ).toBe(true);
    const view = render(tree());
    fireEvent.click(screen.getByRole("button", { name: "Start new run" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Discard and start new" })
    );
    expect(readStoredRun("recording-test")).toBeNull();
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Easy run" }))
    );
    h.gps.error = "Permission denied";
    view.rerender(tree());
    // The page's GPS failure action starts a fresh manual entry.
    fireEvent.click(screen.getByRole("button", { name: "Track without GPS" }));
    expect(
      screen.getByRole("textbox", { name: "Distance covered" })
    ).toHaveValue("");
  });
});

/* Pgm8: the treadmill is where a run is done, so a treadmill run keeps its
   session's type ("long") with `place: "treadmill"`. Everything that asks
   "is this run on the GPS" reads the place too: such a run never starts
   the GPS, runs on the treadmill screen, and hands the summary its type
   and its place. A run stored before Pgm8 as `activityType: "treadmill"`
   is one too. */
describe("a run on the treadmill", () => {
  /** Stands in for the finish screen: what the run handed it. */
  function PlaceSummary() {
    const state = useLocation().state as {
      distance: number;
      runConfig: { activityType: string; place?: string };
    };
    return (
      <p>
        {`${state.runConfig.activityType} · ${state.runConfig.place ?? "outdoors"} · ${state.distance} m`}
      </p>
    );
  }

  it.each([
    [
      "a planned long run, since Pgm8",
      { activityType: "long" as const, place: "treadmill" as const },
      "long · treadmill · 6000 m",
    ],
    [
      "a treadmill run stored before Pgm8",
      // The treadmill was a run type then; it is no ActivityType now.
      {
        activityType:
          "treadmill" as unknown as StoredRun["config"]["activityType"],
      },
      "treadmill · outdoors · 6000 m",
    ],
  ])(
    "%s resumes without the GPS, on the treadmill screen",
    async (_name, config, handed) => {
      h.unit = "km";
      const { points: _trace, ...snapshot } = saveInterruptedRun(
        "active",
        config
      );
      expect(
        writeStoredRun("recording-test", { ...snapshot, points: [] })
      ).toBe(true);
      render(
        <MemoryRouter initialEntries={["/run"]}>
          <Routes>
            <Route path="/run" element={<Run />} />
            <Route path="/run-summary" element={<PlaceSummary />} />
          </Routes>
        </MemoryRouter>
      );
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Resume run" }));
      });
      const distance = screen.getByRole("textbox", {
        name: "Distance from treadmill",
      });
      expect(h.gpsCalls).not.toContain("start");
      // The outdoor run's sheet, with its Finish, is not there.
      expect(screen.queryByRole("button", { name: "Finish" })).toBeNull();
      fireEvent.change(distance, { target: { value: "6" } });
      await act(async () => {
        fireEvent.click(
          screen.getByRole("button", { name: "Save treadmill run" })
        );
      });
      expect(screen.getByText(handed)).toBeInTheDocument();
      expect(h.gpsCalls).not.toContain("start");
    }
  );
});

describe("manual structured coaching through the real player", () => {
  async function startIntervals(treadmill: boolean) {
    h.timer.elapsed = 0;
    const view = render(tree());
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "More options" }));
    });
    if (treadmill) {
      fireEvent.click(screen.getByRole("switch", { name: "On a treadmill" }));
    }
    fireEvent.click(
      screen.getByRole("button", {
        name: "Selected run type: Easy run. Tap to change.",
      })
    );
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Choose run type" })).getByRole(
        "button",
        { name: /^Intervals/ }
      )
    );
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", {
          name: treadmill ? "Start on the treadmill" : "Start intervals",
          hidden: true,
        })
      );
    });
    return view;
  }

  it("runs the displayed treadmill repeats, holds distance steps for explicit completion, and times recovery", async () => {
    h.unit = "km";
    const view = await startIntervals(true);
    expect(screen.getByText("HARD · REP 1/5")).toBeInTheDocument();
    expect(screen.getByText(figureLine("1.00 km target"))).toBeInTheDocument();
    expect(h.gpsCalls).not.toContain("start");
    // Time passing cannot invent metres on the machine.
    h.timer.elapsed = 240;
    view.rerender(tree());
    expect(screen.getByText("HARD · REP 1/5")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Mark distance step complete" })
    );
    expect(screen.getByText("1:30")).toBeInTheDocument();
    h.timer.elapsed = 329;
    view.rerender(tree());
    expect(screen.getByText("0:01")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Pause run" }));
    expect(h.timer.isRunning).toBe(false);
    // A paused timer is held, so its recovery does not burn off.
    view.rerender(tree());
    expect(screen.getByText("0:01")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Resume run" }));
    h.timer.elapsed = 330;
    view.rerender(tree());
    expect(screen.getByText("1K")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Mark distance step complete" })
    ).toBeInTheDocument();
    // A runner may skip a step without declaring that they covered it.
    fireEvent.click(
      screen.getByRole("button", { name: "Skip to the next step" })
    );
    expect(screen.getByText("1:30")).toBeInTheDocument();
    fireEvent.change(
      screen.getByRole("textbox", { name: "Distance from treadmill" }),
      {
        target: { value: "2.75" },
      }
    );
    fireEvent.click(screen.getByRole("button", { name: "Save treadmill run" }));
    const payload = JSON.parse(
      screen.getByTestId("finish-payload").textContent!
    );
    expect(payload).toMatchObject({
      distance: 2750,
      points: [],
      workPortion: null,
    });
    expect(h.gpsCalls).not.toContain("start");
  });

  it("retains an ad-hoc interval session after GPS fallback and saves miles as metres with unknown work distance", async () => {
    h.gps.error = "Permission denied";
    h.gps.permissionState = "denied";
    await startIntervals(false);
    fireEvent.click(screen.getByRole("button", { name: "Track without GPS" }));
    expect(screen.getByText("HARD · REP 1/5")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Mark distance step complete" })
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "Distance covered" }),
      {
        target: { value: "3.1" },
      }
    );
    expect(screen.getByText("mi")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save manual run" }));
    const payload = JSON.parse(
      screen.getByTestId("finish-payload").textContent!
    );
    expect(payload.distance).toBeCloseTo(4988.9664, 6);
    expect(payload).toMatchObject({
      points: [],
      workPortion: null,
      runConfig: { activityType: "manual" },
    });
    expect(payload.runConfig.segments).toHaveLength(9);
  });
});

/* Home's and Train's In progress strip offer a run left unsaved, and the
   finish screen holds a run only in memory until it is saved. */
describe("a run picked up from the In progress strip", () => {
  function openAt(url: string) {
    return render(
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/run" element={<Run />} />
          <Route path="/run-summary" element={<Summary />} />
        </Routes>
      </MemoryRouter>
    );
  }

  it("carries on with the stored run without asking again", async () => {
    const snapshot = saveInterruptedRun("paused");
    h.gps.points = snapshot.points;
    await act(async () => {
      openAt("/run?resume=1");
    });
    expect(screen.queryByRole("button", { name: "Resume run" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Carry on" })
    ).toBeInTheDocument();
    expect(h.gpsCalls).toContain("appendPoints");
  });

  it("without the flag, still asks", async () => {
    saveInterruptedRun("paused");
    await act(async () => {
      openAt("/run");
    });
    expect(
      screen.getByRole("button", { name: "Resume run" })
    ).toBeInTheDocument();
  });

  it("keeps a finished run stopped, so recovering it never runs on", async () => {
    await resumeFromSnapshot("active");
    expect(h.timer.isRunning).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Finish" }));
    expect(screen.getByTestId("finish-payload")).toBeInTheDocument();
    expect(readStoredRun("recording-test")).toMatchObject({
      phase: "paused",
      isRunning: false,
      accumulatedSeconds: 600,
    });
  });
});
