import { describe, it, expect, vi } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const {
  isEmailRateLimited,
  firstEmailLimitHit,
  PASSWORD_RESET_LIMITS,
  VERIFICATION_EMAIL_LIMITS,
  DAY_MS,
} = require("../lib/emailRateLimit");

const __dirnameLocal = dirname(fileURLToPath(import.meta.url));

describe("isEmailRateLimited", () => {
  it("passes the Firestore handle as the first shared-limiter argument", async () => {
    const firestore = { collection: vi.fn() };
    const limiter = { isRateLimited: vi.fn().mockResolvedValue(false) };

    await expect(
      isEmailRateLimited({
        firestore,
        key: "pwreset_a_b_com",
        action: "passwordReset",
        maxCalls: 5,
        windowMs: 300_000,
        limiter,
      })
    ).resolves.toBe(false);

    expect(limiter.isRateLimited).toHaveBeenCalledWith(
      firestore,
      "pwreset_a_b_com",
      "passwordReset",
      5,
      300_000
    );
  });

  it("keeps the verification rate-limit contract", async () => {
    const firestore = { collection: vi.fn() };
    const limiter = { isRateLimited: vi.fn().mockResolvedValue(true) };

    await expect(
      isEmailRateLimited({
        firestore,
        key: "verifyemail_user-1",
        action: "verificationEmail",
        maxCalls: 3,
        windowMs: 600_000,
        limiter,
      })
    ).resolves.toBe(true);

    expect(limiter.isRateLimited).toHaveBeenCalledWith(
      firestore,
      "verifyemail_user-1",
      "verificationEmail",
      3,
      600_000
    );
  });

  it("throws (does NOT shift args) when the first field is not a Firestore handle", async () => {
    // This is the regression this whole packet exists for: a string in the
    // handle slot. The adapter must reject it loudly rather than let
    // `db.collection(...)` throw an opaque TypeError deep in the limiter.
    const limiter = { isRateLimited: vi.fn() };
    await expect(
      isEmailRateLimited({
        firestore: "pwreset_a_b_com",
        key: "passwordReset",
        action: 5,
        maxCalls: 300_000,
        limiter,
      })
    ).rejects.toThrow(/Firestore handle required/);
    expect(limiter.isRateLimited).not.toHaveBeenCalled();
  });

  it("requires a non-empty key", async () => {
    const firestore = { collection: vi.fn() };
    const limiter = { isRateLimited: vi.fn() };
    await expect(
      isEmailRateLimited({ firestore, key: "", action: "x", limiter })
    ).rejects.toThrow(/key required/);
    expect(limiter.isRateLimited).not.toHaveBeenCalled();
  });
});

describe("firstEmailLimitHit", () => {
  const limits = [
    { action: "short", maxCalls: 3, windowMs: 1_000, message: "short" },
    { action: "day", maxCalls: 5, windowMs: DAY_MS, message: "day" },
  ];

  it("checks every window, in order, with the handle first", async () => {
    const firestore = { collection: vi.fn() };
    const limiter = { isRateLimited: vi.fn().mockResolvedValue(false) };
    await expect(
      firstEmailLimitHit({ firestore, key: "k", limits, limiter })
    ).resolves.toBeNull();
    expect(limiter.isRateLimited.mock.calls).toEqual([
      [firestore, "k", "short", 3, 1_000],
      [firestore, "k", "day", 5, DAY_MS],
    ]);
  });

  it("stops at the first window that refuses, so later ones do not count it", async () => {
    const firestore = { collection: vi.fn() };
    const limiter = { isRateLimited: vi.fn().mockResolvedValueOnce(true) };
    await expect(
      firstEmailLimitHit({ firestore, key: "k", limits, limiter })
    ).resolves.toBe(limits[0]);
    expect(limiter.isRateLimited).toHaveBeenCalledTimes(1);
  });
});

describe("the account-email windows", () => {
  it("limit a reset address to 5 in 5 minutes and 3 a day", () => {
    expect(
      PASSWORD_RESET_LIMITS.map((l) => [l.action, l.maxCalls, l.windowMs])
    ).toEqual([
      ["passwordReset", 5, 300_000],
      ["passwordResetDay", 3, DAY_MS],
    ]);
  });

  it("limit an account's verification emails to 3 in 10 minutes and 5 a day", () => {
    expect(
      VERIFICATION_EMAIL_LIMITS.map((l) => [l.action, l.maxCalls, l.windowMs])
    ).toEqual([
      ["verificationEmail", 3, 600_000],
      ["verificationEmailDay", 5, DAY_MS],
    ]);
  });

  it("each say when to try again, in a line the client shows as written", () => {
    // accountSecurity.ts and Login.tsx pass a "Too many" message through.
    for (const limit of [
      ...PASSWORD_RESET_LIMITS,
      ...VERIFICATION_EMAIL_LIMITS,
    ]) {
      expect(limit.message).toMatch(
        /^Too many .*Try again (in a few minutes|tomorrow)\.$/
      );
    }
  });
});

describe("accountEmails wiring (regression guard for the arg-shift bug)", () => {
  const read = (...parts) =>
    readFileSync(join(__dirnameLocal, "..", ...parts), "utf8");
  // The verification callable limits in accountEmails.js; the reset
  // callable's request, limit included, is lib/passwordResetRequest.js.
  const callables = read("email", "accountEmails.js");
  const resetRequest = read("lib", "passwordResetRequest.js");

  it("routes both callables through the isEmailRateLimited adapter", () => {
    // firstEmailLimitHit calls the adapter once per window (pinned above).
    expect(callables).toContain("firstEmailLimitHit(");
    expect(callables).toContain("requestPasswordReset(");
    expect(resetRequest).toContain("firstEmailLimitHit(");
  });

  it("no longer calls the raw shared rateLimiter.isRateLimited directly", () => {
    for (const source of [callables, resetRequest]) {
      expect(source).not.toMatch(/rateLimiter\.isRateLimited/);
      expect(source).not.toMatch(/require\(["']\.\.\/rateLimiter["']\)/);
    }
  });
});
