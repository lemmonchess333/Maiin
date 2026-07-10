/**
 * Momentum Check-in (CHECKIN-01) — pure model pins.
 *
 * Protected invariants:
 *   - every feel/focus response maps to NAVIGATION only (a route
 *     string), never a mutation hook — one answer must never change
 *     programme volume or calorie targets
 *   - the doc is keyed by weekKey (idempotent re-submission)
 *   - parse rejects malformed boundary data; dismissed docs parse to
 *     a dismissed record regardless of missing answers
 */
import { describe, it, expect } from "vitest";
import {
  FEEL_OPTIONS,
  FOCUS_OPTIONS,
  nextActionForFeel,
  nextActionForFocus,
  checkinDocPath,
  parseCheckin,
} from "../momentumCheckin";

describe("nextActionForFeel / nextActionForFocus", () => {
  it("maps every feel to a navigation-only action", () => {
    for (const { value } of FEEL_OPTIONS) {
      const action = nextActionForFeel(value);
      expect(action.label.length).toBeGreaterThan(0);
      expect(action.to.startsWith("/")).toBe(true);
    }
  });

  it("maps every focus to a navigation-only action", () => {
    for (const { value } of FOCUS_OPTIONS) {
      const action = nextActionForFocus(value);
      expect(action.label.length).toBeGreaterThan(0);
      expect(action.to.startsWith("/")).toBe(true);
    }
  });

  it("'a bit much' steers to programme options, never a volume cut", () => {
    expect(nextActionForFeel("a_bit_much").to).toBe("/program");
  });
});

describe("checkinDocPath", () => {
  it("keys the doc by week — same week overwrites itself", () => {
    expect(checkinDocPath("u1", "2026-07-06")).toBe(
      "users/u1/checkins/2026-07-06"
    );
    expect(checkinDocPath("u1", "2026-07-06")).toBe(
      checkinDocPath("u1", "2026-07-06")
    );
  });
});

describe("parseCheckin", () => {
  const base = { weekKey: "2026-07-06", createdAt: 1751846400000 };

  it("round-trips a valid answer", () => {
    const parsed = parseCheckin({
      ...base,
      feel: "a_bit_much",
      focus: "lifts",
    });
    expect(parsed).toEqual({
      ...base,
      feel: "a_bit_much",
      focus: "lifts",
    });
  });

  it("nulls an unknown focus but keeps the answer", () => {
    const parsed = parseCheckin({ ...base, feel: "good_fit", focus: "junk" });
    expect(parsed?.focus).toBeNull();
    expect(parsed?.feel).toBe("good_fit");
  });

  it("parses a dismissal without answers", () => {
    const parsed = parseCheckin({ ...base, dismissed: true });
    expect(parsed?.dismissed).toBe(true);
  });

  it("rejects malformed boundary data", () => {
    expect(parseCheckin(null)).toBeNull();
    expect(parseCheckin("x")).toBeNull();
    expect(parseCheckin({})).toBeNull();
    expect(parseCheckin({ ...base, feel: "meh" })).toBeNull();
    expect(
      parseCheckin({ weekKey: 5, createdAt: "x", feel: "good_fit" })
    ).toBeNull();
  });
});
