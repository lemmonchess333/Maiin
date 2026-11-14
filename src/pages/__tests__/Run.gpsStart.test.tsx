/**
 * Run25 call 2: a GPS run's clock waits for the first good fix. Through the
 * real Run page with the real GPS hook, run timer and session player, and
 * only the location source, the device and the screens around them faked:
 *
 *  1. Start with no fix: "Finding GPS", no clock, until a fix within 20 m
 *     arrives; the clock counts from that fix.
 *  2. Start with a good fix in hand from the run screen's watch: the clock
 *     starts at the tap, and no waiting screen shows.
 *  3. Start anyway: the clock starts at the tap, and distance counts from
 *     the first fix the reading gate passes.
 *  4. A 40 m fix does not start the clock; a later 18 m one does.
 *  5. The session player's first step, the saved run's start, Apple
 *     Health's start and the trace's first point (where the first
 *     kilometre's split starts) are all the clock's start.
 *  6. A treadmill run never shows "Finding GPS".
 *  7. Location refused keeps the screen it had: its own words and Track
 *     without GPS, and no Start anyway.
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
import { restoreRealTimers } from "@/test/fakeTimers";
import Run from "../Run";
import { readStoredRun } from "@/lib/runResumeStorage";
import { DEFAULT_CONFIG } from "@/components/run/runConfigDefaults";
import type { GPSPoint, Split } from "@/lib/gps";
import type { RunSessionIdentity } from "@/lib/runSessionIdentity";

const UID = "gps-start-test";
const T0 = Date.parse("2026-10-04T08:00:00Z");

interface FakeWatch {
  purpose: string | undefined;
  onFix: PositionCallback;
  onError: PositionErrorCallback;
  cleared: boolean;
}

const h = vi.hoisted(() => ({
  watches: [] as FakeWatch[],
  permission: "granted" as PermissionState,
  spoken: [] as string[],
}));

vi.mock("@/lib/locationSource", () => ({
  getLocationSource: () => ({
    getCurrent: () => {},
    watch: (
      _options: PositionOptions,
      onFix: PositionCallback,
      onError: PositionErrorCallback,
      purpose?: string
    ) => {
      const watch: FakeWatch = { purpose, onFix, onError, cleared: false };
      h.watches.push(watch);
      return {
        clear: () => {
          watch.cleared = true;
        },
      };
    },
  }),
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ profile: { uid: UID, runMode: "freeform" } }),
  useUidForStorageKey: () => UID,
  useUid: () => UID,
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
vi.mock("@/hooks/useWakeLock", () => ({
  useWakeLock: () => ({ request: vi.fn(), release: vi.fn() }),
}));
vi.mock("@/hooks/useHeartRate", () => ({
  useHeartRate: () => ({ bpm: null }),
}));
vi.mock("@/hooks/useAudioCues", () => ({
  useAudioCues: () => ({
    prime: () => {},
    speak: (line: string) => h.spoken.push(line),
    checkDistanceCue: () => {},
    checkTimeCue: () => {},
    checkPaceAlert: () => {},
    checkEasyCeiling: () => {},
    checkHalfway: () => {},
    checkFinal500: () => {},
  }),
}));
vi.mock("@/components/run/RunMapLazy", () => ({ default: () => null }));
vi.mock("@/components/run/RunTilePicker", () => ({
  default: ({
    onPickType,
    onMoreOptions,
    gpsSignal,
  }: {
    onPickType: (type: string) => void;
    onMoreOptions: () => void;
    gpsSignal?: import("react").ReactNode;
  }) => (
    <>
      {gpsSignal}
      <button onClick={() => onPickType("easy")}>Easy run</button>
      <button onClick={onMoreOptions}>More options</button>
    </>
  ),
}));
vi.mock("@/components/run/RunLaunchCard", () => ({
  default: ({
    onStart,
    gpsSignal,
  }: {
    onStart: () => void;
    gpsSignal?: import("react").ReactNode;
  }) => (
    <>
      {gpsSignal}
      <button onClick={onStart}>Start run</button>
    </>
  ),
}));
// The full setup, at its "On a treadmill" switch (Pgm8).
vi.mock("@/components/run/RunSetupModal", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/run/RunSetupModal")>()),
  default: ({ onStart }: { onStart: (config: unknown) => void }) => (
    <button onClick={() => onStart({ ...DEFAULT_CONFIG, place: "treadmill" })}>
      Start on the treadmill
    </button>
  ),
}));
vi.mock("@/components/run/IntervalStepShell", () => ({
  default: ({ player }: { player: { state: { index: number } } }) => (
    <p data-testid="step">{player.state.index}</p>
  ),
}));
vi.mock("@/components/run/RunBottomSheet", () => ({
  default: ({
    elapsed,
    formatTime,
    onStop,
    intervalDisplay,
  }: {
    elapsed: number;
    formatTime: (seconds: number) => string;
    onStop: () => void;
    intervalDisplay?: import("react").ReactNode;
  }) => (
    <>
      {intervalDisplay}
      <p data-testid="clock">{formatTime(elapsed)}</p>
      <button onClick={onStop}>Finish</button>
    </>
  ),
}));

/** Metres in one degree of latitude, by gps.ts's haversine. */
const M_PER_DEG = (6371000 * Math.PI) / 180;

