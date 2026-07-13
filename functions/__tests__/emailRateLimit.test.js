import { describe, it, expect, vi } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const { isEmailRateLimited } = require("../lib/emailRateLimit");

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

describe("accountEmails wiring (regression guard for the arg-shift bug)", () => {
  const source = readFileSync(
    join(__dirnameLocal, "..", "email", "accountEmails.js"),
    "utf8"
  );

  it("routes both callables through the isEmailRateLimited adapter", () => {
    const adapterCalls = source.match(/isEmailRateLimited\(/g) || [];
    // Two call sites (password reset + verification) plus the import
    // destructure => at least 2 invocation occurrences.
    expect(adapterCalls.length).toBeGreaterThanOrEqual(2);
  });

  it("no longer calls the raw shared rateLimiter.isRateLimited directly", () => {
    expect(source).not.toMatch(/rateLimiter\.isRateLimited/);
    expect(source).not.toMatch(/require\(["']\.\.\/rateLimiter["']\)/);
  });
});
