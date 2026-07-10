/**
 * TDD pins for the durable trial-eligibility fix (2026-07-09 money-path audit,
 * finding F1 — trial re-grant → Vertex-compute faucet).
 *
 * The decision + expiry live in a pure helper (`functions/lib/durableTrial.js`)
 * so they're testable without booting firebase-admin; `completeOnboarding` in
 * index.js reads `trialLedger/{uid}`, delegates the grant decision here, and
 * writes the durable marker atomically with the trial.
 *
 * Invariant that closes the exploit:
 *   - A user whose `users/{uid}` doc is ABSENT but whose durable ledger marker
 *     EXISTS gets NO new trial. That is the self-delete-and-re-onboard vector:
 *     pre-fix the absent doc alone minted a fresh 7-day Pro trial; now the
 *     surviving ledger marker blocks the re-grant.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  TRIAL_LEDGER_COLLECTION,
  TRIAL_DAYS,
  trialLedgerRef,
  trialExpiryIso,
  shouldGrantTrial,
} = require("../lib/durableTrial");

describe("durableTrial.shouldGrantTrial", () => {
  it("grants for a genuinely new user (no doc, no ledger marker)", () => {
    expect(shouldGrantTrial({ userDocExists: false, ledgerExists: false })).toBe(
      true
    );
  });

  it("DOES NOT re-grant when the doc is absent but a durable marker exists (the F1 exploit)", () => {
    // Self-delete users/{uid} then re-onboard: userDocExists=false but the
    // ledger survived → no fresh trial. This is the line the whole fix exists for.
    expect(shouldGrantTrial({ userDocExists: false, ledgerExists: true })).toBe(
      false
    );
  });

  it("does not grant for an existing user doc (trial is preserved by the caller, not re-minted)", () => {
    expect(shouldGrantTrial({ userDocExists: true, ledgerExists: false })).toBe(
      false
    );
    expect(shouldGrantTrial({ userDocExists: true, ledgerExists: true })).toBe(
      false
    );
  });
});

describe("durableTrial.trialExpiryIso", () => {
  it("returns an ISO-8601 UTC timestamp TRIAL_DAYS in the future", () => {
    const now = new Date("2026-07-09T12:00:00.000Z");
    const iso = trialExpiryIso(now);
    expect(iso).toBe("2026-07-16T12:00:00.000Z");
    expect(TRIAL_DAYS).toBe(7);
    // Server-written ISO string → Date.parse is locale-stable (audit clean bill).
    expect(new Date(iso).getTime() - now.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("does not mutate the passed-in Date", () => {
    const now = new Date("2026-07-09T12:00:00.000Z");
    trialExpiryIso(now);
    expect(now.toISOString()).toBe("2026-07-09T12:00:00.000Z");
  });
});

describe("durableTrial.trialLedgerRef", () => {
  it("targets the admin-only trialLedger collection keyed by uid", () => {
    const calls = { collection: null, doc: null };
    const db = {
      collection(name) {
        calls.collection = name;
        return {
          doc(id) {
            calls.doc = id;
            return { __ref: `${name}/${id}` };
          },
        };
      },
    };
    const ref = trialLedgerRef(db, "uid-abc");
    expect(calls.collection).toBe(TRIAL_LEDGER_COLLECTION);
    expect(calls.collection).toBe("trialLedger");
    expect(calls.doc).toBe("uid-abc");
    expect(ref.__ref).toBe("trialLedger/uid-abc");
  });
});
