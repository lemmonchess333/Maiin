/**
 * Spec v7 required-test gate #11 — "Home future planned day shows
 * planned item, not 'No activity logged'."
 *
 * DayPeekCard is the surface where a user taps a future day on
 * the Home WeekStrip and reads what's planned. PR-0c shifts the
 * lookup from a `runDays.find(r => r.dayIndex === dow)` inline
 * match (which leaked this-Monday's status into next Monday) to
 * the shared training resolver, which enforces date/weekKey-
 * aware matching with a legacy fallback gated to the current
 * generated week.
 *
 * Tests pin both the planned-day surface (gate #11) AND the
 * PR-0c correctness contract: a next-week date never inherits
 * this-week's runDay status.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DayPeekCard from "@/components/home/DayPeekCard";
import type { UserProfile } from "@/lib/auth";
import type {
  ProgramState,
  ScheduledRunDay,
} from "@/features/program/programTypes";
import type { ScheduleDay } from "@/lib/scheduleUtils";
import type { ClaimState } from "@/lib/scheduledRunCompletion";
import type { SavedRunDoc } from "@/hooks/useClaimMap";
import { localWeekKey, parseLocalDate } from "@/lib/dateHelpers";

// B3g — DayPeekCard's extras rows tap-through via useNavigate.
// Mock so we can assert destinations without a full Router tree.
const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom"
    );
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

const emptyClaimMap: Map<string, ClaimState> = new Map();
const emptyExtras: SavedRunDoc[] = [];

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

function renderCard(node: React.ReactElement) {
  return render(<MemoryRouter>{node}</MemoryRouter>);
}

function makeSchedule(types: ScheduleDay["type"][]): ScheduleDay[] {
  return types.map((type, day) => ({ day, type }));
}

function makeRunDay(overrides: Partial<ScheduledRunDay> = {}): ScheduledRunDay {
  return {
    id: `runday_test_${overrides.dayIndex ?? 2}`,
    dayIndex: 2,
    templateId: "easy_30",
    type: "easy",
    completed: false,
    status: "planned",
    ...overrides,
  };
}

function makeProfile(weekSchedule: ScheduleDay[]): UserProfile {
  return {
    uid: "u-1",
    displayName: "Test",
    email: "t@example.com",
    weekSchedule,
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
  } as ProgramState;
}

function emptyTotals() {
  return { calories: 0, protein: 0, carbs: 0, fat: 0, mealCount: 0 };
}

// Today (per CLAUDE.md context) is Saturday 2026-05-16. Build the
// test dates around that so resolver matching exercises the
// real same-week / future-week branches.
const TODAY_DOW = new Date().getDay();
// Pick a date in this calendar week for the planned-run cases.
// Today is in the strip, so a Tuesday in this week is either past
// or future depending on the weekday — but the resolver matches
// by date string regardless of "future vs past".
const dayOfThisWeek = (dow: number): string => {
  const todaySunday = new Date();
  todaySunday.setDate(todaySunday.getDate() - TODAY_DOW + dow);
  const y = todaySunday.getFullYear();
  const m = String(todaySunday.getMonth() + 1).padStart(2, "0");
  const d = String(todaySunday.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

describe("DayPeekCard — planned run rendering (spec gate #11, resolver-aware)", () => {
  it("renders 'Run scheduled' for a planned run day with date+weekKey set", () => {
    const tueKey = dayOfThisWeek(2);
    const tueWeekKey = localWeekKey(parseLocalDate(tueKey));
    const schedule = makeSchedule([
      "rest",
      "lift",
      "run",
      "lift",
      "run",
      "rest",
      "lift",
    ]);
    const profile = makeProfile(schedule);
    const programState = makeProgramState([
      makeRunDay({ dayIndex: 2, date: tueKey, weekKey: tueWeekKey }),
    ]);

    render(
      <DayPeekCard
        dateKey={tueKey}
        profile={profile}
        programState={programState}
        claimMap={emptyClaimMap}
        extras={emptyExtras}
        workouts={[]}
        dailyTotals={emptyTotals()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText("Run scheduled")).toBeInTheDocument();
    expect(screen.queryByText("No activity logged")).not.toBeInTheDocument();
  });

  it("falls back to 'No activity logged' when there's no planned run + no logged activity", () => {
    const tueKey = dayOfThisWeek(2);
    const schedule = makeSchedule([
      "rest",
      "rest",
      "rest",
      "rest",
      "rest",
      "rest",
      "rest",
    ]);
    const profile = makeProfile(schedule);

    render(
      <DayPeekCard
        dateKey={tueKey}
        profile={profile}
        programState={makeProgramState([])}
        claimMap={emptyClaimMap}
        extras={emptyExtras}
        workouts={[]}
        dailyTotals={emptyTotals()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText("No activity logged")).toBeInTheDocument();
    expect(screen.queryByText("Run scheduled")).not.toBeInTheDocument();
  });

  it("renders 'Run completed' with a check when the runDay is marked completed via legacy status", () => {
    // PR-J chunk B3c — the resolver now derives completion via the
    // claim map. Legacy completed_* docs surface as completed when
    // the claim map carries `legacyCompleted: true` (which
    // `computeClaims` sets automatically — here we hand-construct
    // it to keep the test focused on the DayPeekCard surface).
    const tueKey = dayOfThisWeek(2);
    const tueWeekKey = localWeekKey(parseLocalDate(tueKey));
    const schedule = makeSchedule([
      "rest",
      "lift",
      "run",
      "lift",
      "run",
      "rest",
      "lift",
    ]);
    const profile = makeProfile(schedule);
    const legacyRunDay = makeRunDay({
      dayIndex: 2,
      date: tueKey,
      weekKey: tueWeekKey,
      completed: true,
      status: "completed_exact",
    });
    const programState = makeProgramState([legacyRunDay]);

    render(
      <DayPeekCard
        dateKey={tueKey}
        profile={profile}
        programState={programState}
        claimMap={claimMapWith([[legacyRunDay.id!, { legacyCompleted: true }]])}
        extras={emptyExtras}
        workouts={[]}
        dailyTotals={emptyTotals()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText("Run completed")).toBeInTheDocument();
  });

  it("renders 'Run completed' when the claim map carries a manual completion (B2 writer)", () => {
    // PR-J chunk B3c — the new manualCompletions writer path. The
    // runDay's status stays `planned`; manualCompleted in the claim
    // map drives the ✅ + "Run completed" copy.
    const tueKey = dayOfThisWeek(2);
    const tueWeekKey = localWeekKey(parseLocalDate(tueKey));
    const schedule = makeSchedule([
      "rest",
      "lift",
      "run",
      "lift",
      "run",
      "rest",
      "lift",
    ]);
    const profile = makeProfile(schedule);
    const plannedRunDay = makeRunDay({
      dayIndex: 2,
      date: tueKey,
      weekKey: tueWeekKey,
      status: "planned",
    });
    const programState = makeProgramState([plannedRunDay]);

    render(
      <DayPeekCard
        dateKey={tueKey}
        profile={profile}
        programState={programState}
        claimMap={claimMapWith([
          [plannedRunDay.id!, { manualCompleted: true }],
        ])}
        extras={emptyExtras}
        workouts={[]}
        dailyTotals={emptyTotals()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText("Run completed")).toBeInTheDocument();
  });

  it("renders 'Run skipped' for a skipped runDay", () => {
    const tueKey = dayOfThisWeek(2);
    const tueWeekKey = localWeekKey(parseLocalDate(tueKey));
    const schedule = makeSchedule([
      "rest",
      "lift",
      "run",
      "lift",
      "run",
      "rest",
      "lift",
    ]);
    const profile = makeProfile(schedule);
    const programState = makeProgramState([
      makeRunDay({
        dayIndex: 2,
        date: tueKey,
        weekKey: tueWeekKey,
        status: "skipped",
      }),
    ]);

    render(
      <DayPeekCard
        dateKey={tueKey}
        profile={profile}
        programState={programState}
        claimMap={emptyClaimMap}
        extras={emptyExtras}
        workouts={[]}
        dailyTotals={emptyTotals()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText("Run skipped")).toBeInTheDocument();
  });

  it("stacks the run row alongside workout + meal lines when all are present", () => {
    const tueKey = dayOfThisWeek(2);
    const tueWeekKey = localWeekKey(parseLocalDate(tueKey));
    const schedule = makeSchedule([
      "rest",
      "lift",
      "both",
      "lift",
      "run",
      "rest",
      "lift",
    ]);
    const profile = makeProfile(schedule);
    const programState = makeProgramState([
      makeRunDay({ dayIndex: 2, date: tueKey, weekKey: tueWeekKey }),
    ]);

    render(
      <DayPeekCard
        dateKey={tueKey}
        profile={profile}
        programState={programState}
        claimMap={emptyClaimMap}
        extras={emptyExtras}
        workouts={[{ durationMinutes: 45 }]}
        dailyTotals={{
          ...emptyTotals(),
          calories: 1800,
          protein: 120,
          mealCount: 3,
        }}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText("Run scheduled")).toBeInTheDocument();
    expect(screen.getByText(/1 session/)).toBeInTheDocument();
    expect(screen.getByText(/1,800 cal/)).toBeInTheDocument();
  });
});

describe("DayPeekCard — PR-0c: next-week date does NOT inherit this-week runDay status", () => {
  it("a runDay completed THIS Tuesday does not surface as completed for NEXT Tuesday's peek", () => {
    // This Tuesday (relative to today)
    const thisTueKey = dayOfThisWeek(2);
    const thisTueWeekKey = localWeekKey(parseLocalDate(thisTueKey));
    // Next Tuesday: same dow=2, but 7 days later
    const nextTue = parseLocalDate(thisTueKey);
    nextTue.setDate(nextTue.getDate() + 7);
    const nextTueKey = `${nextTue.getFullYear()}-${String(nextTue.getMonth() + 1).padStart(2, "0")}-${String(nextTue.getDate()).padStart(2, "0")}`;

    const schedule = makeSchedule([
      "rest",
      "lift",
      "run",
      "lift",
      "run",
      "rest",
      "lift",
    ]);
    const profile = makeProfile(schedule);
    const programState = makeProgramState([
      makeRunDay({
        dayIndex: 2,
        date: thisTueKey,
        weekKey: thisTueWeekKey,
        status: "completed_exact",
        completed: true,
      }),
    ]);

    // Render the peek for NEXT Tuesday. The claim map carries the
    // legacy completion entry for THIS Tuesday's runDay — but the
    // resolver won't match the runDay to next Tuesday at all
    // (date+weekKey both fail), so the legacy entry never reaches
    // the rendered output. The contract being pinned here.
    const thisTueRunDay = makeRunDay({
      dayIndex: 2,
      date: thisTueKey,
      weekKey: thisTueWeekKey,
      status: "completed_exact",
      completed: true,
    });
    render(
      <DayPeekCard
        dateKey={nextTueKey}
        profile={profile}
        programState={programState}
        claimMap={claimMapWith([
          [thisTueRunDay.id!, { legacyCompleted: true }],
        ])}
        extras={emptyExtras}
        workouts={[]}
        dailyTotals={emptyTotals()}
        onClose={vi.fn()}
      />
    );

    // The runDay's `date` is this Tuesday — exact match fails for
    // next Tuesday, weekKey fails too, legacy fallback doesn't
    // apply (the runDay has both date and weekKey). Resolver
    // returns null. No "Run completed" copy, no "Run scheduled"
    // copy — there's just no run row at all for next Tuesday.
    expect(screen.queryByText("Run completed")).not.toBeInTheDocument();
    expect(screen.queryByText("Run scheduled")).not.toBeInTheDocument();
    expect(screen.getByText("No activity logged")).toBeInTheDocument();
  });
});

describe("DayPeekCard — Q5 extras rows (chunk B3g)", () => {
  beforeEach(() => {
    navigateMock.mockClear();
  });

  it("renders an extras row when an unclaimed saved run exists for this date", () => {
    const tueKey = dayOfThisWeek(2);
    const schedule = makeSchedule([
      "rest",
      "rest",
      "rest",
      "rest",
      "rest",
      "rest",
      "rest",
    ]);
    const profile = makeProfile(schedule);
    renderCard(
      <DayPeekCard
        dateKey={tueKey}
        profile={profile}
        programState={makeProgramState([])}
        claimMap={emptyClaimMap}
        extras={[savedRun({ id: "extra-1", distance: 5000, type: "easy" })]}
        workouts={[]}
        dailyTotals={emptyTotals()}
        onClose={vi.fn()}
      />
    );
    expect(
      screen.getByRole("button", { name: /Extra run: 5km easy/i })
    ).toBeInTheDocument();
    // Activity section took over — fallback empty-state copy hidden.
    expect(screen.queryByText("No activity logged")).not.toBeInTheDocument();
  });

  it("tapping an extras row navigates to RunDetail (/run/:id)", () => {
    const tueKey = dayOfThisWeek(2);
    const schedule = makeSchedule([
      "rest",
      "rest",
      "rest",
      "rest",
      "rest",
      "rest",
      "rest",
    ]);
    const profile = makeProfile(schedule);
    renderCard(
      <DayPeekCard
        dateKey={tueKey}
        profile={profile}
        programState={makeProgramState([])}
        claimMap={emptyClaimMap}
        extras={[savedRun({ id: "tap-target" })]}
        workouts={[]}
        dailyTotals={emptyTotals()}
        onClose={vi.fn()}
      />
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Extra run: 5km easy/i })
    );
    expect(navigateMock).toHaveBeenCalledWith("/run/tap-target");
  });

  it("caps visible extras at 2 and surfaces a '+N more' tap-through to /history", () => {
    const tueKey = dayOfThisWeek(2);
    const schedule = makeSchedule([
      "rest",
      "rest",
      "rest",
      "rest",
      "rest",
      "rest",
      "rest",
    ]);
    const profile = makeProfile(schedule);
    renderCard(
      <DayPeekCard
        dateKey={tueKey}
        profile={profile}
        programState={makeProgramState([])}
        claimMap={emptyClaimMap}
        extras={[
          savedRun({ id: "ex-1", distance: 3000, type: "easy" }),
          savedRun({ id: "ex-2", distance: 4000, type: "tempo" }),
          savedRun({ id: "ex-3", distance: 5000, type: "long" }),
          savedRun({ id: "ex-4", distance: 6000, type: "easy" }),
        ]}
        workouts={[]}
        dailyTotals={emptyTotals()}
        onClose={vi.fn()}
      />
    );
    // First two render as inline rows.
    expect(
      screen.getByRole("button", { name: /Extra run: 3km easy/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Extra run: 4km tempo/i })
    ).toBeInTheDocument();
    // The 3rd + 4th are hidden behind the overflow indicator.
    expect(
      screen.queryByRole("button", { name: /Extra run: 5km long/i })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /2 more extra runs/i })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /2 more extra runs/i }));
    expect(navigateMock).toHaveBeenCalledWith("/history");
  });

  it("extras render alongside a planned-run row when both exist for the date", () => {
    // Real-world scenario: the user has a planned 5km easy slot on
    // Tuesday AND logged a 3km run that didn't claim the slot
    // (sub-threshold). DayPeek shows the planned row + the extras
    // row side-by-side so the user sees both facts at a glance.
    const tueKey = dayOfThisWeek(2);
    const tueWeekKey = localWeekKey(parseLocalDate(tueKey));
    const schedule = makeSchedule([
      "rest",
      "lift",
      "run",
      "lift",
      "run",
      "rest",
      "lift",
    ]);
    const profile = makeProfile(schedule);
    const programState = makeProgramState([
      makeRunDay({ dayIndex: 2, date: tueKey, weekKey: tueWeekKey }),
    ]);
    renderCard(
      <DayPeekCard
        dateKey={tueKey}
        profile={profile}
        programState={programState}
        claimMap={emptyClaimMap}
        extras={[
          savedRun({ id: "sub-threshold", distance: 3000, type: "easy" }),
        ]}
        workouts={[]}
        dailyTotals={emptyTotals()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText("Run scheduled")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Extra run: 3km easy/i })
    ).toBeInTheDocument();
  });
});
