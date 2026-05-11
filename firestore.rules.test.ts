/**
 * Firestore rules unit tests — users/{uid}/public/{doc}.
 *
 * Runs against the Firestore emulator. Skipped automatically when
 * FIRESTORE_EMULATOR_HOST is not set so `npm test` still passes in envs
 * without the emulator running.
 *
 * To run locally:
 *
 *   # install emulator binaries once (requires Java on the host)
 *   npm install -g firebase-tools
 *
 *   # run the emulator, then the tests against it
 *   firebase emulators:exec --only firestore 'vitest run firestore.rules.test.ts'
 *
 * Or: start the emulator in one terminal and, in another,
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx vitest run firestore.rules.test.ts
 */

import { describe, it, beforeAll, afterAll, beforeEach } from "vitest";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const REQUIRE_EMULATOR = process.env.REQUIRE_FIRESTORE_EMULATOR === "1";
if (REQUIRE_EMULATOR && !EMULATOR_HOST) {
  // CI gate: when REQUIRE_FIRESTORE_EMULATOR=1, missing FIRESTORE_EMULATOR_HOST
  // is a hard failure, not a silent skip. Deployment-branch CI must
  // set REQUIRE_FIRESTORE_EMULATOR=1 to ensure rules evidence is real.
  throw new Error(
    "FIRESTORE_EMULATOR_HOST is required when REQUIRE_FIRESTORE_EMULATOR=1. " +
      "Start the Firestore emulator (e.g. `firebase emulators:exec --only firestore,auth ...`) before running this test.",
  );
}
const suite = EMULATOR_HOST ? describe : describe.skip;

const OWNER_UID = "owner-uid";
const OTHER_UID = "other-uid";
const PROJECT_ID = "tropos-rules-test";

suite("firestore.rules — users/{uid}/public/{doc}", () => {
  let env: RulesTestEnvironment;

  beforeAll(async () => {
    const [host, portStr] = (EMULATOR_HOST || "").split(":");
    env = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules: readFileSync("firestore.rules", "utf8"),
        host,
        port: Number(portStr),
      },
    });
  });

  afterAll(async () => {
    await env?.cleanup();
  });

  beforeEach(async () => {
    await env.clearFirestore();
  });

  it("authed user reads another user's public profile", async () => {
    // Seed a public doc via admin bypass so the read path can be tested
    // independent of the write rule.
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, "users", OWNER_UID, "public", "profile"), {
        uid: OWNER_UID,
        displayName: "Owner",
        photoURL: null,
        athleteType: "Lifter",
        currentStreak: 5,
        longestStreak: 10,
        createdAt: serverTimestamp(),
      });
    });

    const otherDb = env.authenticatedContext(OTHER_UID).firestore();
    await assertSucceeds(getDoc(doc(otherDb, "users", OWNER_UID, "public", "profile")));
  });

  it("unauthed user reads a public profile — fails", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), "users", OWNER_UID, "public", "profile"),
        { uid: OWNER_UID, displayName: "Owner", photoURL: null, athleteType: "Lifter", currentStreak: 0, longestStreak: 0, createdAt: serverTimestamp() },
      );
    });

    const anonDb = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anonDb, "users", OWNER_UID, "public", "profile")));
  });

  it("owner writes all allowlisted fields — succeeds", async () => {
    const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
    await assertSucceeds(
      setDoc(doc(ownerDb, "users", OWNER_UID, "public", "profile"), {
        uid: OWNER_UID,
        displayName: "Owner",
        photoURL: null,
        athleteType: "Lifter",
        currentStreak: 3,
        longestStreak: 7,
        createdAt: serverTimestamp(),
        badgeSummary: { earnedMap: { first_step: "2026-01-01T00:00:00Z" }, count: 1 },
      }),
    );
  });

  it("owner writes a subset (just badgeSummary) — succeeds", async () => {
    const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
    await assertSucceeds(
      setDoc(
        doc(ownerDb, "users", OWNER_UID, "public", "profile"),
        { badgeSummary: { earnedMap: {}, count: 0 } },
        { merge: true },
      ),
    );
  });

  it("owner writes an unknown field — fails (fail-closed)", async () => {
    const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
    await assertFails(
      setDoc(
        doc(ownerDb, "users", OWNER_UID, "public", "profile"),
        {
          uid: OWNER_UID,
          displayName: "Owner",
          photoURL: null,
          athleteType: "Lifter",
          currentStreak: 0,
          longestStreak: 0,
          createdAt: serverTimestamp(),
          pwned: true, // <- disallowed by hasOnly()
        },
      ),
    );
  });

  it("non-owner writes even an allowlisted field — fails", async () => {
    const otherDb = env.authenticatedContext(OTHER_UID).firestore();
    await assertFails(
      setDoc(
        doc(otherDb, "users", OWNER_UID, "public", "profile"),
        { displayName: "Hacked" },
        { merge: true },
      ),
    );
  });
});

