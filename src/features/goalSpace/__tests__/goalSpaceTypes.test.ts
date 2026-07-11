/**
 * Goal Space schema contract (GOALS-CORE-01, slice 1) — pins.
 *
 * The privacy fence is the load-bearing part: raw calories, macros,
 * bodyweight, photos, GPS and food data must be REJECTED by
 * checkEventPayload before any write is attempted. Plus: the exact
 * six-kind allowlist, the 8-member cap, launch templates excluding
 * body_composition (private-first), and boundary parse guards.
 */
import { describe, it, expect } from "vitest";
import {
  GOAL_SPACE_EVENT_KINDS,
  GOAL_SPACE_MAX_MEMBERS,
  GOAL_SPACE_TEXT_MAX,
  LAUNCH_TEMPLATES,
  checkEventPayload,
  parseGoalSpace,
  parseGoalSpaceEvent,
} from "../goalSpaceTypes";

describe("locked constants (GsPb1)", () => {
  it("event allowlist is exactly the six audited kinds", () => {
    expect([...GOAL_SPACE_EVENT_KINDS]).toEqual([
      "joined",
      "weekly_check_in",
      "session_completed",
      "milestone",
      "needs_support",
      "routine_shared",
    ]);
  });

  it("circles cap at 8 members", () => {
    expect(GOAL_SPACE_MAX_MEMBERS).toBe(8);
  });

  it("launch templates exclude body_composition (private-first)", () => {
    expect(LAUNCH_TEMPLATES.map((t) => t.type)).toEqual([
      "strength_block",
      "race",
      "nutrition_consistency",
    ]);
  });
});

describe("checkEventPayload — the privacy fence", () => {
  const valid = {
    id: "e1",
    uid: "u1",
    kind: "weekly_check_in",
    text: "Checked in for the week",
    weekKey: "2026-07-06",
    createdAt: 1,
  };

  it("accepts a well-formed allowlisted event", () => {
    expect(checkEventPayload(valid).ok).toBe(true);
  });

  it("rejects every raw-health-data field by name", () => {
    for (const field of [
      "calories",
      "kcalTotal",
      "macros",
      "proteinG",
      "bodyweightKg",
      "weightKg",
      "photoUrl",
      "imageRef",
      "gpsTrace",
      "latStart",
      "routePolyline",
      "mealSummary",
      "foodItems",
    ]) {
      const res = checkEventPayload({ ...valid, [field]: 42 });
      expect(res.ok, `${field} must be rejected`).toBe(false);
    }
  });

  it("rejects ANY field outside the allowlist, even innocuous ones", () => {
    expect(checkEventPayload({ ...valid, mood: "great" }).ok).toBe(false);
  });

  it("rejects unknown kinds and over-long text", () => {
    expect(checkEventPayload({ ...valid, kind: "dm" }).ok).toBe(false);
    expect(
      checkEventPayload({
        ...valid,
        text: "x".repeat(GOAL_SPACE_TEXT_MAX + 1),
      }).ok
    ).toBe(false);
  });

  it("allows a null/absent text", () => {
    expect(checkEventPayload({ ...valid, text: null }).ok).toBe(true);
  });
});

describe("parse guards", () => {
  const space = {
    id: "gs1",
    type: "strength_block",
    title: "8-week strength block",
    visibility: "invite_only",
    ownerId: "u1",
    memberCount: 2,
    maxMembers: 8,
    targetDate: null,
    active: true,
    createdAt: 1,
  };

  it("round-trips a valid space and clamps maxMembers to the cap", () => {
    expect(parseGoalSpace(space)).toEqual(space);
    expect(parseGoalSpace({ ...space, maxMembers: 50 })?.maxMembers).toBe(8);
  });

  it("rejects malformed spaces", () => {
    expect(parseGoalSpace(null)).toBeNull();
    expect(parseGoalSpace({ ...space, type: "book_club" })).toBeNull();
    expect(parseGoalSpace({ ...space, visibility: "public" })).toBeNull();
  });

  it("round-trips a valid event and bounds text on read", () => {
    const ev = {
      id: "e1",
      uid: "u1",
      kind: "milestone",
      text: "First 100kg squat",
      weekKey: null,
      createdAt: 1,
    };
    expect(parseGoalSpaceEvent(ev)).toEqual(ev);
    expect(
      parseGoalSpaceEvent({ ...ev, text: "x".repeat(500) })?.text
    ).toHaveLength(GOAL_SPACE_TEXT_MAX);
  });

  it("rejects events with unknown kinds", () => {
    expect(
      parseGoalSpaceEvent({ id: "e", uid: "u", kind: "chat", createdAt: 1 })
    ).toBeNull();
  });
});
