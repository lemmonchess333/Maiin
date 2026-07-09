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
import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const REQUIRE_EMULATOR = process.env.REQUIRE_FIRESTORE_EMULATOR === "1";
if (REQUIRE_EMULATOR && !EMULATOR_HOST) {
  // CI gate: when REQUIRE_FIRESTORE_EMULATOR=1, missing FIRESTORE_EMULATOR_HOST
  // is a hard failure, not a silent skip. Deployment-branch CI must
  // set REQUIRE_FIRESTORE_EMULATOR=1 to ensure rules evidence is real.
  throw new Error(
    "FIRESTORE_EMULATOR_HOST is required when REQUIRE_FIRESTORE_EMULATOR=1. " +
      "Start the Firestore emulator (e.g. `firebase emulators:exec --only firestore,auth ...`) before running this test."
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
    await assertSucceeds(
      getDoc(doc(otherDb, "users", OWNER_UID, "public", "profile"))
    );
  });

  it("unauthed user reads a public profile — fails", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), "users", OWNER_UID, "public", "profile"),
        {
          uid: OWNER_UID,
          displayName: "Owner",
          photoURL: null,
          athleteType: "Lifter",
          currentStreak: 0,
          longestStreak: 0,
          createdAt: serverTimestamp(),
        }
      );
    });

    const anonDb = env.unauthenticatedContext().firestore();
    await assertFails(
      getDoc(doc(anonDb, "users", OWNER_UID, "public", "profile"))
    );
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
        badgeSummary: {
          earnedMap: { first_step: "2026-01-01T00:00:00Z" },
          count: 1,
        },
      })
    );
  });

  it("owner writes displayName + displayNameLower (the rename mirror) — succeeds", async () => {
    // Regression: the search case-insensitivity mirror field displayNameLower
    // was missing from the allowlist, so every rename (committed as an atomic
    // batch of the main user doc + this public doc) was permission-denied.
    const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
    await assertSucceeds(
      setDoc(
        doc(ownerDb, "users", OWNER_UID, "public", "profile"),
        { displayName: "Myles", displayNameLower: "myles" },
        { merge: true }
      )
    );
  });

  it("owner writes a subset (just badgeSummary) — succeeds", async () => {
    const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
    await assertSucceeds(
      setDoc(
        doc(ownerDb, "users", OWNER_UID, "public", "profile"),
        { badgeSummary: { earnedMap: {}, count: 0 } },
        { merge: true }
      )
    );
  });

  it("owner writes an unknown field — fails (fail-closed)", async () => {
    const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
    await assertFails(
      setDoc(doc(ownerDb, "users", OWNER_UID, "public", "profile"), {
        uid: OWNER_UID,
        displayName: "Owner",
        photoURL: null,
        athleteType: "Lifter",
        currentStreak: 0,
        longestStreak: 0,
        createdAt: serverTimestamp(),
        pwned: true, // <- disallowed by hasOnly()
      })
    );
  });

  it("non-owner writes even an allowlisted field — fails", async () => {
    const otherDb = env.authenticatedContext(OTHER_UID).firestore();
    await assertFails(
      setDoc(
        doc(otherDb, "users", OWNER_UID, "public", "profile"),
        { displayName: "Hacked" },
        { merge: true }
      )
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
        { merge: true }
      )
    );
  });

  it("photoURL = empty string passes (removeProfilePhoto clear state)", async () => {
    const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
    await assertSucceeds(
      setDoc(
        doc(ownerDb, "users", OWNER_UID, "public", "profile"),
        { photoURL: "" },
        { merge: true }
      )
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
        { merge: true }
      )
    );
  });

  it("photoURL on Google OAuth CDN passes (Google sign-in)", async () => {
    const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
    await assertSucceeds(
      setDoc(
        doc(ownerDb, "users", OWNER_UID, "public", "profile"),
        {
          photoURL: "https://lh3.googleusercontent.com/a/ACg8ocIabcdefg=s96-c",
        },
        { merge: true }
      )
    );
  });

  it("photoURL on Apple OAuth CDN passes (Apple sign-in)", async () => {
    const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
    await assertSucceeds(
      setDoc(
        doc(ownerDb, "users", OWNER_UID, "public", "profile"),
        { photoURL: "https://appleid.cdn-apple.com/static/bin/avatar/123.jpg" },
        { merge: true }
      )
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
        { merge: true }
      )
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
        { merge: true }
      )
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
        { merge: true }
      )
    );
  });

  it("photoURL with data: scheme — fails", async () => {
    // data: could embed arbitrary bytes / scripts (SVG executes JS).
    const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
    await assertFails(
      setDoc(
        doc(ownerDb, "users", OWNER_UID, "public", "profile"),
        {
          photoURL: "data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+",
        },
        { merge: true }
      )
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
        { merge: true }
      )
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
        { merge: true }
      )
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
        { merge: true }
      )
    );
  });

  it("photoStoragePath null — passes (OAuth-only / cleared state)", async () => {
    const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
    await assertSucceeds(
      setDoc(
        doc(ownerDb, "users", OWNER_UID, "public", "profile"),
        { photoStoragePath: null },
        { merge: true }
      )
    );
  });

  it("photoStoragePath empty string — passes (cleared state)", async () => {
    const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
    await assertSucceeds(
      setDoc(
        doc(ownerDb, "users", OWNER_UID, "public", "profile"),
        { photoStoragePath: "" },
        { merge: true }
      )
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
        { merge: true }
      )
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
        { merge: true }
      )
    );
  });

  it("partial update without photoStoragePath passes (field-absent branch)", async () => {
    // Same absent-field short-circuit semantics as photoURL.
    const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
    await assertSucceeds(
      setDoc(
        doc(ownerDb, "users", OWNER_UID, "public", "profile"),
        { displayName: "Owner" },
        { merge: true }
      )
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
        validChallengeData
      );
    });
    const db = env.authenticatedContext(OWNER_UID).firestore();
    await assertSucceeds(getDoc(doc(db, "challenges", "weekly-2026-01-01")));
  });

  it("unauthed user reads challenges — fails", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), "challenges", "weekly-2026-01-01"),
        validChallengeData
      );
    });
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "challenges", "weekly-2026-01-01")));
  });

  // Challenge docs are SERVER-OWNED — materialised by the rolloverChallenges
  // scheduled function via the Admin SDK (which bypasses rules). No client may
  // create, update, or delete a /challenges doc, regardless of id prefix or
  // body shape. (Pre-2026-06 the create rule accepted any authenticated write
  // to the five time-windowed prefixes subject to isValidChallengeBody() —
  // that let any browser create global product metadata, the same anti-pattern
  // the repo had already fixed for default crews. isValidChallengeBody() is
  // retained in firestore.rules but is now unreachable.)

  it("authed user creates a valid-prefix challenge — fails (server-owned)", async () => {
    const db = env.authenticatedContext(OWNER_UID).firestore();
    await assertFails(
      setDoc(doc(db, "challenges", "weekly-2026-01-01"), validChallengeData)
    );
  });

  it("authed user creates a group-goal challenge — fails (server-owned)", async () => {
    const db = env.authenticatedContext(OWNER_UID).firestore();
    await assertFails(
      setDoc(doc(db, "challenges", "group-goal-2026-01-01"), validChallengeData)
    );
  });

  it("authed user updates an existing challenge — fails (server-owned)", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), "challenges", "weekly-2026-01-01"),
        validChallengeData
      );
    });
    const db = env.authenticatedContext(OWNER_UID).firestore();
    await assertFails(
      setDoc(
        doc(db, "challenges", "weekly-2026-01-01"),
        { name: "Hijacked" },
        { merge: true }
      )
    );
  });

  it("authed user deletes a challenge — fails (server-owned)", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), "challenges", "weekly-2026-01-01"),
        validChallengeData
      );
    });
    const db = env.authenticatedContext(OWNER_UID).firestore();
    await assertFails(deleteDoc(doc(db, "challenges", "weekly-2026-01-01")));
  });

  it("unauthed user creates a challenge — fails", async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(
      setDoc(doc(db, "challenges", "weekly-2026-01-01"), validChallengeData)
    );
  });

  it("owner writes their participant doc — succeeds", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), "challenges", "weekly-2026-01-01"),
        validChallengeData
      );
    });
    const db = env.authenticatedContext(OWNER_UID).firestore();
    // A real client join (useChallenges.joinChallenge): currentValue starts
    // at 0, tierAchieved null — both server-owned thereafter. The old test
    // body { progress, tier } used field names the app never writes and that
    // the create allowlist now correctly rejects.
    await assertSucceeds(
      setDoc(
        doc(db, "challenges", "weekly-2026-01-01", "participants", OWNER_UID),
        { currentValue: 0, tierAchieved: null, joinedAt: serverTimestamp() }
      )
    );
  });

  it("owner CANNOT join with a forged non-zero currentValue — server-owned", async () => {
    // Core of the 2026-06 audit finding: currentValue / tierAchieved are
    // server-owned (syncChallengeProgress, Admin SDK). A client join must
    // start neutral; a forged base value would bake into the world-readable
    // leaderboard (sorted by currentValue desc).
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), "challenges", "weekly-2026-01-01"),
        validChallengeData
      );
    });
    const db = env.authenticatedContext(OWNER_UID).firestore();
    await assertFails(
      setDoc(
        doc(db, "challenges", "weekly-2026-01-01", "participants", OWNER_UID),
        { currentValue: 99, tierAchieved: "gold", joinedAt: serverTimestamp() }
      )
    );
  });

  it("owner CANNOT bump currentValue on update — server-owned", async () => {
    // Seed a valid participant doc, then attempt a client-side progress bump.
    // The update rule permits only cosmetic identity (displayName/photoURL);
    // any diff touching currentValue/tierAchieved is denied.
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), "challenges", "weekly-2026-01-01"),
        validChallengeData
      );
      await setDoc(
        doc(
          ctx.firestore(),
          "challenges",
          "weekly-2026-01-01",
          "participants",
          OWNER_UID
        ),
        { currentValue: 0, tierAchieved: null, joinedAt: serverTimestamp() }
      );
    });
    const db = env.authenticatedContext(OWNER_UID).firestore();
    await assertFails(
      setDoc(
        doc(db, "challenges", "weekly-2026-01-01", "participants", OWNER_UID),
        { currentValue: 500, tierAchieved: "gold" },
        { merge: true }
      )
    );
  });

  it("other user writes someone else's participant doc — fails", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), "challenges", "weekly-2026-01-01"),
        validChallengeData
      );
    });
    const db = env.authenticatedContext(OTHER_UID).firestore();
    await assertFails(
      setDoc(
        doc(db, "challenges", "weekly-2026-01-01", "participants", OWNER_UID),
        { progress: 99, tier: "gold" }
      )
    );
  });

  it("authed user reads another user's participant doc — succeeds (leaderboard reads)", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), "challenges", "weekly-2026-01-01"),
        validChallengeData
      );
      await setDoc(
        doc(
          ctx.firestore(),
          "challenges",
          "weekly-2026-01-01",
          "participants",
          OWNER_UID
        ),
        { progress: 5, tier: "silver" }
      );
    });
    const db = env.authenticatedContext(OTHER_UID).firestore();
    await assertSucceeds(
      getDoc(
        doc(db, "challenges", "weekly-2026-01-01", "participants", OWNER_UID)
      )
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
      })
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
      })
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
      setDoc(
        doc(db, "users", OWNER_UID, "runs", "r1"),
        fullPlanMetadataRunDoc()
      )
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
      })
    );
  });

  it("non-owner cannot write to another user's run doc, even with valid metadata", async () => {
    // Owner-only write rule still holds — the new metadata fields
    // don't relax the auth boundary.
    const otherDb = env.authenticatedContext(OTHER_UID).firestore();
    await assertFails(
      setDoc(
        doc(otherDb, "users", OWNER_UID, "runs", "r3"),
        fullPlanMetadataRunDoc()
      )
    );
  });

  it("unauthed cannot read another user's run doc", async () => {
    // Pin that adding metadata didn't accidentally open cross-user
    // reads (the audit doc has separate read rules; runs are owner
    // -only read).
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), "users", OWNER_UID, "runs", "r4"),
        fullPlanMetadataRunDoc()
      );
    });
    const anonDb = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anonDb, "users", OWNER_UID, "runs", "r4")));
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
      })
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
        })
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
        })
      );
    });
  }

  it("owner reads succeed during the freeze (running status)", async () => {
    await seedDeletionStatus(OWNER_UID, "running");
    // seed a meal doc bypass-rules so the read path can be tested
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users", OWNER_UID, "meals", "m1"), {
        text: "x",
      });
    });
    const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
    await assertSucceeds(
      getDoc(doc(ownerDb, "users", OWNER_UID, "meals", "m1"))
    );
  });

  it("owner writes to users/{uid} root FAIL during running status", async () => {
    await seedDeletionStatus(OWNER_UID, "running");
    const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
    await assertFails(
      setDoc(
        doc(ownerDb, "users", OWNER_UID),
        { displayName: "Renamed mid-deletion" },
        { merge: true }
      )
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
      })
    );
  });

  it("follow creation FAILS when EITHER side is mid-deletion", async () => {
    // Owner mid-deletion: cannot create their own follow.
    await seedDeletionStatus(OWNER_UID, "running");
    const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
    await assertFails(
      setDoc(doc(ownerDb, "following", OWNER_UID, "users", OTHER_UID), {
        createdAt: serverTimestamp(),
      })
    );
  });

  it("follow creation FAILS when target is mid-deletion", async () => {
    await seedDeletionStatus(OTHER_UID, "running");
    const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
    await assertFails(
      setDoc(doc(ownerDb, "following", OWNER_UID, "users", OTHER_UID), {
        createdAt: serverTimestamp(),
      })
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
    await assertSucceeds(
      getDoc(doc(ownerDb, "accountDeletionRequests", OWNER_UID))
    );
  });

  it("non-owner reads someone else's accountDeletionRequests doc — fails", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "accountDeletionRequests", OWNER_UID), {
        uid: OWNER_UID,
        status: "running",
      });
    });
    const otherDb = env.authenticatedContext(OTHER_UID).firestore();
    await assertFails(
      getDoc(doc(otherDb, "accountDeletionRequests", OWNER_UID))
    );
  });

  it("client cannot write to accountDeletionRequests — server-only", async () => {
    const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
    await assertFails(
      setDoc(doc(ownerDb, "accountDeletionRequests", OWNER_UID), {
        uid: OWNER_UID,
        status: "running",
      })
    );
  });

  it("client cannot read or write deletedAccounts tombstone", async () => {
    const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
    await assertFails(getDoc(doc(ownerDb, "deletedAccounts", OWNER_UID)));
    await assertFails(
      setDoc(doc(ownerDb, "deletedAccounts", OWNER_UID), { uid: OWNER_UID })
    );
  });

  it("client cannot read or write deletedBillingIdentities", async () => {
    const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
    await assertFails(
      getDoc(doc(ownerDb, "deletedBillingIdentities", "some-hash"))
    );
    await assertFails(
      setDoc(doc(ownerDb, "deletedBillingIdentities", "some-hash"), {
        provider: "apple",
      })
    );
  });

  it("client cannot read or write paymentEventsPostDeletion", async () => {
    const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
    await assertFails(getDoc(doc(ownerDb, "paymentEventsPostDeletion", "ev1")));
    await assertFails(
      setDoc(doc(ownerDb, "paymentEventsPostDeletion", "ev1"), {
        provider: "apple",
      })
    );
  });
});

