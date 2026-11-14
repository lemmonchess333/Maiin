/**
 * A new account's first visit to Home: the one first-week journey every
 * account takes (App1, whole-app grill Q27), its first-week rows opening
 * their session, Home waiting for what decides its hero, and the Health
 * prompt waiting its turn.
 *
 * The older journey (a three-stop walk on the first visit, a first meal
 * and three weigh-ins on the card, the Pro offer after setup) went with
 * the comparison group, so an account stamped with it, or with no journey
 * at all, gets this one too.
 *
 * Home is rendered for real with its data hooks replaced, as in
 * Home.dayAndWeek.test.tsx. The plan is set up "now", so the first week is
 * derived from the clock rather than pinned to a date some window has to
 * contain.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  profile: null as any,
  programState: null as any,
  maintenanceFailed: false,
  workoutsFailed: false,
  workoutsLoading: false,
  mealsLoading: false,
  homeDataLoading: false,
  steps: { status: "unavailable", primingShown: true, ready: true } as {
    status: string;
    primingShown: boolean;
    ready: boolean;
  },
  isPro: true,
  track: vi.fn(),
  homeTrack: vi.fn(),
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
  /* One component per tag, as framer's own `motion.div` is one component:
     a fresh function on every read would be a new component type on every
     render, remounting what it draws. */
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
  useUidForStorageKey: () => "u1",
}));
vi.mock("@/lib/lifecycleAnalytics", () => ({ track: h.track }));
vi.mock("@/lib/subscription", () => ({
  useSubscription: () => ({
    isPro: h.isPro,
    isInTrial: false,
    trialDaysLeft: 0,
  }),
  isCheckoutTrialEligible: () => false,
}));
vi.mock("@/hooks/useWorkouts", () => ({
  useWorkouts: () => ({
    workouts: [],
    getWorkoutsForDate: () => [],
    loading: h.workoutsLoading,
    failed: h.workoutsFailed,
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
      loading: h.mealsLoading,
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
    weighInCount: 0,
    postWorkoutNudge: null,
    loading: h.homeDataLoading,
  }),
}));
vi.mock("@/hooks/useLifetimeRunStats", () => ({
  useLifetimeRunStats: () => ({ runCount: 0, loading: false }),
}));
vi.mock("@/features/program/useHomeProgram", () => ({
  useHomeProgram: () => ({
    programState: h.programState,
    loading: false,
    maintenanceFailed: h.maintenanceFailed,
    recentLayoff: "none",
    controller: null,
    overrideRunDay: vi.fn(),
    markManualComplete: vi.fn(),
    skipRunDay: vi.fn(),
    skipWorkoutDay: vi.fn(),
    restoreRunDay: vi.fn(),
    restoreWorkoutDay: vi.fn(),
    moveRunDay: vi.fn(),
    dismissFellBehindPrompt: vi.fn(),
    realignRacePlan: vi.fn(),
  }),
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
vi.mock("@/hooks/useSnoozeDismiss", () => ({
  useSnoozeDismiss: () => ({ snoozed: true, snooze: vi.fn() }),
}));
vi.mock("@/hooks/useCountUp", () => ({ useCountUp: (v: number) => v }));
vi.mock("@/hooks/useSteps", () => ({
  useSteps: () => ({
    ...h.steps,
    steps: null,
    connect: vi.fn(),
    refresh: vi.fn(),
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
vi.mock("@/lib/homeAnalytics", () => ({ track: h.homeTrack }));

vi.mock("@/components/home/WeightLogSheet", () => ({
  default: () => <div>Weigh-in sheet</div>,
}));
vi.mock("@/components/home/DayPeekCard", () => ({ default: () => null }));
vi.mock("@/components/home/GoalReachedSheet", () => ({ default: () => null }));
vi.mock("@/components/program/FellBehindSheet", () => ({
  default: () => null,
}));
vi.mock("@/components/program/LiftReturnSheet", () => ({
  default: () => null,
}));
/* The runner's return has its own suite (Home.runReturn.test.tsx). */
vi.mock("@/components/program/RunReturnSheet", () => ({
  default: () => null,
}));
vi.mock("@/features/program/useTrainingReturn", async () => {
  const { assessTrainingReturn, liftingPlan } = await vi.importActual<
    typeof import("@/features/program/trainingReturn")
  >("@/features/program/trainingReturn");
  // The lift side is the real check over the workouts Home hands in; the
  // run side's read is stubbed (useTrainingReturn.test.tsx reads it).
  return {
    useTrainingReturn: (input: {
      profile: Parameters<typeof liftingPlan>[0];
      workouts: Parameters<typeof assessTrainingReturn>[0]["workouts"];
      todayKey: string;
    }) => ({
      lift: assessTrainingReturn({
        workouts: input.workouts,
        runs: null,
        todayKey: input.todayKey,
        lifting: liftingPlan(input.profile),
        running: "none",
      }).lift,
      run: { daysAway: null, dismissKey: null, offer: null },
    }),
  };
});
vi.mock("@/components/program/DayActionSheet", () => ({
  default: () => null,
}));
vi.mock("@/components/ProModal", () => ({ default: () => null }));
vi.mock("@/features/streaks/BadgeEarnedModal", () => ({
  BadgeEarnedModal: () => null,
}));
vi.mock("@/components/home/StepsPrimingModal", () => ({
  default: ({ open }: { open: boolean }) => (
    <output data-testid="steps-prompt">{open ? "open" : "closed"}</output>
  ),
}));
vi.mock("@/components/home/TrialEndedDialog", () => ({ default: () => null }));
vi.mock("@/components/home/WaterCard", () => ({ default: () => null }));
vi.mock("@/components/home/WeightTile", () => ({ default: () => null }));
vi.mock("@/components/home/TodayEnergy", () => ({
  default: () => <section aria-label="Food">Food</section>,
}));
vi.mock("@/components/home/VerifyEmailBanner", () => ({ default: () => null }));
vi.mock("@/components/home/WeeklyReviewEntry", () => ({ default: () => null }));
vi.mock("@/components/home/ContextualTipBanner", () => ({
  default: ({ title, visible }: { title: string; visible: boolean }) =>
    visible ? <p>{title}</p> : null,
}));
vi.mock("@/components/home/TrackSectionView", () => ({
  default: ({ children }: any) => children,
}));

import Home from "../Home";

const DAY_MS = 86_400_000;

/** An account that signed up `signedUpDaysAgo` days before now and set up
 *  its plan `setUpDaysAgo` days ago (null: before setup was stamped), on a
 *  rest-day schedule, with a programme of two workouts and no run plan. */
function accountFrom(signedUpDaysAgo: number, setUpDaysAgo: number | null) {
  const began = Date.now() - signedUpDaysAgo * DAY_MS;
  const setUp =
    setUpDaysAgo === null ? null : Date.now() - setUpDaysAgo * DAY_MS - 1000;
  h.profile = {
    uid: "u1",
    displayName: "Test",
    createdAt: { toMillis: () => began },
    ...(setUp !== null && { onboardingCompletedAt: { toMillis: () => setUp } }),
    weekSchedule: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, type: "rest" })),
    weeklyWorkoutsTarget: 3,
    athleteType: "Lifter",
  };
  h.programState = {
    goal: "recomp",
    currentPhase: "base",
    weekNumber: 1,
    splitType: "full_body",
    workouts: ["Full Body Circuit A", "Full Body Circuit B"].map((dayName) => ({
      dayName,
      dayType: "full",
      exercises: [{ name: "Squat", exerciseId: "squat", sets: 3 }],
      completed: false,
    })),
    updatedAt: 0,
    settings: { autoProgression: true, smallPlates: false },
    weekHistory: [],
    programSchemaVersion: 2,
    runDays: [],
  };
}

/** A phone's boxes for everything on the page: jsdom draws no layout, and
 *  the walk Home once had waited for one. */
let restoreLayout: (() => void) | null = null;
function layOut() {
  const proto = Element.prototype;
  const original = proto.getBoundingClientRect;
  proto.getBoundingClientRect = () =>
    ({
      left: 16,
      top: 200,
      width: 360,
      height: 120,
      x: 16,
      y: 200,
      right: 376,
      bottom: 320,
      toJSON() {},
    }) as DOMRect;
  restoreLayout = () => {
    proto.getBoundingClientRect = original;
  };
}

function LocationProbe() {
  const location = useLocation();
  return (
    <output data-testid="location">
      {location.pathname + location.search}
      {location.state ? ` ${JSON.stringify(location.state)}` : ""}
    </output>
  );
}

function homeAt() {
  return (
    <MemoryRouter initialEntries={["/"]}>
      <Home />
      <LocationProbe />
    </MemoryRouter>
  );
}

function renderHome() {
  return render(homeAt());
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

/** The app is left and opened again: what Home held for the open of its
 *  first visit (`usePriorHomeVisit`) is let go, whatever test ran before. */
function reopenApp() {
  act(() => setVisibility("hidden"));
  act(() => setVisibility("visible"));
}

const cardViews = () =>
  h.track.mock.calls.filter(([event]) => event === "first_week_card_viewed");

beforeEach(() => {
  localStorage.clear();
  reopenApp();
  h.track.mockClear();
  h.homeTrack.mockClear();
  h.workoutsFailed = false;
  h.maintenanceFailed = false;
  h.workoutsLoading = false;
  h.mealsLoading = false;
  h.homeDataLoading = false;
  h.steps = { status: "unavailable", primingShown: true, ready: true };
  h.isPro = true;
  window.scrollBy = vi.fn();
  // Signup can precede the plan by days: the card counts from the
  // server's plan-completion stamp.
  accountFrom(5, 0);
});

afterEach(() => {
  cleanup();
  restoreLayout?.();
  restoreLayout = null;
});

describe("one first-week journey, whatever journey the account was stamped with", () => {
  it.each([
    ["version 2", 2],
    ["the comparison group's version 1", 1],
    ["no version", undefined],
  ])(
    "an account with %s gets no walk, and only its training on the card",
    async (_label, activationJourneyVersion) => {
      h.profile.activationJourneyVersion = activationJourneyVersion;
      // Boxes for everything, so a walk that waited for one would show.
      layOut();
      renderHome();
      const card = screen.getByRole("region", { name: "Your first week" });
      expect(card).toHaveTextContent("Day 1 of 7");
      expect(card).toHaveTextContent("Finish your first workout");
      expect(card).not.toHaveTextContent("Log your first meal");
      expect(card).not.toHaveTextContent("Weigh in on three mornings");
      expect(card).not.toHaveTextContent("weekly recap");
      await act(async () => {
        await new Promise((r) => setTimeout(r, 400));
      });
      expect(screen.queryByRole("dialog")).toBeNull();

      // Its row opens the session, as Home's card would.
      fireEvent.click(
        screen.getByRole("button", { name: /Finish your first workout/ })
      );
      expect(screen.getByTestId("location")).toHaveTextContent(
        "/program?day=0&start=1"
      );
      expect(screen.queryByRole("dialog")).toBeNull();
    }
  );

  it("counts the week from the plan's setup, not from sign-up", () => {
    accountFrom(20, 2);
    renderHome();
    expect(
      screen.getByRole("region", { name: "Your first week" })
    ).toHaveTextContent("Day 3 of 7");
  });

  it("has no card for an account set up before setup was stamped", () => {
    // Setup has been stamped since 12 October 2026: an account without the
    // stamp is past its first week, whenever it signed up.
    accountFrom(0, null);
    renderHome();
    expect(
      screen.queryByRole("heading", { name: "Your first week" })
    ).toBeNull();
  });

  it("isn't shown past the first week", () => {
    accountFrom(30, 10);
    renderHome();
    expect(
      screen.queryByRole("heading", { name: "Your first week" })
    ).toBeNull();
  });

  it("records one card view per Home visit and a training row selection", async () => {
    const view = renderHome();
    await waitFor(() => expect(cardViews()).toHaveLength(1));
    expect(h.track).toHaveBeenCalledWith("first_week_card_viewed", {
      sport: "lifter",
      firstWeekDay: 1,
    });

    view.rerender(homeAt());
    expect(cardViews()).toHaveLength(1);

    fireEvent.click(
      screen.getByRole("button", { name: /Finish your first workout/ })
    );
    expect(h.track).toHaveBeenCalledWith("first_week_task_selected", {
      sport: "lifter",
      task: "workout",
      firstWeekDay: 1,
    });
    expect(h.homeTrack).toHaveBeenCalledWith("home_card_tapped", {
      card: "first_week_workout",
      action: "start",
    });
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/program?day=0&start=1"
    );

    cleanup();
    renderHome();
    await waitFor(() => expect(cardViews()).toHaveLength(2));
  });

  it("offers a first run once the plan runs, and still counts the setup answer (App1 Q23)", async () => {
    // Set up as a lifter, with a starter goal since.
    h.profile.runMode = "starter";
    h.profile.starterGoal = { startedOn: "2026-01-01" };
    renderHome();
    expect(
      screen.getByRole("button", { name: /Finish your first workout/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Go for your first run/ })
    ).toBeInTheDocument();
    // The first-week numbers describe who set up.
    await waitFor(() =>
      expect(h.track).toHaveBeenCalledWith("first_week_card_viewed", {
        sport: "lifter",
        firstWeekDay: 1,
      })
    );
  });

  it("shows the training task while meal and weight data are still loading", () => {
    h.mealsLoading = true;
    h.homeDataLoading = true;
    renderHome();
    expect(
      screen.getByRole("button", { name: /Finish your first workout/ })
    ).toBeInTheDocument();
  });

  it("the calorie tip it replaced is gone", () => {
    renderHome();
    expect(
      screen.queryByText("Your activity is already in your target")
    ).toBeNull();
  });
});

describe("the Health steps prompt waits its turn", () => {
  it("not in the open of the app that held the first Home visit", () => {
    h.steps = { status: "unprompted", primingShown: false, ready: true };
    renderHome();
    expect(screen.getByTestId("steps-prompt")).toHaveTextContent("closed");
    cleanup();
    // Back on Home from the first session's finish, in the same open: the
    // finish has just asked about sharing and reminders.
    renderHome();
    expect(screen.getByTestId("steps-prompt")).toHaveTextContent("closed");
    cleanup();
    reopenApp();
    renderHome();
    expect(screen.getByTestId("steps-prompt")).toHaveTextContent("open");
  });

  it("waits for the account's saved answer", async () => {
    // Past its first visit: nothing else holds the prompt, so only the
    // answer can. Until it loads, "not asked yet" is the hook's default,
    // not this account's: someone who had already answered saw the prompt
    // open and close again (FV2).
    localStorage.setItem("tropos-home-visited:u1", "1");
    accountFrom(30, 30);
    h.steps = { status: "unprompted", primingShown: false, ready: false };
    const view = renderHome();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 400));
    });
    expect(screen.getByTestId("steps-prompt")).toHaveTextContent("closed");

    h.steps = { status: "unprompted", primingShown: false, ready: true };
    view.rerender(homeAt());
    await waitFor(() =>
      expect(screen.getByTestId("steps-prompt")).toHaveTextContent("open")
    );
  });

  it("asks only where steps can change the target", async () => {
    // Steps feed the activity level offer on Food, which is Pro (whole-app
    // grill Q31, Q45). A free account is not asked for data that would
    // feed nothing; the same account on Pro is.
    localStorage.setItem("tropos-home-visited:u1", "1");
    accountFrom(30, 30);
    h.steps = { status: "unprompted", primingShown: false, ready: true };
    h.isPro = false;
    const view = renderHome();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 400));
    });
    expect(screen.getByTestId("steps-prompt")).toHaveTextContent("closed");

    h.isPro = true;
    view.rerender(homeAt());
    await waitFor(() =>
      expect(screen.getByTestId("steps-prompt")).toHaveTextContent("open")
    );
  });
});

