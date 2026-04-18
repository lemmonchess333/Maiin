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
