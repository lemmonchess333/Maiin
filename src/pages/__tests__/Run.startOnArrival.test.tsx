/**
 * Home's Start goes straight into the run (owner, 2026-10-16: "Should open
 * then go"). Through the real Run page with device I/O stubbed: opened with
 * `?start=1`, the page starts the run it names and takes the flag off its
 * address, or shows itself when there is something to see first
 * (startOnArrival). Train's way in, with no flag, still opens the run's own
 * card. The GPS screen it starts on takes the run to the treadmill, which
 * the setup's switch did before Home's Start stopped passing through it.
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
import { localDateString, localWeekKey } from "@/lib/dateHelpers";
import {
  writeStoredRun,
  RUN_RESUME_SCHEMA_VERSION,
  type StoredRun,
} from "@/lib/runResumeStorage";
import { freeformPlanMetadata } from "@/lib/runPlanMetadata";
import type { ProgramState } from "@/features/program/programTypes";
import { FIRST_RUN_CHECK_MS } from "@/features/run/startOnArrival";
import { RUN } from "@/test/journeyScreens";

const RACE_GOAL = { distance: "10k", targetDate: "2099-04-18" };
const HOME_START = "/run?template=easy_30&scheduledRunId=runday_today&start=1";

const h = vi.hoisted(() => ({
  runMode: "race_prep",
  programState: null as unknown,
  gpsCalls: [] as string[],
  hint: { owed: false, loading: false, runCount: 0 },
  launchCardRenders: 0,
  pickerRenders: 0,
}));

/* Stable across renders, as the real hook's useCallbacks are. */
const gpsControls = {
  preWarm: () => {},
  start: () => h.gpsCalls.push("start"),
  stop: () => h.gpsCalls.push("stop"),
  pause: () => {},
  resume: () => {},
  getPoints: () => [],
  getRejectedFixCount: () => 0,
  appendPoints: () => {},
};

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    profile: { uid: "arrival-test", runMode: h.runMode, raceGoal: RACE_GOAL },
  }),
  useUidForStorageKey: () => "arrival-test",
  useUid: () => "arrival-test",
}));
vi.mock("@/features/program/useProgram", () => ({
  useProgram: () => ({ programState: h.programState, loading: false }),
}));
vi.mock("@/hooks/useDistanceUnit", () => ({ useDistanceUnit: () => "km" }));
vi.mock("@/hooks/useLastRunType", () => ({ useLastRunType: () => null }));
// The first-run hint: owed to an account that has met the guide, and due
// once the read of its runs finds none.
vi.mock("@/hooks/useGuideHint", () => ({
  useGuideHint: () => ({
    allowed: true,
    owed: h.hint.owed,
    markSeen: () => {},
  }),
}));
vi.mock("@/hooks/useLifetimeRunStats", () => ({
  useLifetimeRunStats: () => ({
    loading: h.hint.loading,
    failed: false,
    runCount: h.hint.runCount,
  }),
}));
vi.mock("@/components/guide/GuideHint", () => ({
  default: ({ when }: { when: boolean }) =>
    when ? <p>First-run hint</p> : null,
}));
vi.mock("@/lib/weather", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/weather")>()),
  getCurrentWeather: vi.fn(async () => null),
}));
vi.mock("@/hooks/useGPS", () => ({
  useGPS: () => ({
    points: [],
    currentPoint: null,
    distance: 0,
    isTracking: false,
    error: null,
    gpsAccuracy: null,
    permissionState: "prompt",
    signalQuality: "searching",
    lastFixAt: null,
    ...gpsControls,
  }),
}));
vi.mock("@/hooks/useRunTimer", () => ({
  useRunTimer: () => ({
    elapsed: 1800,
    isRunning: false,
    start: () => {},
    pause: () => {},
    resume: () => {},
    reset: () => {},
    rehydrate: () => {},
    recalcNow: () => {},
    formatTime: () => "30:00",
    getAccumulatedSeconds: () => 1800,
  }),
}));
vi.mock("@/hooks/useWakeLock", () => ({
  useWakeLock: () => ({ request: async () => {}, release: async () => {} }),
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
vi.mock("@/components/run/RunMapLazy", () => ({ default: () => null }));
vi.mock("@/components/run/RouteSetupSection", () => ({ default: () => null }));
vi.mock("@/components/run/ShoeSelector", () => ({ default: () => null }));
vi.mock("@/components/run/RunLaunchCard", () => ({
  default: ({ onStart }: { onStart: () => void }) => {
    h.launchCardRenders += 1;
    return <button onClick={onStart}>The run's card</button>;
  },
}));
vi.mock("@/components/run/RunTilePicker", () => ({
  default: () => {
    h.pickerRenders += 1;
    return <p>Run picker</p>;
  },
}));

/** Stands in for the finish screen: what the run handed it. */
function Summary() {
  const state = useLocation().state as {
    distance: number;
    runConfig: {
      activityType: string;
      place?: string;
      planMetadata?: { scheduledRunId: string | null };
    };
  };
  const { activityType, place, planMetadata } = state.runConfig;
  return (
    <p>
      {`${activityType} · ${place ?? "outdoors"} · ${planMetadata?.scheduledRunId ?? "no plan"} · ${state.distance} m`}
    </p>
  );
}

function Address() {
  return <p data-testid="address">{useLocation().search}</p>;
}

async function open(url: string) {
  await act(async () => {
    render(
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route
            path="/run"
            element={
              <>
                <Run />
                <Address />
              </>
            }
          />
          <Route path="/run-summary" element={<Summary />} />
        </Routes>
      </MemoryRouter>
    );
  });
}

function planTodaysEasyRun() {
  const today = new Date();
  h.programState = {
    runDays: [
      {
        id: "runday_today",
        dayIndex: today.getDay(),
        date: localDateString(today),
        weekKey: localWeekKey(today),
        templateId: "easy_30",
        type: "easy",
        completed: false,
        status: "planned",
      },
    ],
    runPlan: {
      mode: "race_prep",
      raceGoal: RACE_GOAL,
      totalWeeks: 12,
      currentWeek: 6,
    },
  } as unknown as ProgramState;
}

function saveInterruptedRun() {
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
    startedAt: Date.now() - 600000,
    lastWriteAt: Date.now(),
    accumulatedSeconds: 360,
    isRunning: false,
    phase: "paused",
    points: [],
  };
  expect(writeStoredRun("arrival-test", snapshot)).toBe(true);
}

async function saveOnTheTreadmill(km: string) {
  fireEvent.change(screen.getByRole("textbox", { name: RUN.distance }), {
    target: { value: km },
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: RUN.saveTreadmill }));
  });
}

