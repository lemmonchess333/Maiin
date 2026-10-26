/**
 * Follow approval (Polish2 call 4), against the real rules engine.
 *
 * A follow was immediate: any signed-in account could write both edges and
 * at once read followers-only posts, maps included, while followers-only is
 * the default share (S2c). Now an account approves each follower unless its
 * owner turns that off (`approveFollowers: false` on `users/{uid}`; absent
 * means on). A follow to such an account is refused, and the app writes a
 * request instead (`followRequests/{target}/users/{asker}`), seen only by
 * the two people. Only the person asked writes the edges, on accepting, in
 * the batch that removes the request.
 *
 * Run: `npm run test:rules`. Skipped when FIRESTORE_EMULATOR_HOST is unset,
 * a hard failure when CI sets REQUIRE_FIRESTORE_EMULATOR=1. Its own
 * projectId, because the rules suites run in parallel against one emulator
 * (see firestore.partnerBonds.rules.test.ts).
 */
import { describe, it, beforeAll, afterAll, beforeEach } from "vitest";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  Timestamp,
  writeBatch,
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

const PROJECT_ID = "tropos-followrequests-rules-test";
const ALICE = "fr-alice"; // the person followed
const BOB = "fr-bob"; // who asks
const CAROL = "fr-carol"; // neither

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

/** Bob follows Alice the way followUser writes it: two edges, in order. */
const followDirectly = async (as: Firestore) => {
  const followedAt = Timestamp.now();
  await setDoc(doc(as, "following", BOB, "users", ALICE), { followedAt });
  await setDoc(doc(as, "followers", ALICE, "users", BOB), { followedAt });
};

const ask = (as: Firestore) =>
  setDoc(doc(as, "followRequests", ALICE, "users", BOB), {
    requestedAt: serverTimestamp(),
  });

/** Alice accepts as acceptFollowRequest does: one batch. */
const accept = (as: Firestore, requester = BOB) => {
  const batch = writeBatch(as);
  const edge = { followedAt: Timestamp.now(), fromRequest: true };
  batch.set(doc(as, "following", requester, "users", ALICE), edge);
  batch.set(doc(as, "followers", ALICE, "users", requester), edge);
  batch.delete(doc(as, "followRequests", ALICE, "users", requester));
  return batch.commit();
};

