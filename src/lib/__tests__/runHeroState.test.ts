/**
 * Run8 PR1c — getRunHeroState discriminator contract.
 *
 * Pins each state's input combination so a future refactor of the
 * Programme Run hero rendering can switch on the state name with
 * full confidence the conditions are exactly what they were before.
 */
import { describe, it, expect } from "vitest";
import {
  getRunHeroState,
  shouldShowHeroOverflow,
  type RunHeroStateInput,
} from "../runHeroState";
import type { ScheduledRunDay } from "@/features/program/programTypes";

const TODAY = "2026-05-27";
const TOMORROW = "2026-05-28";
const YESTERDAY = "2026-05-26";

function runDay(overrides: Partial<ScheduledRunDay> = {}): ScheduledRunDay {
  return {
    id: "rd-1",
    dayIndex: 3,
    date: TODAY,
    weekKey: "2026-W22",
    status: "planned",
    templateId: "easy_30",
    type: "easy",
    ...overrides,
  } as ScheduledRunDay;
}

function input(overrides: Partial<RunHeroStateInput> = {}): RunHeroStateInput {
  return {
    mode: "structured",
    raceGoal: null,
    phase: null,
    recoveryEndDate: null,
    nextStartable: null,
    todayKey: TODAY,
    tomorrowKey: TOMORROW,
    hasRunDays: false,
    ...overrides,
  };
}

