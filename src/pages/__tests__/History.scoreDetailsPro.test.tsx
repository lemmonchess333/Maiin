/**
 * Score details are Pro on Progress (whole-app grill Q84; the owner, 18
 * November 2026: the score's number is free, its card, 12-week chart,
 * average and makeup are Pro).
 *
 * `PerformanceSection` draws the details whenever `detailsOpen` is true,
 * locked or not: History's `scoreOpen = isPro && (…)` is the one gate.
 * Every link that opens them (`?score=details`, the retired
 * `?view=performance`, a `#performance` anchor) is read through it, so a
 * free account's link lands on the lead, and only a Pro account's opens
 * "Your score by week" and the ring. Nothing else held that gate: removing
 * `isPro &&` kept every test green.
 *
 * History is rendered for real with its data hooks replaced, as the Home
 * page tests do. The performance weeks are served to the real lead and the
 * real details, so the ring and the chart are the shipped ones. The
 * nutrition lifetime clears the cold-start gate, under which the page
 * draws no Performance section at all.
 */
import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const h = vi.hoisted(() => ({
  isPro: false,
  weeks: [] as object[],
  /* One object, so the page's memos keyed on it hold between renders. */
  profile: {
    createdAt: "2026-01-01T00:00:00.000Z",
    primaryGoal: "strength",
    experience: "intermediate",
    weeklyWorkoutsTarget: 4,
    liftTimeBudgetMinutes: 60,
  },
}));

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {}, auth: { currentUser: null } }));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/historyAnalytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/paywallAnalytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { uid: "u1", displayName: "Test" },
    profile: h.profile,
    updateProfile: vi.fn(),
  }),
  useUid: () => "u1",
  useUidForStorageKey: () => "u1",
}));
vi.mock("@/lib/subscription", () => ({
  useSubscription: () => ({
    isPro: h.isPro,
    isInTrial: false,
    trialDaysLeft: 0,
  }),
  isCheckoutTrialEligible: () => false,
}));
vi.mock("@/hooks/useRunningStats", () => ({
  useRunningStats: () => ({
    weeklyData: [],
    runs: [],
    loading: false,
    failed: false,
    refresh: vi.fn(),
  }),
}));
vi.mock("@/hooks/useWorkouts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useWorkouts")>()),
  useWorkouts: () => ({ workouts: [], loading: false, failed: false }),
}));
vi.mock("@/hooks/useMeals", () => ({
  useMeals: () => ({
    meals: [],
    deletedMeals: [],
    hasMore: false,
    loading: false,
    error: null,
  }),
}));
vi.mock("@/hooks/useMealsInRange", () => ({
  useMealsInRange: () => ({ meals: [], loading: false }),
}));
vi.mock("@/hooks/useLifetimeRunStats", () => ({
  useLifetimeRunStats: () => ({
    runCount: 0,
    totalDistanceM: 0,
    firstRun: null,
    races: [],
    dated: [],
    runs: [],
    loading: false,
    failed: false,
  }),
}));
/* A food day logged, so the page is past its cold start. */
vi.mock("@/hooks/useLifetimeMealStats", () => ({
  useLifetimeMealStats: () => ({ mealCount: 3, daysLogged: 1 }),
}));
vi.mock("@/hooks/useWeekPulse", () => ({ useWeekPulse: () => null }));
vi.mock("@/hooks/useEffectiveTargets", () => ({
  useEffectiveTargets: () => ({
    finalTarget: 2400,
    protein: 150,
    carbs: 280,
    fat: 75,
    learnedMaintenance: null,
  }),
}));
vi.mock("@/hooks/useDailyTargetsInRange", () => ({
  useDailyTargetsInRange: () => ({ targets: new Map(), loading: false }),
}));
vi.mock("@/hooks/useBodyweightTrend", () => ({
  useBodyweightTrend: () => ({ entries: [], points: [], loading: false }),
}));
vi.mock("@/hooks/useWeeklyReview", () => ({
  useReviewEligibility: () => ({ eligibility: "ineligible" }),
}));
vi.mock("@/hooks/usePerformance", () => ({
  usePerformanceWeeks: () => {
    const weeks = h.weeks;
    return {
      weeks,
      currentWeek: weeks.length ? weeks[weeks.length - 1] : null,
      previousWeek: weeks.length >= 2 ? weeks[weeks.length - 2] : null,
      docsAvailable: weeks.length,
      loading: false,
      failed: false,
      refresh: vi.fn(),
    };
  },
}));

import History from "../History";
import { addLocalDays, localDateString } from "@/lib/dateHelpers";

/** A day `n` days before today, as the engine keys its documents. */
const daysAgo = (n: number) => localDateString(addLocalDays(new Date(), -n));