// ========================================
// /activities — 2026-05-26 audit findings #1 + #7 + #11
//
// Pinned-by-test invariants:
//   - Reads are visibility-aware: public open, private owner-only,
//     followers-only requires actual follower relation.
//   - Creates enforce strict field allowlist + enum checks + numeric
//     bounds + payload-size caps.
//   - Valid activity creation still works (regression guard for the
//     production `postActivity` shape).
// ========================================

const FOLLOWER_UID = "follower-uid";
const STRANGER_UID = "stranger-uid";

function makeValidActivity(overrides: Record<string, unknown> = {}) {
  return {
    authorId: OWNER_UID,
    authorName: "Owner",
    type: "run",
    visibility: "public",
    createdAt: serverTimestamp(),
    kudosCount: 0,
    commentCount: 0,
    ...overrides,
  };
}

suite("firestore.rules — /activities visibility-aware reads (audit #1)", () => {
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

  // Helper to seed an activity + a follower relation via the
  // rules-disabled admin bypass.
  async function seed({
    activityId,
    visibility,
    follower,
  }: {
    activityId: string;
    visibility: "public" | "followers" | "private";
    follower?: string;
  }) {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, "activities", activityId), {
        ...makeValidActivity({ visibility }),
        createdAt: new Date(),
      });
      if (follower) {
        await setDoc(doc(db, "followers", OWNER_UID, "users", follower), {
          followedAt: new Date(),
        });
      }
    });
  }

  it("public activity — readable by any authed user", async () => {
    await seed({ activityId: "pub-1", visibility: "public" });
    const strangerDb = env.authenticatedContext(STRANGER_UID).firestore();
    await assertSucceeds(getDoc(doc(strangerDb, "activities", "pub-1")));
  });

  it("private activity — NOT readable by another user (THE audit #1 fix)", async () => {
    await seed({ activityId: "priv-1", visibility: "private" });
    const strangerDb = env.authenticatedContext(STRANGER_UID).firestore();
    await assertFails(getDoc(doc(strangerDb, "activities", "priv-1")));
  });

  it("private activity — readable by the owner", async () => {
    await seed({ activityId: "priv-2", visibility: "private" });
    const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
    await assertSucceeds(getDoc(doc(ownerDb, "activities", "priv-2")));
  });

  it("followers-only activity — readable by a valid follower", async () => {
    await seed({
      activityId: "fol-1",
      visibility: "followers",
      follower: FOLLOWER_UID,
    });
    const followerDb = env.authenticatedContext(FOLLOWER_UID).firestore();
    await assertSucceeds(getDoc(doc(followerDb, "activities", "fol-1")));
  });

  it("followers-only activity — NOT readable by a non-follower", async () => {
    await seed({
      activityId: "fol-2",
      visibility: "followers",
      follower: FOLLOWER_UID,
    });
    const strangerDb = env.authenticatedContext(STRANGER_UID).firestore();
    await assertFails(getDoc(doc(strangerDb, "activities", "fol-2")));
  });

  it("followers-only activity — readable by the owner", async () => {
    await seed({ activityId: "fol-3", visibility: "followers" });
    const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
    await assertSucceeds(getDoc(doc(ownerDb, "activities", "fol-3")));
  });
});

