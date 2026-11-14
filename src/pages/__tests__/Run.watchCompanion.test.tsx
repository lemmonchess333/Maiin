/**
 * The Watch companion through the real Run page, with device I/O and the
 * native bridge stubbed: the step of a structured run the Watch is sent,
 * and the one-authority command contract (docs/proposals/connected-
 * training.md, "One-authority session contract" 2): a wrist Pause, Resume
 * or End is applied at most once, only to the active session and account at
 * the revision the Watch saw, and always answered with the phone's state.
 * The acceptance matrix's "Double tap, delayed acknowledgement, or repeated
 * Finish" row is the last case.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { restoreRealTimers } from "@/test/fakeTimers";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Run from "../Run";
import {
  readStoredRun,
  writeStoredRun,
  RUN_RESUME_SCHEMA_VERSION,
  type StoredRun,
} from "@/lib/runResumeStorage";
import { freeformPlanMetadata } from "@/lib/runPlanMetadata";
import { sessionPlayerSignature } from "@/lib/sessionPlayerCheckpoint";
import type { SessionSegment } from "@/lib/runSegments";
import type { GPSPoint } from "@/lib/gps";
import type {
  WatchRunCommand,
  WatchRunCommandAck,
  WatchRunSnapshot,
} from "@/lib/watchRunBridge";

const UID = "watch-test";
const SESSION = "run-watch-1";

const h = vi.hoisted(() => ({
  gps: { points: [] as GPSPoint[], distance: 0 },
  timer: { isRunning: false, elapsed: 0 },
  timerPause: vi.fn(),
  timerResume: vi.fn(),
  currentUid: "watch-test" as string | null,
  published: [] as unknown[],
  acks: [] as unknown[],
  deliver: null as ((command: unknown) => void) | null,
  track: vi.fn(),
}));

vi.mock("@/lib/lifecycleAnalytics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/lifecycleAnalytics")>()),
  track: h.track,
}));

vi.mock("@/lib/connectedTrainingRelease", () => ({
  CONNECTED_TRAINING_RELEASED: true,
}));
vi.mock("@/lib/firebase", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/firebase")>()),
  auth: {
    get currentUser() {
      return h.currentUid ? { uid: h.currentUid } : null;
    },
  },
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { uid: "watch-test" },
    profile: { uid: "watch-test", runMode: "freeform" },
  }),
  useUidForStorageKey: () => "watch-test",
  useUid: () => "watch-test",
}));
vi.mock("@/hooks/useConnectedTrainingPrefs", () => ({
  useConnectedTrainingPrefs: () => ({
    prefs: { useWatchForRuns: true, saveWorkoutsToHealth: false },
    loading: false,
    failed: false,
    update: vi.fn(),
    retry: vi.fn(),
  }),
}));
vi.mock("@/hooks/useWatchRunSwitch", () => ({ useWatchRunSwitch: () => {} }));
vi.mock("@/lib/watchRunBridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/watchRunBridge")>()),
  publishWatchRunSnapshot: vi.fn(async (snapshot: unknown) => {
    h.published.push(snapshot);
    return true;
  }),
  acknowledgeWatchRunCommand: vi.fn(async (ack: unknown) => {
    h.acks.push(ack);
    return true;
  }),
  subscribeWatchRunCommands: vi.fn(
    async (handler: (command: unknown) => void) => {
      h.deliver = handler;
      return () => {
        if (h.deliver === handler) h.deliver = null;
      };
    }
  ),
  getWatchRunStatus: vi.fn(async () => ({
    available: true,
    paired: true,
    installed: true,
    reachable: true,
    enabled: true,
  })),
  clearWatchRunSession: vi.fn(async () => {}),
}));
vi.mock("@/features/program/useProgram", () => ({
  useProgram: () => ({ programState: null, loading: false }),
}));
vi.mock("@/hooks/useDistanceUnit", () => ({ useDistanceUnit: () => "km" }));
vi.mock("@/lib/weather", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/weather")>()),
  getCurrentWeather: vi.fn(async () => null),
}));
vi.mock("@/components/run/ShoeSelector", () => ({ default: () => null }));
vi.mock("@/components/run/RouteSetupSection", () => ({ default: () => null }));
vi.mock("@/hooks/useLastRunType", () => ({ useLastRunType: () => null }));
vi.mock("@/hooks/useGPS", () => ({
  useGPS: () => ({
    ...h.gps,
    currentPoint: null,
    isTracking: true,
    error: null,
    gpsAccuracy: 5,
    permissionState: "granted",
    signalQuality: "strong",
    lastFixAt: null,
    preWarm: () => {},
    start: () => {},
    stop: () => {},
    pause: () => {},
    resume: () => {},
    getPoints: () => h.gps.points,
    getRejectedFixCount: () => 0,
    appendPoints: () => {},
  }),
}));
vi.mock("@/hooks/useRunTimer", () => ({
  useRunTimer: () => ({
    elapsed: h.timer.elapsed,
    isRunning: h.timer.isRunning,
    start: () => {
      h.timer.isRunning = true;
    },
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
    speak: () => {},
    checkDistanceCue: () => {},
    checkTimeCue: () => {},
    checkPaceAlert: () => {},
    checkEasyCeiling: () => {},
    checkHalfway: () => {},
    checkFinal500: () => {},
  }),
}));
vi.mock("@/components/run/RunMapLazy", () => ({ default: () => null }));
vi.mock("@/components/run/RunBottomSheet", () => ({
  default: ({
    onPause,
    onResume,
    intervalDisplay,
    isPaused,
  }: {
    onPause: () => void;
    onResume: () => void;
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
    </>
  ),
}));

const T0 = Date.parse("2026-10-04T08:00:00Z");

const segments: SessionSegment[] = [
  {
    type: "warmup",
    label: "Warm-up",
    instruction: "Easy jogging",
    eyebrow: "EASY",
    target: { kind: "duration", seconds: 60 },
  },
  {
    type: "hard",
    label: "400 m @ 3:50 /km",
    instruction: "Rep 1 of 2",
    eyebrow: "QUICK AND RELAXED · REP 1/2",
    target: { kind: "distance", meters: 400 },
    rep: 1,
    totalReps: 2,
  },
  {
    type: "recovery",
    label: "Recover",
    instruction: "Easy jog or walk",
    eyebrow: "EASY · AFTER REP 1/2",
    target: { kind: "duration", seconds: 90 },
    rep: 1,
    totalReps: 2,
  },
  {
    type: "hard",
    label: "400 m @ 3:50 /km",
    instruction: "Rep 2 of 2",
    eyebrow: "QUICK AND RELAXED · REP 2/2",
    target: { kind: "distance", meters: 400 },
    rep: 2,
    totalReps: 2,
  },
];

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

/** A structured outdoor run already under way, at Watch revision 3. */
function saveRunningSession() {
  const snapshot: StoredRun = {
    v: RUN_RESUME_SCHEMA_VERSION,
    config: {
      activityType: "intervals",
      autoPause: false,
      audioCues: true,
      audioCueFrequency: "every_km",
      paceAlerts: true,
      voiceRate: 0.9,
      displayStats: ["pace", "distance", "time"],
      target: { type: "none" },
      planMetadata: freeformPlanMetadata("freeform"),
      segments,
    },
    identity: {
      sessionId: SESSION,
      runId: SESSION,
      uid: UID,
      scheduledRunId: null,
      startedAt: T0,
      startLocalDate: "2026-10-04",
      originTimeZone: "Europe/London",
    },
    watchRevision: 3,
    startedAt: T0,
    recordingStartedAt: T0,
    lastWriteAt: T0,
    accumulatedSeconds: 0,
    isRunning: true,
    phase: "active",
    points: [point(0, T0)],
    playerCheckpoint: {
      version: 1,
      signature: sessionPlayerSignature(segments, "gps"),
      index: 0,
      segmentStarts: [{ elapsed: 0, distance: 0 }],
    },
  };
  expect(writeStoredRun(UID, snapshot)).toBe(true);
}

