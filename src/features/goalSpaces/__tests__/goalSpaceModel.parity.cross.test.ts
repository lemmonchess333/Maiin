/**
 * GOALS-CORE-01 parity pin — the client contract module
 * (src/features/goalSpaces/goalSpaceModel.ts) and the server mirror
 * (functions/lib/goalSpaces.js) must agree on the closed event
 * allowlist, capacity, invite TTL, text bounds and the check-in week
 * key. The tested copy does not prove the running copy (CLAUDE.md
 * recurring-mistake rule) — this cross test pins BOTH copies equal so
 * drift fails CI instead of shipping a client that renders events the
 * server refuses (or vice versa).
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import {
  GOAL_SPACE_EVENT_KINDS,
  GOAL_SPACE_MAX_MEMBERS,
  INVITE_TTL_MS,
  MAX_TITLE_LENGTH,
  MAX_EVENT_NOTE_LENGTH,
  MAX_WHY_LENGTH,
  cleanBoundedText,
  checkinWeekKey,
  canAcceptMember,
  isInviteUsable,
} from "../goalSpaceModel";

const require = createRequire(import.meta.url);
const server = require("../../../../functions/lib/goalSpaces.js");

describe("goal-space client/server contract parity", () => {
  it("event kind allowlists are identical", () => {
    expect([...GOAL_SPACE_EVENT_KINDS]).toEqual([
      ...server.GOAL_SPACE_EVENT_KINDS,
    ]);
  });

  it("capacity, TTL and text bounds are identical", () => {
    expect(GOAL_SPACE_MAX_MEMBERS).toBe(server.GOAL_SPACE_MAX_MEMBERS);
    expect(INVITE_TTL_MS).toBe(server.INVITE_TTL_MS);
    expect(MAX_TITLE_LENGTH).toBe(server.MAX_TITLE_LENGTH);
    expect(MAX_EVENT_NOTE_LENGTH).toBe(server.MAX_EVENT_NOTE_LENGTH);
    expect(MAX_WHY_LENGTH).toBe(server.MAX_WHY_LENGTH);
  });

  it("cleanBoundedText behaves identically on representative inputs", () => {
    const cases: unknown[] = [
      "  hello   world  ",
      "a\x00b\x1fc",
      "x".repeat(300),
      42,
      null,
      "",
    ];
    for (const input of cases) {
      expect(cleanBoundedText(input, 60)).toBe(
        server.cleanBoundedText(input, 60)
      );
    }
  });

  it("checkinWeekKey agrees across a full week + boundaries", () => {
    const dates = [
      new Date(2026, 6, 6), // Monday
      new Date(2026, 6, 10), // Friday
      new Date(2026, 6, 12), // Sunday
      new Date(2026, 6, 13), // next Monday
      new Date(2026, 7, 1), // month boundary
      new Date(2026, 0, 1), // year start
    ];
    for (const d of dates) {
      expect(checkinWeekKey(d)).toBe(server.checkinWeekKey(d));
    }
  });

  it("capacity + invite predicates agree", () => {
    const spaces = [
      { active: true, memberCount: 7, maxMembers: 8 },
      { active: true, memberCount: 8, maxMembers: 8 },
      { active: false, memberCount: 0, maxMembers: 8 },
      { active: true, memberCount: 8, maxMembers: 100 },
    ];
    for (const s of spaces) {
      expect(canAcceptMember(s)).toBe(server.canAcceptMember(s));
    }
    const invites = [
      { expiresAtMs: 1000 },
      { expiresAtMs: 1000, revoked: true },
    ];
    for (const inv of invites) {
      expect(isInviteUsable(inv, 999)).toBe(server.isInviteUsable(inv, 999));
      expect(isInviteUsable(inv, 1000)).toBe(server.isInviteUsable(inv, 1000));
    }
  });
});