describe("getRunHeroState", () => {
  it("returns 'freeform' when mode is freeform", () => {
    expect(getRunHeroState(input({ mode: "freeform" }))).toBe("freeform");
  });

  it("returns 'unset' when race_prep has no raceGoal", () => {
    expect(getRunHeroState(input({ mode: "race_prep" }))).toBe("unset");
  });

  it("returns 'race-recovery' when phase=recovery and recoveryEndDate is future", () => {
    expect(
      getRunHeroState(
        input({
          mode: "race_prep",
          raceGoal: { distance: "10k", targetDate: YESTERDAY },
          phase: "recovery",
          recoveryEndDate: "2026-06-10",
        })
      )
    ).toBe("race-recovery");
  });

  it("recovery takes precedence over a stale nextStartable", () => {
    expect(
      getRunHeroState(
        input({
          mode: "race_prep",
          raceGoal: { distance: "10k", targetDate: YESTERDAY },
          phase: "recovery",
          recoveryEndDate: "2026-06-10",
          nextStartable: runDay(),
          hasRunDays: true,
        })
      )
    ).toBe("race-recovery");
  });

  it("Run9 R3-cycle: recovery wins even when mode resolved to freeform", () => {
    // Materialization clears raceGoal at recovery-END (→ runMode freeform), but
    // the phase clear is a separate server write. Between them a user is
    // phase=recovery AND mode=freeform — the recovery hero must still win, NOT
    // the bare freeform Start CTA. This pins the recovery-check-before-freeform
    // ordering.
    expect(
      getRunHeroState(
        input({
          mode: "freeform",
          raceGoal: null,
          phase: "recovery",
          recoveryEndDate: "2026-06-10",
        })
      )
    ).toBe("race-recovery");
  });

  it("returns 'race-today' when nextStartable is today's race template", () => {
    expect(
      getRunHeroState(
        input({
          mode: "race_prep",
          raceGoal: { distance: "10k", targetDate: TODAY },
          nextStartable: runDay({ templateId: "marathon_race", date: TODAY }),
        })
      )
    ).toBe("race-today");
  });

  it("Run9 (l): returns 'race-recent' for a race 1–3 days ago (did-you-race window)", () => {
    // TODAY = 2026-05-27. Race two days ago (2026-05-25) → within T+1..T+3.
    expect(
      getRunHeroState(
        input({
          mode: "race_prep",
          raceGoal: { distance: "10k", targetDate: "2026-05-25" },
          // a stale past race slot would otherwise read as catch-up
          nextStartable: runDay({
            date: "2026-05-25",
            templateId: "marathon_race",
          }),
          hasRunDays: true,
        })
      )
    ).toBe("race-recent");
  });

  it("Run9 (l): race-recent does NOT fire on race day itself (T+0)", () => {
    // Race today → race-today wins, not race-recent.
    expect(
      getRunHeroState(
        input({
          mode: "race_prep",
          raceGoal: { distance: "10k", targetDate: TODAY },
          nextStartable: runDay({ date: TODAY, templateId: "marathon_race" }),
        })
      )
    ).toBe("race-today");
  });

  it("Run9 (l): a race >3 days ago falls through to catch-up, not race-recent", () => {
    // Race 5 days ago (2026-05-22) → past the did-you-race window.
    expect(
      getRunHeroState(
        input({
          mode: "race_prep",
          raceGoal: { distance: "10k", targetDate: "2026-05-22" },
          nextStartable: runDay({
            date: "2026-05-22",
            templateId: "marathon_race",
          }),
        })
      )
    ).toBe("catch-up");
  });

  it("Run9 (l): recovery still wins over race-recent (race was logged)", () => {
    expect(
      getRunHeroState(
        input({
          mode: "race_prep",
          raceGoal: { distance: "10k", targetDate: "2026-05-25" },
          phase: "recovery",
          recoveryEndDate: "2026-06-10",
        })
      )
    ).toBe("race-recovery");
  });

  it("returns 'race-prep-week' when race_prep + today is non-race", () => {
    expect(
      getRunHeroState(
        input({
          mode: "race_prep",
          raceGoal: { distance: "10k", targetDate: "2026-07-15" },
          nextStartable: runDay({ date: TODAY }),
        })
      )
    ).toBe("race-prep-week");
  });

  it("returns 'structured-today' when structured + today's planned run", () => {
    expect(
      getRunHeroState(
        input({
          mode: "structured",
          nextStartable: runDay({ date: TODAY }),
        })
      )
    ).toBe("structured-today");
  });

  it("returns 'catch-up' when nextStartable.date is in the past", () => {
    expect(
      getRunHeroState(
        input({
          mode: "structured",
          nextStartable: runDay({ date: YESTERDAY }),
        })
      )
    ).toBe("catch-up");
  });

  it("returns 'structured-tomorrow' when nextStartable.date === tomorrow", () => {
    expect(
      getRunHeroState(
        input({
          mode: "structured",
          nextStartable: runDay({ date: TOMORROW }),
        })
      )
    ).toBe("structured-tomorrow");
  });

  it("returns 'structured-future' for dates >tomorrow", () => {
    expect(
      getRunHeroState(
        input({
          mode: "structured",
          nextStartable: runDay({ date: "2026-06-05" }),
        })
      )
    ).toBe("structured-future");
  });

  it("returns 'all-done' when runDays exist and none are startable", () => {
    expect(
      getRunHeroState(
        input({
          mode: "structured",
          nextStartable: null,
          hasRunDays: true,
        })
      )
    ).toBe("all-done");
  });

  it("returns 'rest' when structured but no runDays and no nextStartable", () => {
    expect(
      getRunHeroState(
        input({
          mode: "structured",
          nextStartable: null,
          hasRunDays: false,
        })
      )
    ).toBe("rest");
  });
});

describe("shouldShowHeroOverflow — L12", () => {
  it("visible on planned-today, catch-up, race-today, race-prep-week", () => {
    expect(shouldShowHeroOverflow("structured-today")).toBe(true);
    expect(shouldShowHeroOverflow("catch-up")).toBe(true);
    expect(shouldShowHeroOverflow("race-today")).toBe(true);
    expect(shouldShowHeroOverflow("race-prep-week")).toBe(true);
  });

  it("hidden on every other state", () => {
    expect(shouldShowHeroOverflow("freeform")).toBe(false);
    expect(shouldShowHeroOverflow("unset")).toBe(false);
    expect(shouldShowHeroOverflow("structured-tomorrow")).toBe(false);
    expect(shouldShowHeroOverflow("structured-future")).toBe(false);
    expect(shouldShowHeroOverflow("race-recovery")).toBe(false);
    expect(shouldShowHeroOverflow("all-done")).toBe(false);
    expect(shouldShowHeroOverflow("rest")).toBe(false);
    // Run9 (l): race-recent is now hidden too — the did-you-race hero body
    // owns the operational slot, so there's no catch-up card to host the `...`.
    expect(shouldShowHeroOverflow("race-recent")).toBe(false);
  });
});
