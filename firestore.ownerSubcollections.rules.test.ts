/**
 * Firestore rules unit tests — the owner-only user subcollections that had
 * no rules test, the block list, and the server-written space-post children.
 *
 * Every block here is short and reads as obviously right — `allow read: if
 * isOwner(uid)` needs no explanation — which is exactly why none had a test:
 * nothing executed them. A rule no test executes is a comment, and the
 * failure it would miss is silent: a later "helpful" widening of
 * progressPhotos or checkins to `request.auth != null` ships green. What
 * each block INTENDS, asserted:
 *
 *   - owner-writable, owner-readable (progressPhotos, progressCheckins,
 *     privacyZones, checkins, trainingBlocks, journeys,
 *     nutritionCommitments; blocks/{uid}/users): the owner reads and
 *     writes; another signed-in user and an unauthenticated caller can do
 *     neither.
 *   - errors: the owner creates and reads a crash report; nobody else can.
 *   - performance: owner-read; no client writes it, the owner included.
 *   - devices: server-only in both directions, owner included.
 *   - spaces/{id}/posts/{id}/likes and comments: any signed-in user reads;
 *     no client writes — not the liker, not the post's author.
 *
 * Same emulator-gated harness as the sibling specs, with its own projectId
 * so a parallel worker's clearFirestore() cannot wipe these seeds.
 */
import { describe, it, beforeAll, afterAll, beforeEach } from "vitest";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const REQUIRE_EMULATOR = process.env.REQUIRE_FIRESTORE_EMULATOR === "1";
if (REQUIRE_EMULATOR && !EMULATOR_HOST) {
  throw new Error(
    "FIRESTORE_EMULATOR_HOST is required when REQUIRE_FIRESTORE_EMULATOR=1."
  );
}
const suite = EMULATOR_HOST ? describe : describe.skip;

const OWNER = "osc-owner-uid";
const OTHER = "osc-other-uid";
const PROJECT_ID = "tropos-owner-subcollections-rules-test";

