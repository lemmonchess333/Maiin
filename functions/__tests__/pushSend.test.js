/**
 * [push] functions/lib/pushSend.js contract tests (epic #961).
 * The prune-on-send-error decision (Q4) over a multicast response.
 */
import { describe, it, expect } from "vitest";
import { tokensToPrune } from "../lib/pushSend";

const tokens = ["t0", "t1", "t2"];

describe("tokensToPrune", () => {
  it("prunes nothing when every send succeeded", () => {
    const batch = {
      responses: [{ success: true }, { success: true }, { success: true }],
    };
    expect(tokensToPrune(batch, tokens)).toEqual([]);
  });

  it("prunes a token whose registration is gone", () => {
    const batch = {
      responses: [
        { success: true },
        {
          success: false,
          error: { code: "messaging/registration-token-not-registered" },
        },
        { success: true },
      ],
    };
    expect(tokensToPrune(batch, tokens)).toEqual(["t1"]);
  });

  it("prunes invalid-argument / invalid-registration-token", () => {
    const batch = {
      responses: [
        { success: false, error: { code: "messaging/invalid-argument" } },
        {
          success: false,
          error: { code: "messaging/invalid-registration-token" },
        },
        { success: true },
      ],
    };
    expect(tokensToPrune(batch, tokens)).toEqual(["t0", "t1"]);
  });

  it("does NOT prune transient errors (token may still be valid)", () => {
    const batch = {
      responses: [
        { success: false, error: { code: "messaging/internal-error" } },
        { success: false, error: { code: "messaging/server-unavailable" } },
        { success: false, error: { code: "messaging/quota-exceeded" } },
      ],
    };
    expect(tokensToPrune(batch, tokens)).toEqual([]);
  });

  it("handles an empty / malformed response", () => {
    expect(tokensToPrune({}, tokens)).toEqual([]);
    expect(tokensToPrune(null, tokens)).toEqual([]);
    expect(tokensToPrune({ responses: [] }, tokens)).toEqual([]);
  });
});

import { buildStreakNudgeMessage } from "../lib/pushSend";

describe("buildStreakNudgeMessage", () => {
  it("uses generic copy + deep-link data, with no PII / numbers (Q7)", () => {
    const m = buildStreakNudgeMessage();
    expect(m.notification.title).toBeTruthy();
    expect(m.notification.body).toBeTruthy();
    expect(m.data).toEqual({ type: "streak", route: "/" });
    // No streak count / number leaked into the body.
    expect(m.notification.body).not.toMatch(/\d/);
  });
});
