/**
 * Blocking both ways (Polish3 call 1), against the real rules engine.
 *
 * A block lives at `blocks/{blocker}/users/{blocked}`, read only by the
 * person blocking. Two things here are new:
 *
 * - `blockedBy/{blocked}/users/{blocker}`, the server's copy for the person
 *   blocked, so their app can leave the blocker out. Read by the account it
 *   describes, written by nobody but the server.
 * - A single read of a profile's public projection is refused to someone
 *   its owner blocked, and a single read of a feed post is refused across a
 *   block either way. Queries cannot be checked per document, so they stay
 *   open and the app filters them: the cases below that still succeed are
 *   the queries the app makes, held open on purpose.
 *
 * Run: `npm run test:rules`. Skipped when FIRESTORE_EMULATOR_HOST is unset,
 * a hard failure when CI sets REQUIRE_FIRESTORE_EMULATOR=1. Its own
 * projectId, because the rules suites run in parallel against one emulator
 * (see firestore.partnerBonds.rules.test.ts).
 */
import { describe, it, beforeAll, afterAll, beforeEach, expect } from "vitest";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  Timestamp,
  where,
  type Firestore,
} from "firebase/firestore";
import { readFileSync } from "node:fs";

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
if (process.env.REQUIRE_FIRESTORE_EMULATOR === "1" && !EMULATOR_HOST) {
  throw new Error(
    "FIRESTORE_EMULATOR_HOST is required when REQUIRE_FIRESTORE_EMULATOR=1. " +
      "Start the Firestore emulator before running this test."
  );
}
const suite = EMULATOR_HOST ? describe : describe.skip;

const PROJECT_ID = "tropos-blocks-rules-test";
const ALICE = "bl-alice"; // blocks Bob
const BOB = "bl-bob"; // blocked by Alice
const CAROL = "bl-carol"; // neither

let env: RulesTestEnvironment;

beforeAll(async () => {
  if (!EMULATOR_HOST) return;
  const [host, portStr] = EMULATOR_HOST.split(":");
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

const db = (uid: string): Firestore =>
  env.authenticatedContext(uid).firestore() as unknown as Firestore;

const seed = (path: string, data: Record<string, unknown>) =>
  env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), data);
  });

const profile = (as: Firestore, uid: string) =>
  getDoc(doc(as, "users", uid, "public", "profile"));

const post = (as: Firestore, id: string) => getDoc(doc(as, "activities", id));

/** The search the People tab runs (socialApi.searchUsers). */
const search = (as: Firestore, prefix: string) =>
  getDocs(
    query(
      collectionGroup(as, "public"),
      where("displayNameLower", ">=", prefix),
      where("displayNameLower", "<=", prefix + ""),
      limit(10)
    )
  );

/** Explore (socialApi.getDiscoverFeed). */
const explore = (as: Firestore) =>
  getDocs(
    query(
      collection(as, "activities"),
      where("visibility", "==", "public"),
      orderBy("createdAt", "desc"),
      limit(20)
    )
  );

/** A profile's posts of one kind (useUserProfileData). */
const profilePosts = (as: Firestore, uid: string, visibility: string) =>
  getDocs(
    query(
      collection(as, "activities"),
      where("authorId", "==", uid),
      where("visibility", "==", visibility),
      orderBy("createdAt", "desc"),
      limit(20)
    )
  );

