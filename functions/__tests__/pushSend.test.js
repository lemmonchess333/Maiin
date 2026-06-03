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

import {
  buildStreakNudgeMessage,
  buildBadgeNudgeMessage,
} from "../lib/pushSend";

describe("buildStreakNudgeMessage", () => {
  it("is DATA-ONLY (no top-level notification — iOS PWA reliability) with generic copy (Q7)", () => {
    const m = buildStreakNudgeMessage();
    // Data-only: title/body live in data so the SW renders them on iOS.
    expect(m.notification).toBeUndefined();
    expect(m.data.type).toBe("streak");
    expect(m.data.route).toBe("/");
    expect(m.data.title).toBeTruthy();
    expect(m.data.body).toBeTruthy();
    // No streak count / number leaked.
    expect(m.data.body).not.toMatch(/\d/);
  });
});

describe("buildBadgeNudgeMessage", () => {
  it("is DATA-ONLY with generic copy (Q7 — badge NAMES leak streak counts, so omit them)", () => {
    const m = buildBadgeNudgeMessage();
    expect(m.notification).toBeUndefined();
    expect(m.data.type).toBe("badge");
    expect(m.data.route).toBe("/");
    expect(m.data.title).toBeTruthy();
    expect(m.data.body).toBeTruthy();
    // No number / streak-implying digit, and no specific badge name.
    expect(m.data.body).not.toMatch(/\d/);
    expect(m.data.title).not.toMatch(/\d/);
  });
});

import {
  buildWeeklyRecapMessage,
  buildFellBehindRecapMessage,
} from "../lib/pushSend";

describe("buildWeeklyRecapMessage", () => {
  it("is DATA-ONLY with generic copy + home route, no week stats / digits (Q7)", () => {
    const m = buildWeeklyRecapMessage();
    // Data-only (iOS PWA reliability): no top-level notification field.
    expect(m.notification).toBeUndefined();
    expect(m.data.type).toBe("recap");
    expect(m.data.route).toBe("/");
    expect(m.data.title).toBeTruthy();
    expect(m.data.body).toBeTruthy();
    // The "how the week went" detail lives in-app, never on the lock screen.
    expect(m.data.title).not.toMatch(/\d/);
    expect(m.data.body).not.toMatch(/\d/);
  });
});

describe("buildFellBehindRecapMessage", () => {
  it("is DATA-ONLY, deep-links the Programme page, no 'X of N' counts (Q7)", () => {
    const m = buildFellBehindRecapMessage();
    expect(m.notification).toBeUndefined();
    expect(m.data.type).toBe("fellbehind");
    expect(m.data.route).toBe("/program");
    expect(m.data.title).toBeTruthy();
    expect(m.data.body).toBeTruthy();
    // No "1 of 3"-style counts on the lock screen — that's in the sheet.
    expect(m.data.title).not.toMatch(/\d/);
    expect(m.data.body).not.toMatch(/\d/);
  });
});