beforeEach(() => {
  localStorage.clear();
  h.runMode = "race_prep";
  h.programState = null;
  h.gpsCalls = [];
  h.hint = { owed: false, loading: false, runCount: 0 };
  h.launchCardRenders = 0;
  h.pickerRenders = 0;
});
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("a run started from Home", () => {
  it("starts the planned run as the page opens, with no second Start", async () => {
    planTodaysEasyRun();
    await open(HOME_START);
    expect(screen.getByText("Acquiring GPS...")).toBeInTheDocument();
    expect(h.gpsCalls).toContain("start");
    expect(h.launchCardRenders).toBe(0);
    // Off the address, so going Back here from the summary, or a reload,
    // starts no other run.
    expect(screen.getByTestId("address")).toHaveTextContent(
      /^\?template=easy_30&scheduledRunId=runday_today$/
    );
  });

  it("starts a free run for a free runner, not the picker", async () => {
    h.runMode = "freeform";
    await open("/run?start=1");
    expect(screen.getByText("Acquiring GPS...")).toBeInTheDocument();
    expect(h.pickerRenders).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: RUN.gpsTreadmill }));
    await saveOnTheTreadmill("5");
    expect(
      screen.getByText("freerun · treadmill · no plan · 5000 m")
    ).toBeInTheDocument();
  });

  it("moves to the treadmill from the GPS screen, keeping the run's type and its plan", async () => {
    planTodaysEasyRun();
    await open(HOME_START);
    fireEvent.click(screen.getByRole("button", { name: RUN.gpsTreadmill }));
    expect(h.gpsCalls).toEqual(["start", "stop"]);
    await saveOnTheTreadmill("5");
    expect(
      screen.getByText("easy · treadmill · runday_today · 5000 m")
    ).toBeInTheDocument();
  });

  it("goes back to the run's own card from the GPS screen's Cancel", async () => {
    planTodaysEasyRun();
    await open(HOME_START);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(
      screen.getByRole("button", { name: "The run's card" })
    ).toBeInTheDocument();
  });

  it("asks about an interrupted run instead of starting another", async () => {
    planTodaysEasyRun();
    saveInterruptedRun();
    await open(HOME_START);
    expect(
      screen.getByRole("button", { name: "Resume run" })
    ).toBeInTheDocument();
    expect(h.gpsCalls).not.toContain("start");
    expect(screen.getByTestId("address").textContent).not.toMatch(/start=/);
  });

  it("opens a first run on the run's card, where its hint is", async () => {
    planTodaysEasyRun();
    h.hint = { owed: true, loading: false, runCount: 0 };
    await open(HOME_START);
    expect(
      screen.getByRole("button", { name: "The run's card" })
    ).toBeInTheDocument();
    expect(screen.getByText("First-run hint")).toBeInTheDocument();
    expect(h.gpsCalls).not.toContain("start");
  });

  it("starts the run of an account owed the hint that has run before", async () => {
    planTodaysEasyRun();
    h.hint = { owed: true, loading: false, runCount: 4 };
    await open(HOME_START);
    expect(screen.getByText("Acquiring GPS...")).toBeInTheDocument();
  });

  it("waits for a slow read of the runs only so long", async () => {
    planTodaysEasyRun();
    h.hint = { owed: true, loading: true, runCount: 0 };
    await open(HOME_START);
    // Neither started nor showing the run's card while it reads.
    expect(h.gpsCalls).not.toContain("start");
    expect(h.launchCardRenders).toBe(0);
    expect(
      await screen.findByText("Acquiring GPS...", undefined, {
        timeout: FIRST_RUN_CHECK_MS + 2000,
      })
    ).toBeInTheDocument();
    expect(h.launchCardRenders).toBe(0);
  });
});

describe("a run opened from Train", () => {
  it("opens on the run's own card, which starts it", async () => {
    planTodaysEasyRun();
    await open("/run?template=easy_30&scheduledRunId=runday_today");
    expect(h.gpsCalls).not.toContain("start");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "The run's card" }));
    });
    expect(screen.getByText("Acquiring GPS...")).toBeInTheDocument();
  });
});