/** A fix `metresNorth` along a meridian, taken at `takenAt`. */
function fix(
  metresNorth: number,
  accuracy: number,
  takenAt: number,
  speed: number | null = null
): GeolocationPosition {
  return {
    coords: {
      latitude: 51.5 + metresNorth / M_PER_DEG,
      longitude: -0.12,
      accuracy,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed,
    },
    timestamp: takenAt,
  } as GeolocationPosition;
}

/** A fix reaching every watch still on, as the phone's GPS would. */
function deliver(position: GeolocationPosition) {
  act(() => {
    for (const w of h.watches) if (!w.cleared) w.onFix(position);
  });
}

/** Move the clock on, letting each second's timer tick land. */
function wait(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

interface Finish {
  identity: RunSessionIdentity;
  recordingStartedAt: number | null;
  points: GPSPoint[];
  splits: Split[];
  elapsed: number;
  distance: number;
}

/** Stands in for the finish screen: shows what the run handed it. */
function Summary() {
  return (
    <output data-testid="finish">{JSON.stringify(useLocation().state)}</output>
  );
}

function open(url = "/run") {
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/run" element={<Run />} />
        <Route path="/run-summary" element={<Summary />} />
      </Routes>
    </MemoryRouter>
  );
}

async function tap(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
}

function finish(): Finish {
  fireEvent.click(screen.getByRole("button", { name: "Finish" }));
  return JSON.parse(screen.getByTestId("finish").textContent ?? "null");
}

const clock = () => screen.queryByTestId("clock")?.textContent ?? null;
const storedStart = () => readStoredRun(UID, Date.now())?.recordingStartedAt;

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
  h.watches.length = 0;
  h.permission = "granted";
  h.spoken.length = 0;
  Object.defineProperty(navigator, "geolocation", {
    value: {},
    configurable: true,
  });
  Object.defineProperty(navigator, "permissions", {
    value: {
      query: async () => ({
        state: h.permission,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    },
    configurable: true,
  });
});
afterEach(async () => {
  await restoreRealTimers();
  cleanup();
  localStorage.clear();
});

