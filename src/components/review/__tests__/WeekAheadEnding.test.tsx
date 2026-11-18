/**
 * The weekly review's ending (App1 Q36): the week ahead as the plan holds
 * it, and any change offered elsewhere, each taken in one tap through the
 * command its own surface uses, with an undo where Q5 calls it small.
 *
 * The plan reader, the score's weeks and the pace insight are stood in for
 * here; what they decide is pinned in `weekAhead.test.ts` and
 * `reviewWeekOffers.test.ts`. These tests hold the wiring: which command a
 * tap sends, what the card then says, and what closing does to an offer
 * still open.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { UserProfile } from "@/lib/auth";
import type {
  ProgramState,
  ScheduledRunDay,
  WorkoutDay,
} from "@/features/program/programTypes";
import {
  addLocalDays,
  localDateString,
  localWeekKey,
  parseLocalDate,
} from "@/lib/dateHelpers";

const state = vi.hoisted(() => ({
  profile: null as Partial<UserProfile> | null,
  programState: null as ProgramState | null,
  loading: false,
  recentLayoff: "none" as string,
  perfWeek: null as unknown,
  insight: null as unknown,
  paceLocked: undefined as boolean | undefined,
  dismissed: new Set<string>(),
}));

const program = vi.hoisted(() => ({
  realignRacePlan: vi.fn(),
  dismissFellBehindPrompt: vi.fn(),
  applyDeloadWeek: vi.fn(),
  revertDeloadWeek: vi.fn(),
}));
const pace = vi.hoisted(() => ({ accept: vi.fn(), dismiss: vi.fn() }));
const dismissals = vi.hoisted(() => ({ calls: [] as string[] }));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { uid: "u1" }, profile: state.profile }),
  useUid: () => "u1",
}));
vi.mock("@/features/program/useHomeProgram", () => ({
  useHomeProgram: () => ({
    programState: state.programState,
    loading: state.loading,
    recentLayoff: state.recentLayoff,
    recentRuns: null,
    controller: null,
    ...program,
  }),
}));
vi.mock("@/hooks/usePerformance", () => ({
  usePerformanceWeeks: () => ({
    weeks: state.perfWeek ? [state.perfWeek] : [],
    currentWeek: state.perfWeek,
    previousWeek: null,
  }),
}));
vi.mock("@/hooks/useSavedRuns", () => ({
  useSavedRuns: () => ({ runs: [], loading: false }),
}));
vi.mock("@/hooks/usePaceInsight", () => ({
  usePaceInsightFromRuns: () => ({
    insight: state.insight,
    ...(state.paceLocked === undefined ? {} : { locked: state.paceLocked }),
    ...pace,
  }),
}));
vi.mock("@/hooks/useDismissOnce", () => ({
  useDismissOnce: (key: string) => ({
    dismissed: state.dismissed.has(key),
    dismiss: () => dismissals.calls.push(key),
  }),
}));
vi.mock("../MomentumCheckinCard", () => ({ default: () => null }));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/toast", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import WeekAheadEnding from "../WeekAheadEnding";
import { toast } from "@/lib/toast";

/* The week under way, from the clock, so no window has to contain a date
   written here. */
const WEEK = localWeekKey(new Date());
const dayOf = (i: number) =>
  localDateString(addLocalDays(parseLocalDate(WEEK), i));

const lift = (dayName: string): WorkoutDay => ({
  dayName,
  dayType: "lift",
  completed: false,
  exercises: [],
});

const runDay = (i: number, templateId: string, type: string) =>
  ({
    id: `run-${i}`,
    date: dayOf(i),
    weekKey: WEEK,
    dayIndex: parseLocalDate(dayOf(i)).getDay(),
    templateId,
    type,
    status: "planned",
  }) as ScheduledRunDay;

/** Lifts Monday, Wednesday and Friday; runs Tuesday and Sunday. */
const HYBRID: Partial<UserProfile> = {
  weeklyWorkoutsTarget: 3,
  weeklyRunDaysTarget: 2,
  weekSchedule: [
    { day: 1, type: "lift" },
    { day: 2, type: "run" },
    { day: 3, type: "lift" },
    { day: 4, type: "rest" },
    { day: 5, type: "lift" },
    { day: 6, type: "rest" },
    { day: 0, type: "run" },
  ],
};

