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
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ProgrammeRunSection from "../ProgrammeRunSection";
import { CONFIGURE_PLAN_RUNNING_STEP } from "../ConfigurePlanModal";
import type { UserProfile } from "@/lib/auth";
import type { ProgramState, ScheduledRunDay } from "@/features/program/programTypes";

// PR-B: ProgrammeRunSection now consumes useAuth() directly (to
// call updateProfile from the inline mode-change handler). Mock
// it so the component renders standalone.
const mockUpdateProfile = vi.fn(async () => ({ ok: true } as { ok: true }));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { uid: "u-1" },
    profile: { uid: "u-1" },
    updateProfile: mockUpdateProfile,
  }),
}));

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
    // PR-B: refreshRunSchedule is the composing handler's second
    // half. Tests pass an async no-op since the assertions are on
    // the chip + form behaviour, not the regenerator output.
    refreshRunSchedule: vi.fn(async () => {}),
    skipRecoveryEarly: vi.fn(async () => {}),
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

describe("ProgrammeRunSection — runDay rendering", () => {
  // PR-D: `race_completed_unlinked` passive-copy block removed
  // alongside the status drop. The per-day list now renders the
  // standard template select for every non-reconciliation status.

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
    // PR-F: "This week" filter now uses `localWeekKey(new Date())`
    // so the fixture must reflect the current calendar week, not
    // a hardcoded historical week. Use the runtime week key.
    const todayWeekKey = (() => {
      const d = new Date();
      const sunday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay());
      const y = sunday.getFullYear();
      const m = String(sunday.getMonth() + 1).padStart(2, "0");
      const day = String(sunday.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    })();
    mockWeeklyData = [{ week: todayWeekKey, totalDistance: 12.3, runCount: 2, avgPace: 330 }];
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
    // PR-B4: the PR-0d "Race prep not set up yet" stub is replaced
    // by the PR-B3 inline race-goal form, which auto-opens when
    // race_prep is the active mode but no raceGoal exists.
    expect(screen.queryByText(/Race prep not set up yet/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Set your race goal/i)).toBeInTheDocument();
    // The inline date input IS now present (it's the form).
    expect(container.querySelector('input[type="date"]')).not.toBeNull();
  });

  it("'Create race plan' button + race_prep chip open the inline form, not the wizard", () => {
    const props = commonProps();
    const profile = makeProfile({ runMode: "freeform", raceGoal: undefined });
    renderWith(
      <ProgrammeRunSection
        {...props}
        profile={profile}
        programState={makeProgramState([], { runPlan: undefined })}
      />,
    );
    // PR-B: tapping Race Prep chip reveals the inline form. No
    // wizard / onOpenConfigurePlan call.
    fireEvent.click(screen.getByRole("button", { name: /Race Prep/i }));
    expect(screen.getByText(/Set your race goal/i)).toBeInTheDocument();
    expect(props.onOpenConfigurePlan).not.toHaveBeenCalled();
  });
});