suite(
  "firestore.rules — /activities create schema + payload limits (audit #7 + #11)",
  () => {
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

    it("valid activity (mandatory fields only) creates successfully", async () => {
      const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
      await assertSucceeds(
        setDoc(doc(ownerDb, "activities", "valid-min"), makeValidActivity())
      );
    });

    it("valid activity with full populated shape creates successfully (regression guard for postActivity)", async () => {
      // Mirror what src/lib/socialApi.ts postActivity writes for a
      // typical workout post. If the rule allowlist drifts from the
      // client shape, this test catches it.
      const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
      await assertSucceeds(
        setDoc(
          doc(ownerDb, "activities", "valid-full"),
          makeValidActivity({
            type: "workout",
            visibility: "followers",
            authorPhotoURL: "https://firebasestorage.googleapis.com/foo",
            workoutName: "Push day",
            exerciseCount: 6,
            totalVolume: 5400,
            duration: 3600,
            muscleGroups: ["chest", "triceps", "shoulders"],
            prHit: true,
            prExercise: "Bench press",
            prWeight: 90,
            prCount: 1,
            challengeMilestone: "Week 3 complete",
            badgeEarned: "consistency-7",
            crewId: "crew-abc",
          })
        )
      );
    });

    it("authorId mismatch — rejected", async () => {
      const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
      await assertFails(
        setDoc(
          doc(ownerDb, "activities", "bad-author"),
          makeValidActivity({ authorId: STRANGER_UID })
        )
      );
    });

    it("invalid visibility enum value — rejected", async () => {
      const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
      await assertFails(
        setDoc(
          doc(ownerDb, "activities", "bad-vis"),
          makeValidActivity({ visibility: "world" })
        )
      );
    });

    it("invalid type enum value — rejected", async () => {
      const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
      await assertFails(
        setDoc(
          doc(ownerDb, "activities", "bad-type"),
          makeValidActivity({ type: "meal" })
        )
      );
    });

    it("non-zero initial kudosCount — rejected (counter-forgery on create)", async () => {
      const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
      await assertFails(
        setDoc(
          doc(ownerDb, "activities", "bad-kudos"),
          makeValidActivity({ kudosCount: 99999 })
        )
      );
    });

    it("unknown field — rejected (fail-closed allowlist)", async () => {
      const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
      await assertFails(
        setDoc(
          doc(ownerDb, "activities", "bad-extra"),
          makeValidActivity({ secretAdminFlag: true })
        )
      );
    });

    it("oversized routePreview (>5000 points) — rejected (audit #11)", async () => {
      const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
      // 5001 entries — one over the cap.
      const bigRoute = Array.from({ length: 5001 }, (_, i) => ({
        lat: 51 + i * 0.00001,
        lon: -1 + i * 0.00001,
      }));
      await assertFails(
        setDoc(
          doc(ownerDb, "activities", "bad-route"),
          makeValidActivity({ routePreview: bigRoute })
        )
      );
    });

    it("routePreview at the cap (5000 points) — accepted", async () => {
      const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
      const cappedRoute = Array.from({ length: 5000 }, (_, i) => ({
        lat: 51 + i * 0.00001,
        lon: -1 + i * 0.00001,
      }));
      await assertSucceeds(
        setDoc(
          doc(ownerDb, "activities", "ok-route"),
          makeValidActivity({ routePreview: cappedRoute })
        )
      );
    });

    it("oversized exercises array (>100) — rejected", async () => {
      const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
      const bigExercises = Array.from({ length: 101 }, (_, i) => ({
        name: `Ex ${i}`,
        summary: "5x10",
      }));
      await assertFails(
        setDoc(
          doc(ownerDb, "activities", "bad-ex"),
          makeValidActivity({ exercises: bigExercises })
        )
      );
    });

    it("oversized muscleGroups array (>20) — rejected", async () => {
      const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
      const bigMuscles = Array.from({ length: 21 }, (_, i) => `group${i}`);
      await assertFails(
        setDoc(
          doc(ownerDb, "activities", "bad-mg"),
          makeValidActivity({ muscleGroups: bigMuscles })
        )
      );
    });

    it("oversized workoutName (>200 chars) — rejected", async () => {
      const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
      const longName = "x".repeat(201);
      await assertFails(
        setDoc(
          doc(ownerDb, "activities", "bad-name"),
          makeValidActivity({ workoutName: longName })
        )
      );
    });

    it("negative distance — rejected", async () => {
      const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
      await assertFails(
        setDoc(
          doc(ownerDb, "activities", "bad-dist-neg"),
          makeValidActivity({ distance: -100 })
        )
      );
    });

    it("absurd distance (>500km) — rejected", async () => {
      const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
      await assertFails(
        setDoc(
          doc(ownerDb, "activities", "bad-dist-huge"),
          makeValidActivity({ distance: 999999999 })
        )
      );
    });

    it("duration > 24h — rejected", async () => {
      const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
      await assertFails(
        setDoc(
          doc(ownerDb, "activities", "bad-dur"),
          makeValidActivity({ duration: 100000 })
        )
      );
    });

    it("blank authorName — rejected", async () => {
      const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
      await assertFails(
        setDoc(
          doc(ownerDb, "activities", "bad-blank-name"),
          makeValidActivity({ authorName: "" })
        )
      );
    });
  }
);

