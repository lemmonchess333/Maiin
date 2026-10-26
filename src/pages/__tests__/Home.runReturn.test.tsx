/**
 * The runner's return on Home: which sheet the `run-return` surface opens,
 * what its actions do, and that it never shows beside another of Home's
 * blocking surfaces.
 *
 * Who is greeted is `runReturn.test.ts`'s and `useRunReturn.test.tsx`'s;
 * here the assessment is handed in, and Home is rendered for real inside
 * the real surface coordinator, with its data hooks replaced as in
 * Home.dayAndWeek.test.tsx. The two run sheets are real; the rest of
 * Home's sheets are stubs, the lift's drawn as a marker so the suite can
 * see which surface won. Dates come from the clock.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addLocalDays, localDateString } from "@/lib/dateHelpers";

const h = vi.hoisted(() => ({
  profile: null as any,
  programState: null as any,
  workouts: [] as Array<Record<string, unknown>>,
  runReturn: { daysAway: null, dismissKey: null, offer: null } as {
    daysAway: number | null;
    dismissKey: string | null;
    offer: "easy-run" | "rebuild" | null;
  },
  recentLayoff: "none" as "none" | "gap" | "detrained",
  /** Dismissal keys stored this test, for the two return surfaces. */
  dismissed: new Set<string>(),
  realignRacePlan: vi.fn(),
  dismissFellBehindPrompt: vi.fn(),
  /** The goal-reached ask, a surface below the run return's. */
  goalOffer: null as null | Record<string, unknown>,
}));

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {}, auth: { currentUser: null } }));
vi.mock("framer-motion", () => {
  const strip = (props: any) => {
    const {
      initial: _i,
      animate: _a,
      exit: _e,
      transition: _t,
      variants: _v,
      whileTap: _w,
      whileHover: _wh,
      layout: _l,
      custom: _c,
      ...rest
    } = props;
    return rest;
  };
  const tags = new Map<string, (props: any) => any>();
  return {
    motion: new Proxy(
      {},
      {
        get: (_t: any, tag: string) => {
          if (!tags.has(tag)) {
            const Tag = tag as any;
            tags.set(tag, (props: any) => <Tag {...strip(props)} />);
          }
          return tags.get(tag);
        },
      }
    ),
    AnimatePresence: ({ children }: any) => children,
    useReducedMotion: () => true,
  };
});

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { uid: "u1", displayName: "Test" },
    profile: h.profile,
    updateProfile: vi.fn(),
  }),
  useUid: () => "u1",
}));
vi.mock("@/lib/subscription", () => ({
  useSubscription: () => ({ isPro: true, isInTrial: false, trialDaysLeft: 0 }),
  isCheckoutTrialEligible: () => false,
}));
vi.mock("@/hooks/useWorkouts", () => ({
  useWorkouts: () => ({
    workouts: h.workouts,
    getWorkoutsForDate: (date: string) =>
      h.workouts.filter((w) => w.date === date),
  }),
}));
vi.mock("@/hooks/useMeals", () => {
  const getDailyTotals = () => ({
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    mealCount: 0,
  });
  return {
    useMeals: () => ({
      meals: [],
      loading: false,
      error: null,
      getDailyTotals,
    }),
  };
});
vi.mock("@/hooks/useFirestore", () => ({ useWeeklyDayMap: () => new Map() }));
vi.mock("@/hooks/useHomeData", () => ({
  useHomeData: () => ({
    lastWeightInfo: null,
    weightTrend: null,
    weightSyncStatus: "idle",
    weightAnnouncement: "",
    postWorkoutNudge: null,
    loading: false,
  }),
}));
vi.mock("@/hooks/useLifetimeRunStats", () => ({
  useLifetimeRunStats: () => ({ runCount: 0, loading: false }),
}));
vi.mock("@/features/program/useHomeProgram", () => ({
  useHomeProgram: () => ({
    programState: h.programState,
    loading: false,
    recentLayoff: h.recentLayoff,
    controller: null,
    overrideRunDay: vi.fn(),
    markManualComplete: vi.fn(),
    skipRunDay: vi.fn(),
    skipWorkoutDay: vi.fn(),
    restoreRunDay: vi.fn(),
    restoreWorkoutDay: vi.fn(),
    moveRunDay: vi.fn(),
    dismissFellBehindPrompt: h.dismissFellBehindPrompt,
    realignRacePlan: h.realignRacePlan,
    easeBackIn: vi.fn(),
  }),
}));
vi.mock("@/features/program/useRunReturn", () => ({
  useRunReturn: () => h.runReturn,
}));
vi.mock("@/hooks/useClaimMapForProgram", () => ({
  useClaimMapForProgram: () => ({
    claimMap: new Map(),
    unclaimedByDate: new Map(),
    runs: [],
    today: "",
    loading: false,
  }),
}));
vi.mock("@/features/streaks/useStreaks", () => ({
  useStreaks: () => ({
    currentStreak: 0,
    newBadge: null,
    dismissNewBadge: vi.fn(),
  }),
}));
vi.mock("@/hooks/useWaterLog", () => ({
  useWaterLog: () => ({
    ml: 0,
    target: 2000,
    logWater: vi.fn(),
    drinks: [],
    removeDrink: vi.fn(),
    servingMl: 250,
    syncStatus: "idle",
    retry: vi.fn(),
  }),
}));
vi.mock("@/hooks/useEffectiveTargets", () => ({
  useEffectiveTargets: () => ({
    finalTarget: 2200,
    protein: 150,
    carbs: 250,
    fat: 70,
  }),
}));
/* The two return surfaces' dismissals, and the goal-reached ask's, are
   recorded; every other one-time surface on Home reads as already seen, so
   none of them takes the visit. */
