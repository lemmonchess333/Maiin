/**
 * PR-0b-iii + PR-0d: ProgrammeRunSection per-day row + mode-chip
 * behaviour.
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
 *  PR-0d (chips + race-goal):
 *   - The mode chips do NOT mutate profile.runMode directly.
 *     Active chip is a no-op. Non-active chip calls
 *     onOpenConfigurePlan with CONFIGURE_PLAN_RUNNING_STEP.
 *   - race_prep + no raceGoal renders the "Race prep not set up
 *     yet" stub + button (instead of the old inline distance/date
 *     form). The button calls onOpenConfigurePlan at the running
 *     step.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ProgrammeRunSection from "../ProgrammeRunSection";
import { CONFIGURE_PLAN_RUNNING_STEP } from "../ConfigurePlanModal";
import type { UserProfile } from "@/lib/auth";
import type { ProgramState, ScheduledRunDay } from "@/features/program/programTypes";

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
    onOpenConfigurePlan: vi.fn(),
  };
}

describe("ProgrammeRunSection — race_completed_unlinked passive copy", () => {
  it("shows 'Race completed separately. Review this in History.' for a race_completed_unlinked row", () => {
    const programState = makeProgramState([
      makeRunDay({ status: "race_completed_unlinked" }),
    ]);
    render(<ProgrammeRunSection {...commonProps()} programState={programState} />);

    expect(screen.getByText(/Race completed separately\. Review this in History\./)).toBeInTheDocument();
  });

  it("does NOT render a template-swap select for race_completed_unlinked rows", () => {
    const programState = makeProgramState([
      makeRunDay({ status: "race_completed_unlinked" }),
    ]);
    const { container } = render(
      <ProgrammeRunSection {...commonProps()} programState={programState} />,
    );

    // The per-day row should have no <select>. The page-level
    // mode picker is buttons, not selects. So zero selects total.
    expect(container.querySelectorAll("select").length).toBe(0);
  });

  it("does NOT render Skip / Start buttons for race_completed_unlinked", () => {
    const programState = makeProgramState([
      makeRunDay({ status: "race_completed_unlinked" }),
    ]);
    render(<ProgrammeRunSection {...commonProps()} programState={programState} />);

    expect(screen.queryByText(/Skip this run/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Start/i)).not.toBeInTheDocument();
  });

  it("planned rows DO show the template-swap select (control)", () => {
    const programState = makeProgramState([makeRunDay({ status: "planned" })]);
    const { container } = render(
      <ProgrammeRunSection {...commonProps()} programState={programState} />,
    );

    // The per-day template <select> should exist.
    const selects = container.querySelectorAll("select");
    expect(selects.length).toBeGreaterThan(0);
    // Not disabled — planned is editable.
    expect((selects[0] as HTMLSelectElement).disabled).toBe(false);
  });

  it("terminal (skipped) rows render a disabled select, not passive copy", () => {
    const programState = makeProgramState([makeRunDay({ status: "skipped" })]);
    const { container } = render(
      <ProgrammeRunSection {...commonProps()} programState={programState} />,
    );

    // Select still rendered; just disabled. (Passive copy is
    // reserved for reconciliation, not generic terminal states.)
    const selects = container.querySelectorAll("select");
    expect(selects.length).toBeGreaterThan(0);
    expect((selects[0] as HTMLSelectElement).disabled).toBe(true);
    expect(
      screen.queryByText(/Race completed separately/i),
    ).not.toBeInTheDocument();
  });
});

describe("ProgrammeRunSection — PR-0d mode chips (no direct runMode mutation)", () => {
  it("active mode chip is a no-op — does not call onOpenConfigurePlan", () => {
    const props = commonProps();
    const profile = makeProfile({ runMode: "race_prep" });
    render(
      <ProgrammeRunSection
        {...props}
        profile={profile}
        programState={makeProgramState([makeRunDay()])}
      />,
    );

    // Active chip — race_prep was the profile mode
    const raceChip = screen.getByRole("button", { name: /Race Prep/ });
    fireEvent.click(raceChip);

    expect(props.onOpenConfigurePlan).not.toHaveBeenCalled();
  });

  it("non-active mode chip opens ConfigurePlanModal at the Running step", () => {
    const props = commonProps();
    const profile = makeProfile({ runMode: "freeform", raceGoal: undefined });
    render(
      <ProgrammeRunSection
        {...props}
        profile={profile}
        programState={makeProgramState([], { runPlan: undefined })}
      />,
    );

    // Click a non-active chip
    const structuredChip = screen.getByRole("button", { name: /^Structured$/ });
    fireEvent.click(structuredChip);

    expect(props.onOpenConfigurePlan).toHaveBeenCalledTimes(1);
    expect(props.onOpenConfigurePlan).toHaveBeenCalledWith(CONFIGURE_PLAN_RUNNING_STEP);
  });

  it("race_prep mode without a raceGoal renders the 'Race prep not set up yet' stub (no inline form)", () => {
    const props = commonProps();
    const profile = makeProfile({ runMode: "race_prep", raceGoal: undefined });
    const { container } = render(
      <ProgrammeRunSection
        {...props}
        profile={profile}
        programState={makeProgramState([], { runPlan: undefined })}
      />,
    );

    // Stub copy is present.
    expect(screen.getByText(/Race prep not set up yet/i)).toBeInTheDocument();
    // The old inline date input is gone.
    expect(container.querySelector('input[type="date"]')).toBeNull();
    // The old "Create Race Plan" button is gone.
    expect(screen.queryByText(/Create Race Plan/i)).not.toBeInTheDocument();
  });

  it("'Set race goal' button opens ConfigurePlanModal at the Running step", () => {
    const props = commonProps();
    const profile = makeProfile({ runMode: "race_prep", raceGoal: undefined });
    render(
      <ProgrammeRunSection
        {...props}
        profile={profile}
        programState={makeProgramState([], { runPlan: undefined })}
      />,
    );

    const setRaceGoal = screen.getByRole("button", { name: /Set race goal/i });
    fireEvent.click(setRaceGoal);

    expect(props.onOpenConfigurePlan).toHaveBeenCalledTimes(1);
    expect(props.onOpenConfigurePlan).toHaveBeenCalledWith(CONFIGURE_PLAN_RUNNING_STEP);
  });
});
