/**
 * A hot day where a run is started (Pgm8 (E8), kept with actions): through
 * the real Run page with device I/O stubbed. Home's Start of a tempo or
 * interval session on a hot day shows the session's card, whose swap is a
 * choice, instead of starting; the swap starts an easy run of the
 * session's minutes; any run started on a hot day carries `hotDay` to the
 * summary, which then reads it by feel. A mild day, an easy run and a
 * weather read that is slow all start as before.
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
import type { ProgramState } from "@/features/program/programTypes";
import { HEAT_CHECK_MS } from "@/features/run/startOnArrival";
import { RUN } from "@/test/journeyScreens";

const RACE_GOAL = { distance: "10k", targetDate: "2099-04-18" };
const HOME_EASY = "/run?template=easy_30&scheduledRunId=runday_today&start=1";
const HOME_TEMPO = "/run?template=tempo_30&scheduledRunId=runday_today&start=1";

/** 32°C at 70% humidity: a T+DP sum of about 168°F, well into hot. */
const HOT = {
  temperature: 32,
  feelsLike: 36,
  humidity: 70,
  windSpeed: 10,
  weatherCode: 0,
  description: "Clear sky",
};
/** 15°C at 50%: about 100°F, mild. */
const MILD = { ...HOT, temperature: 15, feelsLike: 15, humidity: 50 };

const h = vi.hoisted(() => ({
  runMode: "race_prep",
  programState: null as unknown,
  gpsCalls: [] as string[],
  hint: { owed: false, loading: false, runCount: 0 },
  launchCardRenders: 0,
  pickerRenders: 0,
  gpsPermission: "prompt" as string,
  gpsError: null as string | null,
  native: false,
  openedSettings: 0,
  weather: null as null | (() => Promise<unknown>),
}));