vi.mock("@/hooks/useDismissOnce", () => ({
  useDismissOnce: (key: string) => {
    const tracked =
      key.startsWith("tropos-run-return:") ||
      key.startsWith("tropos-lift-return:") ||
      key.startsWith("tropos-goal-reached:");
    return {
      dismissed: tracked ? h.dismissed.has(key) : true,
      dismiss: () => h.dismissed.add(key),
    };
  },
}));
vi.mock("@/hooks/useSnoozeDismiss", () => ({
  useSnoozeDismiss: () => ({ snoozed: true, snooze: vi.fn() }),
}));
vi.mock("@/hooks/useCountUp", () => ({ useCountUp: (v: number) => v }));
vi.mock("@/hooks/useSteps", () => ({
  useSteps: () => ({
    status: "unavailable",
    steps: null,
    connect: vi.fn(),
    refresh: vi.fn(),
    primingShown: true,
    ready: true,
    dismissPriming: vi.fn(),
  }),
}));
vi.mock("@/hooks/usePerformance", () => ({
  usePerformanceWeeks: () => ({
    weeks: [],
    currentWeek: null,
    previousWeek: null,
    docsAvailable: 0,
    loading: false,
  }),
}));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/homeAnalytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/lifecycleAnalytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/speechUnlock", () => ({ unlockSpeech: vi.fn() }));

/* Display-only surfaces, stubbed. The lift's return draws a marker while
   it is the surface on show. */
vi.mock("@/components/program/LiftReturnSheet", () => ({
  default: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? (
      <div role="dialog" aria-label="Lift welcome back">
        <button type="button" onClick={onClose}>
          Close the lift sheet
        </button>
      </div>
    ) : null,
}));
vi.mock("@/components/home/WeightLogSheet", () => ({ default: () => null }));
vi.mock("@/components/home/DayPeekCard", () => ({ default: () => null }));
vi.mock("@/components/home/GoalReachedSheet", () => ({
  default: ({ open }: { open: boolean }) =>
    open ? <div role="dialog" aria-label="Goal reached" /> : null,
}));
vi.mock("@/lib/goalWeightPlan", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/goalWeightPlan")>()),
  goalReachedOffer: () => h.goalOffer,
}));
vi.mock("@/components/program/DayActionSheet", () => ({
  default: () => null,
}));
vi.mock("@/components/ProModal", () => ({ default: () => null }));
vi.mock("@/features/streaks/BadgeEarnedModal", () => ({
  BadgeEarnedModal: () => null,
}));
vi.mock("@/components/home/StepsPrimingModal", () => ({
  default: () => null,
}));
vi.mock("@/components/home/TrialEndedDialog", () => ({ default: () => null }));
vi.mock("@/components/home/WaterCard", () => ({ default: () => null }));
vi.mock("@/components/home/WeightStepsTiles", () => ({ default: () => null }));
vi.mock("@/components/home/TodayEnergy", () => ({ default: () => null }));
vi.mock("@/components/home/VerifyEmailBanner", () => ({ default: () => null }));
vi.mock("@/components/home/WeeklyReviewEntry", () => ({ default: () => null }));
vi.mock("@/components/home/PerformanceHeroCard", () => ({
  default: () => null,
}));
vi.mock("@/components/home/ContextualTipBanner", () => ({
  default: () => null,
}));
vi.mock("@/components/home/TrackSectionView", () => ({
  default: ({ children }: any) => children,
}));