function tree() {
  return (
    <MemoryRouter initialEntries={["/run"]}>
      <Routes>
        <Route path="/run" element={<Run />} />
        <Route path="/run-summary" element={<p>Finish screen</p>} />
      </Routes>
    </MemoryRouter>
  );
}

async function resumeRun() {
  saveRunningSession();
  h.gps.points = [point(0, T0)];
  const view = render(tree());
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Resume run" }));
  });
  return view;
}

const lastSnapshot = () => h.published.at(-1) as WatchRunSnapshot;
const lastAck = () => h.acks.at(-1) as WatchRunCommandAck;

function command(
  action: WatchRunCommand["action"],
  commandId: string,
  expectedRevision: number,
  overrides: Partial<WatchRunCommand> = {}
): WatchRunCommand {
  const now = Date.now();
  return {
    sessionId: SESSION,
    commandId,
    expectedRevision,
    action,
    createdAtMs: now,
    expiresAtMs: now + 8_000,
    ...overrides,
  };
}

async function fromWrist(value: WatchRunCommand) {
  expect(h.deliver).toBeTypeOf("function");
  await act(async () => {
    h.deliver!(value);
  });
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
  h.gps.distance = 0;
  h.timer.isRunning = false;
  h.timer.elapsed = 0;
  h.currentUid = UID;
  h.published.length = 0;
  h.acks.length = 0;
  h.deliver = null;
  h.track.mockReset();
  h.timerPause.mockReset().mockImplementation(() => {
    h.timer.isRunning = false;
  });
  h.timerResume.mockReset().mockImplementation(() => {
    h.timer.isRunning = true;
  });
});
afterEach(async () => {
  await restoreRealTimers();
  cleanup();
  localStorage.clear();
});

