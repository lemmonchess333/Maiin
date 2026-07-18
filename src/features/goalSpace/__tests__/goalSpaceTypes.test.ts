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
  WEEKLY_FOCUS_OPTIONS,
  WEEKLY_FOCUS_SUPPORTERS_MAX,
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

  it("weekly-focus allowlist is exactly the six locked intents (SOCIAL-FOCUS-01)", () => {
    expect([...WEEKLY_FOCUS_OPTIONS]).toEqual([
      "strength",
      "running",
      "nutrition",
      "progress",
      "recovery",
      "balanced",
    ]);
  });
});

describe("checkEventPayload — the privacy fence", () => {
  const valid = {
    id: "e1",
    uid: "u1",
    kind: "needs_support",
    text: "Would appreciate a nudge this week",
    weekKey: null,
    createdAt: 1,
  };

  it("accepts a well-formed allowlisted event", () => {
    expect(checkEventPayload(valid).ok).toBe(true);
  });

  it("rejects client writes of the server-only weekly_check_in kind (SOCIAL-FOCUS-01)", () => {
    // Check-ins go through the goalSpaceWeeklyCheckIn callable — the
    // deterministic weekly event ID can't be bypassed with a client
    // write, and the rules enforce the same restriction server-side.
    expect(
      checkEventPayload({ ...valid, kind: "weekly_check_in", text: null }).ok
    ).toBe(false);
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

  it("accepts a string weekKey on client-writable kinds (allowlisted field)", () => {
    // Pins the accept path for the weekKey field itself — the rules
    // allowlist it for client-created kinds, so a future fence
    // tightening that drops it must fail a test, not regress silently.
    expect(checkEventPayload({ ...valid, weekKey: "2026-07-12" }).ok).toBe(
      true
    );
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
    // CIRCLE-TARGET-LIFECYCLE — additive; parse defaults it to null.
    endedAt: null,
  };

  it("round-trips a valid space and clamps maxMembers to the cap", () => {
    expect(parseGoalSpace(space)).toEqual(space);
    expect(parseGoalSpace({ ...space, maxMembers: 50 })?.maxMembers).toBe(8);
  });

  it("defaults endedAt to null when absent and reads a numeric endedAt", () => {
    const { endedAt: _omit, ...withoutEndedAt } = space;
    void _omit;
    expect(parseGoalSpace(withoutEndedAt)?.endedAt).toBeNull();
    expect(parseGoalSpace({ ...space, endedAt: 123 })?.endedAt).toBe(123);
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
    expect(parseGoalSpaceEvent(ev)).toEqual({
      ...ev,
      weeklyFocus: null,
      supporterIds: [],
    });
    expect(
      parseGoalSpaceEvent({ ...ev, text: "x".repeat(500) })?.text
    ).toHaveLength(GOAL_SPACE_TEXT_MAX);
  });

  it("rejects events with unknown kinds", () => {
    expect(
      parseGoalSpaceEvent({ id: "e", uid: "u", kind: "chat", createdAt: 1 })
    ).toBeNull();
  });

  it("legacy check-ins (no focus fields) keep parsing — weeklyFocus null, supporterIds empty", () => {
    const legacy = parseGoalSpaceEvent({
      id: "e-old",
      uid: "u1",
      kind: "weekly_check_in",
      text: null,
      weekKey: null,
      createdAt: 1,
    });
    expect(legacy).not.toBeNull();
    expect(legacy?.weeklyFocus).toBeNull();
    expect(legacy?.supporterIds).toEqual([]);
  });

  it("keeps a valid weeklyFocus, nulls anything outside the closed enum", () => {
    const base = {
      id: "e2",
      uid: "u1",
      kind: "weekly_check_in",
      text: null,
      weekKey: "2026-07-12",
      createdAt: 1,
    };
    expect(
      parseGoalSpaceEvent({ ...base, weeklyFocus: "running" })?.weeklyFocus
    ).toBe("running");
    expect(
      parseGoalSpaceEvent({ ...base, weeklyFocus: "calories" })?.weeklyFocus
    ).toBeNull();
  });

  it("filters and bounds supporterIds on read", () => {
    const parsed = parseGoalSpaceEvent({
      id: "e3",
      uid: "u1",
      kind: "weekly_check_in",
      text: null,
      weekKey: "2026-07-12",
      weeklyFocus: "strength",
      supporterIds: ["a", 42, null, "b"],
      createdAt: 1,
    });
    expect(parsed?.supporterIds).toEqual(["a", "b"]);
    const flood = parseGoalSpaceEvent({
      id: "e4",
      uid: "u1",
      kind: "weekly_check_in",
      text: null,
      weekKey: "2026-07-12",
      weeklyFocus: "strength",
      supporterIds: Array.from({ length: 100 }, (_, i) => `s${i}`),
      createdAt: 1,
    });
    expect(flood?.supporterIds).toHaveLength(WEEKLY_FOCUS_SUPPORTERS_MAX);
  });
});
