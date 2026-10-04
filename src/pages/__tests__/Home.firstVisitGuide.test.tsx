/**
 * The first-visit guide on Home (FV1): the walk a new account meets on its
 * first visit, its replay from Settings, the first-week rows that open
 * their step, and the Health prompt waiting its turn.
 *
 * Home is rendered for real with its data hooks replaced, as in
 * Home.dayAndWeek.test.tsx. jsdom lays nothing out, and the walk waits
 * for its first card to have a size (useGuideWalkReady), so the tests that
 * expect a walk give the page a phone's boxes (`layOut`). The account
 * begins "now", so the first week is derived from the clock rather than
 * pinned to a date some window has to contain.
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
  steps: { status: "unavailable", primingShown: true, ready: true } as {
    status: string;
    primingShown: boolean;
    ready: boolean;
  },
  track: vi.fn(),
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
     render, remounting the walk's card and dropping its focus. */
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
  useSubscription: () => ({ isPro: true, isInTrial: false, trialDaysLeft: 0 }),
  isCheckoutTrialEligible: () => false,
}));
vi.mock("@/hooks/useWorkouts", () => ({
  useWorkouts: () => ({
    workouts: [],
    getWorkoutsForDate: () => [],
    loading: false,
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
    weighInCount: 0,
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
vi.mock("@/lib/homeAnalytics", () => ({ track: vi.fn() }));

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
vi.mock("@/components/home/WeightStepsTiles", () => ({ default: () => null }));
vi.mock("@/components/home/TodayEnergy", () => ({
  default: () => <section aria-label="Food">Food</section>,
}));
vi.mock("@/components/home/VerifyEmailBanner", () => ({ default: () => null }));
vi.mock("@/components/home/WeeklyReviewEntry", () => ({ default: () => null }));
vi.mock("@/components/home/PerformanceHeroCard", () => ({
  default: () => null,
}));
vi.mock("@/components/home/ContextualTipBanner", () => ({
  default: ({ title, visible }: { title: string; visible: boolean }) =>
    visible ? <p>{title}</p> : null,
}));
vi.mock("@/components/home/TrackSectionView", () => ({
  default: ({ children }: any) => children,
}));

import Home from "../Home";
import { WALK_SEEN_KEY } from "@/lib/firstGuide";

const DAY_MS = 86_400_000;

/** An account that began `daysAgo` days before now, on a rest-day
 *  schedule, with a programme of two workouts and no run plan. */
function accountFrom(daysAgo: number) {
  const began = Date.now() - daysAgo * DAY_MS;
  h.profile = {
    uid: "u1",
    displayName: "Test",
    createdAt: { toMillis: () => began },
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
    fatigueScore: 0,
    updatedAt: 0,
    settings: { autoProgression: true, microloading: true },
    weekHistory: [],
    programSchemaVersion: 2,
    runDays: [],
  };
}

/** A phone's boxes for everything on the page: jsdom draws no layout. */
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
      {location.pathname}
      {location.state ? ` ${JSON.stringify(location.state)}` : ""}
    </output>
  );
}

function homeAt(state?: unknown) {
  return (
    <MemoryRouter initialEntries={[{ pathname: "/", state }]}>
      <Home />
      <LocationProbe />
    </MemoryRouter>
  );
}

function renderHome(state?: unknown) {
  return render(homeAt(state));
}

const walkSeen = () => localStorage.getItem(`u1:${WALK_SEEN_KEY}`);

/** Presses one of the walk's buttons once its card is on screen: the card
 *  shows once its target holds still, with focus on its main button, and
 *  isn't tappable before that. The button keeps focus from stop to stop,
 *  so focus alone doesn't say the card can be seen. */
async function press(name: "Next" | "Done" | "Skip" | "Got it") {
  const main = name === "Skip" ? "Next" : name;
  await waitFor(
    () => {
      const button = screen.getByRole("button", { name: main });
      expect(button).toBeVisible();
      expect(button).toHaveFocus();
    },
    { timeout: 3000 }
  );
  fireEvent.click(screen.getByRole("button", { name }));
}

beforeEach(() => {
  localStorage.clear();
  h.track.mockClear();
  h.steps = { status: "unavailable", primingShown: true, ready: true };
  window.scrollBy = vi.fn();
  accountFrom(0);
});

afterEach(() => {
  cleanup();
  restoreLayout?.();
  restoreLayout = null;
  document.documentElement.classList.remove("guiding");
});

describe("the first-visit walk on Home", () => {
  it("walks a new account through today's session, its first week and food, once", async () => {
    layOut();
    renderHome();
    await screen.findByRole(
      "dialog",
      { name: "Your first workout" },
      { timeout: 3000 }
    );
    await press("Next");
    await screen.findByRole("dialog", { name: "Your first week" });
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "Three things to do in your first seven days"
    );
    await press("Next");
    await screen.findByRole("dialog", { name: "Food" });
    await press("Done");

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(walkSeen()).toBe("1");
    expect(h.track).toHaveBeenCalledWith("guide_started", {
      walk: "first-visit",
      count: 3,
    });
    expect(h.track).toHaveBeenCalledWith("guide_finished", {
      walk: "first-visit",
      stop: "food",
      stepIndex: 2,
    });

    // Once: a later visit doesn't bring it back.
    cleanup();
    renderHome();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 400));
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("isn't offered to an account past its first week", async () => {
    accountFrom(10);
    layOut();
    renderHome();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 400));
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Settings' Show me around plays it again, then forgets the request", async () => {
    localStorage.setItem(`u1:${WALK_SEEN_KEY}`, "1");
    accountFrom(30);
    layOut();
    renderHome({ guide: "walk" });
    // Past its first week the account has no first-week card, and its
    // session card is a rest day's: the walk is the stops it can show.
    await screen.findByRole(
      "dialog",
      { name: "A rest day" },
      { timeout: 3000 }
    );
    await press("Next");
    await screen.findByRole("dialog", { name: "Food" });
    await press("Done");
    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent(/^\/$/)
    );
  });

  it("the Health steps prompt waits until the walk is over", async () => {
    h.steps = { status: "unprompted", primingShown: false, ready: true };
    layOut();
    renderHome();
    expect(screen.getByTestId("steps-prompt")).toHaveTextContent("closed");
    await screen.findByRole(
      "dialog",
      { name: "Your first workout" },
      { timeout: 3000 }
    );
    expect(screen.getByTestId("steps-prompt")).toHaveTextContent("closed");
    await press("Skip");
    await waitFor(() =>
      expect(screen.getByTestId("steps-prompt")).toHaveTextContent("open")
    );
  });

  it("the Health steps prompt waits for the account's saved answer", async () => {
    // Walk seen, past the first week: nothing else holds the prompt, so
    // only the answer can. Until it loads, "not asked yet" is the hook's
    // default, not this account's: someone who had already answered saw
    // the prompt open and close again (FV2).
    localStorage.setItem(`u1:${WALK_SEEN_KEY}`, "1");
    accountFrom(30);
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

  it("the calorie tip it replaced is gone", () => {
    localStorage.setItem(`u1:${WALK_SEEN_KEY}`, "1");
    renderHome();
    expect(
      screen.queryByText("Your activity is already in your target")
    ).toBeNull();
  });
});

describe("the first-week card's rows open their step", () => {
  beforeEach(() => {
    // These read the rows, not the walk.
    localStorage.setItem(`u1:${WALK_SEEN_KEY}`, "1");
  });

  it("the first meal opens Food with the composer pointed out", () => {
    renderHome();
    fireEvent.click(
      screen.getByRole("button", { name: /Log your first meal/ })
    );
    expect(screen.getByTestId("location")).toHaveTextContent(
      '/food {"guide":"food-composer"}'
    );
  });

  it("the weigh-ins open the weigh-in sheet", () => {
    renderHome();
    expect(screen.queryByText("Weigh-in sheet")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: /Weigh in on three mornings/ })
    );
    expect(screen.getByText("Weigh-in sheet")).toBeInTheDocument();
  });

  it("the first workout is pointed out on today's card", async () => {
    layOut();
    renderHome();
    fireEvent.click(
      screen.getByRole("button", { name: /Finish your first workout/ })
    );
    const stop = await screen.findByRole("dialog", {
      name: "Your first workout",
    });
    expect(stop).toHaveTextContent("ticked off on the card below");
    await press("Got it");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(h.track).toHaveBeenCalledWith("guide_finished", {
      walk: "first-week-row",
      stop: "today",
      stepIndex: 0,
    });
  });
});
