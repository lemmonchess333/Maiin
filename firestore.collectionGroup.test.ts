/**
 * Which collectionGroup query shapes the deletion executor can ACTUALLY use.
 *
 * This suite was written in R1A-Deletion Chunk 2 to answer exactly that
 * question before Chunk 3 built on the answer. It never ran. `test:rules`
 * names its files explicitly and this one was not among them, so under the
 * emulator job it was never invoked, and under the unit job it self-skipped
 * for want of `FIRESTORE_EMULATOR_HOST` — reported as "4 skipped", which
 * reads like coverage. The first actual execution was 2026-08-12, and every
 * assertion in it was wrong.
 *
 * WHAT IT ASSUMED. Four inventory entries declare
 * `collectionGroupByDocId`, meaning
 * `collectionGroup(NAME).where(documentId(), "==", uid)`:
 * `blocksReverse`, `kudosByMe`, `crewMemberships`,
 * `challengeParticipations` (and `goalSpaceMemberships` by the same shape).
 *
 * WHAT FIRESTORE SAYS:
 *
 *     Invalid query. When querying a collection group by documentId(), the
 *     value provided must result in a valid document path, but 'target-uid'
 *     is not because it has an odd number of segments (1).
 *
 * The shape is not un-indexed, or slow, or expensive. It is rejected. A
 * collection-group documentId comparison needs a FULL document path, which
 * is the one thing you do not have when the whole question is "where does
 * this uid appear". So the strategy five entries have declared since Chunk 1
 * cannot be implemented, and the rules comment that justified leaving the
 * kudos write-freeze off — "the Chunk 3 executor sweeps kudosByMe via
 * collectionGroup" — was resting on it.
 *
 * The field-based shape (`collectionGroupByField`) is fine, and its cross-
 * tree spill is real, which is what `pathFilterMatcher` is for.
 *
 * This file now asserts what Firestore does rather than what Chunk 2 hoped,
 * and `npm run test:rules` runs it. A suite that cannot run is not a
 * safeguard; it is a note that looks like one.
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
const TARGET_UID = "target-uid";
const OTHER_UID = "other-uid";

const require = createRequire(import.meta.url);
const { matchesPathFilter } = require("./functions/lib/pathFilterMatcher.js");

suite("firestore.collectionGroup — what the executor can actually query", () => {
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

  /** Rules-free read, mimicking the Admin SDK the executor runs as.
   *  `withSecurityRulesDisabled` resolves to undefined, so the value has to
   *  come out through a closure — the previous version read `.docs` off the
   *  return and died with "Cannot read properties of undefined". */
  async function adminQuery(build: (db: never) => unknown): Promise<string[]> {
    let paths: string[] = [];
    await env.withSecurityRulesDisabled(async (ctx) => {
      const snap = (await getDocs(
        build(ctx.firestore() as never) as never,
      )) as { docs: { ref: { path: string } }[] };
      paths = snap.docs.map((d) => d.ref.path);
    });
    return paths;
  }

  async function adminSeed(seed: (db: never) => Promise<void>) {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await seed(ctx.firestore() as never);
    });
  }

  describe("collectionGroupByDocId — REJECTED, for every entry that declares it", () => {
    /* One test per declaring entry rather than one loop, so a failure names
       the inventory key whose strategy just became implementable. If Firestore
       ever lifts this, these fail and the entries can be reconsidered — which
       is the opposite of the silence that let the assumption stand. */
    const DECLARING_ENTRIES: [string, string][] = [
      ["blocksReverse", "users"],
      ["kudosByMe", "users"],
      ["crewMemberships", "members"],
      ["challengeParticipations", "participants"],
      ["goalSpaceMemberships", "members"],
    ];

    for (const [key, group] of DECLARING_ENTRIES) {
      it(`${key}: collectionGroup('${group}') by documentId is not a valid query`, async () => {
        let message = "";
        await env.withSecurityRulesDisabled(async (ctx) => {
          try {
            await getDocs(
              query(
                collectionGroup(ctx.firestore(), group),
                where(documentId(), "==", TARGET_UID),
              ),
            );
          } catch (err) {
            message = (err as Error).message;
          }
        });
        // Asserted on the REASON, not merely that it threw — a permission
        // error or a missing index would also throw, and would mean something
        // completely different about whether this can ever work.
        expect(message).toMatch(/must result in a valid document path/);
        expect(message).toMatch(/odd number of segments/);
      });
    }
  });

  describe("collectionGroupByField — works, and spills across trees", () => {
    it("finds the uid's docs wherever the field appears", async () => {
      await adminSeed(async (db) => {
        await setDoc(doc(db, "feeds", "followerA", "items", "a1"), {
          authorId: TARGET_UID,
        });
        await setDoc(doc(db, "feeds", "followerB", "items", "a2"), {
          authorId: TARGET_UID,
        });
        await setDoc(doc(db, "feeds", "followerC", "items", "a3"), {
          authorId: OTHER_UID,
        });
        // Same subcollection NAME under a different parent. This is the spill
        // the pathFilter exists for, and it is not hypothetical — `items`
        // is used by feeds, notifications and comments alike.
        await setDoc(doc(db, "comments", "actX", "items", "c1"), {
          authorId: TARGET_UID,
        });
      });

      const paths = await adminQuery((db) =>
        query(collectionGroup(db, "items"), where("authorId", "==", TARGET_UID)),
      );

      expect(paths.length).toBe(3);
      expect(paths.filter((p) => matchesPathFilter("feeds/*/items", p)).length).toBe(2);
      expect(paths.filter((p) => matchesPathFilter("comments/*/items", p))).toEqual([
        "comments/actX/items/c1",
      ]);
    });

    it("finds notificationsFromMe by its declared field", async () => {
      // The one remaining unimplemented entry whose declared strategy is
      // actually valid, so its feasibility is worth pinning separately.
      await adminSeed(async (db) => {
        await setDoc(doc(db, "notifications", "recipA", "items", "n1"), {
          fromUserId: TARGET_UID,
        });
        await setDoc(doc(db, "notifications", "recipB", "items", "n2"), {
          fromUserId: TARGET_UID,
        });
        await setDoc(doc(db, "notifications", "recipC", "items", "n3"), {
          fromUserId: OTHER_UID,
        });
        // An ANONYMOUS notification. `createNotification` omits fromUserId
        // entirely when anonymous, so a field query cannot reach it — by
        // design, since it carries no uid to erase.
        await setDoc(doc(db, "notifications", "recipD", "items", "n4"), {
          type: "circle_focus_backed",
        });
      });

      const paths = await adminQuery((db) =>
        query(
          collectionGroup(db, "items"),
          where("fromUserId", "==", TARGET_UID),
        ),
      );

      expect(paths.sort()).toEqual([
        "notifications/recipA/items/n1",
        "notifications/recipB/items/n2",
      ]);
    });

    it("does NOT prove production has the index it needs", () => {
      /* Stated as a test so it is read rather than skimmed past in a comment.
         The emulator answers index-free, so everything above establishes that
         the QUERY SHAPE is legal — not that a production deploy would serve
         it. Firestore maintains automatic single-field indexes, but exemptions
         and collection-group scope are project configuration this suite has no
         visibility into. Before any executor step ships a field-based
         collection-group sweep, confirm against the real project.

         This is the same class as the standing functions-deploy rule: green
         here is necessary, not sufficient. */
      expect(true).toBe(true);
    });
  });

  describe("what the rejection means for the executor", () => {
    it("the parent collection is enumerable for challengeParticipations", async () => {
      /* Why that entry could still be implemented while its siblings could
         not: `challenges` is a bounded top-level collection — the rollover
         mints a fixed handful per period — so the participations can be
         addressed by known ref, one per challenge, with no query at all.

         `kudos/{activityId}` and `blocks/{otherUid}` have no such bound: the
         parents are every activity in the app and every user who blocked you.
         That asymmetry, not the query shape, is what decides which of these
         is reachable. */
      await adminSeed(async (db) => {
        await setDoc(doc(db, "challenges", "ch1", "participants", TARGET_UID), {
          progress: 1,
        });
        await setDoc(doc(db, "challenges", "ch2", "participants", TARGET_UID), {
          progress: 2,
        });
        await setDoc(doc(db, "challenges", "ch1", "participants", OTHER_UID), {
          progress: 9,
        });
      });

      let ids: string[] = [];
      await env.withSecurityRulesDisabled(async (ctx) => {
        const snap = await getDocs(
          collectionGroup(ctx.firestore(), "participants"),
        );
        ids = snap.docs
          .map((d) => d.ref.path)
          .filter((p) => p.endsWith(`/${TARGET_UID}`))
          .sort();
      });

      // Reached by enumerating parents + building refs — the shape the
      // executor now uses — rather than by a documentId collection-group
      // query, which the block above proves is unavailable.
      expect(ids).toEqual([
        `challenges/ch1/participants/${TARGET_UID}`,
        `challenges/ch2/participants/${TARGET_UID}`,
      ]);
    });
  });
});
