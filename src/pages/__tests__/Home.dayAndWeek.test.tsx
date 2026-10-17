/**
 * Home's own derivations of the day: the date in its header, the week's
 * counts under "This week", and the session the rest-day card names for
 * tomorrow.
 *
 * These live in Home.tsx itself, so the page is rendered for real with its
 * data hooks replaced. The components that only display a hook's figures
 * (water, weight, the food card, the performance row, the sheets) are
 * stubbed; the week strip, the session cards and the week summary are
 * real, because they are what the assertions read.
 *
 * The clock is pinned (Date only; no timers move) and every date literal
 * below is derived from the pinned day, so none of them can drift out of
 * a window as the calendar moves.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  profile: null as any,
  programState: null as any,
  workouts: [] as Array<{ id: string; date: string }>,
  meals: [] as Array<{ id: string; date: string; calories?: number }>,
  mealsLoading: false,
  mealsError: null as string | null,
  programLoading: false,
  dayMap: new Map<
    string,
    { workouts: number; meals: number; caloriesHit: boolean }
  >(),
  claimMap: new Map(),
  unclaimedByDate: new Map(),
  /* Every saved run, as the claim hook reads them. */
  runs: [] as Array<Record<string, unknown>>,
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
  return {
    motion: new Proxy(
      {},
      {
        get: (_t: any, tag: string) => (props: any) => {
          const Tag = tag as any;
          return <Tag {...strip(props)} />;
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
  /* One function, as useMeals' own is between changes to the meals (a
     useCallback): a memo keyed on it must not be refreshed by a new
     function on every render, or a missing day key goes unnoticed. */
  const getDailyTotals = (date: string) => ({
    calories: h.meals
      .filter((m) => m.date === date)
      .reduce((total, m) => total + (m.calories ?? 0), 0),
    protein: 0,
    carbs: 0,
    fat: 0,
    mealCount: h.meals.filter((m) => m.date === date).length,
  });
  /* The hook's own contract: `meals` are the ACTIVE meals (a soft-deleted
     meal is not among them), and a day's totals count them. */
  return {
    useMeals: () => ({
      meals: h.meals,
      loading: h.mealsLoading,
      error: h.mealsError,
      getDailyTotals,
    }),
  };
});
vi.mock("@/hooks/useFirestore", () => ({
  useWeeklyDayMap: () => h.dayMap,
}));
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
    loading: h.programLoading,
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
    claimMap: h.claimMap,
    unclaimedByDate: h.unclaimedByDate,
    runs: h.runs,
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
vi.mock("@/hooks/useDismissOnce", () => ({
  useDismissOnce: () => ({ dismissed: true, dismiss: vi.fn() }),
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

/* Display-only surfaces, stubbed so the suite reads Home's own logic. */
vi.mock("@/components/home/WeightLogSheet", () => ({ default: () => null }));
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
  default: () => null,
}));
vi.mock("@/components/home/TrialEndedDialog", () => ({ default: () => null }));
vi.mock("@/components/home/WaterCard", () => ({ default: () => null }));
vi.mock("@/components/home/WeightStepsTiles", () => ({ default: () => null }));
/* The food card draws the figures it is handed; the test reads the one
   that says which day's food it is. */
vi.mock("@/components/home/TodayEnergy", () => ({
  default: ({ calories }: { calories: number }) => (
    <output data-testid="today-calories">{calories}</output>
  ),
}));
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
import { addLocalDays, localDateString, localWeekKey } from "@/lib/dateHelpers";
import { formatWeekdayDayMonth } from "@/utils/formatters";

type DayType = "lift" | "run" | "both" | "rest";

/** A weekSchedule from day-of-week (0 = Sunday) to type; unnamed days rest. */
function schedule(types: Partial<Record<number, DayType>>) {
  return [0, 1, 2, 3, 4, 5, 6].map((day) => ({
    day,
    type: types[day] ?? "rest",
  }));
}

function profileWith(types: Partial<Record<number, DayType>>) {
  return {
    uid: "u1",
    displayName: "Test",
    weekSchedule: schedule(types),
    weeklyWorkoutsTarget: 3,
  };
}

function programStateWith(overrides: Record<string, unknown> = {}) {
  return {
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
  };
}

function workoutDay(dayName: string) {
  return {
    dayName,
    dayType: "pull",
    exercises: [{ name: "Lat pulldown", exerciseId: "lat-pulldown", sets: 3 }],
    completed: false,
  };
}

function runDay(date: Date, overrides: Record<string, unknown> = {}) {
  const key = localDateString(date);
  return {
    id: `rd-${key}`,
    dayIndex: date.getDay(),
    date: key,
    weekKey: localWeekKey(date),
    templateId: "easy_30",
    type: "easy",
    completed: false,
    status: "planned",
    ...overrides,
  };
}

/** Pin the clock to a local date and time (Date only; timers stay real). */
function pinClock(at: Date) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(at);
}

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
      <Home />
      <LocationProbe />
    </MemoryRouter>
  );
}

