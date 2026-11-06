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
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import Run from "../Run";
import { localDateString, localWeekKey } from "@/lib/dateHelpers";
import {
  readStoredRun,
  runResumeKey,
  writeStoredRun,
  RUN_RESUME_SCHEMA_VERSION,
  type StoredRun,
} from "@/lib/runResumeStorage";
import { createRunSessionIdentity } from "@/lib/runSessionIdentity";
import { canonicalRunConfig } from "@/features/run/canonicalRunLaunch";
import { freeformPlanMetadata } from "@/lib/runPlanMetadata";
import type { ProgramState } from "@/features/program/programTypes";
import { FIRST_RUN_CHECK_MS } from "@/features/run/startOnArrival";
import { RUN } from "@/test/journeyScreens";

const RACE_GOAL = { distance: "10k", targetDate: "2099-04-18" };
const HOME_START = "/run?template=easy_30&scheduledRunId=runday_today&start=1";

const h = vi.hoisted(() => ({
  runMode: "race_prep",
  legacyAllowed: true,
  programState: null as unknown,
  gpsCalls: [] as string[],
  hint: { owed: false, loading: false, runCount: 0 },
  launchCardRenders: 0,
  pickerRenders: 0,
  gpsPermission: "prompt" as string,
  gpsError: null as string | null,
  native: false,
  openedSettings: 0,
  user: undefined as { uid: string } | undefined,
  authority: null as Record<string, unknown> | null,
  launch: vi.fn(),
  wake: vi.fn(async () => {}),
  timerStarts: 0,
  genericCueCalls: 0,
  points: [] as { lat: number; lon: number; timestamp: number }[],
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
    user: h.user,
    profile: { uid: "arrival-test", runMode: h.runMode, raceGoal: RACE_GOAL },
  }),
  useUidForStorageKey: () => "arrival-test",
  useUid: () => "arrival-test",
}));
vi.mock("@/features/program/useRunningPrescriptionGate", () => ({
  useRunningPrescriptionGate: () => ({
    legacyAllowed: h.legacyAllowed,
    authority: h.authority,
    status: h.legacyAllowed ? "inactive" : h.authority ? "ready" : "pending",
  }),
}));
vi.mock("@/features/program/runningPrescriptionFeature", () => ({
  RUNNING_PRESCRIPTION_GATE_ENABLED: true,
  CANONICAL_RUNNING_LAUNCH_ENABLED: true,
}));
vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({
  auth: {
    get currentUser() {
      return h.user ?? null;
    },
  },
  db: {},
  functions: {},
}));
vi.mock("@/hooks/usePrivacyZones", () => ({
  warmPrivacyZones: async () => {},
}));
vi.mock("firebase/functions", () => ({
  httpsCallable:
    (_functions: unknown, name: string) => async (request: unknown) => ({
      data: await h.launch(request, name),
    }),
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
    points: h.points,
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
    start: () => {
      h.timerStarts++;
    },
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
  useWakeLock: () => ({ request: () => h.wake(), release: async () => {} }),
}));
vi.mock("@/hooks/useHeartRate", () => ({
  useHeartRate: () => ({ bpm: null }),
}));
vi.mock("@/hooks/useAudioCues", () => ({
  useAudioCues: () => ({
    prime: () => {},
    speak: () => {},
    checkDistanceCue: () => {
      h.genericCueCalls++;
    },
    checkTimeCue: () => {
      h.genericCueCalls++;
    },
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
  h.legacyAllowed = true;
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
  h.user = undefined;
  h.authority = null;
  h.launch.mockReset();
  h.wake.mockReset().mockResolvedValue(undefined);
  h.timerStarts = 0;
  h.genericCueCalls = 0;
  h.points = [];
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: true,
  });
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.useRealTimers();
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

describe("a run whose location is refused", () => {
  function refuse() {
    h.gpsPermission = "denied";
    h.gpsError = "User denied Geolocation";
  }

  it("says location is off rather than that it is still searching", async () => {
    refuse();
    await open("/run?start=1");
    expect(screen.getByText("Location is off for Tropos")).toBeInTheDocument();
    expect(screen.queryByText("Acquiring GPS...")).toBeNull();
    expect(
      screen.queryByText("Move to an open area away from buildings")
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Track without GPS" })
    ).toBeInTheDocument();
  });

  it("opens the phone's settings from the app", async () => {
    refuse();
    h.native = true;
    await open("/run?start=1");
    fireEvent.click(screen.getByRole("button", { name: "Open settings" }));
    expect(h.openedSettings).toBe(1);
  });

  it("offers no Settings button on the web, where there is none to open", async () => {
    refuse();
    await open("/run?start=1");
    expect(screen.queryByRole("button", { name: "Open settings" })).toBeNull();
    expect(screen.getByText(/browser's settings/)).toBeInTheDocument();
  });
});

describe("the note about time in the background", () => {
  it("leaves no timer behind when the screen closes while it shows", async () => {
    const pending = new Set<unknown>();
    const realSet = globalThis.setTimeout;
    const realClear = globalThis.clearTimeout;
    const setSpy = vi.spyOn(globalThis, "setTimeout").mockImplementation(((
      fn: () => void,
      ms?: number
    ) => {
      const id = realSet(() => {
        pending.delete(id);
        fn();
      }, ms);
      if (ms === 6000) pending.add(id);
      return id;
    }) as typeof setTimeout);
    const clearSpy = vi.spyOn(globalThis, "clearTimeout").mockImplementation(((
      id: unknown
    ) => {
      pending.delete(id);
      realClear(id as ReturnType<typeof setTimeout>);
    }) as typeof clearTimeout);
    try {
      await open("/run?start=1");
      act(() => visibility.onVisible?.({ hiddenDuration: 30 }));
      expect(pending.size).toBe(1);
      cleanup();
      expect(pending.size).toBe(0);
    } finally {
      setSpy.mockRestore();
      clearSpy.mockRestore();
    }
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

describe("prescription compatibility on the real Run entrypoint", () => {
  it.each([
    HOME_START,
    "/run?type=tempo&start=1",
    "/run?scheduledRunId=runday_today&start=1",
    "/run?template=tempo_20",
  ])("blocks cached prescribed launch via %s", async (url) => {
    h.legacyAllowed = false;
    planTodaysEasyRun();
    await open(url);
    expect(screen.getByText("Run guidance is unavailable")).toBeInTheDocument();
    expect(h.gpsCalls).not.toContain("start");
    expect(h.launchCardRenders).toBe(0);
    expect(h.pickerRenders).toBe(0);
  });
  it("still records and saves a voluntary treadmill activity without the old plan claim", async () => {
    h.legacyAllowed = false;
    planTodaysEasyRun();
    await open(HOME_START);
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Record on a treadmill" })
      )
    );
    await saveOnTheTreadmill("5");
    expect(
      screen.getByText("freerun · treadmill · no plan · 5000 m")
    ).toBeInTheDocument();
  });
  it("does not automatically resume stored prescribed guidance", async () => {
    h.legacyAllowed = false;
    saveInterruptedRun();
    await open("/run?resume=1");
    expect(h.gpsCalls).not.toContain("start");
    expect(
      screen.getByRole("button", { name: "Continue without coaching" })
    ).toBeInTheDocument();
  });
});

function canonicalToday() {
  h.user = { uid: "arrival-test" };
  h.legacyAllowed = false;
  const session = {
    id: "canonical_today",
    date: new Date().toISOString().slice(0, 10),
    templateId: "run_walk_1",
    minutes: 29,
    kind: "run_walk" as const,
  };
  const authority = {
    schemaVersion: 1,
    accountId: h.user.uid,
    revision: 4,
    timeZone: "UTC",
    holds: [] as string[],
    migration: { version: 1, status: "complete" },
    constraints: {
      reviewConfirmation: {
        version: 1,
        confirmed: true,
        authorityRevision: 4,
        raceGoalId: null,
      },
    },
    plan: { raceGoalId: null, sessions: [session] },
  };
  h.authority = authority;
  const response = () => ({
    schemaVersion: 1 as const,
    accountId: authority.accountId,
    revision: authority.revision,
    raceGoalId: null,
    timeZone: "UTC",
    session,
    authorizedAtMs: Date.now(),
    expiresAtMs: Date.now() + 15000,
  });
  h.launch.mockImplementation(async (request: { activityId?: string }) => ({
    ...response(),
    ...(request.activityId
      ? { activityId: request.activityId, launchId: `launch_${"a".repeat(64)}` }
      : {}),
  }));
  return { authority, response };
}
describe("canonical launch through the mounted Run route", () => {
  it.each(["other run", "recorded", "stale recorded", "corrupt"])(
    "preserves %s storage when discarding failed preparation",
    async (replacement) => {
      const { response } = canonicalToday();
      h.launch.mockImplementation(async (request: { activityId?: string }) => {
        if (request.activityId) throw Error("Start could not be confirmed.");
        return response();
      });
      await open("/run?canonicalSessionId=canonical_today");
      fireEvent.click(
        await screen.findByRole("button", {
          name: "Check and start today's session",
        })
      );
      await screen.findByText("Acquiring GPS...");
      fireEvent.click(screen.getByRole("button", { name: RUN.gpsTreadmill }));
      await screen.findByRole("button", { name: "Discard unstarted session" });
      const saved = readStoredRun("arrival-test")!;
      if (replacement === "other run" || replacement === "stale recorded")
        saved.identity = createRunSessionIdentity(
          "arrival-test",
          "other_activity",
          saved.config,
          saved.startedAt
        );
      if (replacement === "recorded" || replacement === "stale recorded") {
        saved.recordingStartedAt = saved.startedAt;
        saved.accumulatedSeconds = 30;
      }
      if (replacement === "stale recorded")
        saved.lastWriteAt = Date.now() - 7 * 60 * 60 * 1000;
      writeStoredRun("arrival-test", saved);
      if (replacement === "corrupt")
        localStorage.setItem(runResumeKey("arrival-test"), "{broken");
      const before = { ...localStorage };
      fireEvent.click(
        screen.getByRole("button", { name: "Discard unstarted session" })
      );
      expect({ ...localStorage }).toEqual(before);
      expect(h.timerStarts).toBe(0);
      expect(h.launch).toHaveBeenCalledTimes(2);
    }
  );

  it("shows Activity recorded and never offers another Start for a linked canonical session", async () => {
    const { authority } = canonicalToday();
    Object.assign(authority, {
      recordedActivityLinks: {
        canonical_today: { activityId: "saved_activity" },
      },
    });
    authority.constraints.reviewConfirmation.authorityRevision--; // Link bumps revision and requires re-review elsewhere.
    await open("/run?canonicalSessionId=canonical_today");
    await screen.findByText("Activity recorded");
    expect(
      screen.queryByRole("button", { name: "Check and start today's session" })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Record without guidance" })
    ).toBeEnabled();
    expect(h.launch).not.toHaveBeenCalled();
  });

  it("asks for a current review after adoption rather than showing a dead Start", async () => {
    const { authority } = canonicalToday();
    authority.constraints.reviewConfirmation.authorityRevision--;
    await open("/run?canonicalSessionId=canonical_today");
    expect(
      await screen.findByRole("button", { name: "Review plan before starting" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Check and start today's session" })
    ).not.toBeInTheDocument();
    expect(h.launch).not.toHaveBeenCalled();
  });
  it("blocks a hold that arrives during wake-lock setup before calling the server", async () => {
    const { authority } = canonicalToday();
    let ready!: () => void;
    h.wake.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          ready = resolve;
        })
    );
    await open(
      "/run?canonicalSessionId=canonical_today&template=tempo_20&start=1"
    );
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Check and start today's session",
      })
    );
    await waitFor(() => expect(h.wake).toHaveBeenCalledOnce());
    authority.holds.push("review_required");
    await act(async () => ready());
    expect(h.launch).not.toHaveBeenCalled();
    expect(h.gpsCalls).not.toContain("start");
    expect(h.timerStarts).toBe(0);
  });
  it("rechecks after GPS preparation, preserves provenance, and does not claim a legacy completion", async () => {
    canonicalToday();
    await open(
      "/run?canonicalSessionId=canonical_today&scheduledRunId=legacy_old"
    );
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Check and start today's session",
      })
    );
    await screen.findByText("Acquiring GPS...");
    expect(h.launch).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: RUN.gpsTreadmill }));
    await waitFor(() => expect(h.timerStarts).toBe(1));
    expect(h.launch).toHaveBeenCalledTimes(2);
    expect(h.genericCueCalls).toBe(0); // Run-walk uses its steps, never generic pace announcements.
    const saved = readStoredRun("arrival-test");
    expect(saved?.config.canonicalLaunch?.session.id).toBe("canonical_today");
    expect(saved?.config.planMetadata.scheduledRunId).toBeNull();
    await saveOnTheTreadmill("3");
    expect(
      screen.getByText("easy · treadmill · no plan · 3000 m")
    ).toBeInTheDocument();
  });
  it("does not start the timer when authority changes during the final treadmill recheck", async () => {
    const { authority, response } = canonicalToday();
    let resolve!: (value: unknown) => void;
    h.launch.mockResolvedValueOnce(response()).mockImplementationOnce(
      () =>
        new Promise((yes) => {
          resolve = yes;
        })
    );
    await open("/run?canonicalSessionId=canonical_today");
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Check and start today's session",
      })
    );
    await screen.findByText("Acquiring GPS...");
    fireEvent.click(screen.getByRole("button", { name: RUN.gpsTreadmill }));
    await waitFor(() => expect(h.launch).toHaveBeenCalledTimes(2));
    authority.revision++;
    await act(async () =>
      resolve({
        ...response(),
        activityId: h.launch.mock.calls[1][0].activityId,
        launchId: `launch_${"a".repeat(64)}`,
      })
    );
    expect(h.timerStarts).toBe(0);
    expect(
      await screen.findByRole("button", { name: "Review plan before starting" })
    ).toBeInTheDocument();
  });
  it("requires a fresh server check after the GPS countdown and blocks a late hold", async () => {
    const { authority, response } = canonicalToday();
    h.points = [{ lat: 51.5, lon: -0.12, timestamp: Date.now() }];
    let resolve!: (value: unknown) => void;
    h.launch.mockResolvedValueOnce(response()).mockImplementationOnce(
      () =>
        new Promise((yes) => {
          resolve = yes;
        })
    );
    await open("/run?canonicalSessionId=canonical_today");
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Check and start today's session",
      })
    );
    await waitFor(() => expect(h.gpsCalls).toContain("start"));
    // Keep real timers here: the countdown owns three one-second transitions.
    await waitFor(() => expect(h.launch).toHaveBeenCalledTimes(2), {
      timeout: 6000,
    });
    expect(h.timerStarts).toBe(0);
    authority.holds.push("review_required");
    await act(async () =>
      resolve({
        ...response(),
        activityId: h.launch.mock.calls[1][0].activityId,
        launchId: `launch_${"a".repeat(64)}`,
      })
    );
    expect(h.timerStarts).toBe(0);
    expect(
      await screen.findByRole("button", { name: "Review plan before starting" })
    ).toBeInTheDocument();
  });
  it("ignores a delayed final authorization after Cancel", async () => {
    const { response } = canonicalToday();
    let resolve!: (value: unknown) => void;
    h.launch.mockResolvedValueOnce(response()).mockImplementationOnce(
      () =>
        new Promise((yes) => {
          resolve = yes;
        })
    );
    await open("/run?canonicalSessionId=canonical_today");
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Check and start today's session",
      })
    );
    await screen.findByText("Acquiring GPS...");
    fireEvent.click(screen.getByRole("button", { name: RUN.gpsTreadmill }));
    await waitFor(() => expect(h.launch).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await act(async () =>
      resolve({
        ...response(),
        activityId: h.launch.mock.calls[1][0].activityId,
        launchId: `launch_${"a".repeat(64)}`,
      })
    );
    expect(h.timerStarts).toBe(0);
    expect(
      await screen.findByRole("button", {
        name: "Check and start today's session",
      })
    ).toBeInTheDocument();
  });
  it("serializes a treadmill choice against a late GPS fix instead of stranding countdown", async () => {
    const { response } = canonicalToday();
    let resolve!: (value: unknown) => void;
    h.launch.mockResolvedValueOnce(response()).mockImplementationOnce(
      () =>
        new Promise((yes) => {
          resolve = yes;
        })
    );
    await open("/run?canonicalSessionId=canonical_today");
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Check and start today's session",
      })
    );
    await screen.findByText("Acquiring GPS...");
    fireEvent.click(screen.getByRole("button", { name: RUN.gpsTreadmill }));
    await waitFor(() => expect(h.launch).toHaveBeenCalledTimes(2));
    h.points = [{ lat: 51.5, lon: -0.12, timestamp: Date.now() }];
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1100));
    });
    expect(screen.getByText("Acquiring GPS...")).toBeInTheDocument();
    expect(h.timerStarts).toBe(0);
    await act(async () =>
      resolve({
        ...response(),
        activityId: h.launch.mock.calls[1][0].activityId,
        launchId: `launch_${"a".repeat(64)}`,
      })
    );
    await waitFor(() => expect(h.timerStarts).toBe(1));
    expect(h.launch).toHaveBeenCalledTimes(2);
  });
  it("does not restore cached canonical coaching when legacy access is re-enabled", async () => {
    const { response } = canonicalToday();
    const config = canonicalRunConfig(response(), {
      audioCues: true,
      place: "treadmill",
    });
    h.legacyAllowed = true; // Rollback/default-off legacy path.
    h.authority = null;
    saveInterruptedRun();
    const stored = readStoredRun("arrival-test")!;
    expect(writeStoredRun("arrival-test", { ...stored, config })).toBe(true);
    await open("/run?resume=1");
    expect(h.launch).not.toHaveBeenCalled();
    expect(h.timerStarts).toBe(0);
    const resume = screen.getByRole("button", {
      name: "Continue without coaching",
    });
    await act(async () => fireEvent.click(resume));
    await saveOnTheTreadmill("2");
    expect(
      screen.getByText("freerun · treadmill · no plan · 2000 m")
    ).toBeInTheDocument();
    expect(h.launch).not.toHaveBeenCalled();
  });
  it("retries an uncertain registration with the same allocated activity, never a second run id", async () => {
    const { response } = canonicalToday();
    let registrations = 0;
    let originalProof: ReturnType<typeof response> | null = null;
    const activityIds: string[] = [];
    h.launch.mockImplementation(async (request: { activityId?: string }) => {
      if (request.activityId) {
        activityIds.push(request.activityId);
        if (++registrations === 1) {
          originalProof = response();
          throw Error("The start check could not be confirmed. Try again.");
        }
      }
      return {
        ...(request.activityId ? originalProof! : response()),
        ...(request.activityId
          ? {
              activityId: request.activityId,
              launchId: `launch_${"a".repeat(64)}`,
            }
          : {}),
      };
    });
    await open("/run?canonicalSessionId=canonical_today");
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Check and start today's session",
      })
    );
    await screen.findByText("Acquiring GPS...");
    fireEvent.click(screen.getByRole("button", { name: RUN.gpsTreadmill }));
    await screen.findByRole("button", {
      name: "Check and start today's session",
    });
    expect(h.timerStarts).toBe(0);
    fireEvent.click(
      screen.getByRole("button", { name: "Check and start today's session" })
    );
    await screen.findByText("Acquiring GPS...");
    fireEvent.click(screen.getByRole("button", { name: RUN.gpsTreadmill }));
    await waitFor(() => expect(h.timerStarts).toBe(1));
    expect(activityIds).toHaveLength(2);
    expect(activityIds[1]).toBe(activityIds[0]);
    const persisted = readStoredRun("arrival-test")!;
    expect(persisted.config.canonicalLaunch).toMatchObject({
      activityId: activityIds[0],
      launchId: `launch_${"a".repeat(64)}`,
    });
    expect(persisted.recordingStartedAt).toBeGreaterThanOrEqual(
      persisted.startedAt
    );
  });
  it.each(["expired response", "server expiry error"])(
    "makes %s terminal until explicit discard of unstarted preparation",
    async (failure) => {
      let clock = Date.now();
      const dateNow = vi.spyOn(Date, "now").mockImplementation(() => clock);
      try {
        const { response } = canonicalToday();
        let original: ReturnType<typeof response> | null = null;
        const ids: string[] = [];
        h.launch.mockImplementation(
          async (request: { activityId?: string }) => {
            if (!request.activityId) return response();
            ids.push(request.activityId);
            if (!original) {
              original = response();
              throw Error("The start check could not be confirmed.");
            }
            if (failure === "server expiry error")
              throw Object.assign(
                Error("Running session needs to be refreshed."),
                {
                  code: "functions/failed-precondition",
                  details: { errorCode: "launch-authorization-expired" },
                }
              );
            return {
              ...original,
              activityId: request.activityId,
              launchId: `launch_${"a".repeat(64)}`,
            };
          }
        );
        await open("/run?canonicalSessionId=canonical_today");
        fireEvent.click(
          await screen.findByRole("button", {
            name: "Check and start today's session",
          })
        );
        await screen.findByText("Acquiring GPS...");
        fireEvent.click(screen.getByRole("button", { name: RUN.gpsTreadmill }));
        await screen.findByRole("button", {
          name: "Discard unstarted session",
        });
        clock += 16_000; // The server receipt is immutable, including its original expiry.
        fireEvent.click(
          screen.getByRole("button", {
            name: "Check and start today's session",
          })
        );
        await screen.findByText("Acquiring GPS...");
        fireEvent.click(screen.getByRole("button", { name: RUN.gpsTreadmill }));
        await screen.findByText(
          /This start check expired before recording began/
        );
        expect(ids).toHaveLength(2);
        expect(ids[1]).toBe(ids[0]);
        expect(h.timerStarts).toBe(0);
        expect(
          screen.queryByRole("button", {
            name: "Check and start today's session",
          })
        ).not.toBeInTheDocument();
        expect(
          screen.getByRole("button", { name: "Record without guidance" })
        ).toBeEnabled();
        expect(readStoredRun("arrival-test")?.identity?.runId).toBe(ids[0]);
        const calls = h.launch.mock.calls.length;
        fireEvent.click(
          screen.getByRole("button", { name: "Discard unstarted session" })
        );
        expect(h.launch).toHaveBeenCalledTimes(calls); // No cancellation/renewal server mutation.
        expect(readStoredRun("arrival-test")).toBeNull();
        fireEvent.click(
          await screen.findByRole("button", {
            name: "Check and start today's session",
          })
        );
        await screen.findByText("Acquiring GPS...");
        expect(readStoredRun("arrival-test")?.identity?.runId).not.toBe(ids[0]);
        expect(h.timerStarts).toBe(0); // Explicit new preparation still needs new registration.
      } finally {
        dateNow.mockRestore();
      }
    }
  );
});
