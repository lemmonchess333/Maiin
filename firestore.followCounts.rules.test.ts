/**
 * Follow counts, against the real rules engine.
 *
 * `followCounts/{uid}` is how many people follow an account and how many
 * it follows, counted by the server from the two lists
 * (functions/lib/followCounts.js). Anyone signed in reads one, so a
 * profile shows the numbers without reading who; someone the owner has
 * blocked cannot, as with the public profile. Nobody lists them and no
 * client writes one, the owner included: a count is the server's, not a
 * claim.
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

const PROJECT_ID = "tropos-followcounts-rules-test";
const ALICE = "fc-alice"; // whose counts they are
const BOB = "fc-bob"; // someone else
const CAROL = "fc-carol"; // someone Alice has blocked

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

const COUNTS = { followers: 12, following: 7 };
const counts = (as: string) => doc(db(as), "followCounts", ALICE);

suite("followCounts/{uid}", () => {
  beforeEach(async () => {
    await env.clearFirestore();
    await seed(`followCounts/${ALICE}`, COUNTS);
  });

  it("the person reads their own counts", async () => {
    await assertSucceeds(getDoc(counts(ALICE)));
  });

  it("anyone signed in reads them, following or not", async () => {
    await assertSucceeds(getDoc(counts(BOB)));
  });

  it("an account nobody has counted reads as missing, not refused", async () => {
    await assertSucceeds(getDoc(doc(db(BOB), "followCounts", "fc-nobody")));
  });

  it("someone the owner has blocked cannot", async () => {
    await seed(`blocks/${ALICE}/users/${CAROL}`, { blockedAt: 1 });
    await assertFails(getDoc(counts(CAROL)));
  });

  it("the owner still reads the counts of someone who blocked them only one way round", async () => {
    // Alice blocked Carol, so Alice can still see whom she blocked.
    await seed(`blocks/${ALICE}/users/${CAROL}`, { blockedAt: 1 });
    await seed(`followCounts/${CAROL}`, { followers: 1, following: 1 });
    await assertSucceeds(getDoc(doc(db(ALICE), "followCounts", CAROL)));
  });

  it("signed out, nobody reads them", async () => {
    const anon = env
      .unauthenticatedContext()
      .firestore() as unknown as Firestore;
    await assertFails(getDoc(doc(anon, "followCounts", ALICE)));
  });

  it("nobody lists them", async () => {
    await assertFails(getDocs(collection(db(ALICE), "followCounts")));
    await assertFails(getDocs(collection(db(BOB), "followCounts")));
  });

  it("no client writes one, the owner included", async () => {
    await assertFails(setDoc(counts(ALICE), { followers: 9999 }));
    await assertFails(updateDoc(counts(ALICE), { followers: 9999 }));
    await assertFails(deleteDoc(counts(ALICE)));
    await assertFails(
      setDoc(doc(db(BOB), "followCounts", BOB), { followers: 9999 })
    );
    await assertFails(updateDoc(counts(BOB), { following: 0 }));
  });
});
