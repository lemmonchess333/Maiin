/**
 * The friends board (Polish2 call 5), against the real rules engine.
 *
 * `friendsBoard/{uid}` is one person's week (sessions, distance, volume),
 * kept by the server only for someone who said yes. They read it, and so
 * do their followers, who are people they accepted (Polish2 call 4); a
 * blocked pair cannot, either way round, and nobody else can. No client
 * writes it, the person included: the figures are the server's count of
 * their sessions, not a claim.
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
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc,
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

const PROJECT_ID = "tropos-friendsboard-rules-test";
const ALICE = "fb-alice"; // whose week it is
const BOB = "fb-bob"; // follows Alice
const CAROL = "fb-carol"; // does not

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

const WEEK = {
  uid: ALICE,
  weekKey: "2026-10-19",
  sessions: 3,
  lifts: 2,
  runs: 1,
  distanceM: 5000,
  volumeKg: 4200,
};
const board = (as: string) => doc(db(as), "friendsBoard", ALICE);

suite("friendsBoard/{uid}", () => {
  beforeEach(async () => {
    await env.clearFirestore();
    await seed(`friendsBoard/${ALICE}`, WEEK);
    await seed(`followers/${ALICE}/users/${BOB}`, { followedAt: 1 });
    await seed(`following/${BOB}/users/${ALICE}`, { followedAt: 1 });
  });

  it("the person reads their own week", async () => {
    await assertSucceeds(getDoc(board(ALICE)));
  });

  it("a follower reads it", async () => {
    await assertSucceeds(getDoc(board(BOB)));
  });

  it("someone who does not follow them cannot", async () => {
    await assertFails(getDoc(board(CAROL)));
  });

  it("a following edge alone is not a follow: the follower edge is the one they accepted", async () => {
    await seed(`following/${CAROL}/users/${ALICE}`, { followedAt: 1 });
    await assertFails(getDoc(board(CAROL)));
  });

  it("a block either way stops a follower reading it", async () => {
    await seed(`blocks/${ALICE}/users/${BOB}`, { blockedAt: 1 });
    await assertFails(getDoc(board(BOB)));
    await env.clearFirestore();
    await seed(`friendsBoard/${ALICE}`, WEEK);
    await seed(`followers/${ALICE}/users/${BOB}`, { followedAt: 1 });
    await seed(`blocks/${BOB}/users/${ALICE}`, { blockedAt: 1 });
    await assertFails(getDoc(board(BOB)));
  });

  it("signed out, nobody reads it", async () => {
    const anon = env
      .unauthenticatedContext()
      .firestore() as unknown as Firestore;
    await assertFails(getDoc(doc(anon, "friendsBoard", ALICE)));
  });

  it("no client writes it, the person included", async () => {
    await assertFails(setDoc(board(ALICE), { ...WEEK, sessions: 99 }));
    await assertFails(updateDoc(board(ALICE), { sessions: 99 }));
    await assertFails(deleteDoc(board(ALICE)));
    await assertFails(setDoc(doc(db(CAROL), "friendsBoard", CAROL), WEEK));
    await assertFails(updateDoc(board(BOB), { sessions: 0 }));
  });
});