/** The week summary column, by its accessible name ("Food logged: 1 of 7 days"). */
function column(label: string): string {
  const group = screen
    .getAllByRole("group")
    .find((g) => (g.getAttribute("aria-label") ?? "").startsWith(`${label}:`));
  if (!group) throw new Error(`no "${label}" column in the week summary`);
  return group.getAttribute("aria-label") ?? "";
}

/** The text of the rest card's supporting line. */
function restCardLine(): string {
  return screen.getByText(/A walk or some mobility helps\./).textContent ?? "";
}

/* 2026 dates, chosen for their weekday: 27 September is a Sunday and
   30 September a Wednesday. Every other date is derived from these. */
const SUNDAY = new Date(2026, 8, 27, 12, 0, 0);
const WEDNESDAY = new Date(2026, 8, 30, 12, 0, 0);

beforeEach(() => {
  h.profile = profileWith({});
  h.programState = programStateWith();
  h.workouts = [];
  h.meals = [];
  h.mealsLoading = false;
  h.mealsError = null;
  h.programLoading = false;
  h.dayMap = new Map();
  h.claimMap = new Map();
  h.unclaimedByDate = new Map();
  h.runs = [];
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Home — tells the launch animation when its content is in", () => {
  // LaunchSplash sets its mark down on Home's header only once this is
  // there, so it reveals today's session and food, not their placeholders.
  const ready = () => document.querySelector("[data-page-ready]");

  it("once the meals and the programme have loaded", () => {
    renderHome();
    expect(ready()).not.toBeNull();
  });

  it("not while the meals are loading", () => {
    h.mealsLoading = true;
    renderHome();
    expect(ready()).toBeNull();
  });

  it("not while the programme is loading", () => {
    h.programLoading = true;
    renderHome();
    expect(ready()).toBeNull();
  });
});

