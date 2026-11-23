/**
 * Lift boards (Run30 call 3), against the real rules engine.
 *
 * - `liftBoards/{exerciseId}/lifters/{uid}`: no client reads or writes it,
 *   the lifter's own entry included. The board reaches the app only
 *   through the getLiftBoard callable, which shows an entry to the people
 *   who follow its lifter and nobody else, across no block either way
 *   (functions/__tests__/liftBoards.test.js drives that). So a stranger
 *   reads no one's entry, a follower reads none directly, and nobody can
 *   put a weight on a board.
 * - `users/{uid}/liftEfforts`: no client reads or writes one, its owner's
 *   included; the app reads its own sets from the workouts.
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
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
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

const PROJECT_ID = "tropos-lift-boards-rules-test";
const LIFTER = "lb-lifter";
const FOLLOWER = "lb-follower";
const STRANGER = "lb-stranger";
const BLOCKED = "lb-blocked";
const LIFT = "bench-press";

const ENTRY = {
  uid: LIFTER,
  exerciseId: LIFT,
  effortId: `w1_${LIFT}`,
  workoutId: "w1",
  activityId: "post-w1",
  weightKg: 100,
  reps: 3,
  day: "2026-11-10",
  updatedAtMs: 1,
};
const EFFORT = {
  uid: LIFTER,
  exerciseId: LIFT,
  workoutId: "w1",
  weightKg: 100,
  reps: 3,
  day: "2026-11-10",
  createdAtMs: 1,
};

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

/** A signed-in client with a verified email, as a public write needs. */
const db = (uid: string): Firestore =>
  env
    .authenticatedContext(uid, { email_verified: true })
    .firestore() as unknown as Firestore;
const anon = (): Firestore =>
  env.unauthenticatedContext().firestore() as unknown as Firestore;

const seed = (path: string, data: Record<string, unknown>) =>
  env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), data);
  });

beforeEach(async () => {
  if (!EMULATOR_HOST) return;
  await env.clearFirestore();
  await seed(`liftBoards/${LIFT}/lifters/${LIFTER}`, ENTRY);
  await seed(`users/${LIFTER}/liftEfforts/w1_${LIFT}`, EFFORT);
  // The follower follows the lifter; the lifter has blocked one person.
  await seed(`followers/${LIFTER}/users/${FOLLOWER}`, { followedAt: 1 });
  await seed(`following/${FOLLOWER}/users/${LIFTER}`, { followedAt: 1 });
  await seed(`blocks/${LIFTER}/users/${BLOCKED}`, { blockedAt: 1 });
});

suite("liftBoards/{exerciseId}/lifters/{uid}", () => {
  const entry = (as: Firestore, uid = LIFTER) =>
    doc(as, "liftBoards", LIFT, "lifters", uid);
  const board = (as: Firestore) =>
    collection(as, "liftBoards", LIFT, "lifters");

  it("nobody reads an entry directly: a stranger, a blocked person, a follower, the lifter", async () => {
    for (const as of [
      db(STRANGER),
      db(BLOCKED),
      db(FOLLOWER),
      db(LIFTER),
      anon(),
    ]) {
      await assertFails(getDoc(entry(as)));
      await assertFails(getDocs(board(as)));
    }
    await assertFails(
      getDocs(query(board(db(FOLLOWER)), where("uid", "in", [LIFTER])))
    );
    await assertFails(
      getDocs(
        query(
          collectionGroup(db(FOLLOWER), "lifters"),
          where("uid", "==", LIFTER)
        )
      )
    );
    await assertFails(getDoc(doc(db(FOLLOWER), "liftBoards", LIFT)));
  });

  it("no client writes an entry, the lifter's own included", async () => {
    await assertFails(setDoc(entry(db(LIFTER)), { ...ENTRY, weightKg: 300 }));
    await assertFails(updateDoc(entry(db(LIFTER)), { weightKg: 300 }));
    await assertFails(deleteDoc(entry(db(LIFTER))));
    await assertFails(
      setDoc(entry(db(STRANGER), STRANGER), { ...ENTRY, uid: STRANGER })
    );
    await assertFails(
      setDoc(doc(db(LIFTER), "liftBoards", LIFT), { name: "Bench" })
    );
  });
});

suite("users/{uid}/liftEfforts", () => {
  const path = `users/${LIFTER}/liftEfforts/w1_${LIFT}`;

  it("no client reads one, its owner's included", async () => {
    for (const as of [db(LIFTER), db(FOLLOWER), db(STRANGER), anon()])
      await assertFails(getDoc(doc(as, path)));
    await assertFails(
      getDocs(collection(db(LIFTER), "users", LIFTER, "liftEfforts"))
    );
  });

  it("no client writes one, its owner's included", async () => {
    await assertFails(
      setDoc(doc(db(LIFTER), path), { ...EFFORT, weightKg: 300 })
    );
    await assertFails(deleteDoc(doc(db(LIFTER), path)));
    await assertFails(
      setDoc(doc(db(LIFTER), `users/${LIFTER}/liftEfforts/new`), EFFORT)
    );
  });
});