import Home from "../Home";
import { SurfaceCoordinatorProvider } from "@/components/SurfaceCoordinatorProvider";
import { RUN_RETURN } from "@/test/journeyScreens";

/** A day n days before today, as a key. */
const daysAgo = (n: number) => localDateString(addLocalDays(new Date(), -n));

function LocationProbe() {
  const location = useLocation();
  return (
    <output data-testid="location">
      {location.pathname + location.search}
    </output>
  );
}

function renderHome() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <SurfaceCoordinatorProvider>
        <Home />
      </SurfaceCoordinatorProvider>
      <LocationProbe />
    </MemoryRouter>
  );
}

/** The coordinator picks after its settle window; the sheet is lazy. */
const findSheet = (name: string | RegExp) =>
  screen.findByRole("dialog", { name }, { timeout: 3000 });

const freeRunner = () => ({
  uid: "u1",
  displayName: "Test",
  athleteType: "Runner",
  runMode: "freeform",
  weekSchedule: [],
});
const racePlan = () => ({
  uid: "u1",
  displayName: "Test",
  athleteType: "Runner",
  runMode: "race_prep",
  raceGoal: {
    distance: "half",
    targetDate: localDateString(addLocalDays(new Date(), 70)),
  },
  weekSchedule: [],
});
const programState = (overrides: Record<string, unknown> = {}) => ({
  goal: "recomp",
  currentPhase: "base",
  weekNumber: 3,
  splitType: "ppl",
  workouts: [],
  fatigueScore: 0,
  updatedAt: 0,
  settings: { autoProgression: true, smallPlates: false },
  weekHistory: [],
  programSchemaVersion: 2,
  runDays: [],
  ...overrides,
});

beforeEach(() => {
  h.profile = freeRunner();
  h.programState = programState();
  h.workouts = [];
  h.runReturn = { daysAway: null, dismissKey: null, offer: null };
  h.recentLayoff = "none";
  h.dismissed = new Set();
  h.realignRacePlan.mockReset();
  h.realignRacePlan.mockResolvedValue({
    status: "applied",
    timing: "healthy",
    totalWeeks: 10,
  });
  h.dismissFellBehindPrompt.mockReset();
  h.dismissFellBehindPrompt.mockResolvedValue({ status: "applied" });
  h.goalOffer = null;
});

afterEach(() => cleanup());

describe("Home — a free runner's welcome back", () => {
  beforeEach(() => {
    h.runReturn = {
      daysAway: 20,
      dismissKey: daysAgo(20),
      offer: "easy-run",
    };
  });

  it("starts the easy run on the Run page, and settles the absence", async () => {
    renderHome();
    await findSheet(RUN_RETURN.sheet);
    fireEvent.click(screen.getByRole("button", { name: RUN_RETURN.easyRun }));
    // Home's run card starts a run the same way: the template, and the
    // start that begins it as the page opens.
    await waitFor(() =>
      expect(screen.getByTestId("location").textContent).toBe(
        "/run?template=easy_20&start=1"
      )
    );
    expect(h.dismissed.has(`tropos-run-return:${daysAgo(20)}`)).toBe(true);
  });

  it("Not now starts nothing and settles the absence", async () => {
    renderHome();
    await findSheet(RUN_RETURN.sheet);
    fireEvent.click(screen.getByRole("button", { name: RUN_RETURN.notNow }));
    await waitFor(() =>
      expect(h.dismissed.has(`tropos-run-return:${daysAgo(20)}`)).toBe(true)
    );
    expect(screen.getByTestId("location").textContent).toBe("/");
  });

  it("is not shown again for an absence already settled", async () => {
    h.dismissed.add(`tropos-run-return:${daysAgo(20)}`);
    // A surface below the run return's is owed too, so the visit has
    // something to show: it can win only if the settled run return stands
    // aside, and the silence about running is measured against a sheet
    // that did open rather than a coordinator that had not picked yet.
    h.goalOffer = { storedDirection: "lose", goalWeightKg: 70, currentKg: 69 };
    renderHome();
    await findSheet("Goal reached");
    expect(
      screen.queryByRole("dialog", { name: RUN_RETURN.sheet })
    ).not.toBeInTheDocument();
  });
});