describe("a GPS run's clock waits for the first good fix", () => {
  it("(1) reads nothing until a 15 m fix arrives, then counts from that fix", async () => {
    open();
    // Let the permission read land, as the page's first render does.
    await act(async () => {});
    await tap("Easy run");
    expect(screen.getByText("Finding GPS")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start anyway" })).toBeVisible();
    wait(8000);
    expect(clock()).toBeNull();
    expect(storedStart()).toBeUndefined();

    vi.setSystemTime(T0 + 8400);
    deliver(fix(0, 15, T0 + 8000));
    expect(screen.queryByText("Finding GPS")).toBeNull();
    expect(clock()).toBe("0:00");
    expect(h.spoken).toContain("Go!");
    // Ten of the screen's seconds on: ten seconds of running, counted from
    // the fix (Apple Health's start, below, is its time), not from the tap
    // of Start or the end of a 3-2-1.
    wait(10_000);
    expect(clock()).toBe("0:10");
    expect(storedStart()).toBe(T0 + 8000);
  });

  it("(2) starts at the tap when a good fix is already in hand, with no waiting screen", async () => {
    open();
    await act(async () => {});
    // The run screen watches location before Start, never asking.
    expect(h.watches.map((w) => w.purpose)).toEqual(["warm"]);
    deliver(fix(0, 8, T0));
    expect(screen.getByRole("status")).toHaveTextContent("GPS ready");
    wait(3000);
    await tap("Easy run");
    expect(screen.queryByText("Finding GPS")).toBeNull();
    expect(clock()).toBe("0:00");
    // The run's own watch has taken over.
    expect(h.watches.map((w) => [w.purpose, w.cleared])).toEqual([
      ["warm", true],
      [undefined, false],
    ]);
    wait(5000);
    expect(clock()).toBe("0:05");
    expect(storedStart()).toBe(T0 + 3000);
  });

  it("(3) Start anyway starts the clock at the tap, and distance from the first fix the gate passes", async () => {
    open();
    await act(async () => {});
    await tap("Easy run");
    wait(5000);
    await tap("Start anyway");
    expect(screen.queryByText("Finding GPS")).toBeNull();
    expect(clock()).toBe("0:00");
    wait(2000);
    // Too rough for the trace to measure from: it moves no distance.
    deliver(fix(0, 200, T0 + 7000));
    wait(2000);
    // The first fix the reading gate passes (150 m with no point before).
    deliver(fix(30, 60, T0 + 9000, 4));
    for (let k = 1; k <= 20; k++) {
      wait(2000);
      deliver(fix(30 + 8 * k, 10, T0 + 9000 + 2000 * k, 4));
    }
    expect(clock()).toBe("0:44");
    const run = finish();
    expect(run.recordingStartedAt).toBe(T0 + 5000);
    expect(run.identity.startedAt).toBe(T0 + 5000);
    expect(run.points[0]).toMatchObject({ timestamp: T0 + 9000, accuracy: 60 });
    // 160 m run after that fix, read through the smoothing; nothing from
    // the rough fix before it.
    expect(run.distance).toBeGreaterThan(120);
    expect(run.distance).toBeLessThan(200);
  });

  it("(4) a 40 m fix does not start the clock; a later 18 m one does", async () => {
    open();
    await act(async () => {});
    await tap("Easy run");
    wait(3000);
    deliver(fix(0, 40, T0 + 3000));
    wait(3000);
    expect(screen.getByText("Finding GPS")).toBeInTheDocument();
    expect(clock()).toBeNull();
    deliver(fix(2, 18, T0 + 6000));
    expect(clock()).toBe("0:00");
    expect(storedStart()).toBe(T0 + 6000);
  });

  it("(5) the session's first step, the saved run's start and the first split all start with the clock", async () => {
    // Run-walk 1: a five-minute walk, then the first run.
    open("/run?template=run_walk_1");
    await act(async () => {});
    await tap("Start run");
    expect(screen.getByText("Finding GPS")).toBeInTheDocument();
    wait(4000);
    const fixAt = T0 + 4000;
    deliver(fix(0, 12, fixAt, 4));
    expect(screen.getByTestId("step")).toHaveTextContent("0");
    // 4 m/s, a fix every 2 s: past the first kilometre by 260 s.
    for (let k = 1; k <= 149; k++) {
      wait(2000);
      deliver(fix(8 * k, 5, fixAt + 2000 * k, 4));
    }
    // 298 s after the fix: still the walk.
    expect(clock()).toBe("4:58");
    expect(screen.getByTestId("step")).toHaveTextContent("0");
    wait(3000);
    // 301 s: the walk's 300 s are done, counted from the fix.
    expect(clock()).toBe("5:01");
    expect(screen.getByTestId("step")).toHaveTextContent("1");

    const run = finish();
    // One instant: the fix, the clock, Apple Health's start, the saved
    // run's start and its day, and the trace's first point.
    expect(run.points[0].timestamp).toBe(fixAt);
    expect(run.recordingStartedAt).toBe(fixAt);
    expect(run.identity.startedAt).toBe(fixAt);
    expect(run.elapsed).toBe(301);
    // The first kilometre, from that point: 1000 m at 4 m/s is 250 s,
    // read through the smoothing's first few fixes.
    expect(run.splits[0].time).toBeGreaterThan(245);
    expect(run.splits[0].time).toBeLessThan(256);
  });

  it("(6) a treadmill run never shows Finding GPS, and its clock starts at once", async () => {
    open();
    await act(async () => {});
    await tap("More options");
    await tap("Start on the treadmill");
    expect(screen.queryByText("Finding GPS")).toBeNull();
    expect(screen.queryByRole("button", { name: "Start anyway" })).toBeNull();
    expect(screen.getByLabelText("Elapsed time")).toBeInTheDocument();
    expect(storedStart()).toBe(T0);
    wait(20_000);
    expect(screen.queryByText("Finding GPS")).toBeNull();
  });

  it("(7) location refused keeps its own words and Track without GPS, and offers no Start anyway", async () => {
    h.permission = "denied";
    open();
    await act(async () => {});
    // Never watched before Start: a warm-up is never the ask.
    expect(h.watches).toEqual([]);
    await tap("Easy run");
    act(() =>
      h.watches[0].onError({
        code: 1,
        message: "User denied Geolocation",
      } as GeolocationPositionError)
    );
    expect(screen.getByText("Location is off for Tropos")).toBeInTheDocument();
    expect(screen.queryByText("Finding GPS")).toBeNull();
    expect(screen.queryByRole("button", { name: "Start anyway" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Track without GPS" })
    ).toBeInTheDocument();
    wait(30_000);
    expect(clock()).toBeNull();
    expect(storedStart()).toBeUndefined();
  });
});
