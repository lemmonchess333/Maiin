/**
 * Goal Spaces pure contract (GOALS-CORE-01). Pins the pieces both the
 * client and the Cloud Functions mirror rely on: the closed event
 * allowlist, capacity, invite expiry, bounded-text cleaning, the
 * Monday-anchored check-in week key, and the locked launch templates.
 */
import { describe, it, expect } from "vitest";
import {
  GOAL_SPACE_EVENT_KINDS,
  GOAL_SPACE_MAX_MEMBERS,
  CIRCLE_TEMPLATES,
  MAX_EVENT_NOTE_LENGTH,
  isGoalSpaceType,
  isGoalSpaceEventKind,
  cleanBoundedText,
  canAcceptMember,
  isInviteUsable,
  checkinWeekKey,
  eventKindLabel,
} from "../goalSpaceModel";

describe("event kind allowlist", () => {
  it("is exactly the six locked kinds", () => {
    expect([...GOAL_SPACE_EVENT_KINDS]).toEqual([
      "joined",
      "weekly_check_in",
      "session_completed",
      "milestone",
      "needs_support",
      "routine_shared",
    ]);
  });

  it("rejects anything outside the allowlist", () => {
    expect(isGoalSpaceEventKind("weekly_check_in")).toBe(true);
    expect(isGoalSpaceEventKind("calorie_update")).toBe(false);
    expect(isGoalSpaceEventKind("weigh_in")).toBe(false);
    expect(isGoalSpaceEventKind("")).toBe(false);
    expect(isGoalSpaceEventKind(null)).toBe(false);
    expect(isGoalSpaceEventKind(42)).toBe(false);
  });

  it("every kind has display copy", () => {
    for (const kind of GOAL_SPACE_EVENT_KINDS) {
      expect(eventKindLabel(kind).length).toBeGreaterThan(0);
    }
  });
});

describe("goal space types", () => {
  it("accepts the five schema types", () => {
    for (const t of [
      "race",
      "strength_block",
      "body_composition",
      "nutrition_consistency",
      "hybrid",
    ]) {
      expect(isGoalSpaceType(t)).toBe(true);
    }
    expect(isGoalSpaceType("weight_loss_contest")).toBe(false);
  });

  it("launch templates are exactly the three locked ones (no body_composition)", () => {
    expect(CIRCLE_TEMPLATES.map((t) => t.type)).toEqual([
      "strength_block",
      "race",
      "nutrition_consistency",
    ]);
    // body_composition stays schema-only until the privacy review (GsPb1).
    expect(CIRCLE_TEMPLATES.some((t) => t.type === "body_composition")).toBe(
      false
    );
  });
});

describe("capacity", () => {
  const base = { active: true, memberCount: 0, maxMembers: 8 };

  it("accepts under capacity, rejects at capacity", () => {
    expect(canAcceptMember({ ...base, memberCount: 7 })).toBe(true);
    expect(canAcceptMember({ ...base, memberCount: 8 })).toBe(false);
  });

  it("rejects archived spaces regardless of room", () => {
    expect(canAcceptMember({ ...base, active: false })).toBe(false);
  });

  it("a forged oversized maxMembers is still capped at the global 8", () => {
    expect(
      canAcceptMember({ active: true, memberCount: 8, maxMembers: 100 })
    ).toBe(false);
    expect(GOAL_SPACE_MAX_MEMBERS).toBe(8);
  });
});

describe("invite expiry", () => {
  it("usable strictly before expiresAt, not at/after, never when revoked", () => {
    const invite = { expiresAtMs: 1_000_000 };
    expect(isInviteUsable(invite, 999_999)).toBe(true);
    expect(isInviteUsable(invite, 1_000_000)).toBe(false);
    expect(isInviteUsable(invite, 1_000_001)).toBe(false);
    expect(isInviteUsable({ ...invite, revoked: true }, 0)).toBe(false);
  });
});

describe("cleanBoundedText", () => {
  it("trims, collapses whitespace, strips control chars, caps length", () => {
    expect(cleanBoundedText("  hello   world  ", 60)).toBe("hello world");
    expect(cleanBoundedText("a\x00b\x1fc", 60)).toBe("abc");
    expect(
      cleanBoundedText("x".repeat(300), MAX_EVENT_NOTE_LENGTH)
    ).toHaveLength(MAX_EVENT_NOTE_LENGTH);
  });

  it("returns empty string for non-strings", () => {
    expect(cleanBoundedText(42, 60)).toBe("");
    expect(cleanBoundedText(null, 60)).toBe("");
    expect(cleanBoundedText({ hack: true }, 60)).toBe("");
  });
});

describe("checkinWeekKey", () => {
  it("anchors to the local Monday of the week", () => {
    // 2026-07-10 is a Friday → Monday is 2026-07-06.
    expect(checkinWeekKey(new Date(2026, 6, 10))).toBe("2026-07-06");
    // Monday maps to itself.
    expect(checkinWeekKey(new Date(2026, 6, 6))).toBe("2026-07-06");
    // Sunday belongs to the PRECEDING Monday's week.
    expect(checkinWeekKey(new Date(2026, 6, 12))).toBe("2026-07-06");
    // Next Monday starts a new week.
    expect(checkinWeekKey(new Date(2026, 6, 13))).toBe("2026-07-13");
  });

  it("crosses month boundaries correctly", () => {
    // 2026-08-01 is a Saturday → Monday 2026-07-27.
    expect(checkinWeekKey(new Date(2026, 7, 1))).toBe("2026-07-27");
  });
});