// ========================================
// /kudos + /comments + /groups counter-write DENIALS
// 2026-05-26 audit PR 2 (findings #2 + #5)
//
// Pre-PR-2 any authed user could:
//   - setDoc(kudos/{aid}/users/{uid})  → kudos forgery
//   - updateDoc(activities/{aid}, { kudosCount: 999999 })  → counter forgery
//   - updateDoc(groups/{cid}, { memberCount: 1000000 })  → crew count forgery
// Post-PR-2 those writes are server-only (via the callables in
// functions/index.js); these tests pin the deny-from-client contract.
// ========================================
suite(
  "firestore.rules — counter writes denied at client (audit #2 + #5)",
  () => {
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

    it("client cannot directly write kudos sub-doc (server-only)", async () => {
      // Seed an activity so the kudos-doc target is meaningful.
      await env.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        await setDoc(doc(db, "activities", "A1"), {
          ...makeValidActivity(),
          createdAt: new Date(),
        });
      });
      const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
      await assertFails(
        setDoc(doc(ownerDb, "kudos", "A1", "users", OWNER_UID), {
          createdAt: new Date(),
        })
      );
    });

    it("client cannot directly delete kudos sub-doc (server-only)", async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        await setDoc(doc(db, "activities", "A1"), {
          ...makeValidActivity(),
          createdAt: new Date(),
        });
        await setDoc(doc(db, "kudos", "A1", "users", OWNER_UID), {
          createdAt: new Date(),
        });
      });
      const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
      await assertFails(
        deleteDoc(doc(ownerDb, "kudos", "A1", "users", OWNER_UID))
      );
    });

    it("non-owner cannot write kudosCount/commentCount on an activity (audit #2 — counter forgery)", async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        await setDoc(doc(db, "activities", "A1"), {
          ...makeValidActivity(),
          createdAt: new Date(),
        });
      });
      const strangerDb = env.authenticatedContext(STRANGER_UID).firestore();
      // updateDoc not imported in this file; use setDoc with merge.
      await assertFails(
        setDoc(
          doc(strangerDb, "activities", "A1"),
          { kudosCount: 999999 },
          { merge: true }
        )
      );
      await assertFails(
        setDoc(
          doc(strangerDb, "activities", "A1"),
          { commentCount: -50 },
          { merge: true }
        )
      );
    });

    it("owner cannot write kudosCount/commentCount either (server-only)", async () => {
      // Defensive — even the activity owner has no business setting
      // these directly. The CFs are the only writer.
      await env.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        await setDoc(doc(db, "activities", "A1"), {
          ...makeValidActivity(),
          createdAt: new Date(),
        });
      });
      const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
      await assertFails(
        setDoc(
          doc(ownerDb, "activities", "A1"),
          { kudosCount: 42 },
          { merge: true }
        )
      );
    });

    it("owner CAN still update visibility on their activity (regression guard)", async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        await setDoc(doc(db, "activities", "A1"), {
          ...makeValidActivity(),
          createdAt: new Date(),
        });
      });
      const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
      await assertSucceeds(
        setDoc(
          doc(ownerDb, "activities", "A1"),
          { visibility: "private" },
          { merge: true }
        )
      );
    });

    it("client cannot directly write comment doc (server-only)", async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        await setDoc(doc(db, "activities", "A1"), {
          ...makeValidActivity(),
          createdAt: new Date(),
        });
      });
      const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
      await assertFails(
        setDoc(doc(ownerDb, "comments", "A1", "items", "C1"), {
          authorId: OWNER_UID,
          authorName: "Owner",
          text: "Nice run!",
          createdAt: new Date(),
        })
      );
    });

    it("client cannot directly write crew memberCount (audit #5 — count forgery)", async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        await setDoc(doc(db, "groups", "crew-a"), {
          name: "Crew A",
          memberCount: 10,
          leaderboardMetric: "workout_count",
          type: "custom",
          createdBy: OWNER_UID,
        });
      });
      const strangerDb = env.authenticatedContext(STRANGER_UID).firestore();
      await assertFails(
        setDoc(
          doc(strangerDb, "groups", "crew-a"),
          { memberCount: 1000000 },
          { merge: true }
        )
      );
    });

    it("client cannot directly write member sub-doc (server-only)", async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        await setDoc(doc(db, "groups", "crew-a"), {
          name: "Crew A",
          memberCount: 10,
          leaderboardMetric: "workout_count",
          type: "custom",
          createdBy: OWNER_UID,
        });
      });
      const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
      await assertFails(
        setDoc(doc(ownerDb, "groups", "crew-a", "members", OWNER_UID), {
          joinedAt: new Date(),
          displayName: "Owner",
        })
      );
    });

    it("crew creator CAN still update non-counter fields on their crew (regression guard)", async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        await setDoc(doc(db, "groups", "crew-a"), {
          name: "Crew A",
          memberCount: 10,
          leaderboardMetric: "workout_count",
          type: "custom",
          createdBy: OWNER_UID,
        });
      });
      const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
      await assertSucceeds(
        setDoc(
          doc(ownerDb, "groups", "crew-a"),
          { name: "Crew A Renamed" },
          { merge: true }
        )
      );
    });

    it("kudos reads stay open (regression guard — UI still renders 'Props from' list)", async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        await setDoc(doc(db, "activities", "A1"), {
          ...makeValidActivity(),
          createdAt: new Date(),
        });
        await setDoc(doc(db, "kudos", "A1", "users", OWNER_UID), {
          createdAt: new Date(),
        });
      });
      const strangerDb = env.authenticatedContext(STRANGER_UID).firestore();
      await assertSucceeds(
        getDoc(doc(strangerDb, "kudos", "A1", "users", OWNER_UID))
      );
    });
  }
);