describe("the step a structured run sends the Watch", () => {
  it("sends the live step with each snapshot, and the next one the moment it starts", async () => {
    const view = await resumeRun();
    expect(lastSnapshot()).toMatchObject({
      sessionId: SESSION,
      revision: 3,
      phase: "running",
      step: {
        index: 0,
        total: 4,
        eyebrow: "EASY",
        headline: "Warm-up",
        effort: "easy",
        remainingSeconds: 60,
        next: "400 m @ 3:50 /km",
      },
    });
    expect(lastSnapshot().step).not.toHaveProperty("haptic");

    // 45 s in, on the beat: 15 s of warm-up left.
    vi.setSystemTime(T0 + 45_000);
    h.timer.elapsed = 45;
    h.gps.distance = 120;
    view.rerender(tree());
    await act(async () => {
      vi.advanceTimersByTime(1_000);
    });
    expect(lastSnapshot().step).toMatchObject({
      index: 0,
      remainingSeconds: 15,
    });

    // The warm-up ends: the rep goes out at once, not on the next beat, as
    // effort up, and the revision is unchanged (a step is a figure).
    const sentBefore = h.published.length;
    vi.setSystemTime(T0 + 60_500);
    h.timer.elapsed = 60;
    h.gps.distance = 160;
    view.rerender(tree());
    await act(async () => {});
    expect(h.published.length).toBeGreaterThan(sentBefore);
    expect(lastSnapshot()).toMatchObject({
      revision: 3,
      step: {
        index: 1,
        eyebrow: "QUICK AND RELAXED · REP 1/2",
        headline: "400 m @ 3:50 /km",
        effort: "work",
        remainingMeters: 400,
        next: "Recover",
        haptic: "start",
      },
    });
  });
});

