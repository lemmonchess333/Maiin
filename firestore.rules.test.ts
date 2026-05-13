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

  // ── photoURL value gate ───────────────────────────────────────────
  // The rule allows photoURL to be: absent, null, "", or a URL matching
  // one of three CDN prefixes (Firebase Storage, Google OAuth, Apple
  // OAuth). Everything else fails closed. These tests pin every branch
  // so a regression in the rule (e.g. relaxing one of the regexes,
  // dropping the null check) surfaces here.

  it("photoURL = null passes (no-photo state for OAuth-less signups)", async () => {
    const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
    await assertSucceeds(
      setDoc(
        doc(ownerDb, "users", OWNER_UID, "public", "profile"),
        { photoURL: null },
        { merge: true },
      ),
    );
  });

  it("photoURL = empty string passes (removeProfilePhoto clear state)", async () => {
    const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
    await assertSucceeds(
      setDoc(
        doc(ownerDb, "users", OWNER_UID, "public", "profile"),
        { photoURL: "" },
        { merge: true },
      ),
    );
  });

  it("photoURL on Firebase Storage CDN passes (custom upload)", async () => {
    const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
    await assertSucceeds(
      setDoc(
        doc(ownerDb, "users", OWNER_UID, "public", "profile"),
        {
          photoURL:
            "https://firebasestorage.googleapis.com/v0/b/tropos-fitness.firebasestorage.app/o/profile-photos%2Fowner-uid%2Favatar.jpg?alt=media",
        },
        { merge: true },
      ),
    );
  });

  it("photoURL on Google OAuth CDN passes (Google sign-in)", async () => {
    const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
    await assertSucceeds(
      setDoc(
        doc(ownerDb, "users", OWNER_UID, "public", "profile"),
        { photoURL: "https://lh3.googleusercontent.com/a/ACg8ocIabcdefg=s96-c" },
        { merge: true },
      ),
    );
  });

  it("photoURL on Apple OAuth CDN passes (Apple sign-in)", async () => {
    const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
    await assertSucceeds(
      setDoc(
        doc(ownerDb, "users", OWNER_UID, "public", "profile"),
        { photoURL: "https://appleid.cdn-apple.com/static/bin/avatar/123.jpg" },
        { merge: true },
      ),
    );
  });

  it("photoURL on an arbitrary external origin — fails", async () => {
    // The bedrock negative: a malicious owner pointing photoURL at
    // their own tracking endpoint would harvest IPs from every
    // viewer of their leaderboard / kudos / social row. The CDN
    // allow-list closes this.
    const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
    await assertFails(
      setDoc(
        doc(ownerDb, "users", OWNER_UID, "public", "profile"),
        { photoURL: "https://pixel-tracker.example/pixel?uid=victim" },
        { merge: true },
      ),
    );
  });

  it("photoURL with a near-miss prefix (suffix phishing) — fails", async () => {
    // `https://lh3.googleusercontent.com.evil.com/...` matches a
    // naive `startsWith` but the rule anchors with `^` so this
    // fails. Pin the anchor.
    const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
    await assertFails(
      setDoc(
        doc(ownerDb, "users", OWNER_UID, "public", "profile"),
        {
          photoURL:
            "https://lh3.googleusercontent.com.evil.com/a/ACg8ocIabcdefg=s96-c",
        },
        { merge: true },
      ),
    );
  });

  it("photoURL with javascript: scheme — fails", async () => {
    // `<img src>` ignores `javascript:` but defence-in-depth: keep it
    // out of Firestore in the first place.
    const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
    await assertFails(
      setDoc(
        doc(ownerDb, "users", OWNER_UID, "public", "profile"),
        { photoURL: "javascript:alert(1)" },
        { merge: true },
      ),
    );
  });

  it("photoURL with data: scheme — fails", async () => {
    // data: could embed arbitrary bytes / scripts (SVG executes JS).
    const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
    await assertFails(
      setDoc(
        doc(ownerDb, "users", OWNER_UID, "public", "profile"),
        {
          photoURL:
            "data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+",
        },
        { merge: true },
      ),
    );
  });

  it("photoURL with plain http (not https) on Firebase Storage — fails", async () => {
    // The regex anchors `^https://` — a downgrade attack would
    // strip the s. Pin that http:// is not accepted even for the
    // allowed hosts.
    const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
    await assertFails(
      setDoc(
        doc(ownerDb, "users", OWNER_UID, "public", "profile"),
        { photoURL: "http://firebasestorage.googleapis.com/v0/b/x/o/y.jpg" },
        { merge: true },
      ),
    );
  });

  it("partial update without photoURL passes (field-absent branch)", async () => {
    // The rule short-circuits when photoURL isn't in the write — a
    // streak-only bump shouldn't fail just because no photoURL was
    // sent. Pin the absent-field branch separately from null/empty.
    const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
    await assertSucceeds(
      setDoc(
        doc(ownerDb, "users", OWNER_UID, "public", "profile"),
        { currentStreak: 5, longestStreak: 9 },
        { merge: true },
      ),
    );
  });

  // ── photoStoragePath value gate ───────────────────────────────────
  // The rule constrains photoStoragePath to `^profile-photos/${uid}/.*`
  // so a malicious caller can't write a value that would trick a
  // future cleanup path into deleting someone else's blob.

  it("photoStoragePath under the owner's folder — passes", async () => {
    const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
    await assertSucceeds(
      setDoc(
        doc(ownerDb, "users", OWNER_UID, "public", "profile"),
        { photoStoragePath: `profile-photos/${OWNER_UID}/avatar.jpg` },
        { merge: true },
      ),
    );
  });

  it("photoStoragePath null — passes (OAuth-only / cleared state)", async () => {
    const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
    await assertSucceeds(
      setDoc(
        doc(ownerDb, "users", OWNER_UID, "public", "profile"),
        { photoStoragePath: null },
        { merge: true },
      ),
    );
  });

  it("photoStoragePath empty string — passes (cleared state)", async () => {
    const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
    await assertSucceeds(
      setDoc(
        doc(ownerDb, "users", OWNER_UID, "public", "profile"),
        { photoStoragePath: "" },
        { merge: true },
      ),
    );
  });

  it("photoStoragePath pointing at another user's folder — fails", async () => {
    // The attack the gate exists to prevent: writing a path that a
    // future cleanup hook would treat as the owner's blob, deleting
    // someone else's photo when the owner clears theirs.
    const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
    await assertFails(
      setDoc(
        doc(ownerDb, "users", OWNER_UID, "public", "profile"),
        { photoStoragePath: `profile-photos/${OTHER_UID}/avatar.jpg` },
        { merge: true },
      ),
    );
  });

  it("photoStoragePath outside profile-photos prefix — fails", async () => {
    // Anchor check: a path that doesn't start with the expected
    // prefix at all gets rejected.
    const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
    await assertFails(
      setDoc(
        doc(ownerDb, "users", OWNER_UID, "public", "profile"),
        { photoStoragePath: `../etc/passwd` },
        { merge: true },
      ),
    );
  });

  it("partial update without photoStoragePath passes (field-absent branch)", async () => {
    // Same absent-field short-circuit semantics as photoURL.
    const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
    await assertSucceeds(
      setDoc(
        doc(ownerDb, "users", OWNER_UID, "public", "profile"),
        { displayName: "Owner" },
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

/**
 * Phase B1: plan-adherence metadata on /users/{uid}/runs/{doc}.
 *
 * The runs rule is owner-only read/write with NO field allowlist,
 * so additive top-level fields should permit through unchanged.
 * This suite pins that the new 10 fields don't accidentally trip
 * any future rule tightening that adds field constraints, and
 * that the non-owner deny still holds with the richer doc shape.
 *
 * Treated as a regression-net for the rule contract more than a
 * security claim per se — Phase B1 doesn't add a new rule, just
 * relies on the existing one.
 */
suite("firestore.rules — users/{uid}/runs/{doc} (plan metadata)", () => {
  let env: RulesTestEnvironment;

  beforeAll(async () => {
    const [host, portStr] = (EMULATOR_HOST || "").split(":");
    env = await initializeTestEnvironment({
      projectId: PROJECT_ID + "-runs-planmeta",
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

  function fullPlanMetadataRunDoc() {
    return {
      // Subset of the real run doc — enough fields to pass the
      // create + the new metadata block.
      distance: 5000,
      duration: 1500,
      completedAt: serverTimestamp(),
      activityType: "tempo",
      // Phase B1 metadata — 10 top-level fields
      planMode: "race_prep",
      planSource: "today_plan",
      plannedRunDayIndex: 2,
      plannedTemplateId: "tempo_20",
      plannedTemplateType: "tempo",
      actualTemplateId: "tempo_20",
      matchedPlanExact: true,
      matchedPlanType: true,
      offPlan: false,
      planWeekIndex: 2,
      planTotalWeeks: 8,
    };
  }

  it("owner can write a run doc carrying the full plan-metadata block", async () => {
    // Bedrock: the runs rule has no allowlist, so the 10 new
    // fields land without issue. If a future rule edit adds a
    // field constraint, this test surfaces it.
    const db = env.authenticatedContext(OWNER_UID).firestore();
    await assertSucceeds(
      setDoc(doc(db, "users", OWNER_UID, "runs", "r1"), fullPlanMetadataRunDoc()),
    );
  });

  it("owner can write a run doc with freeform-default null metadata", async () => {
    // Freeform users still write the metadata block — all
    // plan-related fields land as null. Pin that null values
    // don't trip any rule.
    const db = env.authenticatedContext(OWNER_UID).firestore();
    await assertSucceeds(
      setDoc(doc(db, "users", OWNER_UID, "runs", "r2"), {
        distance: 5000,
        duration: 1500,
        completedAt: serverTimestamp(),
        activityType: "freerun",
        planMode: "freeform",
        planSource: "manual",
        plannedRunDayIndex: null,
        plannedTemplateId: null,
        plannedTemplateType: null,
        actualTemplateId: null,
        matchedPlanExact: null,
        matchedPlanType: null,
        offPlan: false,
        planWeekIndex: null,
        planTotalWeeks: null,
      }),
    );
  });

  it("non-owner cannot write to another user's run doc, even with valid metadata", async () => {
    // Owner-only write rule still holds — the new metadata fields
    // don't relax the auth boundary.
    const otherDb = env.authenticatedContext(OTHER_UID).firestore();
    await assertFails(
      setDoc(
        doc(otherDb, "users", OWNER_UID, "runs", "r3"),
        fullPlanMetadataRunDoc(),
      ),
    );
  });

  it("unauthed cannot read another user's run doc", async () => {
    // Pin that adding metadata didn't accidentally open cross-user
    // reads (the audit doc has separate read rules; runs are owner
    // -only read).
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), "users", OWNER_UID, "runs", "r4"),
        fullPlanMetadataRunDoc(),
      );
    });
    const anonDb = env.unauthenticatedContext().firestore();
    await assertFails(
      getDoc(doc(anonDb, "users", OWNER_UID, "runs", "r4")),
    );
  });
});
