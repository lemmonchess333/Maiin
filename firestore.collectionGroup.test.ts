/**
 * R1A-Deletion Chunk 2 — emulator-backed feasibility tests for the
 * collectionGroup + documentId query shapes the executor relies on.
 *
 * Four executor entries do `collectionGroup(NAME).where(documentId(), "==", uid)`
 * filtered to a parent path:
 *   - blocksReverse:           collectionGroup('users') @ blocks/*\/users
 *   - kudosByMe:               collectionGroup('users') @ kudos/*\/users
 *   - crewMemberships:         collectionGroup('members') @ groups/*\/members
 *   - challengeParticipations: collectionGroup('participants') @ challenges/*\/participants
 *
 * Plus two collectionGroupByField entries:
 *   - feedFanout:              collectionGroup('items').where('authorId', '==', uid) @ feeds/*\/items
 *   - notificationsFromMe:     collectionGroup('items').where('fromUserId', '==', uid) @ notifications/*\/items
 *
 * Goals of this suite (run against the Firestore emulator):
 *   1. Verify the collectionGroup + documentId equality query returns
 *      the expected docs.
 *   2. Verify the segment-aware pathFilter (parentPath includes '/feeds/'
 *      etc., applied in-process after the query) does NOT include
 *      same-name subcollections under other parents.
 *   3. Verify required Firestore indexes exist (the emulator gives
 *      friendly errors when an index is missing; absence here vs
 *      production should both be loud).
 *
 * Skip behaviour: same as firestore.rules.test.ts — when
 * FIRESTORE_EMULATOR_HOST isn't set, the whole suite skips. Local
 * setup:
 *   npm install -g firebase-tools
 *   firebase emulators:exec --only firestore "vitest run firestore.collectionGroup.test.ts"
 *
 * Or run the emulator manually then:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx vitest run firestore.collectionGroup.test.ts
 *
 * If the emulator surfaces an "index required" message, that's the
 * Chunk 2 → Chunk 3 deploy gate: composite/collectionGroup indexes
 * must be created in firestore.indexes.json before the executor ships.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import {
  collectionGroup,
  doc,
  query,
  where,
  documentId,
  setDoc,
  getDocs,
} from "firebase/firestore";
import { createRequire } from "node:module";

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const REQUIRE_EMULATOR = process.env.REQUIRE_FIRESTORE_EMULATOR === "1";
if (REQUIRE_EMULATOR && !EMULATOR_HOST) {
  throw new Error(
    "FIRESTORE_EMULATOR_HOST is required when REQUIRE_FIRESTORE_EMULATOR=1. " +
      "Start the Firestore emulator before running this test.",
  );
}
const suite = EMULATOR_HOST ? describe : describe.skip;

const PROJECT_ID = "tropos-cg-test";
const ACTOR_UID = "actor-uid";
const TARGET_UID = "target-uid";
const OTHER_UID = "other-uid";

const require = createRequire(import.meta.url);
const { matchesPathFilter } = require("./functions/lib/pathFilterMatcher.js");

suite("firestore.collectionGroup — executor query shapes", () => {
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

  it("collectionGroup('users') + documentId == uid returns kudos+blocks+follows leaves; pathFilter discriminates", async () => {
    // Seed a 'users' subcollection under THREE different parents:
    //   kudos/activity1/users/{TARGET_UID}     ← matches kudos pathFilter
    //   blocks/{OTHER_UID}/users/{TARGET_UID}  ← matches blocks pathFilter
    //   following/{OTHER_UID}/users/{TARGET_UID}  ← matches NEITHER kudos nor blocks
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, "kudos", "activity1", "users", TARGET_UID), { ts: 1 });
      await setDoc(doc(db, "blocks", OTHER_UID, "users", TARGET_UID), { ts: 2 });
      await setDoc(doc(db, "following", OTHER_UID, "users", TARGET_UID), { ts: 3 });
    });

    const adminDb = (await env.authenticatedContext(ACTOR_UID).firestore());
    const q = query(collectionGroup(adminDb, "users"), where(documentId(), "==", TARGET_UID));
    // Rules block reads from non-owners on kudos/blocks/following users — so
    // this raw query MAY fail at rule-evaluation time. The executor uses Admin
    // SDK which bypasses rules; here we verify the query SHAPE works against
    // emulator. We rerun with rules disabled to mimic the executor.
    let snap;
    try {
      snap = await getDocs(q);
    } catch {
      snap = await env.withSecurityRulesDisabled(async (ctx) => {
        return getDocs(query(collectionGroup(ctx.firestore(), "users"), where(documentId(), "==", TARGET_UID)));
      });
    }
    const paths = snap.docs.map((d) => d.ref.path);
    expect(paths.length).toBe(3);

    // Apply pathFilter discrimination in-process (as the executor will):
    const kudosOnly = paths.filter((p) => matchesPathFilter("kudos/*/users", p));
    const blocksOnly = paths.filter((p) => matchesPathFilter("blocks/*/users", p));
    const followingOnly = paths.filter((p) => matchesPathFilter("following/*/users", p));

    expect(kudosOnly).toEqual([`kudos/activity1/users/${TARGET_UID}`]);
    expect(blocksOnly).toEqual([`blocks/${OTHER_UID}/users/${TARGET_UID}`]);
    expect(followingOnly).toEqual([`following/${OTHER_UID}/users/${TARGET_UID}`]);
  });

  it("collectionGroup('members') + documentId == uid (crewMemberships)", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, "groups", "crewA", "members", TARGET_UID), { displayName: "X" });
      await setDoc(doc(db, "groups", "crewB", "members", TARGET_UID), { displayName: "X" });
      // Decoy: a 'members' subcollection under a different parent shape
      // should NOT match the pathFilter. Firestore won't have such a
      // collection in production, but the test confirms the filter
      // rejects it.
      await setDoc(doc(db, "decoy", "x", "members", TARGET_UID), { x: 1 });
    });
    const snap = await env.withSecurityRulesDisabled(async (ctx) => {
      return getDocs(query(collectionGroup(ctx.firestore(), "members"), where(documentId(), "==", TARGET_UID)));
    });
    const paths = snap.docs.map((d) => d.ref.path);
    expect(paths.length).toBe(3);
    const filtered = paths.filter((p) => matchesPathFilter("groups/*/members", p));
    expect(filtered.sort()).toEqual([
      `groups/crewA/members/${TARGET_UID}`,
      `groups/crewB/members/${TARGET_UID}`,
    ]);
  });

  it("collectionGroup('items') + where(authorId == uid) + pathFilter (feedFanout)", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      // Three fanouts: two feed items by TARGET_UID, one by OTHER_UID
      await setDoc(doc(db, "feeds", "followerA", "items", "a1"), { authorId: TARGET_UID });
      await setDoc(doc(db, "feeds", "followerB", "items", "a2"), { authorId: TARGET_UID });
      await setDoc(doc(db, "feeds", "followerC", "items", "a3"), { authorId: OTHER_UID });
      // Decoy: a comment item authored by TARGET_UID under
      // comments/{activityId}/items — same subcollection NAME 'items'
      // but different parent. Should NOT be cleaned by feedFanout (it's
      // covered by commentsAuthoredByMe instead).
      await setDoc(doc(db, "comments", "actX", "items", "c1"), { authorId: TARGET_UID });
    });
    const snap = await env.withSecurityRulesDisabled(async (ctx) => {
      return getDocs(
        query(collectionGroup(ctx.firestore(), "items"), where("authorId", "==", TARGET_UID)),
      );
    });
    const paths = snap.docs.map((d) => d.ref.path);
    // Raw query returns BOTH feed items AND comment items by TARGET_UID.
    expect(paths.length).toBe(3);
    // pathFilter "feeds/*/items" discriminates feed-only:
    const feedsOnly = paths.filter((p) => matchesPathFilter("feeds/*/items", p));
    expect(feedsOnly.length).toBe(2);
    expect(feedsOnly.every((p) => p.startsWith("feeds/"))).toBe(true);
    // pathFilter "comments/*/items" picks up the comment fanout:
    const commentsOnly = paths.filter((p) => matchesPathFilter("comments/*/items", p));
    expect(commentsOnly.length).toBe(1);
    expect(commentsOnly[0]).toBe("comments/actX/items/c1");
  });

  it("collectionGroup('participants') + documentId == uid (challengeParticipations)", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, "challenges", "ch1", "participants", TARGET_UID), { progress: 1 });
      await setDoc(doc(db, "challenges", "ch2", "participants", TARGET_UID), { progress: 2 });
    });
    const snap = await env.withSecurityRulesDisabled(async (ctx) => {
      return getDocs(query(collectionGroup(ctx.firestore(), "participants"), where(documentId(), "==", TARGET_UID)));
    });
    const filtered = snap.docs
      .map((d) => d.ref.path)
      .filter((p) => matchesPathFilter("challenges/*/participants", p));
    expect(filtered.sort()).toEqual([
      `challenges/ch1/participants/${TARGET_UID}`,
      `challenges/ch2/participants/${TARGET_UID}`,
    ]);
  });
});
