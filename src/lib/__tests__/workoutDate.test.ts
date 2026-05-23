/**
 * Tests for `isWorkoutOnDate` — the date-match helper used by
 * useEffectiveTargets (Food ring) and useHomeData (Home budget line).
 *
 * The contract: any of the three workout.date shapes (string,
 * Date, Firestore Timestamp) matches against the target date by
 * normalising to "yyyy-MM-dd" in the viewer's local timezone.
 *
 * Pinning the three branches plus the fallthrough is important
 * because useEffectiveTargets and useHomeData both consume this
 * helper and their totals must agree — a regression in one
 * branch silently desyncs the Food ring from the Home budget.
 */
import { describe, it, expect } from "vitest";
import { Timestamp } from "firebase/firestore";
import { isWorkoutOnDate } from "../workoutDate";

const target = new Date(2026, 3, 17); // 17 April 2026, local TZ

describe("isWorkoutOnDate — string date", () => {
  it("matches when the string equals the target's local yyyy-MM-dd", () => {
    expect(isWorkoutOnDate({ date: "2026-04-17" }, target)).toBe(true);
  });

  it("does not match a different date string", () => {
    expect(isWorkoutOnDate({ date: "2026-04-18" }, target)).toBe(false);
  });

  it("does not match an empty string", () => {
    expect(isWorkoutOnDate({ date: "" }, target)).toBe(false);
  });
});

describe("isWorkoutOnDate — Date instance", () => {
  it("matches a Date on the same local day", () => {
    /* Same calendar day in local TZ — passes via the date-fns
       format("yyyy-MM-dd") normalisation. */
    const sameDay = new Date(2026, 3, 17, 14, 30, 0);
    expect(isWorkoutOnDate({ date: sameDay }, target)).toBe(true);
  });

  it("does not match a Date one day off", () => {
    const nextDay = new Date(2026, 3, 18, 14, 30, 0);
    expect(isWorkoutOnDate({ date: nextDay }, target)).toBe(false);
  });

  it("matches at midnight boundaries (00:00)", () => {
    const midnight = new Date(2026, 3, 17, 0, 0, 0);
    expect(isWorkoutOnDate({ date: midnight }, target)).toBe(true);
  });

  it("matches at end-of-day boundaries (23:59)", () => {
    const lateNight = new Date(2026, 3, 17, 23, 59, 59);
    expect(isWorkoutOnDate({ date: lateNight }, target)).toBe(true);
  });
});

describe("isWorkoutOnDate — Firestore Timestamp", () => {
  it("matches a Timestamp on the same local day", () => {
    const ts = Timestamp.fromDate(new Date(2026, 3, 17, 9, 0, 0));
    expect(isWorkoutOnDate({ date: ts }, target)).toBe(true);
  });

  it("does not match a Timestamp on a different day", () => {
    const ts = Timestamp.fromDate(new Date(2026, 3, 16, 9, 0, 0));
    expect(isWorkoutOnDate({ date: ts }, target)).toBe(false);
  });
});

describe("isWorkoutOnDate — unknown shape fallthrough", () => {
  it("returns false for an unexpected date shape (defensive)", () => {
    /* `workout.date` is typed as `string | Date | Timestamp` but
       callers come from Firestore reads — defensively cover the
       case where the field is something else (e.g. null in a
       legacy doc). */
    const malformed = { date: 12345 as unknown as string };
    expect(isWorkoutOnDate(malformed, target)).toBe(false);
  });
});
