import { describe, it, expect } from "vitest";
import {
  shouldScheduleStreakReminder,
  firstWeekNudgeAction,
  computeTomorrowOccurrence,
} from "../useStreakReminder";
import {
  STREAK_NOTIFICATION_ID,
  FIRST_WEEK_NOTIFICATION_ID,
} from "../streakNotificationId";

/**
 * Pure-logic tests for the streak reminder's scheduling decision and for
 * the stable notification ID. Timing-dependent firing and Firestore/Capacitor
 * side effects are covered by manual device testing per the prompt's
 * acceptance criteria.
 */

const base = {
  loading: false,
  enabled: true,
  primingShown: true,
  currentStreak: 3,
  hasLoggedToday: false,
};

describe("shouldScheduleStreakReminder", () => {
  it("schedules when all gates pass", () => {
    expect(shouldScheduleStreakReminder(base)).toBe(true);
  });

  it("does not schedule while still loading", () => {
    expect(shouldScheduleStreakReminder({ ...base, loading: true })).toBe(
      false
    );
  });

  it("does not schedule when disabled", () => {
    expect(shouldScheduleStreakReminder({ ...base, enabled: false })).toBe(
      false
    );
  });

  it("does not schedule before priming has been responded to", () => {
    expect(shouldScheduleStreakReminder({ ...base, primingShown: false })).toBe(
      false
    );
  });

  it("does not schedule when streak is below 2", () => {
    expect(shouldScheduleStreakReminder({ ...base, currentStreak: 1 })).toBe(
      false
    );
    expect(shouldScheduleStreakReminder({ ...base, currentStreak: 0 })).toBe(
      false
    );
  });

  it("schedules at the 2-day boundary", () => {
    expect(shouldScheduleStreakReminder({ ...base, currentStreak: 2 })).toBe(
      true
    );
  });

  it("does not schedule when already logged today", () => {
    expect(
      shouldScheduleStreakReminder({ ...base, hasLoggedToday: true })
    ).toBe(false);
  });
});

// First-week (day-2) return nudge — D-1 fix. Day 1: the user just logged
// (hasLoggedToday true, streak 1), consent granted, nudge never scheduled.
const fwBase = {
  loading: false,
  enabled: true,
  primingShown: true,
  currentStreak: 1,
  hasLoggedToday: true,
  firstWeekNudgeDateKey: null as string | null,
  todayKey: "2026-06-01",
};

describe("firstWeekNudgeAction", () => {
  it("schedules on the first log day (streak 1, logged today, consented, never scheduled)", () => {
    expect(firstWeekNudgeAction(fwBase)).toBe("schedule");
  });

  it("never schedules while loading / unconsented / disabled", () => {
    expect(firstWeekNudgeAction({ ...fwBase, loading: true })).toBe("none");
    expect(firstWeekNudgeAction({ ...fwBase, primingShown: false })).toBe(
      "none"
    );
    expect(firstWeekNudgeAction({ ...fwBase, enabled: false })).toBe("none");
  });

  it("only fires in the streak-1 window — at ≥ 2 the daily reminder owns the surface", () => {
    expect(firstWeekNudgeAction({ ...fwBase, currentStreak: 2 })).toBe("none");
    expect(firstWeekNudgeAction({ ...fwBase, currentStreak: 0 })).toBe("none");
  });

  it("requires a log today — the nudge anchors to the log day, not app-open", () => {
    expect(firstWeekNudgeAction({ ...fwBase, hasLoggedToday: false })).toBe(
      "none"
    );
  });

  it("is once-ever: a consumed marker never re-schedules, even in a later streak-1 window", () => {
    expect(
      firstWeekNudgeAction({
        ...fwBase,
        firstWeekNudgeDateKey: "2026-05-02",
        todayKey: "2026-06-01",
      })
    ).toBe("none");
  });

  it("cancels the pending fire when the user logs on the fire day (came back on their own)", () => {
    expect(
      firstWeekNudgeAction({
        ...fwBase,
        firstWeekNudgeDateKey: "2026-06-02",
        todayKey: "2026-06-02",
        currentStreak: 2,
        hasLoggedToday: true,
      })
    ).toBe("cancel");
  });

  it("does NOT cancel on the fire day when the user hasn't logged — the nudge must fire", () => {
    expect(
      firstWeekNudgeAction({
        ...fwBase,
        firstWeekNudgeDateKey: "2026-06-02",
        todayKey: "2026-06-02",
        currentStreak: 0,
        hasLoggedToday: false,
      })
    ).toBe("none");
  });

  it("cancels when the reminder is disabled after scheduling", () => {
    expect(
      firstWeekNudgeAction({
        ...fwBase,
        enabled: false,
        firstWeekNudgeDateKey: "2026-06-02",
        todayKey: "2026-06-01",
      })
    ).toBe("cancel");
  });

  it("logging on the SCHEDULE day does not cancel tomorrow's pending fire", () => {
    // Right after scheduling: marker = tomorrow, today is still the log day.
    expect(
      firstWeekNudgeAction({
        ...fwBase,
        firstWeekNudgeDateKey: "2026-06-02",
        todayKey: "2026-06-01",
        hasLoggedToday: true,
      })
    ).toBe("none");
  });
});

describe("computeTomorrowOccurrence", () => {
  it("returns tomorrow at the given local time", () => {
    const result = computeTomorrowOccurrence("20:00");
    expect(result).not.toBeNull();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(result!.getDate()).toBe(tomorrow.getDate());
    expect(result!.getHours()).toBe(20);
    expect(result!.getMinutes()).toBe(0);
    expect(result!.getTime()).toBeGreaterThan(Date.now());
  });

  it("null on malformed input", () => {
    expect(computeTomorrowOccurrence("8pm")).toBeNull();
    expect(computeTomorrowOccurrence("25:00")).toBeNull();
    expect(computeTomorrowOccurrence("20:75")).toBeNull();
  });
});

describe("STREAK_NOTIFICATION_ID", () => {
  it("is 3001 — stable for cancel-on-activity callers", () => {
    // Hard-pinned because useStreaks.ts imports this and cancels by value.
    // A rename here without updating that import would silently break the
    // "don't fire after a fresh log" behaviour.
    expect(STREAK_NOTIFICATION_ID).toBe(3001);
  });

  it("does not collide with meal (1001-1003) or workout (2001) IDs", () => {
    expect(STREAK_NOTIFICATION_ID).not.toBe(1001);
    expect(STREAK_NOTIFICATION_ID).not.toBe(1002);
    expect(STREAK_NOTIFICATION_ID).not.toBe(1003);
    expect(STREAK_NOTIFICATION_ID).not.toBe(2001);
  });
});

describe("FIRST_WEEK_NOTIFICATION_ID", () => {
  it("is 3002 — distinct from the daily streak reminder so cancels can't clobber", () => {
    expect(FIRST_WEEK_NOTIFICATION_ID).toBe(3002);
    expect(FIRST_WEEK_NOTIFICATION_ID).not.toBe(STREAK_NOTIFICATION_ID);
  });
});
