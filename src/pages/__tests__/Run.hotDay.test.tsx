/**
 * A hot day where a run is started (heatAdjustment.ts, the owner's heat
 * adjustment), through the real Run page with device I/O stubbed. Home's
 * Start of a planned run on a hot day with something to offer shows the
 * run's card instead of starting; Adjust for heat starts the session from
 * the eased paces with the adjustment on the run, Clear gives back the
 * plan's; a swap starts an easy run of the session's minutes; an extreme
 * day shows its advice and still starts on Start; a heart-rate ceiling,
 * from a live source and a measured max, speaks over the ceiling. Any run
 * started on a hot day carries `hotDay` to the summary. A mild day, a run
 * with nothing to adjust and a slow weather read start as before.
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
import { heatEasedPaceTable } from "@/lib/heatAdjustment";
import { paceTableFromFitness, resolveSessionPaces } from "@/lib/runPaces";
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
/** 36°C at 80%: about 192°F, past the table: hard running not advised. */
const EXTREME = { ...HOT, temperature: 36, feelsLike: 45, humidity: 80 };
/** A 25-minute 5K, confirmed: the plan's paces come from it. */
const FITNESS = { benchmark: { distanceM: 5000, timeS: 1500 }, vdot: null };

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
  runFitness: null as unknown,
  maxHeartRate: null as number | null,
  hrLive: false,
  bpm: null as number | null,
  spoken: [] as string[],
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
    profile: {
      uid: "arrival-test",
      runMode: h.runMode,
      raceGoal: RACE_GOAL,
      runFitness: h.runFitness,
      maxHeartRate: h.maxHeartRate,
    },
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
vi.mock("@/lib/heartRateSource", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/heartRateSource")>()),
  // A fake live source: available where the test says, never streaming
  // (the hook below hands the run its beats).
  getHeartRateSource: () => ({
    available: h.hrLive,
    subscribe: () => ({ stop() {} }),
  }),
}));
vi.mock("@/hooks/useHeartRate", () => ({
  useHeartRate: () => ({ bpm: h.bpm }),
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
vi.mock("@/components/run/RouteSetupSection", () => ({ default: () => null }));
vi.mock("@/components/run/ShoeSelector", () => ({ default: () => null }));
vi.mock("@/components/run/RunLaunchCard", () => ({
  default: ({
    onStart,
    heat,
    paceRange,
  }: {
    onStart: () => void;
    paceRange?: string | null;
    heat?: {
      level: string;
      line: string;
      adjust?: {
        accepted: boolean;
        adjustedLine: string;
        onAccept: () => void;
        onClear: () => void;
      } | null;
      swap?: { line: string; label: string; onSwap: () => void } | null;
    } | null;
  }) => {
    h.launchCardRenders += 1;
    return (
      <>
        <button onClick={onStart}>The run's card</button>
        {heat && <p>{heat.line}</p>}
        {paceRange && <p>{`Range ${paceRange}`}</p>}
        {heat?.adjust &&
          (heat.adjust.accepted ? (
            <>
              <p>{heat.adjust.adjustedLine}</p>
              <button onClick={heat.adjust.onClear}>Clear adjustment</button>
            </>
          ) : (
            <button onClick={heat.adjust.onAccept}>Adjust for heat</button>
          ))}
        {heat?.swap && (
          <button onClick={heat.swap.onSwap}>{heat.swap.label}</button>
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
      heatAdjustment?: {
        from: number;
        to: number;
        effortOnly?: boolean;
        hrCeiling?: number;
      };
      planMetadata?: { scheduledRunId: string | null };
    };
  };
  const { activityType, target, hotDay, heatAdjustment, planMetadata } =
    state.runConfig;
  const adjusted = heatAdjustment
    ? `adjusted ${heatAdjustment.from}–${heatAdjustment.to}${heatAdjustment.effortOnly ? " by feel" : ""}${heatAdjustment.hrCeiling ? ` under ${heatAdjustment.hrCeiling} bpm` : ""}`
    : "not adjusted";
  return (
    <p>
      {`${activityType} · ${target.type} ${target.value ?? "-"} · ${hotDay ? "hot day" : "no hot day"} · ${adjusted} · ${planMetadata?.scheduledRunId ?? "no plan"}`}
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
  h.runFitness = null;
  h.maxHeartRate = null;
  h.hrLive = false;
  h.bpm = null;
  h.spoken = [];
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

async function tap(name: string) {
  await act(async () => {
    fireEvent.click(await screen.findByRole("button", { name }));
  });
}

/** The tempo's pace from the eased table: 6–8% slower on HOT. */
function easedTempoPace() {
  const table = paceTableFromFitness(FITNESS);
  return resolveSessionPaces(
    "tempo",
    heatEasedPaceTable(table, { from: 0.06, to: 0.08 })
  ).targetPace!;
}

describe("a hot day, started from Home", () => {
  beforeEach(() => {
    h.runFitness = FITNESS;
  });

  it("shows the tempo's card with the offer and the swap, and starts nothing", async () => {
    planToday("tempo_30");
    h.weather = async () => HOT;
    await open(HOME_TEMPO);
    expect(
      await screen.findByText(
        "By a common rule of thumb, this heat slows the same effort by 6–8%."
      )
    ).toBeInTheDocument();
    expect(h.gpsCalls).not.toContain("start");
    expect(
      screen.getByRole("button", { name: "Adjust for heat" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Run easy instead" })
    ).toBeInTheDocument();
    // The start flag is off the address: a reload shows the card again.
    expect(screen.getByTestId("address")).toHaveTextContent(
      /^\?template=tempo_30&scheduledRunId=runday_today$/
    );
  });

  it("starts the tempo as planned when the offer isn't taken", async () => {
    planToday("tempo_30");
    h.weather = async () => HOT;
    await open(HOME_TEMPO);
    await tap("The run's card");
    await finishOnTheTreadmill();
    expect(
      screen.getByText(
        "tempo · pace 319 · hot day · not adjusted · runday_today"
      )
    ).toBeInTheDocument();
  });

  it("adjusts the tempo for heat: the eased pace as a range, then the run carries it", async () => {
    planToday("tempo_30");
    h.weather = async () => HOT;
    await open(HOME_TEMPO);
    await tap("Adjust for heat");
    // 5:19 /km eased 6–8%: shown as a range, never one pace.
    expect(
      screen.getByText("Adjusted for heat: work at 5:38–5:45 /km.")
    ).toBeInTheDocument();
    expect(screen.getByText("Range 5:38–5:45 /km")).toBeInTheDocument();
    await tap("The run's card");
    await finishOnTheTreadmill();
    expect(
      screen.getByText(
        `tempo · pace ${easedTempoPace()} · hot day · adjusted 0.06–0.08 · runday_today`
      )
    ).toBeInTheDocument();
  });

  it("clears the adjustment back to the plan's tempo", async () => {
    planToday("tempo_30");
    h.weather = async () => HOT;
    await open(HOME_TEMPO);
    await tap("Adjust for heat");
    await tap("Clear adjustment");
    await tap("The run's card");
    await finishOnTheTreadmill();
    expect(
      screen.getByText(
        "tempo · pace 319 · hot day · not adjusted · runday_today"
      )
    ).toBeInTheDocument();
  });

  it("swaps the tempo for an easy run of its 45 minutes", async () => {
    planToday("tempo_30");
    h.weather = async () => HOT;
    await open(HOME_TEMPO);
    await tap("Run easy instead");
    expect(screen.getByText("Acquiring GPS…")).toBeInTheDocument();
    await finishOnTheTreadmill();
    expect(
      screen.getByText(
        "easy · time 2700 · hot day · not adjusted · runday_today"
      )
    ).toBeInTheDocument();
  });

  it("offers an easy run a slower easy limit", async () => {
    planToday("easy_30");
    h.weather = async () => HOT;
    await open(HOME_EASY);
    await tap("Adjust for heat");
    expect(
      screen.getByText(
        /^Adjusted for heat: keep easy running slower than \d+:\d{2} \/km\.$/
      )
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /instead$/ })).toBeNull();
  });

  it("starts the tempo straight away on a mild day, with no hot day on it", async () => {
    planToday("tempo_30");
    h.weather = async () => MILD;
    await open(HOME_TEMPO);
    expect(await screen.findByText("Acquiring GPS…")).toBeInTheDocument();
    expect(h.launchCardRenders).toBe(0);
    await finishOnTheTreadmill();
    expect(
      screen.getByText(
        "tempo · pace 319 · no hot day · not adjusted · runday_today"
      )
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

describe("a hot day with nothing to adjust", () => {
  it("starts an easy run with no confirmed paces straight away, carrying the hot day", async () => {
    planToday("easy_30");
    h.weather = async () => HOT;
    await open(HOME_EASY);
    expect(await screen.findByText("Acquiring GPS…")).toBeInTheDocument();
    expect(h.launchCardRenders).toBe(0);
    await finishOnTheTreadmill();
    expect(
      screen.getByText(
        "easy · time 1800 · hot day · not adjusted · runday_today"
      )
    ).toBeInTheDocument();
  });
});

describe("an extreme day", () => {
  it("shows the run's card, advising against running outside, and Start still runs it", async () => {
    planToday("easy_30");
    h.weather = async () => EXTREME;
    await open(HOME_EASY);
    expect(
      await screen.findByText(
        "Running outside isn’t advised in this heat. If you go, run by feel."
      )
    ).toBeInTheDocument();
    expect(h.gpsCalls).not.toContain("start");
    await tap("The run's card");
    expect(screen.getByText("Acquiring GPS…")).toBeInTheDocument();
  });

  it("adjusts a tempo to effort only: no pace target", async () => {
    h.runFitness = FITNESS;
    planToday("tempo_30");
    h.weather = async () => EXTREME;
    await open(HOME_TEMPO);
    await tap("Adjust for heat");
    expect(
      screen.getByText("Adjusted for heat: no pace targets, so run by feel.")
    ).toBeInTheDocument();
    await tap("The run's card");
    await finishOnTheTreadmill();
    expect(
      screen.getByText(
        "tempo · none - · hot day · adjusted 0.08–0.1 by feel · runday_today"
      )
    ).toBeInTheDocument();
  });
});

describe("a heart-rate ceiling, from a live source and a measured max", () => {
  beforeEach(() => {
    h.runFitness = FITNESS;
    h.hrLive = true;
    h.maxHeartRate = 190;
  });

  it("offers the tempo's ceiling in place of its paces, and speaks over it", async () => {
    planToday("tempo_30");
    h.weather = async () => HOT;
    await open(HOME_TEMPO);
    await tap("Adjust for heat");
    // The top of the tempo's zone, Z4, at a measured 190.
    expect(
      screen.getByText("Adjusted for heat: keep your heart rate under 171 bpm.")
    ).toBeInTheDocument();
    h.bpm = 178;
    await tap("The run's card");
    fireEvent.click(screen.getByRole("button", { name: RUN.gpsTreadmill }));
    await vi.waitFor(() =>
      expect(h.spoken).toContain("Heart rate over 171. Ease off in the heat.")
    );
    await saveOnTheTreadmill("5");
    expect(
      screen.getByText(
        `tempo · pace ${easedTempoPace()} · hot day · adjusted 0.06–0.08 under 171 bpm · runday_today`
      )
    ).toBeInTheDocument();
  });

  it("says nothing while no beats arrive, and offers no ceiling without a live source", async () => {
    planToday("tempo_30");
    h.weather = async () => HOT;
    await open(HOME_TEMPO);
    await tap("Adjust for heat");
    await tap("The run's card");
    fireEvent.click(screen.getByRole("button", { name: RUN.gpsTreadmill }));
    await saveOnTheTreadmill("5");
    expect(h.spoken.filter((line) => /Heart rate/.test(line))).toEqual([]);
    cleanup();

    h.hrLive = false;
    await open(HOME_TEMPO);
    await tap("Adjust for heat");
    expect(
      screen.getByText("Adjusted for heat: work at 5:38–5:45 /km.")
    ).toBeInTheDocument();
  });
});