// ════════════════════════════════════════════════════════════════════
// audit PR 3 (#3 + #6 + #12) — feed + notification creates are now
// server-only. Pre-PR-3 the client wrote `/feeds/{recipient}/items`
// and `/notifications/{recipient}/items` directly. `authorId ==
// auth.uid` stopped impersonation but couldn't gate volume — a
// script could fan out 100k items into any follower's feed or push
// fake-looking notifications. Rules now deny client create; the
// onActivityCreated trigger handles feed fan-out, and notification
// creation is folded into toggleKudosCallable + addCommentCallable.
//
// Owner can still read + delete their own feed / notifications.
// Delete is gated by `isOwnerAndNotDeleting` to preserve the
// "deleting users do not write anywhere" R1A invariant.
// ════════════════════════════════════════════════════════════════════
suite(
  "firestore.rules — feed + notification writes denied at client (audit #3 + #6)",
  () => {
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

    it("client cannot directly create a feed item in their own feed (server-only)", async () => {
      const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
      await assertFails(
        setDoc(doc(ownerDb, "feeds", OWNER_UID, "items", "I1"), {
          activityId: "act1",
          authorId: OWNER_UID,
          summary: "tried to inject a feed item",
          createdAt: new Date(),
        })
      );
    });

    it("client cannot fan-out into another user's feed (audit #3 — feed spam)", async () => {
      const attackerDb = env.authenticatedContext(STRANGER_UID).firestore();
      await assertFails(
        setDoc(doc(attackerDb, "feeds", OWNER_UID, "items", "I1"), {
          activityId: "act1",
          authorId: STRANGER_UID, // matches sender — pre-PR-3 this passed
          summary: "spam content",
          createdAt: new Date(),
        })
      );
    });

    it("owner can still read their own feed (regression guard)", async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        await setDoc(doc(db, "feeds", OWNER_UID, "items", "I1"), {
          activityId: "act1",
          authorId: OTHER_UID,
          summary: "from a friend",
          createdAt: new Date(),
        });
      });
      const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
      await assertSucceeds(
        getDoc(doc(ownerDb, "feeds", OWNER_UID, "items", "I1"))
      );
    });

    it("owner can still delete their own feed item (regression guard — UI inbox clear)", async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        await setDoc(doc(db, "feeds", OWNER_UID, "items", "I1"), {
          activityId: "act1",
          authorId: OTHER_UID,
          summary: "from a friend",
          createdAt: new Date(),
        });
      });
      const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
      await assertSucceeds(
        deleteDoc(doc(ownerDb, "feeds", OWNER_UID, "items", "I1"))
      );
    });

    it("stranger cannot delete someone else's feed item", async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        await setDoc(doc(db, "feeds", OWNER_UID, "items", "I1"), {
          activityId: "act1",
          authorId: OWNER_UID,
          summary: "private feed item",
          createdAt: new Date(),
        });
      });
      const strangerDb = env.authenticatedContext(STRANGER_UID).firestore();
      await assertFails(
        deleteDoc(doc(strangerDb, "feeds", OWNER_UID, "items", "I1"))
      );
    });

    it("client cannot directly create a notification in their own inbox", async () => {
      const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
      await assertFails(
        setDoc(doc(ownerDb, "notifications", OWNER_UID, "items", "N1"), {
          type: "kudos",
          fromUserId: OWNER_UID,
          message: "self-notification attempt",
          read: false,
          createdAt: new Date(),
        })
      );
    });

    it("client cannot push notifications into another user's inbox (audit #6 — notification spam)", async () => {
      const attackerDb = env.authenticatedContext(STRANGER_UID).firestore();
      await assertFails(
        setDoc(doc(attackerDb, "notifications", OWNER_UID, "items", "N1"), {
          type: "kudos",
          fromUserId: STRANGER_UID, // matches sender — pre-PR-3 this passed
          message: "Tropos: click here to claim your prize",
          read: false,
          createdAt: new Date(),
        })
      );
    });

    it("owner can still read their notifications (regression guard)", async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        await setDoc(doc(db, "notifications", OWNER_UID, "items", "N1"), {
          type: "kudos",
          fromUserId: OTHER_UID,
          message: "you got props",
          read: false,
          createdAt: new Date(),
        });
      });
      const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
      await assertSucceeds(
        getDoc(doc(ownerDb, "notifications", OWNER_UID, "items", "N1"))
      );
    });

    it("owner can delete their own notification (mark-as-read replacement)", async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        await setDoc(doc(db, "notifications", OWNER_UID, "items", "N1"), {
          type: "kudos",
          fromUserId: OTHER_UID,
          message: "you got props",
          read: false,
          createdAt: new Date(),
        });
      });
      const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
      await assertSucceeds(
        deleteDoc(doc(ownerDb, "notifications", OWNER_UID, "items", "N1"))
      );
    });

    it("stranger cannot delete someone else's notification", async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        await setDoc(doc(db, "notifications", OWNER_UID, "items", "N1"), {
          type: "kudos",
          fromUserId: OTHER_UID,
          message: "you got props",
          read: false,
          createdAt: new Date(),
        });
      });
      const strangerDb = env.authenticatedContext(STRANGER_UID).firestore();
      await assertFails(
        deleteDoc(doc(strangerDb, "notifications", OWNER_UID, "items", "N1"))
      );
    });
  }
);

