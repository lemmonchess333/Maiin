/**
 * Spec v7 required-test gate #11 — Home future planned day shows
 * planned item.
 *
 * Companion to DayPeekCard.test.tsx — that test pins the
 * tap-through detail. This one pins the always-visible strip
 * itself: future days that have a planned runDay must render the
 * coral planned-run indicator, NOT a blank chip.
 *
 * PR-0c moves the strip's runDay-matching from inline
 * `runDays.find(r => r.dayIndex === dow)` + `inSameWeek` heuristic
 * to the shared training resolver, which enforces date/weekKey-
 * aware matching anchored on today's currentWeekKey. So next-
 * week strip days can no longer borrow this-week's runDay state.
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import WeekStrip from "@/components/home/WeekStrip";
import type { UserProfile } from "@/lib/auth";
import type {
  ProgramState,
  ScheduledRunDay,
} from "@/features/program/programTypes";
import type { ScheduleDay } from "@/lib/scheduleUtils";
import type { ClaimState } from "@/lib/scheduledRunCompletion";
import { localDateString, localWeekKey } from "@/lib/dateHelpers";

const emptyClaimMap: Map<string, ClaimState> = new Map();

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

function makeSchedule(types: ScheduleDay["type"][]): ScheduleDay[] {
  return types.map((type, day) => ({ day, type }));
}

function makeRunDay(overrides: Partial<ScheduledRunDay> = {}): ScheduledRunDay {
  return {
    id: `runday_test_${overrides.dayIndex ?? 0}`,
    dayIndex: 0,
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

describe("WeekStrip — runDay status precedence (spec gate #11, resolver-aware)", () => {
  it("renders the planned-run rhombus when today's runDay is planned and not completed", () => {
    const today = new Date();
    const todayDow = today.getDay();
    const todayKey = localDateString(today);
    const todayWeekKey = localWeekKey(today);
    const schedule = makeSchedule([
      "run",
      "run",
      "run",
      "run",
      "run",
      "run",
      "run",
    ]);
    const profile = makeProfile(schedule);
    const programState = makeProgramState([
      makeRunDay({ dayIndex: todayDow, date: todayKey, weekKey: todayWeekKey }),
    ]);

    const { container } = render(
      <WeekStrip
        dayMap={new Map()}
        profile={profile}
        programState={programState}
        claimMap={emptyClaimMap}
        selectedDate={null}
        onDayTap={vi.fn()}
      />
    );

    // Coral rhombus — planned, not completed.
    const rhombuses = container.querySelectorAll(".rotate-45");
    expect(rhombuses.length).toBeGreaterThan(0);
    // No Check icon — planned (not completed) does not render a check.
    const checks = container.querySelectorAll(".lucide-check");
    expect(checks.length).toBe(0);
  });

  it("renders a Check icon for a completed run day (precedence over recurring rhombus)", () => {
    // PR-J chunk B3c — resolver-derived completion. The legacy
    // doc carries status="completed_exact" + the claim map's
    // `legacyCompleted` entry is what surfaces the ✅ (matches
    // what `computeClaims` produces in the real wiring).
    const today = new Date();
    const todayDow = today.getDay();
    const todayKey = localDateString(today);
    const todayWeekKey = localWeekKey(today);
    const schedule = makeSchedule([
      "run",
      "run",
      "run",
      "run",
      "run",
      "run",
      "run",
    ]);
    const profile = makeProfile(schedule);
    const legacyRunDay = makeRunDay({
      dayIndex: todayDow,
      date: todayKey,
      weekKey: todayWeekKey,
      completed: true,
      status: "completed_exact",
    });
    const programState = makeProgramState([legacyRunDay]);

    const { container } = render(
      <WeekStrip
        dayMap={new Map()}
        profile={profile}
        programState={programState}
        claimMap={claimMapWith([[legacyRunDay.id!, { legacyCompleted: true }]])}
        selectedDate={null}
        onDayTap={vi.fn()}
      />
    );

    const checks = container.querySelectorAll(".lucide-check");
    expect(checks.length).toBeGreaterThan(0);
  });

  it("renders a Check icon when the claim map carries a manual completion (B2 writer)", () => {
    // PR-J chunk B3c — the new manualCompletions writer path:
    // runDay.status stays "planned", but the ✅ surfaces because
    // the claim map says manualCompleted.
    const today = new Date();
    const todayDow = today.getDay();
    const todayKey = localDateString(today);
    const todayWeekKey = localWeekKey(today);
    const schedule = makeSchedule([
      "run",
      "run",
      "run",
      "run",
      "run",
      "run",
      "run",
    ]);
    const profile = makeProfile(schedule);
    const plannedRunDay = makeRunDay({
      dayIndex: todayDow,
      date: todayKey,
      weekKey: todayWeekKey,
      status: "planned",
    });
    const programState = makeProgramState([plannedRunDay]);

    const { container } = render(
      <WeekStrip
        dayMap={new Map()}
        profile={profile}
        programState={programState}
        claimMap={claimMapWith([
          [plannedRunDay.id!, { manualCompleted: true }],
        ])}
        selectedDate={null}
        onDayTap={vi.fn()}
      />
    );

    const checks = container.querySelectorAll(".lucide-check");
    expect(checks.length).toBeGreaterThan(0);
  });

  it("PR-0c: does not match next-week strip dates to this-week's runDay", () => {
    // Strip is rolling 7-day forward. If today is mid-week, the
    // last few strip days fall into NEXT week. Even when a
    // legacy-shaped runDay (no date/weekKey) matches by dayIndex,
    // the resolver's currentWeekKey gate prevents it from
    // surfacing on next-week strip dates.
    const schedule = makeSchedule([
      "run",
      "run",
      "run",
      "run",
      "run",
      "run",
      "run",
    ]);
    const profile = makeProfile(schedule);
    const today = new Date();
    const todayDow = today.getDay();
    // A legacy runDay with NO date/weekKey, dayIndex covering all
    // dows except today's. With the legacy code these would leak
    // status onto every strip day (including next-week dates).
    const runDays = [0, 1, 2, 3, 4, 5, 6]
      .filter((d) => d !== todayDow)
      .map((d) =>
        makeRunDay({
          dayIndex: d,
          date: undefined,
          weekKey: undefined,
          completed: true,
          status: "completed_exact",
        })
      );

    // Claim map carries `legacyCompleted: true` for every legacy
    // doc — the resolver's currentWeekKey gate is what prevents
    // those entries from leaking onto next-week strip positions
    // (the runDay match returns null before the claim map is even
    // consulted).
    const claimMap = claimMapWith(
      runDays.map((rd) => [rd.id!, { legacyCompleted: true }])
    );
    const { container } = render(
      <WeekStrip
        dayMap={new Map()}
        profile={profile}
        programState={makeProgramState(runDays)}
        claimMap={claimMap}
        selectedDate={null}
        onDayTap={vi.fn()}
      />
    );

    // The strip iterates today + 6 forward. Of those, only strip
    // positions whose dates fall in the SAME week as today should
    // match the legacy-shaped runDays. That's exactly `7 - todayDow`
    // positions — minus today itself (excluded from runDays).
    const checks = container.querySelectorAll(".lucide-check");
    const maxExpected = Math.max(0, 7 - todayDow - 1);
    expect(checks.length).toBeLessThanOrEqual(maxExpected);
  });

  it("renders the recurring rhombus when programState is omitted (back-compat)", () => {
    const schedule = makeSchedule([
      "run",
      "run",
      "run",
      "run",
      "run",
      "run",
      "run",
    ]);
    const profile = makeProfile(schedule);

    const { container } = render(
      <WeekStrip
        dayMap={new Map()}
        profile={profile}
        programState={null}
        claimMap={emptyClaimMap}
        selectedDate={null}
        onDayTap={vi.fn()}
      />
    );

    const rhombuses = container.querySelectorAll(".rotate-45");
    expect(rhombuses.length).toBeGreaterThan(0);
  });
});