/** A writer-shaped document, as `functions/lib/perfScoring.js` emits. */
function week(weekKey: string, pi: number) {
  return {
    weekKey,
    performanceIndex: pi,
    loadBand: "high",
    deloadRecommended: false,
    breakdown: {
      liftLoadScore: 70,
      runLoadScore: 70,
      recoveryScore: 60,
      adherenceScore: 60,
    },
    multipliers: { liftProgression: 1, runVolume: 1, runPaceAdjustmentPct: 0 },
    aggregates: {
      liftSessions: 4,
      liftTonnage: 16240,
      runSessions: 3,
      runKm: 32.4,
      runLongKm: 14.2,
    },
    baseline: { liftTonnage: 13700, runKm: 28, weeksUsed: 4 },
    adherenceScore: 60,
    signals: { lifetimeWeeks: 8, daysSinceLastTraining: 1 },
  };
}

/** Four weeks: past the baseline's cold start, the newest today's. */
const WEEKS = [
  week(daysAgo(21), 55),
  week(daysAgo(14), 58),
  week(daysAgo(7), 60),
  week(daysAgo(0), 72),
];

/** Every way in to the details: the param, the retired Performance page's
 *  view and tab, and its anchor. */
const LINKS = [
  "/history?score=details",
  "/history?view=performance",
  "/history?tab=performance",
  "/history#performance",
];

function open(entry: string) {
  const [path, hash] = entry.split("#");
  /* The anchor is read from the window, as a deep link lands. */
  window.history.replaceState(null, "", hash ? `/#${hash}` : "/");
  return render(
    <MemoryRouter initialEntries={[path]}>
      <History />
    </MemoryRouter>
  );
}

/** The lead's number, free to everyone. */
const leadScore = () =>
  document.querySelector("[data-lead-score]") as HTMLElement | null;
/** The details' ring: the score's card, the first of the details. */
const ring = () => document.querySelector("svg circle[stroke-dasharray]");

/* The details are a lazy chunk. Loaded once here, so a free account's
   details, were the gate gone, would have arrived by the time the test
   looks for them, rather than still be loading. */
beforeAll(async () => {
  await import("@/components/analytics/PerformanceDetails");
});

/** Lets a lazy chunk that was asked for arrive and draw. */
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

beforeEach(() => {
  h.weeks = WEEKS;
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
  vi.restoreAllMocks();
});

describe("Score details are Pro on Progress", () => {
  it.each(LINKS)(
    "a free account opening %s sees the lead and its number, not the details",
    async (link) => {
      h.isPro = false;
      open(link);
      // The lead, with the free number, has drawn.
      expect(await screen.findByText("Sharpening")).toBeInTheDocument();
      expect(leadScore()).toHaveTextContent("Your score 72");
      // The row offers Pro rather than opening. Closed, it is the last
      // thing the section draws: open, the details follow it, or their
      // placeholder while they load.
      const row = screen.getByRole("button", { name: "Score details, Pro" });
      expect(row.nextElementSibling).toBeNull();
      await settle();
      // Nothing of the details: no chart, no score card, no ring.
      expect(screen.queryByText("Your score by week")).toBeNull();
      expect(screen.queryByRole("region", { name: "Your score" })).toBeNull();
      expect(ring()).toBeNull();
    }
  );

  it.each(LINKS)(
    "a Pro account opening %s sees its score by week and the ring",
    async (link) => {
      h.isPro = true;
      open(link);
      expect(await screen.findByText("Your score by week")).toBeInTheDocument();
      expect(
        screen.getByRole("region", { name: "Your score" })
      ).toBeInTheDocument();
      expect(ring()).not.toBeNull();
      expect(
        screen.getByRole("button", { name: "Score details" })
      ).toHaveAttribute("aria-expanded", "true");
    }
  );

  it("a Pro account's plain visit keeps the details closed", async () => {
    // Anchors the Pro case: the details open from the link, not for Pro.
    h.isPro = true;
    open("/history");
    expect(await screen.findByText("Sharpening")).toBeInTheDocument();
    await settle();
    expect(screen.queryByText("Your score by week")).toBeNull();
    expect(ring()).toBeNull();
  });
});

/* The lead counts the 7 days' sessions against the plan the score was
   scored against, the profile's lift and run days (`plannedSessionCount`),
   and History is the page that has the profile. */
describe("the lead counts sessions against the profile's plan", () => {
  it("says the count from the plan, not sessions or food", async () => {
    h.isPro = false;
    const offPlan = {
      ...week(daysAgo(0), 64),
      loadBand: "moderate",
      adherenceScore: 43,
      aggregates: {
        liftSessions: 4,
        liftTonnage: 13700,
        runSessions: 0,
        runKm: 0,
        runLongKm: 0,
      },
      signals: {
        lifetimeWeeks: 8,
        daysSinceLastTraining: 1,
        adherenceWeak: true,
      },
    };
    h.weeks = [...WEEKS.slice(0, 3), offPlan];
    open("/history");
    expect(await screen.findByText("Steady")).toBeInTheDocument();
    // The profile plans 4 lift days and no runs.
    expect(
      screen.getByText(
        "You did 4 of 4 planned sessions, with food well off your targets"
      )
    ).toBeInTheDocument();
  });
});