// ── Security audit 2026-06: user-doc CREATE self-grant guard ───────────
// computeEffectiveTier (functions/helpers.js) grants server-side Pro on a
// future trialExpiresAt REGARDLESS of subscriptionTier. The create rule
// pins subscriptionTier == 'free' but billingFieldsUnsetOnCreate() must
// also block a client from seeding trial/billing timestamps, or a free
// user self-grants Pro (incl. paid AI compute) with one direct write.
suite("firestore.rules — users/{uid} create self-grant guard", () => {
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

  const future = new Date(Date.now() + 30 * 86_400_000).toISOString();

  it("free user CAN create their own doc with no billing fields", async () => {
    const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
    await assertSucceeds(
      setDoc(doc(ownerDb, "users", OWNER_UID), {
        subscriptionTier: "free",
        trialExpiresAt: null,
      })
    );
  });

  it("free user CANNOT self-grant via a future trialExpiresAt on create", async () => {
    const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
    await assertFails(
      setDoc(doc(ownerDb, "users", OWNER_UID), {
        subscriptionTier: "free",
        trialExpiresAt: future,
      })
    );
  });

  it("free user CANNOT seed a future subscriptionExpiresAt on create", async () => {
    const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
    await assertFails(
      setDoc(doc(ownerDb, "users", OWNER_UID), {
        subscriptionTier: "free",
        subscriptionExpiresAt: future,
      })
    );
  });

  it("free user CANNOT seed a stripeSubscriptionId on create", async () => {
    const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
    await assertFails(
      setDoc(doc(ownerDb, "users", OWNER_UID), {
        subscriptionTier: "free",
        stripeSubscriptionId: "sub_attacker",
      })
    );
  });

  // ── useStreaks badge-save coverage: the hook commits a 2-doc batch
  //    (streaks/data badges + public/profile badgeSummary). Pin that the
  //    batch + each write individually are rules-valid (no deletion ledger). ──
  it("owner writes streaks/data alone — succeeds", async () => {
    const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
    await assertSucceeds(
      setDoc(
        doc(ownerDb, "users", OWNER_UID, "streaks", "data"),
        { badges: [{ id: "first_step", earnedAt: "2026-06-07" }] },
        { merge: true }
      )
    );
  });

  it("owner writes public/profile badgeSummary — succeeds", async () => {
    const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
    await assertSucceeds(
      setDoc(
        doc(ownerDb, "users", OWNER_UID, "public", "profile"),
        { badgeSummary: { earnedMap: { first_step: "2026-06-07" }, count: 1 } },
        { merge: true }
      )
    );
  });

  it("owner commits the useStreaks badge-save batch (streaks/data + public/profile) — succeeds", async () => {
    const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
    const batch = writeBatch(ownerDb);
    batch.set(
      doc(ownerDb, "users", OWNER_UID, "streaks", "data"),
      { badges: [{ id: "first_step", earnedAt: "2026-06-07" }] },
      { merge: true }
    );
    batch.set(
      doc(ownerDb, "users", OWNER_UID, "public", "profile"),
      { badgeSummary: { earnedMap: { first_step: "2026-06-07" }, count: 1 } },
      { merge: true }
    );
    await assertSucceeds(batch.commit());
  });
});