describe("Home waits for what decides its hero", () => {
  it("shows repair without a checklist or fabricated Start when the plan is missing", () => {
    h.programState = null;
    renderHome();
    expect(screen.getByText("Training isn’t ready")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Your first week" })
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Start workout" })).toBeNull();
  });

  it("shows missing-plan repair for a runner while unrelated workouts load", () => {
    // A runner's plan: no lift days.
    h.profile.weeklyWorkoutsTarget = 0;
    h.profile.runMode = "freeform";
    h.programState = null;
    h.workoutsLoading = true;
    renderHome();
    expect(screen.getByText("Training isn’t ready")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start run" })).toBeNull();
  });

  it("waits rather than showing a false incomplete task when workout evidence failed", () => {
    h.workoutsFailed = true;
    renderHome();
    expect(screen.getByText("Training isn’t ready")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Your first week" })
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Start workout" })).toBeNull();
  });

  it("does not say 'Your first workout' beside the date before the workouts say so", () => {
    h.workoutsLoading = true;
    renderHome();
    expect(screen.queryByText("Your first workout")).toBeNull();
    cleanup();
    h.workoutsLoading = false;
    h.workoutsFailed = true;
    renderHome();
    expect(screen.getByText("Training isn’t ready")).toBeInTheDocument();
    expect(screen.queryByText("Your first workout")).toBeNull();
  });

  function racePlanToBuild() {
    h.profile.runMode = "race_prep";
    h.profile.raceGoal = { distance: "half", targetDate: "2099-01-01" };
    h.profile.weekSchedule = [0, 1, 2, 3, 4, 5, 6].map((day) => ({
      day,
      type: "run",
    }));
    h.programState.runDays = [];
  }

  it("waits, with no error, while a race plan's week is being built", () => {
    racePlanToBuild();
    renderHome();
    expect(screen.queryByText("Training isn’t ready")).toBeNull();
    expect(screen.queryByRole("button", { name: "Start run" })).toBeNull();
    expect(
      screen.queryByRole("heading", { name: "Your first week" })
    ).toBeNull();
  });

  it("says training isn’t ready only when building a race plan’s week failed", () => {
    racePlanToBuild();
    h.maintenanceFailed = true;
    renderHome();
    expect(screen.getByText("Training isn’t ready")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start run" })).toBeNull();
  });
});
