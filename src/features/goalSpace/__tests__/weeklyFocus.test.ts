/**
 * SOCIAL-FOCUS-01 — presentation-helper pins: the locked labels, the
 * Circle-type ordering (relevant first, nothing prohibited), the
 * timeline copy incl. the legacy focus-less sentence, and the
 * chosen-focus pulse count (distinct members, this week only).
 */
import { describe, it, expect } from "vitest";
import { WEEKLY_FOCUS_OPTIONS, type GoalSpaceEvent } from "../goalSpaceTypes";
import {
  WEEKLY_FOCUS_LABELS,
  checkInTimelineCopy,
  countWeeklyFocusSet,
  orderWeeklyFocus,
} from "../weeklyFocus";

describe("labels", () => {
  it("every focus has its locked user-facing label", () => {
    expect(WEEKLY_FOCUS_LABELS).toEqual({
      strength: "Lift with intention",
      running: "Follow my run plan",
      nutrition: "Keep food logging steady",
      progress: "Make one private progress check-in",
      recovery: "Protect recovery",
      balanced: "Keep the week balanced",
    });
  });
});

describe("orderWeeklyFocus", () => {
  it("leads with the Circle-type-relevant focus", () => {
    expect(orderWeeklyFocus("race")[0]).toBe("running");
    expect(orderWeeklyFocus("strength_block")[0]).toBe("strength");
    expect(orderWeeklyFocus("nutrition_consistency")[0]).toBe("nutrition");
    expect(orderWeeklyFocus("body_composition")[0]).toBe("progress");
    expect(orderWeeklyFocus("hybrid")[0]).toBe("balanced");
  });

  it("never prohibits a safe choice — all six offered for every type", () => {
    for (const type of [
      "race",
      "strength_block",
      "body_composition",
      "nutrition_consistency",
      "hybrid",
    ] as const) {
      expect([...orderWeeklyFocus(type)].sort()).toEqual(
        [...WEEKLY_FOCUS_OPTIONS].sort()
      );
    }
  });
});

describe("checkInTimelineCopy", () => {
  it("renders the focus sentence and keeps the legacy copy for focus-less check-ins", () => {
    expect(checkInTimelineCopy("running")).toBe(
      "is focusing on running this week"
    );
    expect(checkInTimelineCopy("balanced")).toBe(
      "is keeping the week balanced"
    );
    expect(checkInTimelineCopy(null)).toBe("checked in for the week");
  });
});

describe("countWeeklyFocusSet", () => {
  const WEEK = "2026-07-12";
  const event = (over: Partial<GoalSpaceEvent>): GoalSpaceEvent => ({
    id: "e",
    uid: "u",
    kind: "weekly_check_in",
    text: null,
    weekKey: WEEK,
    weeklyFocus: "running",
    supporterIds: [],
    createdAt: 1,
    ...over,
  });

  it("counts distinct members with a focus this week only", () => {
    const events = [
      event({ id: "1", uid: "a" }),
      event({ id: "2", uid: "a" }), // same member twice → one
      event({ id: "3", uid: "b", weeklyFocus: null }), // no focus → out
      event({ id: "4", uid: "c", weekKey: "2026-07-05" }), // last week → out
      event({ id: "5", uid: "d", kind: "milestone" }), // not a check-in → out
      event({ id: "6", uid: "e", weeklyFocus: "recovery" }),
    ];
    expect(countWeeklyFocusSet(events, WEEK)).toBe(2);
  });
});
