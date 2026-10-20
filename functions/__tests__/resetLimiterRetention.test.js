/**
 * The password-reset limiter no longer keeps an address. Its key was the
 * address itself (`pwreset_alice_example_com`), kept for good and reached
 * by no deletion, for every address anyone typed. It is now a hash, every
 * rateLimits record expires a window after its newest call, and a one-off
 * script removes the address-keyed records left behind.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");
const { passwordResetKey } = require("../lib/emailRateLimit");
const { isRateLimited } = require("../rateLimiter");
const {
  purgeLegacyResetLimiterDocs,
} = require("../scripts/purgeLegacyResetLimiterDocs");

const here = dirname(fileURLToPath(import.meta.url));
const read = (...parts) => readFileSync(join(here, "..", ...parts), "utf8");

afterEach(() => vi.useRealTimers());

describe("the password-reset limiter's key", () => {
  it("is a hash of the address, never the address", () => {
    const key = passwordResetKey("Alice.Smith@Example.com");
    expect(key).toMatch(/^pwreset_[0-9a-f]{32}$/);
    expect(key).not.toMatch(/alice|smith|example/i);
  });

  it("is the same key for the same address, however it is typed", () => {
    expect(passwordResetKey(" alice@example.com ")).toBe(
      passwordResetKey("ALICE@example.com")
    );
    expect(passwordResetKey("alice@example.com")).not.toBe(
      passwordResetKey("bob@example.com")
    );
  });

  it("is what the callable limits by", () => {
    const source = read("email", "accountEmails.js");
    expect(source).toContain("key: passwordResetKey(email)");
    // Before: `pwreset_${email.toLowerCase().replace(...)}`.
    expect(source).not.toMatch(/pwreset_\$\{email/);
  });
});

describe("a rate-limit record", () => {
  it("expires a window after its newest call", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 9, 20, 12));
    const firestore = memoryFirestore();
    await isRateLimited(firestore, "pwreset_abc", "passwordReset", 5, 300_000);
    vi.setSystemTime(Date.UTC(2026, 9, 20, 12, 2));
    await isRateLimited(firestore, "pwreset_abc", "passwordReset", 5, 300_000);
    // Before: no expiresAt, so the record was kept for good.
    expect(
      firestore.data.get("rateLimits/pwreset_abc_passwordReset").expiresAt
    ).toEqual(new Date(Date.UTC(2026, 9, 20, 12, 7)));
  });

  it("is under a TTL policy on that field", () => {
    const { fieldOverrides } = JSON.parse(
      readFileSync(join(here, "..", "..", "firestore.indexes.json"), "utf8")
    );
    expect(fieldOverrides).toContainEqual({
      collectionGroup: "rateLimits",
      fieldPath: "expiresAt",
      ttl: true,
      indexes: [],
    });
  });
});

describe("purgeLegacyResetLimiterDocs", () => {
  const seeded = () =>
    memoryFirestore({
      "rateLimits/pwreset_alice_example_com_passwordReset": {
        timestamps: [1],
      },
      "rateLimits/pwreset_0123456789abcdef0123456789abcdef_passwordReset": {
        timestamps: [1],
        expiresAt: new Date(),
      },
      "rateLimits/alice_analyzeFood": { timestamps: [1] },
      "rateLimits/verifyemail_alice_verificationEmail": { timestamps: [1] },
    });

  it("reports, and deletes nothing, on a dry run", async () => {
    const firestore = seeded();
    const report = await purgeLegacyResetLimiterDocs({ firestore });
    expect(report).toEqual({ scanned: 2, legacy: 1, deleted: 0, dryRun: true });
    expect(firestore.data.size).toBe(4);
  });

  it("deletes only the address-keyed records", async () => {
    const firestore = seeded();
    const report = await purgeLegacyResetLimiterDocs({
      firestore,
      apply: true,
    });
    expect(report.deleted).toBe(1);
    expect([...firestore.data.keys()].sort()).toEqual([
      "rateLimits/alice_analyzeFood",
      "rateLimits/pwreset_0123456789abcdef0123456789abcdef_passwordReset",
      "rateLimits/verifyemail_alice_verificationEmail",
    ]);
  });
});
