/**
 * PR-0b-iii: ProgrammeRunSection per-day row renders status-aware.
 *
 * Pinned here:
 *   - race_completed_unlinked rows show passive copy
 *     ("Race completed separately. Review this in History.")
 *     with no template-swap select, no Skip, no Start.
 *   - planned rows show the editable template <select> as before.
 *   - terminal rows (skipped / completed_*) show a disabled
 *     select — the user can read the row but can't change it.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ProgrammeRunSection from "../ProgrammeRunSection";
import type { UserProfile } from "@/lib/auth";
import type { ProgramState, ScheduledRunDay } from "@/features/program/programTypes";

function makeProfile(): UserProfile {
  return {
    uid: "u-1",
    displayName: "Test",
    email: "t@example.com",
    runMode: "race_prep",
    raceGoal: { distance: "10k", targetDate: "2027-04-18" },
  } as UserProfile;
}

function makeProgramState(runDays: ScheduledRunDay[]): ProgramState {
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
    updateProfile: vi.fn(async () => ({ ok: true })) as never,
    overrideRunDay: vi.fn(),
    refreshRunSchedule: vi.fn(async () => {}),
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