describe("ProgrammeRunSection — PR-B inline mode chips (composing handler)", () => {
  beforeEach(() => {
    mockUpdateProfile.mockClear();
  });

  it("freeform → structured composes updateProfile + refreshRunSchedule with default target=3", async () => {
    const props = commonProps();
    const profile = makeProfile({
      runMode: "freeform",
      raceGoal: undefined,
      weeklyRunDaysTarget: 0,
      weeklyRunsTarget: 0,
    });
    renderWith(
      <ProgrammeRunSection
        {...props}
        profile={profile}
        runsTarget={0}
        programState={makeProgramState([], { runPlan: undefined })}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Structured$/i }));
    });

    // updateProfile called with mode + target (default 3)
    expect(mockUpdateProfile).toHaveBeenCalledTimes(1);
    expect(mockUpdateProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        runMode: "structured",
        weeklyRunDaysTarget: 3,
        weeklyRunsTarget: 3,
      }),
    );
    // refreshRunSchedule called with the override target
    expect(props.refreshRunSchedule).toHaveBeenCalledWith(
      expect.objectContaining({ weeklyRunDaysTarget: 3 }),
    );
    // NOT routed through the wizard
    expect(props.onOpenConfigurePlan).not.toHaveBeenCalled();
  });

  it("structured → freeform composes updateProfile + refreshRunSchedule", async () => {
    const props = commonProps();
    const profile = makeProfile({
      runMode: "structured",
      raceGoal: undefined,
      weeklyRunDaysTarget: 3,
    });
    renderWith(
      <ProgrammeRunSection
        {...props}
        profile={profile}
        programState={makeProgramState([makeRunDay({ status: "planned" })], { runPlan: { mode: "structured" } })}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Freeform$/i }));
    });

    expect(mockUpdateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ runMode: "freeform" }),
    );
    expect(props.refreshRunSchedule).toHaveBeenCalled();
    expect(props.onOpenConfigurePlan).not.toHaveBeenCalled();
  });

  it("race_prep chip from freeform reveals form, does NOT write yet", async () => {
    const props = commonProps();
    const profile = makeProfile({ runMode: "freeform", raceGoal: undefined });
    renderWith(
      <ProgrammeRunSection
        {...props}
        profile={profile}
        programState={makeProgramState([], { runPlan: undefined })}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Race Prep/i }));
    });

    // Form is visible, but no writes happened yet.
    expect(screen.getByText(/Set your race goal/i)).toBeInTheDocument();
    expect(mockUpdateProfile).not.toHaveBeenCalled();
    expect(props.refreshRunSchedule).not.toHaveBeenCalled();
  });

  it("race_prep chip from non-race_prep mode shows chip as selected while form is open", async () => {
    const props = commonProps();
    const profile = makeProfile({ runMode: "freeform", raceGoal: undefined });
    renderWith(
      <ProgrammeRunSection
        {...props}
        profile={profile}
        programState={makeProgramState([], { runPlan: undefined })}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Race Prep/i }));
    });

    const raceChip = screen.getByRole("button", { name: /Race Prep/i });
    expect(raceChip.getAttribute("aria-pressed")).toBe("true");
    const freeformChip = screen.getByRole("button", { name: /^Freeform$/i });
    expect(freeformChip.getAttribute("aria-pressed")).toBe("false");
  });

  it("race_prep with preserved goal: chip tap opens form prefilled with old goal", async () => {
    const props = commonProps();
    // User was previously in race_prep — raceGoal preserved
    // on profile per R1 GATED verdict — and switched to freeform.
    const profile = makeProfile({
      runMode: "freeform",
      raceGoal: { distance: "half", targetDate: "2027-09-15" },
    });
    renderWith(
      <ProgrammeRunSection
        {...props}
        profile={profile}
        programState={makeProgramState([], { runPlan: undefined })}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Race Prep/i }));
    });

    // Form title acknowledges existing goal
    expect(screen.getByText(/Edit race goal/i)).toBeInTheDocument();
    // Date input prefilled
    const dateInput = document.getElementById(
      "programme-race-target-date",
    ) as HTMLInputElement | null;
    expect(dateInput?.value).toBe("2027-09-15");
  });

  it("double-tap guard: chips are disabled while a mode change is in flight", () => {
    // Slow refresh to make the handler stay in flight long enough
    // for the assertion to land before it resolves.
    const slowRefresh = vi.fn(
      () => new Promise<void>(() => { /* never resolves */ }),
    );
    const props = { ...commonProps(), refreshRunSchedule: slowRefresh };
    const profile = makeProfile({
      runMode: "freeform",
      raceGoal: undefined,
      weeklyRunDaysTarget: 0,
    });
    renderWith(
      <ProgrammeRunSection
        {...props}
        profile={profile}
        runsTarget={0}
        programState={makeProgramState([], { runPlan: undefined })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^Structured$/i }));
    // While the handler is mid-flight, the not-yet-selected chips
    // disable to prevent a double-tap race.
    const freeformChip = screen.getByRole("button", { name: /^Freeform$/i }) as HTMLButtonElement;
    expect(freeformChip.disabled).toBe(true);
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

// beforeEach is imported at the top of the file (used by both
// the PR-B chip suite and the freeform-hero reset helper).
