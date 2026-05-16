/**
 * PR-0b-iii + PR-0d + PR-4: ProgrammeRunSection behaviour.
 *
 * Pinned here:
 *
 *  PR-0b-iii (rows):
 *   - race_completed_unlinked rows show passive copy
 *     ("Race completed separately. Review this in History.")
 *     with no template-swap select, no Skip, no Start.
 *   - planned rows show the editable template <select> as before.
 *   - terminal rows (skipped / completed_*) show a disabled
 *     select — the user can read the row but can't change it.
 *
 *  PR-0d (mode-change safety):
 *   - Mode changes never call updateProfile({ runMode }) directly.
 *     All paths route through onOpenConfigurePlan(CONFIGURE_PLAN_RUNNING_STEP).
 *
 *  PR-4 (hero inversion):
 *   - Mode-picker chip row is gone. Mode changes happen via the
 *     footer "Change plan ›" affordance.
 *   - Freeform users see a "Start a run" hero + recent-run summary
 *     (or empty-state copy when no runs).
 *   - Structured / race_prep users with planned runs see a
 *     "Next · {day}" Start card promoted above the per-day list.
 *   - The "Race prep not set up yet" stub remains the hero for
 *     race_prep + no goal.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ProgrammeRunSection from "../ProgrammeRunSection";
import { CONFIGURE_PLAN_RUNNING_STEP } from "../ConfigurePlanModal";
import type { UserProfile } from "@/lib/auth";
import type { ProgramState, ScheduledRunDay } from "@/features/program/programTypes";

// PR-4: ProgrammeRunSection now consumes useRunningStats. Mock it
// so tests don't try to hit Firestore. Per-test override via
// `mockRecentRuns` / `mockWeeklyData` for the freeform-hero cases.
let mockRecentRuns: Array<{
  id: string;
  distance: number;
  duration: number;
  avgPace: number;
  elevationGain: number;
  calories: number;
  activityType: string;
  completedAt: Date;
}> = [];
let mockWeeklyData: Array<{ week: string; totalDistance: number; runCount: number; avgPace: number }> = [];
let mockRunsLoading = false;
vi.mock("@/hooks/useRunningStats", () => ({
  useRunningStats: () => ({
    runs: mockRecentRuns,
    weeklyData: mockWeeklyData,
    loading: mockRunsLoading,
  }),
}));

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    uid: "u-1",
    displayName: "Test",
    email: "t@example.com",
    runMode: "race_prep",
    raceGoal: { distance: "10k", targetDate: "2027-04-18" },
    ...overrides,
  } as UserProfile;
}

function makeProgramState(runDays: ScheduledRunDay[], overrides: Partial<ProgramState> = {}): ProgramState {
  return {
    goal: "recomp",
    currentPhase: "base",
    weekNumber: 1,
    splitType: "ppl",
    workouts: [],
    fatigueScore: 0,
    updatedAt: Date.now(),
    settings: { autoProgression: true, microloading: true },
    weekHistory: [],
    programSchemaVersion: 2,
    runDays,
    runPlan: {
      mode: "race_prep",
      raceGoal: { distance: "10k", targetDate: "2027-04-18" },
      totalWeeks: 12,
      currentWeek: 0,
    },
    ...overrides,
  } as ProgramState;
}

function makeRunDay(overrides: Partial<ScheduledRunDay> = {}): ScheduledRunDay {
  return {
    id: "runday_2026-05-10_2_easy_30",
    dayIndex: 2,
    templateId: "easy_30",
    type: "easy",
    completed: false,
    status: "planned",
    date: "2026-05-12",
    weekKey: "2026-05-10",
    ...overrides,
  };
}

function commonProps() {
  return {
    profile: makeProfile(),
    runsTarget: 2,
    overrideRunDay: vi.fn(),
    completeRunDay: vi.fn(async () => {}),
    skipRunDay: vi.fn(async () => {}),
    skipWorkoutDay: vi.fn(async () => {}),
    onOpenConfigurePlan: vi.fn(),
  };
}

function renderSection(props: ReturnType<typeof commonProps>, programState: ProgramState) {
  return render(
    <MemoryRouter>
      <ProgrammeRunSection {...props} programState={programState} />
    </MemoryRouter>,
  );
}

function renderWith(node: React.ReactElement) {
  return render(<MemoryRouter>{node}</MemoryRouter>);
}

describe("ProgrammeRunSection — race_completed_unlinked passive copy", () => {
  it("shows 'Race completed separately. Review this in History.' for a race_completed_unlinked row", () => {
    const programState = makeProgramState([makeRunDay({ status: "race_completed_unlinked" })]);
    renderSection(commonProps(), programState);
    expect(screen.getByText(/Race completed separately\. Review this in History\./)).toBeInTheDocument();
  });

  it("does NOT render a template-swap select for race_completed_unlinked rows", () => {
    const programState = makeProgramState([makeRunDay({ status: "race_completed_unlinked" })]);
    const { container } = renderSection(commonProps(), programState);
    // No <select> for the reconciliation row itself. (Row-level
    // assertion — other rows might still render a select.)
    expect(container.querySelectorAll("select").length).toBe(0);
  });

  it("does NOT render Skip / Start buttons for race_completed_unlinked", () => {
    const programState = makeProgramState([makeRunDay({ status: "race_completed_unlinked" })]);
    renderSection(commonProps(), programState);
    expect(screen.queryByText(/Skip this run/i)).not.toBeInTheDocument();
  });

  it("planned rows DO show the template-swap select (control)", () => {
    const programState = makeProgramState([makeRunDay({ status: "planned" })]);
    const { container } = renderSection(commonProps(), programState);
    const selects = container.querySelectorAll("select");
    expect(selects.length).toBeGreaterThan(0);
    expect((selects[0] as HTMLSelectElement).disabled).toBe(false);
  });

  it("terminal (skipped) rows render a disabled select, not passive copy", () => {
    const programState = makeProgramState([makeRunDay({ status: "skipped" })]);
    const { container } = renderSection(commonProps(), programState);
    const selects = container.querySelectorAll("select");
    expect(selects.length).toBeGreaterThan(0);
    expect((selects[0] as HTMLSelectElement).disabled).toBe(true);
    expect(screen.queryByText(/Race completed separately/i)).not.toBeInTheDocument();
  });
});

describe("ProgrammeRunSection — PR-4 footer 'Change plan' affordance", () => {
  it("clicking 'Change plan' opens ConfigurePlanModal at the Running step (freeform)", () => {
    const props = commonProps();
    const profile = makeProfile({ runMode: "freeform", raceGoal: undefined });
    renderWith(
      <ProgrammeRunSection
        {...props}
        profile={profile}
        programState={makeProgramState([], { runPlan: undefined })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Change plan/i }));
    expect(props.onOpenConfigurePlan).toHaveBeenCalledTimes(1);
    expect(props.onOpenConfigurePlan).toHaveBeenCalledWith(CONFIGURE_PLAN_RUNNING_STEP);
  });

  it("clicking 'Change plan' opens ConfigurePlanModal at the Running step (structured)", () => {
    const props = commonProps();
    const profile = makeProfile({ runMode: "structured", raceGoal: undefined });
    renderWith(
      <ProgrammeRunSection
        {...props}
        profile={profile}
        programState={makeProgramState([makeRunDay()], { runPlan: { mode: "structured" } })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Change plan/i }));
    expect(props.onOpenConfigurePlan).toHaveBeenCalledWith(CONFIGURE_PLAN_RUNNING_STEP);
  });

  it("clicking 'Change plan' opens ConfigurePlanModal at the Running step (race_prep with goal)", () => {
    const props = commonProps();
    renderSection(props, makeProgramState([makeRunDay()]));
    fireEvent.click(screen.getByRole("button", { name: /Change plan/i }));
    expect(props.onOpenConfigurePlan).toHaveBeenCalledWith(CONFIGURE_PLAN_RUNNING_STEP);
  });

  it("the footer label reflects the current mode (Race prep)", () => {
    renderSection(commonProps(), makeProgramState([makeRunDay()]));
    expect(screen.getByText(/Running mode:/i).textContent).toMatch(/Race prep/);
  });
});

describe("ProgrammeRunSection — PR-4 freeform hero", () => {
  beforeEachReset();

  it("renders a 'Start a run' CTA for freeform users", () => {
    mockRecentRuns = [];
    mockWeeklyData = [];
    const props = commonProps();
    const profile = makeProfile({ runMode: "freeform", raceGoal: undefined });
    renderWith(
      <ProgrammeRunSection
        {...props}
        profile={profile}
        runsTarget={0}
        programState={makeProgramState([], { runPlan: undefined })}
      />,
    );
    expect(screen.getByText(/Start a run/i)).toBeInTheDocument();
  });

  it("renders the empty-state copy when freeform user has no runs", () => {
    mockRecentRuns = [];
    mockWeeklyData = [];
    const props = commonProps();
    const profile = makeProfile({ runMode: "freeform", raceGoal: undefined });
    renderWith(
      <ProgrammeRunSection
        {...props}
        profile={profile}
        runsTarget={0}
        programState={makeProgramState([], { runPlan: undefined })}
      />,
    );
    expect(
      screen.getByText(/Track your first run to see weekly distance and pace trends here\./i),
    ).toBeInTheDocument();
  });

  it("renders last-run + this-week stats when freeform user has runs", () => {
    mockRecentRuns = [
      {
        id: "r1",
        distance: 5200,
        duration: 1722,
        avgPace: 331,
        elevationGain: 12,
        calories: 320,
        activityType: "run",
        completedAt: new Date(Date.now() - 2 * 24 * 3600 * 1000),
      },
    ];
    mockWeeklyData = [{ week: "2026-05-10", totalDistance: 12.3, runCount: 2, avgPace: 330 }];
    const props = commonProps();
    const profile = makeProfile({ runMode: "freeform", raceGoal: undefined });
    renderWith(
      <ProgrammeRunSection
        {...props}
        profile={profile}
        runsTarget={0}
        programState={makeProgramState([], { runPlan: undefined })}
      />,
    );
    expect(screen.getByText(/Last run/i)).toBeInTheDocument();
    expect(screen.getByText(/This week/i)).toBeInTheDocument();
    // "Track your first run" empty state should not render.
    expect(screen.queryByText(/Track your first run/i)).not.toBeInTheDocument();
  });

  it("section is visible for freeform users even with runsTarget === 0 (no early return)", () => {
    mockRecentRuns = [];
    mockWeeklyData = [];
    const props = commonProps();
    const profile = makeProfile({ runMode: "freeform", raceGoal: undefined });
    const { container } = renderWith(
      <ProgrammeRunSection
        {...props}
        profile={profile}
        runsTarget={0}
        programState={makeProgramState([], { runPlan: undefined })}
      />,
    );
    expect(container.querySelector("section")).not.toBeNull();
    expect(screen.getByText(/Run training/i)).toBeInTheDocument();
  });
});

describe("ProgrammeRunSection — PR-4 structured / race_prep hero", () => {
  beforeEachReset();

  it("promotes a 'Next' Start card for structured users with planned runs", () => {
    const props = commonProps();
    const profile = makeProfile({ runMode: "structured", raceGoal: undefined });
    renderWith(
      <ProgrammeRunSection
        {...props}
        profile={profile}
        programState={makeProgramState(
          [makeRunDay({ status: "planned", dayIndex: 3 })],
          { runPlan: { mode: "structured" } },
        )}
      />,
    );
    expect(screen.getByText(/^Next ·/i)).toBeInTheDocument();
  });

  it("renders 'All runs done this week' badge when every runDay is terminal", () => {
    const props = commonProps();
    const profile = makeProfile({ runMode: "structured", raceGoal: undefined });
    renderWith(
      <ProgrammeRunSection
        {...props}
        profile={profile}
        programState={makeProgramState(
          [makeRunDay({ status: "completed_exact", completed: true })],
          { runPlan: { mode: "structured" } },
        )}
      />,
    );
    expect(screen.getByText(/All runs done this week/i)).toBeInTheDocument();
    expect(screen.queryByText(/^Next ·/i)).not.toBeInTheDocument();
  });

  it("renders 'Configure your runs' CTA for non-freeform users with runsTarget=0 and no race goal", () => {
    const props = commonProps();
    const profile = makeProfile({ runMode: "structured", raceGoal: undefined });
    renderWith(
      <ProgrammeRunSection
        {...props}
        profile={profile}
        runsTarget={0}
        programState={makeProgramState([], { runPlan: { mode: "structured" } })}
      />,
    );
    expect(screen.getByText(/Configure your runs/i)).toBeInTheDocument();
  });

  it("race_prep mode without a raceGoal renders the 'Race prep not set up yet' stub", () => {
    const props = commonProps();
    const profile = makeProfile({ runMode: "race_prep", raceGoal: undefined });
    const { container } = renderWith(
      <ProgrammeRunSection
        {...props}
        profile={profile}
        programState={makeProgramState([], { runPlan: undefined })}
      />,
    );
    expect(screen.getByText(/Race prep not set up yet/i)).toBeInTheDocument();
    // Old inline date input is gone.
    expect(container.querySelector('input[type="date"]')).toBeNull();
  });

  it("'Set race goal' button opens ConfigurePlanModal at the Running step", () => {
    const props = commonProps();
    const profile = makeProfile({ runMode: "race_prep", raceGoal: undefined });
    renderWith(
      <ProgrammeRunSection
        {...props}
        profile={profile}
        programState={makeProgramState([], { runPlan: undefined })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Set race goal/i }));
    expect(props.onOpenConfigurePlan).toHaveBeenCalledWith(CONFIGURE_PLAN_RUNNING_STEP);
  });
});

// Reset the useRunningStats mock between tests so the freeform-hero
// cases see fresh fixture data each time.
function beforeEachReset() {
  beforeEach(() => {
    mockRecentRuns = [];
    mockWeeklyData = [];
    mockRunsLoading = false;
  });
}

// beforeEach helper from vitest — imported lazily so the file's
// describe block above doesn't have to declare it at the top.
import { beforeEach } from "vitest";