suite(
  "firestore.rules — owner subcollections, blocks, space-post children",
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

    const asOwner = () => env.authenticatedContext(OWNER).firestore();
    const asOther = () => env.authenticatedContext(OTHER).firestore();
    const asAnon = () => env.unauthenticatedContext().firestore();

    /** Seed past the rules so a denial is about the read/write under test. */
    const seed = (path: string, data: Record<string, unknown>) =>
      env.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), path), data);
      });

    describe("owner-only subcollections — owner reads and writes, nobody else", () => {
      const OWNER_WRITABLE = [
        "progressPhotos",
        "progressCheckins",
        "privacyZones",
        "checkins",
        "trainingBlocks",
        "journeys",
        "nutritionCommitments",
      ];

      for (const sub of OWNER_WRITABLE) {
        const path = `users/${OWNER}/${sub}/d1`;

        it(`${sub}: the owner creates, reads, updates and deletes`, async () => {
          const ref = doc(asOwner(), path);
          await assertSucceeds(setDoc(ref, { createdAt: 1 }));
          await assertSucceeds(getDoc(ref));
          await assertSucceeds(updateDoc(ref, { createdAt: 2 }));
          await assertSucceeds(deleteDoc(ref));
        });

        it(`${sub}: another signed-in user can neither read nor write`, async () => {
          await seed(path, { createdAt: 1 });
          const ref = doc(asOther(), path);
          await assertFails(getDoc(ref));
          await assertFails(setDoc(ref, { createdAt: 2 }));
          await assertFails(deleteDoc(ref));
        });

        it(`${sub}: an unauthenticated caller can neither read nor write`, async () => {
          await seed(path, { createdAt: 1 });
          const ref = doc(asAnon(), path);
          await assertFails(getDoc(ref));
          await assertFails(setDoc(ref, { createdAt: 2 }));
          await assertFails(deleteDoc(ref));
        });
      }
    });

    describe("users/{uid}/errors — owner creates and reads crash reports", () => {
      // The append-only half (no owner update or delete) is pinned beside the
      // Diagnostics read in firestore.rules.test.ts.
      const path = `users/${OWNER}/errors/e1`;

      it("the owner logs a crash and reads it back", async () => {
        const ref = doc(asOwner(), path);
        await assertSucceeds(setDoc(ref, { message: "boom", createdAt: 1 }));
        await assertSucceeds(getDoc(ref));
      });

      it("nobody else can read, or plant into, another user's crash log", async () => {
        await seed(path, { message: "boom", createdAt: 1 });
        for (const db of [asOther(), asAnon()]) {
          await assertFails(getDoc(doc(db, path)));
          await assertFails(
            setDoc(doc(db, `users/${OWNER}/errors/e2`), {
              message: "planted",
              createdAt: 1,
            })
          );
        }
      });
    });

    describe("users/{uid}/performance — server-written, owner-read", () => {
      const path = `users/${OWNER}/performance/2026-08-31`;

      it("the owner reads a week; another user and an anonymous caller cannot", async () => {
        await seed(path, { performanceIndex: 72 });
        await assertSucceeds(getDoc(doc(asOwner(), path)));
        await assertFails(getDoc(doc(asOther(), path)));
        await assertFails(getDoc(doc(asAnon(), path)));
      });

      it("no client writes it — the owner included", async () => {
        // A writable index would let a user forge the score the rollup owns.
        await seed(path, { performanceIndex: 72 });
        for (const db of [asOwner(), asOther(), asAnon()]) {
          await assertFails(setDoc(doc(db, path), { performanceIndex: 100 }));
          await assertFails(deleteDoc(doc(db, path)));
        }
      });
    });

    describe("users/{uid}/devices — server-only in both directions", () => {
      const path = `users/${OWNER}/devices/token-hash-a`;

      it("owner, another user and an anonymous caller are all denied read and write", async () => {
        await seed(path, { token: "fcm-token" });
        for (const db of [asOwner(), asOther(), asAnon()]) {
          await assertFails(getDoc(doc(db, path)));
          await assertFails(setDoc(doc(db, path), { token: "forged" }));
          await assertFails(deleteDoc(doc(db, path)));
        }
      });
    });

    describe("blocks/{uid}/users/{targetUid}", () => {
      const path = `blocks/${OWNER}/users/${OTHER}`;

      it("the blocker writes, reads and lifts a block", async () => {
        const ref = doc(asOwner(), path);
        await assertSucceeds(setDoc(ref, { blockedAt: 1 }));
        await assertSucceeds(getDoc(ref));
        await assertSucceeds(deleteDoc(ref));
      });

      it("the blocked user cannot see, alter or remove the block against them", async () => {
        // A block must be invisible to its target: a readable list tells a
        // user who blocked them, and a writable one lets them lift it.
        await seed(path, { blockedAt: 1 });
        const ref = doc(asOther(), path);
        await assertFails(getDoc(ref));
        await assertFails(setDoc(ref, { blockedAt: 2 }));
        await assertFails(deleteDoc(ref));
      });

      it("an unauthenticated caller can neither read nor write a block", async () => {
        await seed(path, { blockedAt: 1 });
        const ref = doc(asAnon(), path);
        await assertFails(getDoc(ref));
        await assertFails(setDoc(ref, { blockedAt: 2 }));
        await assertFails(deleteDoc(ref));
      });
    });

    describe("spaces/{id}/posts/{id}/likes and comments — signed-in read, server-only write", () => {
      const post = "spaces/runners/posts/p1";
      const like = `${post}/likes/${OTHER}`;
      const comment = `${post}/comments/c1`;

      beforeEach(async () => {
        await seed(post, {
          authorId: OWNER,
          authorName: "Owner",
          body: "Long run done.",
          likeCount: 1,
          commentCount: 1,
        });
        await seed(like, { createdAt: 1 });
        await seed(comment, { authorId: OTHER, text: "Nice.", createdAt: 1 });
      });

      it("any signed-in user reads a like and a comment; an anonymous caller cannot", async () => {
        for (const db of [asOwner(), asOther()]) {
          await assertSucceeds(getDoc(doc(db, like)));
          await assertSucceeds(getDoc(doc(db, comment)));
        }
        await assertFails(getDoc(doc(asAnon(), like)));
        await assertFails(getDoc(doc(asAnon(), comment)));
      });

      it("no client writes a like — not the liker, not the post's author", async () => {
        // The callable flips the like doc and the post's likeCount in one
        // transaction; a direct write would leave the two disagreeing.
        await assertFails(setDoc(doc(asOther(), like), { createdAt: 2 }));
        await assertFails(deleteDoc(doc(asOther(), like)));
        await assertFails(
          setDoc(doc(asOwner(), `${post}/likes/${OWNER}`), { createdAt: 1 })
        );
        await assertFails(deleteDoc(doc(asOwner(), like)));
      });

      it("no client writes a comment — not its author, not the post's author", async () => {
        await assertFails(
          setDoc(doc(asOther(), `${post}/comments/c2`), {
            authorId: OTHER,
            text: "planted",
            createdAt: 1,
          })
        );
        await assertFails(
          updateDoc(doc(asOther(), comment), { text: "edited" })
        );
        await assertFails(deleteDoc(doc(asOther(), comment)));
        await assertFails(deleteDoc(doc(asOwner(), comment)));
      });
    });
  }
);