const visibility = vi.hoisted(() => ({
  onVisible: null as null | ((e: { hiddenDuration: number }) => void),
}));
vi.mock("@/hooks/useRunVisibility", () => ({
  useRunVisibility: (opts: {
    onVisible: (e: { hiddenDuration: number }) => void;
  }) => {
    visibility.onVisible = opts.onVisible;
  },
}));
vi.mock("@/lib/platform", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/platform")>()),
  isNativePlatform: () => h.native,
}));
vi.mock("@/lib/nativeLocationSettings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/nativeLocationSettings")>()),
  openLocationSettings: async () => {
    h.openedSettings += 1;
  },
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
  getCurrentWeather: vi.fn(() => (h.weather ? h.weather() : null)),
}));
vi.mock("@/hooks/useGPS", () => ({
  useGPS: () => ({
    points: [],
    currentPoint: null,
    distance: 0,
    isTracking: false,
    error: h.gpsError,
    gpsAccuracy: null,
    permissionState: h.gpsPermission,
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
    checkEasyCeiling: () => {},
    checkHalfway: () => {},
    checkFinal500: () => {},
  }),
}));
vi.mock("@/components/run/RunMapLazy", () => ({ default: () => null }));
vi.mock("@/components/run/RouteSetupSection", () => ({ default: () => null }));
vi.mock("@/components/run/ShoeSelector", () => ({ default: () => null }));
vi.mock("@/components/run/RunLaunchCard", () => ({
  default: ({
    onStart,
    hotDay,
    heatSwapMinutes,
    onHeatSwap,
  }: {
    onStart: () => void;
    hotDay?: boolean;
    heatSwapMinutes?: number | null;
    onHeatSwap?: () => void;
  }) => {
    h.launchCardRenders += 1;
    return (
      <>
        <button onClick={onStart}>The run's card</button>
        {hotDay && <p>Hot day on the card</p>}
        {hotDay && heatSwapMinutes != null && (
          <button
            onClick={onHeatSwap}
          >{`Swap for ${heatSwapMinutes} min`}</button>
        )}
      </>
    );
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
    runConfig: {
      activityType: string;
      target: { type: string; value?: number };
      hotDay?: boolean;
      planMetadata?: { scheduledRunId: string | null };
    };
  };
  const { activityType, target, hotDay, planMetadata } = state.runConfig;
  return (
    <p>
      {`${activityType} · ${target.type} ${target.value ?? "-"} · ${hotDay ? "hot day" : "no hot day"} · ${planMetadata?.scheduledRunId ?? "no plan"}`}
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

function planToday(templateId: "easy_30" | "tempo_30") {
  const today = new Date();
  h.programState = {
    runDays: [
      {
        id: "runday_today",
        dayIndex: today.getDay(),
        date: localDateString(today),
        weekKey: localWeekKey(today),
        templateId,
        type: templateId === "easy_30" ? "easy" : "tempo",
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
  h.gpsPermission = "prompt";
  h.gpsError = null;
  h.native = false;
  h.openedSettings = 0;
  h.weather = null;
});
afterEach(() => {
  cleanup();
  localStorage.clear();
});

/** The run, moved to the treadmill from the GPS screen and saved, as the
 *  summary is handed it. */
async function finishOnTheTreadmill() {
  fireEvent.click(screen.getByRole("button", { name: RUN.gpsTreadmill }));
  await saveOnTheTreadmill("5");
}

describe("a hot day, started from Home", () => {
  it("shows a tempo's card with its easy-run swap, and starts nothing", async () => {
    planToday("tempo_30");
    h.weather = async () => HOT;
    await open(HOME_TEMPO);
    expect(await screen.findByText("Hot day on the card")).toBeInTheDocument();
    expect(h.gpsCalls).not.toContain("start");
    // The tempo_30 template's 45 minutes, as its cards state them.
    expect(
      screen.getByRole("button", { name: "Swap for 45 min" })
    ).toBeInTheDocument();
    // The start flag is off the address: a reload shows the card again.
    expect(screen.getByTestId("address")).toHaveTextContent(
      /^\?template=tempo_30&scheduledRunId=runday_today$/
    );
  });

  it("swaps the tempo for an easy run of its 45 minutes, read by feel afterwards", async () => {
    planToday("tempo_30");
    h.weather = async () => HOT;
    await open(HOME_TEMPO);
    await act(async () => {
      fireEvent.click(
        await screen.findByRole("button", { name: "Swap for 45 min" })
      );
    });
    expect(screen.getByText("Acquiring GPS…")).toBeInTheDocument();
    await finishOnTheTreadmill();
    expect(
      screen.getByText("easy · time 2700 · hot day · runday_today")
    ).toBeInTheDocument();
  });

  it("keeps the tempo when it is started from its card instead", async () => {
    planToday("tempo_30");
    h.weather = async () => HOT;
    await open(HOME_TEMPO);
    await act(async () => {
      fireEvent.click(
        await screen.findByRole("button", { name: "The run's card" })
      );
    });
    await finishOnTheTreadmill();
    expect(
      screen.getByText(/^tempo · .* · hot day · runday_today$/)
    ).toBeInTheDocument();
  });

  it("starts an easy run straight away, carrying the hot day to the summary", async () => {
    planToday("easy_30");
    h.weather = async () => HOT;
    await open(HOME_EASY);
    expect(await screen.findByText("Acquiring GPS…")).toBeInTheDocument();
    expect(h.launchCardRenders).toBe(0);
    await finishOnTheTreadmill();
    expect(
      screen.getByText("easy · time 1800 · hot day · runday_today")
    ).toBeInTheDocument();
  });

  it("starts the tempo straight away on a mild day, with no hot day on it", async () => {
    planToday("tempo_30");
    h.weather = async () => MILD;
    await open(HOME_TEMPO);
    expect(await screen.findByText("Acquiring GPS…")).toBeInTheDocument();
    expect(h.launchCardRenders).toBe(0);
    await finishOnTheTreadmill();
    expect(
      screen.getByText(/^tempo · .* · no hot day · runday_today$/)
    ).toBeInTheDocument();
  });

  it("starts the tempo when the weather can't be read", async () => {
    planToday("tempo_30");
    h.weather = async () => null;
    await open(HOME_TEMPO);
    expect(await screen.findByText("Acquiring GPS…")).toBeInTheDocument();
    expect(h.launchCardRenders).toBe(0);
  });

  it("waits for a slow weather read only so long, then starts the tempo", async () => {
    planToday("tempo_30");
    h.weather = () => new Promise(() => {});
    await open(HOME_TEMPO);
    expect(h.gpsCalls).not.toContain("start");
    expect(h.launchCardRenders).toBe(0);
    expect(
      await screen.findByText("Acquiring GPS…", undefined, {
        timeout: HEAT_CHECK_MS + 2000,
      })
    ).toBeInTheDocument();
    expect(h.launchCardRenders).toBe(0);
  });
});

describe("a hot day, opened from Train", () => {
  it("shows the card's hot day and its swap for a tempo", async () => {
    planToday("tempo_30");
    h.weather = async () => HOT;
    await open("/run?template=tempo_30&scheduledRunId=runday_today");
    expect(await screen.findByText("Hot day on the card")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Swap for 45 min" })
    ).toBeInTheDocument();
  });

  it("offers no swap for an easy run, which says only the hot day", async () => {
    planToday("easy_30");
    h.weather = async () => HOT;
    await open("/run?template=easy_30&scheduledRunId=runday_today");
    expect(await screen.findByText("Hot day on the card")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Swap/ })).toBeNull();
  });
});