const programme = (overrides: Partial<ProgramState> = {}): ProgramState =>
  ({
    goal: "recomp",
    currentPhase: "base",
    weekNumber: 4,
    splitType: "ppl",
    workouts: [lift("Push"), lift("Pull"), lift("Legs")],
    weekHistory: [],
    runDays: [runDay(1, "easy_30", "easy"), runDay(6, "long_10k", "long")],
    ...overrides,
  }) as ProgramState;

/** The score's last week, recommending a lighter week from running. */
const RUNNING_HARD = {
  deloadRecommended: true,
  aggregates: { runSessions: 4, liftSessions: 0 },
};

const onClose = vi.fn();

function renderEnding(preview = false) {
  return render(
    <MemoryRouter initialEntries={["/review"]}>
      <Routes>
        <Route
          path="/review"
          element={
            <WeekAheadEnding
              reviewedWeekKey="2026-07-06"
              trainingWhy={undefined}
              uid="u1"
              onClose={onClose}
              preview={preview}
            />
          }
        />
        <Route path="/settings/run-plan" element={<p>Run plan page</p>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  state.profile = HYBRID;
  state.programState = programme();
  state.loading = false;
  state.recentLayoff = "none";
  state.perfWeek = null;
  state.insight = null;
  state.paceLocked = undefined;
  state.dismissed = new Set();
  dismissals.calls = [];
  vi.clearAllMocks();
});

afterEach(cleanup);

describe("WeekAheadEnding — the week", () => {
  it("lists the seven days: a lift, a named run with its dose, or rest", () => {
    renderEnding();
    const rows = within(
      screen.getByRole("list", { name: "Your week" })
    ).getAllByRole("listitem");
    expect(rows).toHaveLength(7);
    expect(rows[0]).toHaveTextContent("Lift");
    expect(rows[1]).toHaveTextContent("Easy 30 · 30 min");
    expect(rows[3]).toHaveTextContent("Rest");
    expect(rows[6]).toHaveTextContent("Long 10K · 10.0 km");
  });

  it("gives the week's figure and the lifts' order, not a weekday's lift", () => {
    renderEnding();
    expect(
      screen.getByText("sessions planned, 3 lifts and 2 runs")
        .previousElementSibling?.textContent
    ).toBe("5");
    expect(screen.getByText("Lifts in order: Push · Pull · Legs")).toBeTruthy();
    expect(screen.queryByText("Push", { selector: "li *" })).toBeNull();
  });

  it("waits for the plan rather than show a week without its runs", () => {
    state.loading = true;
    renderEnding();
    expect(
      screen.getByRole("status", { name: "Loading the week ahead" })
    ).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Your week" })).toBeNull();
  });
});

describe("WeekAheadEnding — nothing offered", () => {
  it("ends on Looks good, which closes the review", () => {
    renderEnding();
    expect(screen.queryByRole("region")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Looks good" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("before a first review it is the plan alone, with no button of its own", () => {
    state.perfWeek = RUNNING_HARD;
    renderEnding(true);
    expect(screen.getByRole("list", { name: "Your week" })).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("WeekAheadEnding — a lighter week", () => {
  beforeEach(() => {
    state.perfWeek = RUNNING_HARD;
    // No runs, so what it changes does not hang on which runs are past.
    state.programState = programme({ runDays: [] });
  });

  it("is offered as Train offers it, and closing keeps the plan", () => {
    renderEnding();
    const offer = screen.getByRole("region", { name: "A lighter week" });
    expect(offer).toHaveTextContent(
      "Half the sets, at the same weights. The full plan is back next week."
    );
    fireEvent.click(screen.getByRole("button", { name: "Keep my plan" }));
    // Set aside under Train's own key, so Train does not ask again.
    return waitFor(() => {
      expect(dismissals.calls).toEqual(["tropos-pgm-deload-dismissed:w4"]);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it("is taken in one tap through Train's command, then can be undone", async () => {
    program.applyDeloadWeek.mockResolvedValue(true);
    program.revertDeloadWeek.mockResolvedValue(true);
    renderEnding();
    fireEvent.click(
      screen.getByRole("button", { name: "Take a lighter week" })
    );
    await screen.findByText(
      "This week is a lighter one. The full plan is back next week."
    );
    expect(program.applyDeloadWeek).toHaveBeenCalledTimes(1);
    // Taken, so nothing is left open: the button agrees the week.
    expect(screen.getByRole("button", { name: "Looks good" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await screen.findByRole("button", { name: "Take a lighter week" });
    expect(program.revertDeloadWeek).toHaveBeenCalledTimes(1);
  });

  it("stays open, and says so, when the command fails", async () => {
    program.applyDeloadWeek.mockResolvedValue(false);
    renderEnding();
    fireEvent.click(
      screen.getByRole("button", { name: "Take a lighter week" })
    );
    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect(
      screen.getByRole("button", { name: "Take a lighter week" })
    ).toBeEnabled();
  });

  it("is not offered in a week it was set aside in", () => {
    state.dismissed = new Set(["tropos-pgm-deload-dismissed:w4"]);
    renderEnding();
    expect(screen.queryByRole("region", { name: "A lighter week" })).toBeNull();
  });
});

describe("WeekAheadEnding — a race plan behind", () => {
  const RACE: Partial<UserProfile> = {
    ...HYBRID,
    runMode: "race_prep",
    raceGoal: {
      distance: "half",
      targetDate: localDateString(addLocalDays(new Date(), 70)),
    },
  } as Partial<UserProfile>;

  beforeEach(() => {
    state.profile = RACE;
    state.programState = programme({
      pendingFellBehindPrompt: {
        weekKey: WEEK,
        completedRatio: 0.25,
        realRunCount: 1,
        weeklyTarget: 4,
      },
    } as Partial<ProgramState>);
  });

  it("realigns in one tap and says what it built", async () => {
    program.realignRacePlan.mockResolvedValue({
      status: "applied",
      timing: "healthy",
      totalWeeks: 10,
    });
    renderEnding();
    expect(
      screen.getByRole("region", { name: "Last week didn’t go to plan" })
    ).toHaveTextContent("You ran 1 of 4 planned runs.");
    fireEvent.click(screen.getByRole("button", { name: "Realign my plan" }));
    await screen.findByRole("status");
    expect(screen.getByRole("status")).toHaveTextContent(/10 weeks/);
    expect(program.realignRacePlan).toHaveBeenCalledTimes(1);
    // A big change: offered, not undone (Q5).
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });

  it("leaves the plan as it was when the realign is refused", async () => {
    program.realignRacePlan.mockResolvedValue({
      status: "declined",
      reason: "x",
    });
    renderEnding();
    fireEvent.click(screen.getByRole("button", { name: "Realign my plan" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Realign my plan" })
      ).toBeEnabled()
    );
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("My race moved answers the prompt and opens the race's date", async () => {
    program.dismissFellBehindPrompt.mockResolvedValue({ status: "applied" });
    renderEnding();
    fireEvent.click(screen.getByRole("button", { name: "My race moved" }));
    await screen.findByText("Run plan page");
    expect(program.dismissFellBehindPrompt).toHaveBeenCalledTimes(1);
  });

  it("Keep my plan answers the prompt as its Not now does, then closes", async () => {
    program.dismissFellBehindPrompt.mockResolvedValue({ status: "applied" });
    renderEnding();
    fireEvent.click(screen.getByRole("button", { name: "Keep my plan" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(program.dismissFellBehindPrompt).toHaveBeenCalledTimes(1);
  });

  it("is not offered to a plan with no race", () => {
    state.profile = HYBRID;
    renderEnding();
    expect(screen.queryByRole("region")).toBeNull();
  });
});

describe("WeekAheadEnding — new paces", () => {
  beforeEach(() => {
    state.profile = {
      ...HYBRID,
      runFitness: { benchmark: null, vdot: 40 },
    } as Partial<UserProfile>;
    state.insight = {
      direction: "faster",
      currentVdot: 40,
      suggestedVdot: 44,
      suggested: {},
    };
  });

  it("updates every pace in one tap", async () => {
    pace.accept.mockResolvedValue("success");
    renderEnding();
    fireEvent.click(screen.getByRole("button", { name: "Update paces" }));
    await screen.findByText("Training paces updated.");
    expect(pace.accept).toHaveBeenCalledTimes(1);
  });

  /* Where the pace controller marks new paces as Pro's to take, the
     review leaves them out: it carries no paywall (Rev1 Q7). */
  it("leaves out paces the controller marks as not this plan's to take", () => {
    state.paceLocked = true;
    renderEnding();
    expect(screen.queryByRole("region", { name: "Faster paces" })).toBeNull();
    expect(screen.getByRole("button", { name: "Looks good" })).toBeTruthy();
  });

  it("Keep my plan sets the paces aside", async () => {
    renderEnding();
    fireEvent.click(screen.getByRole("button", { name: "Keep my plan" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(pace.dismiss).toHaveBeenCalledTimes(1);
  });
});
