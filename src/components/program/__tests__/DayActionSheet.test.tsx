/**
 * PR-1: DayActionSheet status-aware contract.
 *
 * The sheet is the unified surface for per-day actions (template
 * swap, mark complete, skip run, skip lift). It replaces what was
 * Week-tab-only pre-PR-1 and mounts from Home + Programme Run rows.
 *
 * Pinned here:
 *   - Planned run renders the template select (enabled), "Mark
 *     complete (manual)", and "Skip this run".
 *   - Terminal runs (completed_* / skipped / race_no_show) render
 *     a locked status badge and a disabled select; no Skip/Complete
 *     buttons.
 *   - race_completed_unlinked renders passive copy with no
 *     interactive controls (template select hidden, no buttons).
 *   - Planned lift renders the "Skip this lift" button; completed/
 *     skipped lifts render a status badge with no action.
 *   - Action callbacks fire with the id-preferring overload
 *     (runDay.id when present, dayIndex fallback).
 *   - Empty day (no lift, no run match) renders the empty-state
 *     copy.
 *
 * Notes:
 * vaul's Drawer renders to a portal under document.body, NOT
 * inside the test container. All queries use `screen` (which
 * queries the entire document) or `document.querySelector` for
 * raw element access.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import DayActionSheet from "../DayActionSheet";
import type { UserProfile } from "@/lib/auth";
import type {
  ProgramState,
  ScheduledRunDay,
  WorkoutDay,
} from "@/features/program/programTypes";
import type { ClaimState } from "@/lib/scheduledRunCompletion";
import type { SavedRunDoc } from "@/hooks/useClaimMap";

const emptyClaimMap: Map<string, ClaimState> = new Map();
const emptyUnclaimed: Map<string, SavedRunDoc[]> = new Map();

function savedRun(overrides: Partial<SavedRunDoc> = {}): SavedRunDoc {
  return {
    id: "saved-1",
    date: "2026-05-12",
    distance: 5000,
    avgPace: 330,
    templateId: "easy_30",
    type: "easy",
    ...overrides,
  };
}

function claimMapWith(
  entries: Array<[string, Partial<ClaimState>]>
): Map<string, ClaimState> {
  const m = new Map<string, ClaimState>();
  for (const [id, partial] of entries) {
    m.set(id, {
      claimedSavedRunId: undefined,
      manualCompleted: false,
      legacyCompleted: false,
      ...partial,
    });
  }
  return m;
}

function makeProfile(
  weekSchedule: { day: number; type: "lift" | "run" | "both" | "rest" }[]
): UserProfile {
  return {
    uid: "u-1",
    displayName: "Test",
    email: "t@example.com",
    weekSchedule,
  } as UserProfile;
}

function makeRunDay(overrides: Partial<ScheduledRunDay> = {}): ScheduledRunDay {
  return {
    id: "runday_2026-05-17_1_easy_30",
    dayIndex: 1,
    date: "2026-05-18",
    weekKey: "2026-05-17",
    templateId: "easy_30",
    type: "easy",
    completed: false,
    status: "planned",
    ...overrides,
  };
}

function makeWorkout(overrides: Partial<WorkoutDay> = {}): WorkoutDay {
  return {
    dayName: "Push",
    dayType: "lift",
    exercises: [],
    completed: false,
    ...overrides,
  };
}

function makeProgramState(
  runDays: ScheduledRunDay[],
  workouts: WorkoutDay[] = []
): ProgramState {
  return {
    goal: "recomp",
    currentPhase: "base",
    weekNumber: 1,
    splitType: "ppl",
    workouts,
    fatigueScore: 0,
    updatedAt: Date.now(),
    settings: { autoProgression: true, microloading: true },
    weekHistory: [],
    programSchemaVersion: 2,
    runDays,
  } as ProgramState;
}

// Anchor fixtures on the live "today" so the resolver's
// currentWeekKey (computed from new Date() inside the sheet)
// matches the fixture weekKey.
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function todayWeekKey() {
  const d = new Date();
  const sunday = new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate() - d.getDay()
  );
  return `${sunday.getFullYear()}-${String(sunday.getMonth() + 1).padStart(2, "0")}-${String(sunday.getDate()).padStart(2, "0")}`;
}
function todayDow() {
  return new Date().getDay();
}

beforeEach(() => {
  cleanup();
});

function commonCallbacks() {
  return {
    overrideRunDay: vi.fn(),
    // PR-J Q2 chunk B2: markManualComplete replaces completeRunDay.
    markManualComplete: vi.fn(async () => {}),
    skipRunDay: vi.fn(async () => {}),
    skipWorkoutDay: vi.fn(async () => {}),
  };
}

describe("DayActionSheet — empty / null state", () => {
  it("renders nothing when open=false", () => {
    render(
      <DayActionSheet
        open={false}
        onClose={() => {}}
        dateKey={todayKey()}
        profile={makeProfile([])}
        programState={null}
        claimMap={emptyClaimMap}
        unclaimedByDate={emptyUnclaimed}
        {...commonCallbacks()}
      />
    );
    // Sheet returns null when closed — no body, no portal content.
    expect(screen.queryByText(/Manage day/i)).not.toBeInTheDocument();
  });

  it("renders 'Nothing scheduled' when no lift and no run match", () => {
    render(
      <DayActionSheet
        open={true}
        onClose={() => {}}
        dateKey={todayKey()}
        profile={makeProfile([
          { day: 0, type: "rest" },
          { day: 1, type: "rest" },
          { day: 2, type: "rest" },
          { day: 3, type: "rest" },
          { day: 4, type: "rest" },
          { day: 5, type: "rest" },
          { day: 6, type: "rest" },
        ])}
        programState={makeProgramState([])}
        claimMap={emptyClaimMap}
        unclaimedByDate={emptyUnclaimed}
        {...commonCallbacks()}
      />
    );
    expect(
      screen.getByText(/Nothing scheduled for this day\./i)
    ).toBeInTheDocument();
  });
});

describe("DayActionSheet — planned run", () => {
  function setup() {
    const profile = makeProfile(
      Array.from({ length: 7 }, (_, i) => ({
        day: i,
        type: i === todayDow() ? ("run" as const) : ("rest" as const),
      }))
    );
    const runDay = makeRunDay({
      id: "runday_target",
      dayIndex: todayDow(),
      date: todayKey(),
      weekKey: todayWeekKey(),
      status: "planned",
    });
    const programState = makeProgramState([runDay]);
    const callbacks = commonCallbacks();
    return { profile, programState, callbacks, runDay };
  }

  it("renders template select (enabled), Mark complete, and Skip this run", () => {
    const { profile, programState, callbacks } = setup();
    render(
      <DayActionSheet
        open={true}
        onClose={() => {}}
        dateKey={todayKey()}
        profile={profile}
        programState={programState}
        claimMap={emptyClaimMap}
        unclaimedByDate={emptyUnclaimed}
        {...callbacks}
      />
    );
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.disabled).toBe(false);
    expect(screen.getByText(/Mark complete \(manual\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Skip this run/i)).toBeInTheDocument();
  });

  it("Mark complete calls markManualComplete with the runDay's id (PR-J Q2)", () => {
    const { profile, programState, callbacks, runDay } = setup();
    render(
      <DayActionSheet
        open={true}
        onClose={() => {}}
        dateKey={todayKey()}
        profile={profile}
        programState={programState}
        claimMap={emptyClaimMap}
        unclaimedByDate={emptyUnclaimed}
        {...callbacks}
      />
    );
    fireEvent.click(screen.getByText(/Mark complete \(manual\)/i));
    expect(callbacks.markManualComplete).toHaveBeenCalledWith(runDay.id);
  });

  it("Skip this run calls skipRunDay with the runDay's id", () => {
    const { profile, programState, callbacks, runDay } = setup();
    render(
      <DayActionSheet
        open={true}
        onClose={() => {}}
        dateKey={todayKey()}
        profile={profile}
        programState={programState}
        claimMap={emptyClaimMap}
        unclaimedByDate={emptyUnclaimed}
        {...callbacks}
      />
    );
    fireEvent.click(screen.getByText(/Skip this run/i));
    expect(callbacks.skipRunDay).toHaveBeenCalledWith(runDay.id);
  });

  it("template select calls overrideRunDay with the runDay's id", () => {
    const { profile, programState, callbacks, runDay } = setup();
    render(
      <DayActionSheet
        open={true}
        onClose={() => {}}
        dateKey={todayKey()}
        profile={profile}
        programState={programState}
        claimMap={emptyClaimMap}
        unclaimedByDate={emptyUnclaimed}
        {...callbacks}
      />
    );
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "tempo_20" } });
    expect(callbacks.overrideRunDay).toHaveBeenCalledWith(
      runDay.id,
      "tempo_20"
    );
  });
});

describe("DayActionSheet — terminal run states locked", () => {
  function setupWithStatus(
    status: ScheduledRunDay["status"],
    completed = false
  ) {
    const profile = makeProfile(
      Array.from({ length: 7 }, (_, i) => ({
        day: i,
        type: i === todayDow() ? ("run" as const) : ("rest" as const),
      }))
    );
    const runDay = makeRunDay({
      id: "runday_terminal",
      dayIndex: todayDow(),
      date: todayKey(),
      weekKey: todayWeekKey(),
      status,
      completed,
    });
    return {
      profile,
      runDay,
      programState: makeProgramState([runDay]),
      callbacks: commonCallbacks(),
    };
  }

  it("completed_exact (legacy doc): select disabled, no Skip / Complete buttons, 'Completed' badge", () => {
    // PR-J chunk B3d — the resolver now derives `run.isCompleted`
    // from the claim map. For legacy completed_* docs the claim
    // map carries `legacyCompleted: true` (which `computeClaims`
    // sets from `isLegacyStatus(rd.status)`); the badge surfaces
    // through that path. The status-driven select-disabled +
    // isStartable gating still keys off `getScheduledRunStatus`
    // — completed_* status means !isStartable means no buttons.
    const { profile, programState, callbacks, runDay } = setupWithStatus(
      "completed_exact",
      true
    );
    render(
      <DayActionSheet
        open={true}
        onClose={() => {}}
        dateKey={todayKey()}
        profile={profile}
        programState={programState}
        claimMap={claimMapWith([[runDay.id!, { legacyCompleted: true }]])}
        unclaimedByDate={emptyUnclaimed}
        {...callbacks}
      />
    );
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.disabled).toBe(true);
    expect(
      screen.queryByText(/Mark complete \(manual\)/i)
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Skip this run/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Completed/i)).toBeInTheDocument();
  });

  it("manual completion on planned runDay surfaces 'Completed' badge AND hides Mark/Skip buttons (PR-J chunk B3d)", () => {
    // The B2 writer leaves runDay.status="planned" but writes
    // manualCompletions[id]. Pre-B3d the resolver wasn't claim-map-
    // aware, so isCompleted=false → "Completed" badge missing AND
    // isStartable=true → Mark/Skip buttons stayed visible.
    //
    // Post-B3d:
    //   - resolver derives isCompleted via the claim map → badge shows
    //   - DayActionSheet gates buttons on `!isCompleted && isStartable`
    //     so the buttons hide once any completion source flips on.
    const { profile, programState, callbacks, runDay } = setupWithStatus(
      "planned",
      false
    );
    render(
      <DayActionSheet
        open={true}
        onClose={() => {}}
        dateKey={todayKey()}
        profile={profile}
        programState={programState}
        claimMap={claimMapWith([[runDay.id!, { manualCompleted: true }]])}
        unclaimedByDate={emptyUnclaimed}
        {...callbacks}
      />
    );
    expect(screen.getByText(/Completed/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/Mark complete \(manual\)/i)
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Skip this run/i)).not.toBeInTheDocument();
  });

  it("saved-run claim on planned runDay also hides Mark/Skip + shows 'Completed' (PR-J chunk B3d)", () => {
    // Same shape as the manual-completion case but driven by an
    // organic saved-run match. Both completion sources share the
    // same `isRunDayComplete` derivation, so the UI treatment is
    // uniform.
    const { profile, programState, callbacks, runDay } = setupWithStatus(
      "planned",
      false
    );
    render(
      <DayActionSheet
        open={true}
        onClose={() => {}}
        dateKey={todayKey()}
        profile={profile}
        programState={programState}
        claimMap={claimMapWith([
          [runDay.id!, { claimedSavedRunId: "saved-1" }],
        ])}
        unclaimedByDate={emptyUnclaimed}
        {...callbacks}
      />
    );
    expect(screen.getByText(/Completed/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/Mark complete \(manual\)/i)
    ).not.toBeInTheDocument();
  });

  it("skipped: select disabled, no Skip / Complete buttons, 'Skipped' badge", () => {
    const { profile, programState, callbacks } = setupWithStatus("skipped");
    render(
      <DayActionSheet
        open={true}
        onClose={() => {}}
        dateKey={todayKey()}
        profile={profile}
        programState={programState}
        claimMap={emptyClaimMap}
        unclaimedByDate={emptyUnclaimed}
        {...callbacks}
      />
    );
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.disabled).toBe(true);
    expect(
      screen.queryByText(/Mark complete \(manual\)/i)
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Skip this run/i)).not.toBeInTheDocument();
    // The "Skipped" badge is the run-section status indicator.
    expect(screen.getAllByText(/Skipped/i).length).toBeGreaterThan(0);
  });
});

// PR-D: the `race_completed_unlinked` describe block was removed
// alongside the status itself. The reconciliation pattern in
// RunSummary now writes completed_exact directly via
// completeRunDay; no intermediate state is needed.

describe("DayActionSheet — Q5 P74 same-date paradox hint (chunk B3f)", () => {
  function setupPlanned(templateId = "easy_30") {
    const profile = makeProfile(
      Array.from({ length: 7 }, (_, i) => ({
        day: i,
        type: i === todayDow() ? ("run" as const) : ("rest" as const),
      }))
    );
    const runDay = makeRunDay({
      id: "runday_paradox",
      dayIndex: todayDow(),
      date: todayKey(),
      weekKey: todayWeekKey(),
      status: "planned",
      templateId,
    });
    return {
      profile,
      programState: makeProgramState([runDay]),
      callbacks: commonCallbacks(),
      runDay,
    };
  }

  it("renders the hint when a planned slot is unclaimed AND a same-date extra exists", () => {
    // Scenario: user logged a 2km run (sub-70% threshold per Q1 P2)
    // on a day where a 5km easy run was planned. Saved run lands in
    // unclaimedByDate because the distance gate fails. Q5 P74 says
    // the sheet should surface the hint so the user can resolve it
    // with a one-tap manual completion.
    const { profile, programState, callbacks } = setupPlanned();
    const extras = new Map<string, SavedRunDoc[]>([
      [todayKey(), [savedRun({ id: "extra-undersized", distance: 2000 })]],
    ]);
    render(
      <DayActionSheet
        open={true}
        onClose={() => {}}
        dateKey={todayKey()}
        profile={profile}
        programState={programState}
        claimMap={emptyClaimMap}
        unclaimedByDate={extras}
        {...callbacks}
      />
    );
    expect(
      screen.getByText(/An extra run is logged for this date/i)
    ).toBeInTheDocument();
    // Mark complete button is still there alongside the hint.
    expect(screen.getByText(/Mark complete \(manual\)/i)).toBeInTheDocument();
  });

  it("does NOT render the hint when no extras exist for this date", () => {
    const { profile, programState, callbacks } = setupPlanned();
    render(
      <DayActionSheet
        open={true}
        onClose={() => {}}
        dateKey={todayKey()}
        profile={profile}
        programState={programState}
        claimMap={emptyClaimMap}
        unclaimedByDate={emptyUnclaimed}
        {...callbacks}
      />
    );
    expect(
      screen.queryByText(/An extra run is logged for this date/i)
    ).not.toBeInTheDocument();
  });

  it("does NOT render the hint on race-day slots even when an extra exists (Q1 P4 / Q2 P21 inheritance)", () => {
    // Race day is strictly real-saved-run-only. If the user runs an
    // 18km half-marathon DNF (sub-95% per Q1 P4), the slot stays
    // planned and the saved run sits as an extra. The hint must
    // suppress so we don't offer a "mark complete" path that would
    // bypass the race-day strict rule.
    const { profile, programState, callbacks } = setupPlanned("race");
    const extras = new Map<string, SavedRunDoc[]>([
      [todayKey(), [savedRun({ id: "race-dnf", distance: 18000 })]],
    ]);
    render(
      <DayActionSheet
        open={true}
        onClose={() => {}}
        dateKey={todayKey()}
        profile={profile}
        programState={programState}
        claimMap={emptyClaimMap}
        unclaimedByDate={extras}
        {...callbacks}
      />
    );
    expect(
      screen.queryByText(/An extra run is logged for this date/i)
    ).not.toBeInTheDocument();
  });

  it("hint disappears once the user taps Mark complete (claim flips, gate hides the section)", () => {
    // Sanity-check the interaction: after Mark complete the entire
    // button block hides (B3d gate `!isCompleted`); the hint hides
    // alongside it because it lives inside the same conditional.
    const { profile, programState, callbacks, runDay } = setupPlanned();
    const extras = new Map<string, SavedRunDoc[]>([
      [todayKey(), [savedRun({ id: "extra-undersized", distance: 2000 })]],
    ]);
    const { rerender } = render(
      <DayActionSheet
        open={true}
        onClose={() => {}}
        dateKey={todayKey()}
        profile={profile}
        programState={programState}
        claimMap={emptyClaimMap}
        unclaimedByDate={extras}
        {...callbacks}
      />
    );
    expect(
      screen.getByText(/An extra run is logged for this date/i)
    ).toBeInTheDocument();
    rerender(
      <DayActionSheet
        open={true}
        onClose={() => {}}
        dateKey={todayKey()}
        profile={profile}
        programState={programState}
        claimMap={claimMapWith([[runDay.id!, { manualCompleted: true }]])}
        unclaimedByDate={extras}
        {...callbacks}
      />
    );
    expect(
      screen.queryByText(/An extra run is logged for this date/i)
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Mark complete \(manual\)/i)
    ).not.toBeInTheDocument();
  });
});

describe("DayActionSheet — lift section", () => {
  function setup(workoutOverrides: Partial<WorkoutDay> = {}) {
    const profile = makeProfile(
      Array.from({ length: 7 }, (_, i) => ({
        day: i,
        type: i === todayDow() ? ("lift" as const) : ("rest" as const),
      }))
    );
    return {
      profile,
      programState: makeProgramState([], [makeWorkout(workoutOverrides)]),
      callbacks: commonCallbacks(),
    };
  }

  it("planned lift: renders 'Skip this lift' button", () => {
    const { profile, programState, callbacks } = setup();
    render(
      <DayActionSheet
        open={true}
        onClose={() => {}}
        dateKey={todayKey()}
        profile={profile}
        programState={programState}
        claimMap={emptyClaimMap}
        unclaimedByDate={emptyUnclaimed}
        {...callbacks}
      />
    );
    expect(screen.getByText(/Skip this lift/i)).toBeInTheDocument();
  });

  it("Skip this lift calls skipWorkoutDay with the lift index", () => {
    const { profile, programState, callbacks } = setup();
    render(
      <DayActionSheet
        open={true}
        onClose={() => {}}
        dateKey={todayKey()}
        profile={profile}
        programState={programState}
        claimMap={emptyClaimMap}
        unclaimedByDate={emptyUnclaimed}
        {...callbacks}
      />
    );
    fireEvent.click(screen.getByText(/Skip this lift/i));
    expect(callbacks.skipWorkoutDay).toHaveBeenCalledWith(0);
  });

  it("completed lift: 'Completed' badge, no Skip button", () => {
    const { profile, programState, callbacks } = setup({ completed: true });
    render(
      <DayActionSheet
        open={true}
        onClose={() => {}}
        dateKey={todayKey()}
        profile={profile}
        programState={programState}
        claimMap={emptyClaimMap}
        unclaimedByDate={emptyUnclaimed}
        {...callbacks}
      />
    );
    expect(screen.queryByText(/Skip this lift/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Completed/i)).toBeInTheDocument();
  });

  it("skipped lift: 'Skipped' badge, no Skip button", () => {
    const { profile, programState, callbacks } = setup({ skipped: true });
    render(
      <DayActionSheet
        open={true}
        onClose={() => {}}
        dateKey={todayKey()}
        profile={profile}
        programState={programState}
        claimMap={emptyClaimMap}
        unclaimedByDate={emptyUnclaimed}
        {...callbacks}
      />
    );
    expect(screen.queryByText(/Skip this lift/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/Skipped/i).length).toBeGreaterThan(0);
  });
});