suite("firestore.rules — blocking both ways", () => {
  beforeEach(async () => {
    await env.clearFirestore();
    for (const uid of [ALICE, BOB, CAROL]) {
      await seed(`users/${uid}/public/profile`, {
        uid,
        displayName: uid,
        displayNameLower: uid,
      });
    }
    const at = Timestamp.fromMillis(Date.UTC(2026, 9, 20));
    await seed("activities/alice-public", {
      authorId: ALICE,
      visibility: "public",
      type: "run",
      createdAt: at,
    });
    await seed("activities/alice-followers", {
      authorId: ALICE,
      visibility: "followers",
      type: "run",
      createdAt: at,
    });
    await seed("activities/bob-public", {
      authorId: BOB,
      visibility: "public",
      type: "workout",
      createdAt: at,
    });
    await seed(`blocks/${ALICE}/users/${BOB}`, { blockedAt: at });
  });

  describe("blockedBy, the copy for the person blocked", () => {
    beforeEach(async () => {
      await seed(`blockedBy/${BOB}/users/${ALICE}`, {});
    });

    it("is read by the account it describes, one row or all of them", async () => {
      await assertSucceeds(
        getDoc(doc(db(BOB), "blockedBy", BOB, "users", ALICE))
      );
      const rows = await assertSucceeds(
        getDocs(collection(db(BOB), "blockedBy", BOB, "users"))
      );
      expect(rows.docs.map((d) => d.id)).toEqual([ALICE]);
    });

    it("is read by nobody else, the blocker included", async () => {
      for (const as of [ALICE, CAROL]) {
        await assertFails(
          getDoc(doc(db(as), "blockedBy", BOB, "users", ALICE))
        );
        await assertFails(
          getDocs(collection(db(as), "blockedBy", BOB, "users"))
        );
      }
    });

    it("is written by nobody: not the person blocked, not the blocker", async () => {
      const row = (as: string) => doc(db(as), "blockedBy", BOB, "users", ALICE);
      await assertFails(deleteDoc(row(BOB)));
      await assertFails(setDoc(row(BOB), {}));
      await assertFails(setDoc(row(ALICE), {}));
      await assertFails(
        setDoc(doc(db(BOB), "blockedBy", BOB, "users", CAROL), {})
      );
    });
  });

  describe("a profile's public projection", () => {
    it("is refused, read on its own, to the person its owner blocked", async () => {
      await assertFails(profile(db(BOB), ALICE));
    });

    it("is read by everyone else, its owner and the blocker included", async () => {
      // Guards the guard: a rule refusing every profile read passes above.
      await assertSucceeds(profile(db(CAROL), ALICE));
      await assertSucceeds(profile(db(ALICE), ALICE));
      // The blocker sees whom they blocked, to unblock them.
      await assertSucceeds(profile(db(ALICE), BOB));
    });

    it("is open again once the block is lifted", async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        await deleteDoc(doc(ctx.firestore(), "blocks", ALICE, "users", BOB));
      });
      await assertSucceeds(profile(db(BOB), ALICE));
    });

    it("stays readable to its owner after a block of themselves", async () => {
      await seed(`blocks/${CAROL}/users/${CAROL}`, { blockedAt: 1 });
      await assertSucceeds(profile(db(CAROL), CAROL));
    });

    it("still answers search for the person blocked, which the app filters", async () => {
      const found = await assertSucceeds(search(db(BOB), "bl-a"));
      expect(found.docs.map((d) => d.ref.parent.parent?.id)).toEqual([ALICE]);
    });
  });

  describe("a feed post", () => {
    it("is refused, read on its own, across a block either way", async () => {
      // Alice blocked Bob: Bob cannot read her post, nor she his.
      await assertFails(post(db(BOB), "alice-public"));
      await assertFails(post(db(ALICE), "bob-public"));
    });

    it("is read on its own by its author and by anyone else", async () => {
      await assertSucceeds(post(db(ALICE), "alice-public"));
      await assertSucceeds(post(db(BOB), "bob-public"));
      await assertSucceeds(post(db(CAROL), "alice-public"));
      await assertSucceeds(post(db(CAROL), "bob-public"));
    });

    it("followers-only, is refused across a block even with a follow left behind", async () => {
      await seed(`followers/${ALICE}/users/${BOB}`, { followedAt: 1 });
      await seed(`followers/${ALICE}/users/${CAROL}`, { followedAt: 1 });
      await assertFails(post(db(BOB), "alice-followers"));
      await assertSucceeds(post(db(CAROL), "alice-followers"));
    });

    it("still answers Explore and a profile's posts, which the app filters", async () => {
      const found = await assertSucceeds(explore(db(BOB)));
      expect(found.docs.map((d) => d.id).sort()).toEqual([
        "alice-public",
        "bob-public",
      ]);
      await assertSucceeds(profilePosts(db(BOB), ALICE, "public"));
      // The author's own profile asks for both kinds at once.
      await assertSucceeds(
        getDocs(
          query(
            collection(db(ALICE), "activities"),
            where("authorId", "==", ALICE),
            where("visibility", "in", ["public", "followers"]),
            orderBy("createdAt", "desc"),
            limit(20)
          )
        )
      );
    });

    it("followers-only, is listed for a follower and refused to anyone else", async () => {
      await seed(`followers/${ALICE}/users/${CAROL}`, { followedAt: 1 });
      await assertSucceeds(profilePosts(db(CAROL), ALICE, "followers"));
      await seed(`followers/${ALICE}/users/${BOB}`, { followedAt: 1 });
      await assertFails(profilePosts(db(BOB), ALICE, "followers"));
    });
  });
});