describe("Home — the date follows the clock", () => {
  it("names the new day once the app comes back after midnight", () => {
    const lateSunday = new Date(2026, 8, 27, 23, 59, 30);
    pinClock(lateSunday);
    renderHome();
    expect(screen.getByText(formatWeekdayDayMonth(lateSunday))).toBeTruthy();

    const earlyMonday = new Date(2026, 8, 28, 0, 0, 30);
    act(() => {
      vi.setSystemTime(earlyMonday);
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(screen.getByText(formatWeekdayDayMonth(earlyMonday))).toBeTruthy();
    expect(screen.queryByText(formatWeekdayDayMonth(lateSunday))).toBeNull();
  });

  it("shows the new day's food once the app comes back after midnight", () => {
    /* The food card read today's meals once, when Home mounted, so after
       midnight it went on showing yesterday's. It now reads the diary Home
       holds, for Home's day. */
    const lateSunday = new Date(2026, 8, 27, 23, 59, 30);
    pinClock(lateSunday);
    h.meals = [{ id: "m1", date: localDateString(lateSunday), calories: 500 }];
    renderHome();
    expect(screen.getByTestId("today-calories").textContent).toBe("500");

    act(() => {
      vi.setSystemTime(new Date(2026, 8, 28, 0, 0, 30));
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(screen.getByTestId("today-calories").textContent).toBe("0");
  });

  it("starts the week's counts again when the week turns over", () => {
    // A lift day every Monday and Thursday, and a session logged on this
    // week's Monday.
    h.profile = profileWith({ 1: "lift", 4: "lift" });
    h.programState = programStateWith({
      workouts: [
        workoutDay("Push — Chest Focus"),
        workoutDay("Pull — Lat Focus"),
      ],
    });
    const lateSunday = new Date(2026, 8, 27, 23, 59, 30);
    const thisMonday = addLocalDays(lateSunday, -6);
    h.workouts = [{ id: "w1", date: localDateString(thisMonday) }];
    pinClock(lateSunday);
    renderHome();
    expect(column("Lifts")).toBe("Lifts: 1 of 2");

    act(() => {
      vi.setSystemTime(new Date(2026, 8, 28, 0, 0, 30));
      document.dispatchEvent(new Event("visibilitychange"));
    });

    // The new week has no session in it yet.
    expect(column("Lifts")).toBe("Lifts: 0 of 2");
  });
});

describe("Home — the week's runs, as every screen counts them", () => {
  beforeEach(() => {
    pinClock(WEDNESDAY);
  });

  const monday = () => localDateString(addLocalDays(WEDNESDAY, -2));
  const tuesday = () => localDateString(addLocalDays(WEDNESDAY, -1));

  it("counts the runs that count against the plan's run days", () => {
    // A race plan runs on Tuesday and Thursday. Tuesday's run counts; the
    // run saved anyway on Monday counts nowhere.
    h.profile = profileWith({ 2: "run", 4: "run" });
    h.programState = programStateWith({
      runDays: [
        runDay(addLocalDays(WEDNESDAY, -1)),
        runDay(addLocalDays(WEDNESDAY, 1)),
      ],
    });
    h.runs = [
      { id: "r1", day: tuesday(), distance: 5000, duration: 1800 },
      {
        id: "r2",
        day: monday(),
        distance: 9000,
        duration: 600,
        savedAnyway: true,
      },
    ];
    renderHome();
    expect(column("Runs")).toBe("Runs: 1 of 2");
  });

  it("shows a free runner's runs with no target to count against", () => {
    // The schedule names two run days, but a free runner's plan has no
    // runs in it: their week is done-only (Run9a, Rev1).
    h.profile = profileWith({ 2: "run", 4: "run" });
    h.runs = [{ id: "r1", day: tuesday(), distance: 5000, duration: 1800 }];
    renderHome();
    expect(column("Runs")).toBe("Runs: 1");
  });
});

describe("Home — the week's food days are days with a meal", () => {
  beforeEach(() => {
    pinClock(WEDNESDAY);
  });

  const monday = () => localDateString(addLocalDays(WEDNESDAY, -2));
  const tuesday = () => localDateString(addLocalDays(WEDNESDAY, -1));

  it("does not count a day whose meals were all deleted", () => {
    /* Food writes the day's log only while the day has a meal, so the log
       still says 3 after the last of them is deleted. The meals have
       loaded and there are none that day. */
    h.dayMap = new Map([
      [monday(), { workouts: 0, meals: 3, caloriesHit: false }],
    ]);
    h.meals = [];
    h.mealsLoading = false;
    renderHome();
    expect(column("Food logged")).toBe("Food logged: 0 of 7 days");
  });

  it("reads the daily log while the meals are still loading", () => {
    h.dayMap = new Map([
      [monday(), { workouts: 0, meals: 2, caloriesHit: false }],
    ]);
    h.meals = [];
    h.mealsLoading = true;
    renderHome();
    expect(column("Food logged")).toBe("Food logged: 1 of 7 days");
  });

  it("reads the daily log when the meals could not be read", () => {
    // An empty list after a failed read is not a week without food.
    h.dayMap = new Map([
      [monday(), { workouts: 0, meals: 2, caloriesHit: false }],
    ]);
    h.meals = [];
    h.mealsError = "Couldn't load your food diary.";
    renderHome();
    expect(column("Food logged")).toBe("Food logged: 1 of 7 days");
  });

  it("counts a loaded meal whose day has no log yet", () => {
    h.meals = [{ id: "m1", date: tuesday() }];
    renderHome();
    expect(column("Food logged")).toBe("Food logged: 1 of 7 days");
  });
});

describe("Home — the rest-day card names tomorrow", () => {
  it("names Monday's run on a Sunday, before the new week's runs are written", () => {
    /* The plan holds this week's runs only; Monday's run is written when
       the week rolls over. Tomorrow is still a run day. */
    pinClock(SUNDAY);
    h.profile = profileWith({ 1: "run" });
    const thisMonday = addLocalDays(SUNDAY, -6);
    h.programState = programStateWith({
      runDays: [runDay(thisMonday, { status: "completed_exact" })],
    });
    renderHome();

    expect(screen.getByText("Recover today")).toBeTruthy();
    expect(restCardLine()).toContain("Tomorrow: Run.");
    fireEvent.click(screen.getByRole("button", { name: "See tomorrow" }));
    // Runs are pinned to dates (ADR-0002), so the day opens by its date.
    expect(screen.getByTestId("location").textContent).toBe(
      `/program?tab=run&rday=${localDateString(addLocalDays(SUNDAY, 1))}`
    );
  });

  it("does not name a run for a day whose run was moved to another day", () => {
    /* Moving a run changes its date and leaves the weekly schedule alone,
       so Thursday is still a run day on the schedule after its run moves
       to Friday. The week's runs are written, and none is on Thursday. */
    pinClock(WEDNESDAY);
    h.profile = profileWith({ 4: "run" });
    const thursday = addLocalDays(WEDNESDAY, 1);
    const friday = addLocalDays(WEDNESDAY, 2);

    // Anchor: with the run still on Thursday, the card names it.
    h.programState = programStateWith({ runDays: [runDay(thursday)] });
    const kept = renderHome();
    expect(restCardLine()).toContain("Tomorrow: Easy 30.");
    kept.unmount();

    h.programState = programStateWith({
      runDays: [runDay(friday, { movedFromDate: localDateString(thursday) })],
    });
    renderHome();
    expect(screen.getByText("Recover today")).toBeTruthy();
    expect(restCardLine()).not.toContain("Tomorrow:");
  });

  it("reads a run with no date or week as this week's, as the resolver does", () => {
    /* A run can carry only a day of the week, with no date or week key,
       and the resolver matches those inside the current week alone. A
       plan like that with no run on Thursday has no run on Thursday. */
    pinClock(WEDNESDAY);
    h.profile = profileWith({ 1: "run", 4: "run" });
    const undated = (dayIndex: number) =>
      runDay(WEDNESDAY, {
        id: `rd-undated-${dayIndex}`,
        dayIndex,
        date: undefined,
        weekKey: undefined,
      });

    // Anchor: the same plan with a Thursday run names it.
    h.programState = programStateWith({ runDays: [undated(1), undated(4)] });
    const withThursday = renderHome();
    expect(restCardLine()).toContain("Tomorrow: Easy 30.");
    withThursday.unmount();

    h.programState = programStateWith({ runDays: [undated(1)] });
    renderHome();
    expect(screen.getByText("Recover today")).toBeTruthy();
    expect(restCardLine()).not.toContain("Tomorrow:");
  });

  it("names a lift day the way the rest of the app does", () => {
    // "Pull · Lat focus", as the workout and finish screens say it.
    pinClock(SUNDAY);
    h.profile = profileWith({ 1: "lift" });
    h.programState = programStateWith({
      workouts: [workoutDay("Pull — Lat Focus")],
    });
    renderHome();
    expect(restCardLine()).toContain("Tomorrow: Pull · Lat focus.");
  });
});

describe("Home — a new account's first days", () => {
  it("offers the programme's next workout, not the weekday's", () => {
    // Wednesday is the third lift day of the week, but nothing is done
    // yet: Train starts at the first workout, and so does Home.
    pinClock(WEDNESDAY);
    h.profile = profileWith({ 1: "lift", 2: "lift", 3: "lift" });
    h.programState = programStateWith({
      workouts: [
        workoutDay("Push — Chest Focus"),
        workoutDay("Pull — Lat Focus"),
        workoutDay("Legs — Quad Focus"),
      ],
    });
    renderHome();
    const card = document.querySelector('[aria-label="Today’s training"]');
    expect(card?.textContent).toMatch(/Chest/);
    expect(card?.textContent).not.toMatch(/Quad/);
  });

  it("counts the week from the day the account began", () => {
    // Joined on the Wednesday: Monday and Tuesday planned nothing.
    pinClock(WEDNESDAY);
    h.profile = {
      ...profileWith({ 1: "lift", 2: "lift", 3: "lift" }),
      createdAt: { toMillis: () => WEDNESDAY.getTime() },
    };
    renderHome();
    expect(column("Lifts")).toBe("Lifts: 0 of 1");
    expect(column("Food logged")).toBe("Food logged: 0 of 5 days");
  });
});