describe("Home — a race plan's welcome back", () => {
  beforeEach(() => {
    h.profile = racePlan();
    h.runReturn = { daysAway: 25, dismissKey: daysAgo(25), offer: "rebuild" };
  });

  it("opens the fell-behind sheet in its welcome-back register", async () => {
    renderHome();
    await findSheet("Welcome back");
    expect(
      screen.getByText(/It's been a while between runs/i)
    ).toBeInTheDocument();
    expect(screen.queryByText(/ of .* runs \(/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Rebuild my plan/i }));
    await waitFor(() =>
      expect(h.dismissed.has(`tropos-run-return:${daysAgo(25)}`)).toBe(true)
    );
    expect(h.realignRacePlan).toHaveBeenCalledTimes(1);
    // No weekly prompt was set, so there is none to clear.
    expect(h.dismissFellBehindPrompt).not.toHaveBeenCalled();
  });

  it("keeps the sheet open when the rebuild didn't land", async () => {
    h.realignRacePlan.mockResolvedValue({ status: "failed" });
    renderHome();
    await findSheet("Welcome back");
    fireEvent.click(screen.getByRole("button", { name: /Rebuild my plan/i }));
    await waitFor(() => expect(h.realignRacePlan).toHaveBeenCalled());
    // The retry is offered again once the attempt has settled.
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Rebuild my plan/i })
      ).not.toBeDisabled()
    );
    expect(h.dismissed.size).toBe(0);
  });

  it("My race moved goes to the run plan, settling the absence", async () => {
    renderHome();
    await findSheet("Welcome back");
    fireEvent.click(screen.getByRole("button", { name: /My race moved/i }));
    await waitFor(() =>
      expect(screen.getByTestId("location").textContent).toBe(
        "/settings/run-plan"
      )
    );
    expect(h.dismissed.has(`tropos-run-return:${daysAgo(25)}`)).toBe(true);
    expect(h.dismissFellBehindPrompt).not.toHaveBeenCalled();
  });
});

describe("Home — one welcome back at a time", () => {
  it("stands down for the weekly check's sheet, which settles it", async () => {
    h.profile = racePlan();
    h.recentLayoff = "detrained";
    h.programState = programState({
      pendingFellBehindPrompt: {
        weekKey: daysAgo(7),
        completedRatio: 0,
        realRunCount: 0,
        weeklyTarget: 3,
      },
    });
    h.runReturn = { daysAway: 25, dismissKey: daysAgo(25), offer: "rebuild" };
    renderHome();
    await findSheet("Welcome back");
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /Not now/i }));
    // It was the weekly check's sheet: its Not now clears the server flag.
    await waitFor(() => expect(h.dismissFellBehindPrompt).toHaveBeenCalled());
    await waitFor(() =>
      expect(h.dismissed.has(`tropos-run-return:${daysAgo(25)}`)).toBe(true)
    );
  });

  it("lets the lift's return go first, and greets the running next visit", async () => {
    h.profile = { ...freeRunner(), athleteType: "Hybrid" };
    h.workouts = [{ id: "w1", date: daysAgo(30), exercises: [{ sets: [{}] }] }];
    h.runReturn = {
      daysAway: 30,
      dismissKey: daysAgo(30),
      offer: "easy-run",
    };
    renderHome();
    await findSheet("Lift welcome back");
    expect(
      screen.queryByRole("dialog", { name: RUN_RETURN.sheet })
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Close the lift sheet" })
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Lift welcome back" })
      ).not.toBeInTheDocument()
    );

    // One blocking surface a visit: the run's waits for the app to come
    // back to the foreground, a new visit.
    document.dispatchEvent(new Event("visibilitychange"));
    await findSheet(RUN_RETURN.sheet);
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });
});
