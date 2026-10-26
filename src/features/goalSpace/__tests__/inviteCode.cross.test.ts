/**
 * The invite-code expiry, TS↔JS mirror pin.
 *
 * The server holds an invitee to the rule (`joinGoalSpace` refuses a code
 * past it), and the app shows the owner when their code runs out. A drift
 * between the two is a code the app calls good that the server refuses,
 * or one it calls expired that still lets people in. So both the length
 * and the rule for a code made before codes carried an expiry are run
 * through both copies, case for case.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import {
  INVITE_CODE_TTL_DAYS,
  inviteCodeExpiresAt,
  inviteCodeExpiryLine,
  isInviteCodeExpired,
} from "../inviteCode";

const require = createRequire(import.meta.url);
const server = require("../../../../functions/lib/goalSpaceMembership.js") as {
  INVITE_CODE_TTL_DAYS: number;
  INVITE_CODE_TTL_MS: number;
  inviteCodeExpiresAt: (space: Record<string, unknown>) => number;
};

const DAY = 86_400_000;
const MADE = 1_760_000_000_000;

const CASES: Record<string, Record<string, unknown>> = {
  "stamped with its expiry": {
    inviteCodeExpiresAt: MADE + 3 * DAY,
    createdAt: 0,
  },
  "made before expiry existed": { createdAt: MADE },
  "a stamp that is not a number": {
    inviteCodeExpiresAt: "soon",
    createdAt: MADE,
  },
  "no age at all": {},
  "a createdAt that is not a number": { createdAt: "yesterday" },
  "a NaN stamp and no createdAt": { inviteCodeExpiresAt: Number.NaN },
};

describe("invite code expiry, client and server", () => {
  it("is the same length on both sides", () => {
    expect(server.INVITE_CODE_TTL_DAYS).toBe(INVITE_CODE_TTL_DAYS);
    expect(server.INVITE_CODE_TTL_MS).toBe(INVITE_CODE_TTL_DAYS * DAY);
  });

  it.each(Object.entries(CASES))("%s: the same expiry", (_name, space) => {
    expect(inviteCodeExpiresAt(space)).toBe(server.inviteCodeExpiresAt(space));
  });

  it("an old code is as old as its Circle", () => {
    expect(inviteCodeExpiresAt({ createdAt: MADE })).toBe(
      MADE + INVITE_CODE_TTL_DAYS * DAY
    );
  });
});

describe("what the owner is shown", () => {
  it("names the time and day the code stops working", () => {
    // Built from the clock's own local parts, so the line holds in every
    // timezone CI runs: 14:05 on a Saturday, wherever that is.
    const at = new Date(2026, 9, 31, 14, 5).getTime();
    expect(inviteCodeExpiryLine(at, at - DAY)).toBe(
      "Works until 14:05 on Sat 31 Oct"
    );
  });

  it("says it has expired from the moment it does", () => {
    const at = MADE + 7 * DAY;
    expect(isInviteCodeExpired(at, at - 1)).toBe(false);
    expect(isInviteCodeExpired(at, at)).toBe(true);
    expect(inviteCodeExpiryLine(at, at)).toBe("This code has expired.");
  });
});