/**
 * R1A-Deletion Chunk 2 — write-freeze rules for accountDeletionRequests
 * active statuses.
 *
 * For each protected user-owned write path, prove:
 *   1. Owner writes succeed when no deletion ledger doc exists.
 *   2. Owner writes succeed when ledger doc exists with non-active status
 *      ('requested' / 'completed' / 'cancelled').
 *   3. Owner writes FAIL when ledger doc status is in the active set
 *      ('running' / 'failed_cleanup' / 'pending_cleanup' /
 *       'pending_auth_deletion' / 'operator_review').
 *   4. Owner reads still succeed during the freeze (the in-progress UI
 *      needs to render durably).
 *   5. Client cannot write to accountDeletionRequests / deletedAccounts
 *      / deletedBillingIdentities / paymentEventsPostDeletion under any
 *      circumstances.
 *   6. Client CAN read their own accountDeletionRequests doc (UI needs).
 *
 * Active-status cases are exercised for a representative path
 * (users/{uid}/meals) since the rule pattern is identical across all
 * user-owned subcollections. Public profile and feeds get their own
 * tests because they have additional write conditions beyond owner-check.
 */

const ACTIVE_STATUSES = [
  "running",
  "failed_cleanup",
  "pending_cleanup",
  "pending_auth_deletion",
  "operator_review",
] as const;

const NON_ACTIVE_STATUSES = ["requested", "completed", "cancelled"] as const;

suite("firestore.rules — R1A write-freeze (active deletion)", () => {
  let env: RulesTestEnvironment;

  beforeAll(async () => {
    const [host, portStr] = (EMULATOR_HOST || "").split(":");
    env = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules: readFileSync("firestore.rules", "utf8"),
        host,
        port: Number(portStr),
      },
    });
  });

  afterAll(async () => {
    await env?.cleanup();
  });

  beforeEach(async () => {
    await env.clearFirestore();
  });

  async function seedDeletionStatus(uid: string, status: string) {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "accountDeletionRequests", uid), {
        uid,
        status,
        operationId: `op-${status}`,
        leaseGeneration: 1,
        startedAt: serverTimestamp(),
      });
    });
  }

  it("owner writes meals succeed when no ledger doc exists", async () => {
    const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
    await assertSucceeds(
      setDoc(doc(ownerDb, "users", OWNER_UID, "meals", "m1"), {
        text: "test",
        createdAt: serverTimestamp(),
      }),
    );
  });

  for (const status of NON_ACTIVE_STATUSES) {
    it(`owner writes meals succeed when ledger status is '${status}' (non-active)`, async () => {
      await seedDeletionStatus(OWNER_UID, status);
      const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
      await assertSucceeds(
        setDoc(doc(ownerDb, "users", OWNER_UID, "meals", "m1"), {
          text: "test",
          createdAt: serverTimestamp(),
        }),
      );
    });
  }

  for (const status of ACTIVE_STATUSES) {
    it(`owner writes meals FAIL when ledger status is '${status}' (active)`, async () => {
      await seedDeletionStatus(OWNER_UID, status);
      const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
      await assertFails(
        setDoc(doc(ownerDb, "users", OWNER_UID, "meals", "m1"), {
          text: "test",
          createdAt: serverTimestamp(),
        }),
      );
    });
  }

  it("owner reads succeed during the freeze (running status)", async () => {
    await seedDeletionStatus(OWNER_UID, "running");
    // seed a meal doc bypass-rules so the read path can be tested
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users", OWNER_UID, "meals", "m1"), { text: "x" });
    });
    const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
    await assertSucceeds(getDoc(doc(ownerDb, "users", OWNER_UID, "meals", "m1")));
  });

  it("owner writes to users/{uid} root FAIL during running status", async () => {
    await seedDeletionStatus(OWNER_UID, "running");
    const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
    await assertFails(
      setDoc(
        doc(ownerDb, "users", OWNER_UID),
        { displayName: "Renamed mid-deletion" },
        { merge: true },
      ),
    );
  });

  it("owner writes public profile FAIL during running status", async () => {
    await seedDeletionStatus(OWNER_UID, "running");
    const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
    await assertFails(
      setDoc(doc(ownerDb, "users", OWNER_UID, "public", "profile"), {
        uid: OWNER_UID,
        displayName: "X",
        photoURL: null,
        athleteType: "Lifter",
        currentStreak: 0,
        longestStreak: 0,
        createdAt: serverTimestamp(),
      }),
    );
  });

  it("follow creation FAILS when EITHER side is mid-deletion", async () => {
    // Owner mid-deletion: cannot create their own follow.
    await seedDeletionStatus(OWNER_UID, "running");
    const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
    await assertFails(
      setDoc(doc(ownerDb, "following", OWNER_UID, "users", OTHER_UID), {
        createdAt: serverTimestamp(),
      }),
    );
  });

  it("follow creation FAILS when target is mid-deletion", async () => {
    await seedDeletionStatus(OTHER_UID, "running");
    const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
    await assertFails(
      setDoc(doc(ownerDb, "following", OWNER_UID, "users", OTHER_UID), {
        createdAt: serverTimestamp(),
      }),
    );
  });
});