suite("firestore.rules — follow approval", () => {
  beforeEach(async () => {
    await env.clearFirestore();
    // Every account exists; none has chosen, so all approve followers.
    for (const uid of [ALICE, BOB, CAROL]) {
      await seed(`users/${uid}`, { displayName: uid });
    }
  });

  describe("a follow to someone who approves followers", () => {
    it("is refused when they never chose (on by default), both edges", async () => {
      await assertFails(
        setDoc(doc(db(BOB), "following", BOB, "users", ALICE), {
          followedAt: Timestamp.now(),
        })
      );
      await assertFails(
        setDoc(doc(db(BOB), "followers", ALICE, "users", BOB), {
          followedAt: Timestamp.now(),
        })
      );
    });

    it("is refused when the choice was cleared (null means none chosen)", async () => {
      await seed(`users/${ALICE}`, { approveFollowers: null });
      await assertFails(followDirectly(db(BOB)));
    });

    it("goes through for someone who turned approval off", async () => {
      // Guards the guard: a rule refusing every follow would pass above.
      await seed(`users/${ALICE}`, { approveFollowers: false });
      await assertSucceeds(followDirectly(db(BOB)));
    });

    it("is refused when they turned it on explicitly", async () => {
      await seed(`users/${ALICE}`, { approveFollowers: true });
      await assertFails(followDirectly(db(BOB)));
    });

    it("cannot claim to be an accepted request", async () => {
      // `fromRequest` makes onFollowerCreated tell the follower they were
      // accepted; only the person asked may write that.
      await seed(`users/${ALICE}`, { approveFollowers: false });
      await assertFails(
        setDoc(doc(db(BOB), "followers", ALICE, "users", BOB), {
          followedAt: Timestamp.now(),
          fromRequest: true,
        })
      );
      await assertSucceeds(followDirectly(db(BOB)));
    });
  });

  describe("a request", () => {
    it("can be made by the asker, with the server's time and nothing else", async () => {
      await assertSucceeds(ask(db(BOB)));
      await env.clearFirestore();
      await assertFails(
        setDoc(doc(db(BOB), "followRequests", ALICE, "users", BOB), {
          requestedAt: Timestamp.fromMillis(0),
        })
      );
      await assertFails(
        setDoc(doc(db(BOB), "followRequests", ALICE, "users", BOB), {
          requestedAt: serverTimestamp(),
          note: "hi",
        })
      );
    });

    it("cannot be made for someone else, or to yourself", async () => {
      await assertFails(
        setDoc(doc(db(CAROL), "followRequests", ALICE, "users", BOB), {
          requestedAt: serverTimestamp(),
        })
      );
      await assertFails(
        setDoc(doc(db(BOB), "followRequests", BOB, "users", BOB), {
          requestedAt: serverTimestamp(),
        })
      );
    });

    it("is refused across a block, either way", async () => {
      await seed(`blocks/${ALICE}/users/${BOB}`, { blockedAt: 1 });
      await assertFails(ask(db(BOB)));
      await env.clearFirestore();
      await seed(`users/${ALICE}`, {});
      await seed(`blocks/${BOB}/users/${ALICE}`, { blockedAt: 1 });
      await assertFails(ask(db(BOB)));
    });

    it("is refused for a restricted account, or while either side is being deleted", async () => {
      await seed(`globalRestrictedUids/${BOB}`, { uid: BOB });
      await assertFails(ask(db(BOB)));
      await env.clearFirestore();
      await seed(`accountDeletionRequests/${ALICE}`, {
        uid: ALICE,
        status: "running",
      });
      await assertFails(ask(db(BOB)));
    });

    it("is read by the two people only", async () => {
      await ask(db(BOB));
      const path = ["followRequests", ALICE, "users", BOB] as const;
      await assertSucceeds(getDoc(doc(db(ALICE), ...path)));
      await assertSucceeds(getDoc(doc(db(BOB), ...path)));
      await assertFails(getDoc(doc(db(CAROL), ...path)));
      // Alice lists her own; nobody lists hers for her.
      await assertSucceeds(
        getDocs(collection(db(ALICE), "followRequests", ALICE, "users"))
      );
      await assertFails(
        getDocs(collection(db(CAROL), "followRequests", ALICE, "users"))
      );
    });

    it("is removed by either of them, and by no one else", async () => {
      const path = ["followRequests", ALICE, "users", BOB] as const;
      await ask(db(BOB));
      await assertFails(deleteDoc(doc(db(CAROL), ...path)));
      await assertSucceeds(deleteDoc(doc(db(BOB), ...path))); // cancel
      await ask(db(BOB));
      await assertSucceeds(deleteDoc(doc(db(ALICE), ...path))); // decline
    });
  });

  describe("accepting", () => {
    it("lets the person asked write both edges and remove the request, in one batch", async () => {
      await ask(db(BOB));
      await assertSucceeds(accept(db(ALICE)));
    });

    it("needs a request: no one is made a follower who never asked", async () => {
      await assertFails(accept(db(ALICE)));
    });

    it("is the person asked alone: the asker cannot accept their own request", async () => {
      await ask(db(BOB));
      await assertFails(followDirectly(db(BOB)));
      // Nor can anyone else accept it for them.
      const carol = db(CAROL);
      const batch = writeBatch(carol);
      batch.set(doc(carol, "followers", ALICE, "users", BOB), {
        followedAt: Timestamp.now(),
      });
      await assertFails(batch.commit());
    });

    it("is refused across a block made after the request", async () => {
      await ask(db(BOB));
      await seed(`blocks/${ALICE}/users/${BOB}`, { blockedAt: 1 });
      await assertFails(accept(db(ALICE)));
    });
  });

  /* Both edges are readable by anyone signed in, and their shape was open:
     a follower could park up to a megabyte on someone else's followers
     list, paid for by every reader of it. An edge holds when it was made
     and, from an accepted request, that it was one. */
  describe("what an edge holds", () => {
    const openToFollows = () =>
      seed(`users/${ALICE}`, { approveFollowers: false });
    const edgeWith = (
      as: Firestore,
      path: "following" | "followers",
      data: Record<string, unknown>
    ) =>
      path === "following"
        ? setDoc(doc(as, "following", BOB, "users", ALICE), data)
        : setDoc(doc(as, "followers", ALICE, "users", BOB), data);

    it.each(["following", "followers"] as const)(
      "a direct %s edge refuses any field beside followedAt",
      async (path) => {
        await openToFollows();
        await assertFails(
          edgeWith(db(BOB), path, {
            followedAt: Timestamp.now(),
            note: "x".repeat(5000),
          })
        );
      }
    );

    it.each(["following", "followers"] as const)(
      "a direct %s edge needs followedAt to be a time",
      async (path) => {
        await openToFollows();
        await assertFails(edgeWith(db(BOB), path, { followedAt: "today" }));
        await assertFails(edgeWith(db(BOB), path, {}));
      }
    );

    it("a direct following edge cannot claim to be an accepted request either", async () => {
      await openToFollows();
      await assertFails(
        edgeWith(db(BOB), "following", {
          followedAt: Timestamp.now(),
          fromRequest: true,
        })
      );
    });

    it("an accepted request's edges refuse any other field", async () => {
      await ask(db(BOB));
      const alice = db(ALICE);
      const batch = writeBatch(alice);
      const edge = {
        followedAt: Timestamp.now(),
        fromRequest: true,
        note: "x",
      };
      batch.set(doc(alice, "following", BOB, "users", ALICE), edge);
      batch.set(doc(alice, "followers", ALICE, "users", BOB), edge);
      batch.delete(doc(alice, "followRequests", ALICE, "users", BOB));
      await assertFails(batch.commit());
      // The app's own shape still goes through.
      await assertSucceeds(accept(alice));
    });
  });
});
