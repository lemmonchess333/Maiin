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
 * PR K (audit P1 #11): rules tests for /challenges.
 *
 * Pre-PR-K `write: if request.auth != null` let any authed user
 * create junk documents with arbitrary IDs and overwrite existing
 * seeded entries. These tests pin the tightened ruleset:
 *
 *   - reads stay open to any authed user
 *   - creates are limited to the three known docId prefixes
 *     (weekly- / monthly- / seasonal-)
 *   - updates + deletes are locked to admin SDK
 *   - participant docs remain owner-only writes
 *
 * Run via: firebase emulators:exec --only firestore \
 *          'vitest run firestore.rules.test.ts'
 */
suite("firestore.rules — /challenges", () => {
  let env: RulesTestEnvironment;

  beforeAll(async () => {
    const [host, portStr] = (EMULATOR_HOST || "").split(":");
    env = await initializeTestEnvironment({
      projectId: PROJECT_ID + "-challenges",
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

  const validChallengeData = {
    name: "Weekly Warrior",
    description: "Log workouts this week",
    type: "weekly",
    metric: "workout_count",
    icon: "trophy",
    tiers: { bronze: 2, silver: 4, gold: 6 },
    startDate: new Date(),
    endDate: new Date(),
    participantCount: 0,
    createdAt: serverTimestamp(),
  };

  it("authed user reads challenges — succeeds", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), "challenges", "weekly-2026-01-01"),
        validChallengeData,
      );
    });
    const db = env.authenticatedContext(OWNER_UID).firestore();
    await assertSucceeds(getDoc(doc(db, "challenges", "weekly-2026-01-01")));
  });

  it("unauthed user reads challenges — fails", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), "challenges", "weekly-2026-01-01"),
        validChallengeData,
      );
    });
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "challenges", "weekly-2026-01-01")));
  });

  it("authed user creates a weekly-prefix challenge — succeeds", async () => {
    const db = env.authenticatedContext(OWNER_UID).firestore();
    await assertSucceeds(
      setDoc(doc(db, "challenges", "weekly-2026-01-01"), validChallengeData),
    );
  });

  it("authed user creates a monthly-prefix challenge — succeeds", async () => {
    const db = env.authenticatedContext(OWNER_UID).firestore();
    await assertSucceeds(
      setDoc(doc(db, "challenges", "monthly-2026-01-01"), validChallengeData),
    );
  });

  it("authed user creates a seasonal-prefix challenge — succeeds", async () => {
    const db = env.authenticatedContext(OWNER_UID).firestore();
    await assertSucceeds(
      setDoc(doc(db, "challenges", "seasonal-2026-01-01"), validChallengeData),
    );
  });

  it("authed user creates a fastest-5k-prefix challenge — succeeds", async () => {
    const db = env.authenticatedContext(OWNER_UID).firestore();
    await assertSucceeds(
      setDoc(doc(db, "challenges", "fastest-5k-2026-01-01"), validChallengeData),
    );
  });

  it("authed user creates a group-goal-prefix challenge — succeeds", async () => {
    const db = env.authenticatedContext(OWNER_UID).firestore();
    await assertSucceeds(
      setDoc(doc(db, "challenges", "group-goal-2026-01-01"), validChallengeData),
    );
  });

  it("authed user creates a junk-id challenge — fails (docId pattern guard)", async () => {
    const db = env.authenticatedContext(OWNER_UID).firestore();
    await assertFails(
      setDoc(doc(db, "challenges", "asdfasdf"), validChallengeData),
    );
  });

  it("authed user creates a fake-prefix challenge — fails (docId pattern guard)", async () => {
    const db = env.authenticatedContext(OWNER_UID).firestore();
    // No leading hyphen → doesn't match `weekly-.*`
    await assertFails(
      setDoc(doc(db, "challenges", "weeklyfake"), validChallengeData),
    );
  });

  it("authed user updates an existing challenge — fails (admin only)", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), "challenges", "weekly-2026-01-01"),
        validChallengeData,
      );
    });
    const db = env.authenticatedContext(OWNER_UID).firestore();
    await assertFails(
      setDoc(
        doc(db, "challenges", "weekly-2026-01-01"),
        { name: "Hijacked" },
        { merge: true },
      ),
    );
  });

  it("unauthed user creates a valid-prefix challenge — fails", async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(
      setDoc(doc(db, "challenges", "weekly-2026-01-01"), validChallengeData),
    );
  });

  it("owner writes their participant doc — succeeds", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), "challenges", "weekly-2026-01-01"),
        validChallengeData,
      );
    });
    const db = env.authenticatedContext(OWNER_UID).firestore();
    await assertSucceeds(
      setDoc(
        doc(db, "challenges", "weekly-2026-01-01", "participants", OWNER_UID),
        { progress: 3, tier: "bronze" },
      ),
    );
  });

  it("other user writes someone else's participant doc — fails", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), "challenges", "weekly-2026-01-01"),
        validChallengeData,
      );
    });
    const db = env.authenticatedContext(OTHER_UID).firestore();
    await assertFails(
      setDoc(
        doc(db, "challenges", "weekly-2026-01-01", "participants", OWNER_UID),
        { progress: 99, tier: "gold" },
      ),
    );
  });

  it("authed user reads another user's participant doc — succeeds (leaderboard reads)", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), "challenges", "weekly-2026-01-01"),
        validChallengeData,
      );
      await setDoc(
        doc(ctx.firestore(), "challenges", "weekly-2026-01-01", "participants", OWNER_UID),
        { progress: 5, tier: "silver" },
      );
    });
    const db = env.authenticatedContext(OTHER_UID).firestore();
    await assertSucceeds(
      getDoc(
        doc(db, "challenges", "weekly-2026-01-01", "participants", OWNER_UID),
      ),
    );
  });
});