describe("a command from the wrist", () => {
  it("pauses and resumes once, at the revision the Watch saw, and answers with the phone's state", async () => {
    await resumeRun();
    await fromWrist(command("pause", "pause-1", 3));
    expect(h.timerPause).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Carry on" })).toBeVisible();
    expect(lastAck()).toEqual({
      sessionId: SESSION,
      commandId: "pause-1",
      revision: 4,
      phase: "paused",
      accepted: true,
    });
    expect(lastSnapshot()).toMatchObject({ revision: 4, phase: "paused" });
    expect(readStoredRun(UID)?.phase).toBe("paused");

    // The same command again (a retransmission after a reconnect): the same
    // answer, and no second pause.
    await fromWrist(command("pause", "pause-1", 3));
    expect(h.timerPause).toHaveBeenCalledTimes(1);
    expect(lastAck()).toEqual(h.acks.at(-2));

    // A second tap sent before the first was answered saw revision 3.
    await fromWrist(command("pause", "pause-2", 3));
    expect(h.timerPause).toHaveBeenCalledTimes(1);
    expect(lastAck()).toMatchObject({
      commandId: "pause-2",
      accepted: false,
      reason: "stale-revision",
      revision: 4,
      phase: "paused",
    });

    await fromWrist(command("resume", "resume-1", 4));
    expect(h.timerResume).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Pause" })).toBeVisible();
    expect(lastAck()).toMatchObject({
      commandId: "resume-1",
      accepted: true,
      revision: 5,
      phase: "running",
    });

    // Each answer is counted for the release's measurement, in aggregate:
    // the action and the outcome, never the run, the session or the command.
    const answered = h.track.mock.calls.filter(
      ([event]) => event === "watch_command_answered"
    );
    expect(answered.map(([, metadata]) => metadata)).toEqual([
      { watchAction: "pause", accepted: true },
      { watchAction: "pause", accepted: true, repeated: true },
      { watchAction: "pause", accepted: false, rejection: "stale-revision" },
      { watchAction: "resume", accepted: true },
    ]);
    expect(JSON.stringify(answered)).not.toMatch(/run-watch-1|pause-1/);
  });

  it("refuses a command that expired, belongs to another run, or follows an account change", async () => {
    await resumeRun();
    const now = Date.now();
    await fromWrist(
      command("pause", "late", 3, {
        createdAtMs: now - 9_000,
        expiresAtMs: now - 1_000,
      })
    );
    expect(lastAck()).toMatchObject({
      accepted: false,
      reason: "expired-command",
    });
    await fromWrist(command("pause", "other", 3, { sessionId: "run-old" }));
    expect(lastAck()).toMatchObject({
      sessionId: "run-old",
      accepted: false,
      reason: "stale-session",
    });
    h.currentUid = "someone-else";
    await fromWrist(command("pause", "switched", 3));
    expect(lastAck()).toMatchObject({
      accepted: false,
      reason: "account-changed",
    });
    expect(h.timerPause).not.toHaveBeenCalled();
  });

  it("ends the run once on a repeated End, keeps the finished review, and refuses the repeat", async () => {
    await resumeRun();
    vi.setSystemTime(T0 + 30_000);
    await act(async () => {
      h.deliver!(command("end", "end-1", 3));
      // Tapped again on a Watch that had not heard back yet.
      h.deliver!(command("end", "end-2", 3));
    });
    expect(screen.getByText("Finish screen")).toBeInTheDocument();
    const [first, second] = h.acks.slice(-2) as WatchRunCommandAck[];
    expect(first).toMatchObject({
      commandId: "end-1",
      accepted: true,
      revision: 4,
      phase: "review",
    });
    expect(second).toMatchObject({
      commandId: "end-2",
      accepted: false,
      reason: "stale-revision",
    });
    // The finished review is kept for the phone's own summary and save,
    // whatever happens to the page now.
    const stored = readStoredRun(UID);
    expect(stored?.phase).toBe("finished");
    expect(stored?.identity?.sessionId).toBe(SESSION);
    expect(stored?.watchRevision).toBe(4);
    expect(
      h.published.filter(
        (s) => (s as WatchRunSnapshot).phase === "review"
      ) as WatchRunSnapshot[]
    ).toEqual([expect.objectContaining({ revision: 4, phase: "review" })]);
    expect(lastSnapshot()).not.toHaveProperty("saveStatus");
  });
});
