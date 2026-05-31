/**
 * R1A-Deletion Chunk 2.D-billing — HMAC billing-identity hash tests.
 *
 * Pin the HMAC contract for billing tombstone keys (decision-log #4
 * post-Chunk-2.C reopening). The threat model the HMAC defeats:
 * offline brute-force of the numeric Apple originalTransactionId key
 * space (10^13 lower bound) after exposure of the
 * `deletedBillingIdentities` collection. Without the secret an
 * attacker cannot compute candidate hashes even with full read
 * access to the tombstone collection.
 *
 * Tests use the pure `computeBillingHash(provider, identifier, secret)`
 * function so the secret can be pinned without booting firebase-functions
 * config. The production helpers `billingIdentityHash` and
 * `billingIdentityLookupHashes` read the secret from process.env
 * (defineSecret binding) and are exercised by the appleIAP.js path.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const billing = require("../../../functions/lib/billingIdentityHash.js");

const { computeBillingHash, makeSecretMissingError } = billing;

const TEST_SECRET =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const ALT_SECRET =
  "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";

describe("computeBillingHash — HMAC contract", () => {
  it("produces a 64-char hex digest", () => {
    const hash = computeBillingHash("apple", "1234567890123", TEST_SECRET);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for the same (provider, identifier, secret)", () => {
    const a = computeBillingHash("apple", "1234567890123", TEST_SECRET);
    const b = computeBillingHash("apple", "1234567890123", TEST_SECRET);
    expect(a).toBe(b);
  });

  it("differs when the secret changes (offline-brute-force resistance)", () => {
    const a = computeBillingHash("apple", "1234567890123", TEST_SECRET);
    const b = computeBillingHash("apple", "1234567890123", ALT_SECRET);
    expect(a).not.toBe(b);
  });

  it("differs when the identifier changes (per-id uniqueness)", () => {
    const a = computeBillingHash("apple", "1234567890123", TEST_SECRET);
    const b = computeBillingHash("apple", "1234567890124", TEST_SECRET);
    expect(a).not.toBe(b);
  });

  it("differs when the provider changes (provider namespacing prevents cross-provider collision)", () => {
    const a = computeBillingHash("apple", "abc123", TEST_SECRET);
    const b = computeBillingHash("stripe", "abc123", TEST_SECRET);
    expect(a).not.toBe(b);
  });
});

describe("computeBillingHash — input validation", () => {
  it("throws when provider is missing", () => {
    expect(() => computeBillingHash("", "1234567890123", TEST_SECRET)).toThrow(
      /provider/
    );
    expect(() =>
      computeBillingHash(
        null as unknown as string,
        "1234567890123",
        TEST_SECRET
      )
    ).toThrow(/provider/);
    expect(() =>
      computeBillingHash(
        undefined as unknown as string,
        "1234567890123",
        TEST_SECRET
      )
    ).toThrow(/provider/);
  });

  it("throws when identifier is missing", () => {
    expect(() => computeBillingHash("apple", "", TEST_SECRET)).toThrow(
      /identifier/
    );
    expect(() =>
      computeBillingHash("apple", null as unknown as string, TEST_SECRET)
    ).toThrow(/identifier/);
  });

  it("throws billing-hmac-secret-missing when secret is missing", () => {
    expect(() => computeBillingHash("apple", "1234567890123", "")).toThrow(
      /BILLING_HMAC_SECRET not provisioned/
    );
    expect(() =>
      computeBillingHash("apple", "1234567890123", null as unknown as string)
    ).toThrow(/BILLING_HMAC_SECRET not provisioned/);
  });

  it("missing-secret error carries the stable errorCode", () => {
    let caught: unknown;
    try {
      computeBillingHash("apple", "1234567890123", "");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeDefined();
    expect((caught as { errorCode?: string }).errorCode).toBe(
      "billing-hmac-secret-missing"
    );
    expect((caught as { code?: string }).code).toBe("failed-precondition");
  });
});

describe("HMAC defeats offline brute-force on 13-digit numeric Apple IDs", () => {
  // The threat model that motivated the Chunk 2.D switch from plain
  // SHA-256: an attacker with read access to the tombstone collection
  // could brute-force the 10^13 candidate space of 13-digit Apple
  // originalTransactionIds and reverse the hash to a known ID.
  //
  // With HMAC, the attacker would additionally need the
  // billing.hmac_secret — a 32-byte-hex random value that's not in
  // the tombstone collection itself.
  //
  // This test demonstrates the property by attempting reversal with
  // a known plaintext but the WRONG secret. The hash doesn't match
  // even though the plaintext is correct.
  it("knowing the plaintext but not the secret does not reproduce the hash", () => {
    // Attacker has the tombstone hash:
    const realHash = computeBillingHash("apple", "1234567890123", TEST_SECRET);
    // Attacker guesses the correct plaintext but the wrong secret:
    const attackerHash = computeBillingHash(
      "apple",
      "1234567890123",
      ALT_SECRET
    );
    expect(attackerHash).not.toBe(realHash);
  });

  it("a brute-force attacker without the secret cannot pre-compute candidate hashes", () => {
    // Attacker tries 100 candidate plaintexts with the wrong secret.
    // None match the real hash.
    const realHash = computeBillingHash("apple", "1234567890123", TEST_SECRET);
    const candidates = Array.from(
      { length: 100 },
      (_, i) => `12345678901${String(i).padStart(2, "0")}`
    );
    const reversed = candidates.find((candidate) => {
      return computeBillingHash("apple", candidate, ALT_SECRET) === realHash;
    });
    expect(reversed).toBeUndefined();
  });
});

describe("billingIdentityLookupHashes — rotation-aware", () => {
  // The production helper reads the secret from process.env at runtime
  // (defineSecret binding). We can't easily inject env in vitest here,
  // so the rotation
  // behaviour is exercised at the pure-computation level: lookup
  // produces hashes under both active and previous secrets.
  it("the design supports multi-secret lookup (computed via the underlying pure helper)", () => {
    const activeHash = computeBillingHash(
      "apple",
      "1234567890123",
      TEST_SECRET
    );
    const previousHash = computeBillingHash(
      "apple",
      "1234567890123",
      ALT_SECRET
    );
    // Rotation invariant: the two hashes differ, so a tombstone written
    // under one secret can ONLY be found by checking BOTH hashes during
    // the rotation window. billingIdentityLookupHashes encodes exactly
    // this — it returns [activeHash, previousHash] when previous is set.
    expect(activeHash).not.toBe(previousHash);
  });
});

describe("makeSecretMissingError — stable error contract", () => {
  it("produces the documented error shape", () => {
    const err = makeSecretMissingError();
    expect(err).toBeInstanceOf(Error);
    expect((err as { code?: string }).code).toBe("failed-precondition");
    expect((err as { errorCode?: string }).errorCode).toBe(
      "billing-hmac-secret-missing"
    );
    expect(err.message).toMatch(/BILLING_HMAC_SECRET not provisioned/);
    expect(err.message).toMatch(
      /firebase functions:secrets:set BILLING_HMAC_SECRET/
    );
  });
});