/**
 * /audit_checkout_sessions — server-only collection.
 *
 * Written by the createCheckoutSession Cloud Function on successful
 * Stripe session creation. Clients must never read or write. The
 * default-deny rule at the top of firestore.rules covers this, plus
 * the explicit `allow read, write: if false` block we added
 * doubles as documentation. These tests pin the negative-space so a
 * future "let me expose this to an admin dashboard" instinct gets
 * caught in CI rather than at runtime.
 */
suite("firestore.rules — /audit_checkout_sessions", () => {
  let env: RulesTestEnvironment;

  beforeAll(async () => {
    const [host, portStr] = (EMULATOR_HOST || "").split(":");
    env = await initializeTestEnvironment({
      projectId: PROJECT_ID + "-audit",
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

  it("unauthenticated client cannot read", async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "audit_checkout_sessions", "any-doc")));
  });

  it("authenticated client cannot read", async () => {
    // Even a signed-in user must not see audit records — they
    // include other users' uids and checkout metadata.
    const db = env.authenticatedContext(OWNER_UID).firestore();
    await assertFails(getDoc(doc(db, "audit_checkout_sessions", "any-doc")));
  });

  it("authenticated client cannot create", async () => {
    // Only Admin SDK (the Cloud Function) writes. A client trying
    // to forge an audit entry must be denied.
    const db = env.authenticatedContext(OWNER_UID).firestore();
    await assertFails(
      setDoc(doc(db, "audit_checkout_sessions", "forged"), {
        uid: OWNER_UID,
        stripeSessionId: "cs_forged",
      }),
    );
  });

  it("authenticated client cannot overwrite an existing doc", async () => {
    // Seed via admin context (bypasses rules), then attempt a
    // client write — must fail.
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "audit_checkout_sessions", "seeded"), {
        uid: OWNER_UID,
        stripeSessionId: "cs_seeded",
      });
    });
    const db = env.authenticatedContext(OWNER_UID).firestore();
    await assertFails(
      setDoc(doc(db, "audit_checkout_sessions", "seeded"), {
        uid: OWNER_UID,
        stripeSessionId: "cs_overwritten",
      }),
    );
  });
});
