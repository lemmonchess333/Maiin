import { describe, it, expect } from "vitest";
import { shouldScheduleStreakReminder } from "../useStreakReminder";
import { STREAK_NOTIFICATION_ID } from "../streakNotificationId";

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