const A_UID = "partner-a";
const B_UID = "partner-b";
const C_UID = "partner-c";

suite("firestore.rules — partnerBonds (SOCIAL S3)", () => {
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

  const BOND = "bond-ab";
  const coldBond = (members: string[]) => ({
    members,
    streak: 0,
    lastSharedDay: null,
    lastActive: {},
    freezeWeek: {},
    createdAt: serverTimestamp(),
  });

  async function seedBond(
    members: string[],
    extra: Record<string, unknown> = {}
  ) {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "partnerBonds", BOND), {
        ...coldBond(members),
        ...extra,
      });
    });
  }

  it("a member reads the bond; a non-member cannot", async () => {
    await seedBond([A_UID, B_UID]);
    await assertSucceeds(
      getDoc(
        doc(env.authenticatedContext(A_UID).firestore(), "partnerBonds", BOND)
      )
    );
    await assertFails(
      getDoc(
        doc(env.authenticatedContext(C_UID).firestore(), "partnerBonds", BOND)
      )
    );
  });

  it("creates a cold bond when the creator is one of two distinct members", async () => {
    const aDb = env.authenticatedContext(A_UID).firestore();
    await assertSucceeds(
      setDoc(doc(aDb, "partnerBonds", BOND), coldBond([A_UID, B_UID]))
    );
  });

  it("rejects a create with a forged head-start (streak != 0)", async () => {
    const aDb = env.authenticatedContext(A_UID).firestore();
    await assertFails(
      setDoc(doc(aDb, "partnerBonds", BOND), {
        ...coldBond([A_UID, B_UID]),
        streak: 99,
      })
    );
  });

  it("rejects a create where the creator isn't a member", async () => {
    const cDb = env.authenticatedContext(C_UID).firestore();
    await assertFails(
      setDoc(doc(cDb, "partnerBonds", BOND), coldBond([A_UID, B_UID]))
    );
  });

  it("rejects a create with duplicate / non-2 members", async () => {
    const aDb = env.authenticatedContext(A_UID).firestore();
    await assertFails(
      setDoc(doc(aDb, "partnerBonds", BOND), coldBond([A_UID, A_UID]))
    );
    await assertFails(
      setDoc(doc(aDb, "partnerBonds", BOND), coldBond([A_UID, B_UID, C_UID]))
    );
  });

  it("Soc7: streak writes are SERVER-ONLY — even a member cannot update", async () => {
    // The engine now runs server-side (applyPartnerActivity, Admin SDK).
    // `allow update: if false` removes the client-write cheat vector, so a
    // member's attempt to bump their own streak is rejected. (A non-member
    // was always rejected; the new invariant is that a MEMBER is too.)
    await seedBond([A_UID, B_UID]);
    const aDb = env.authenticatedContext(A_UID).firestore();
    await assertFails(
      setDoc(doc(aDb, "partnerBonds", BOND), {
        ...coldBond([A_UID, B_UID]),
        streak: 3,
        lastSharedDay: "2026-06-12",
      })
    );
    // A members-swap is just one form of update — also blocked by `if false`
    // (the dedicated immutability check is now subsumed).
    await assertFails(
      setDoc(doc(aDb, "partnerBonds", BOND), {
        ...coldBond([A_UID, C_UID]),
        streak: 1,
      })
    );
  });

  it("either member can delete the bond; a non-member cannot", async () => {
    await seedBond([A_UID, B_UID]);
    await assertFails(
      deleteDoc(
        doc(env.authenticatedContext(C_UID).firestore(), "partnerBonds", BOND)
      )
    );
    await assertSucceeds(
      deleteDoc(
        doc(env.authenticatedContext(B_UID).firestore(), "partnerBonds", BOND)
      )
    );
  });

  it("R1A: can't create a bond while a member is mid-deletion", async () => {
    // Seed a running deletion request for B via admin bypass.
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "accountDeletionRequests", B_UID), {
        status: "running",
      });
    });
    const aDb = env.authenticatedContext(A_UID).firestore();
    await assertFails(
      setDoc(doc(aDb, "partnerBonds", BOND), coldBond([A_UID, B_UID]))
    );
  });
});