suite("firestore.rules — R1A operational collections", () => {
  let env: RulesTestEnvironment;

  beforeAll(async () => {
    const [host, portStr] = (EMULATOR_HOST || "").split(":");
    env = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules: readFileSync("firestore.rules", "utf8"),
        host,
        port: Number(portStr),
      },
    });
  });

  afterAll(async () => {
    await env?.cleanup();
  });

  beforeEach(async () => {
    await env.clearFirestore();
  });

  it("owner reads their own accountDeletionRequests doc — succeeds (UI needs it)", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "accountDeletionRequests", OWNER_UID), {
        uid: OWNER_UID,
        status: "running",
        leaseGeneration: 1,
      });
    });
    const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
    await assertSucceeds(getDoc(doc(ownerDb, "accountDeletionRequests", OWNER_UID)));
  });

  it("non-owner reads someone else's accountDeletionRequests doc — fails", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "accountDeletionRequests", OWNER_UID), {
        uid: OWNER_UID,
        status: "running",
      });
    });
    const otherDb = env.authenticatedContext(OTHER_UID).firestore();
    await assertFails(getDoc(doc(otherDb, "accountDeletionRequests", OWNER_UID)));
  });

  it("client cannot write to accountDeletionRequests — server-only", async () => {
    const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
    await assertFails(
      setDoc(doc(ownerDb, "accountDeletionRequests", OWNER_UID), {
        uid: OWNER_UID,
        status: "running",
      }),
    );
  });

  it("client cannot read or write deletedAccounts tombstone", async () => {
    const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
    await assertFails(getDoc(doc(ownerDb, "deletedAccounts", OWNER_UID)));
    await assertFails(setDoc(doc(ownerDb, "deletedAccounts", OWNER_UID), { uid: OWNER_UID }));
  });

  it("client cannot read or write deletedBillingIdentities", async () => {
    const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
    await assertFails(getDoc(doc(ownerDb, "deletedBillingIdentities", "some-hash")));
    await assertFails(
      setDoc(doc(ownerDb, "deletedBillingIdentities", "some-hash"), { provider: "apple" }),
    );
  });

  it("client cannot read or write paymentEventsPostDeletion", async () => {
    const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
    await assertFails(getDoc(doc(ownerDb, "paymentEventsPostDeletion", "ev1")));
    await assertFails(
      setDoc(doc(ownerDb, "paymentEventsPostDeletion", "ev1"), { provider: "apple" }),
    );
  });
});
