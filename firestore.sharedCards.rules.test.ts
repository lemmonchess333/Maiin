/**
 * A shared card's stored copy (Soc17 call 1), against the real rules
 * engine.
 *
 * `sharedCards/{token}` is the card a link opens: its figures and words,
 * the owner's uid and their invite code. Only the `sharedCard` callable
 * writes it and only `sharedCardPage` reads it, both with the Admin SDK
 * (functions/lib/sharedCards.js). No client reads it, the owner included,
 * or a token would name its sharer's account and a list would hand out
 * every card; no client writes it, or anyone could put words on
 * troposfit.com under someone else's name.
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

const PROJECT_ID = "tropos-shared-cards-rules-test";
const ANA = "cards-ana";
const BEN = "cards-ben";
const TOKEN = "AbCdEfGhIjKlMnOpQrStUv";
const COPY = {
  ownerUid: ANA,
  workoutId: "w1",
  card: { template: "lift", format: "story", totalVolumeKg: 7470 },
  inviteCode: "K7P49M2H",
  createdAt: 1,
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

const db = (uid: string): Firestore =>
  env.authenticatedContext(uid).firestore() as unknown as Firestore;
const anon = (): Firestore =>
  env.unauthenticatedContext().firestore() as unknown as Firestore;

suite("sharedCards/{token}", () => {
  beforeEach(async () => {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "sharedCards", TOKEN), COPY);
    });
  });

  it("the owner, anyone else and a signed-out visitor are all denied a read", async () => {
    for (const as of [db(ANA), db(BEN), anon()]) {
      await assertFails(getDoc(doc(as, "sharedCards", TOKEN)));
    }
  });

  it("nobody lists them, not even their own", async () => {
    await assertFails(
      getDocs(
        query(collection(db(ANA), "sharedCards"), where("ownerUid", "==", ANA))
      )
    );
    await assertFails(getDocs(collection(anon(), "sharedCards")));
  });

  it("no client writes one, its owner included", async () => {
    await assertFails(
      setDoc(doc(db(ANA), "sharedCards", "zYxWvUtSrQpOnMlKjIhGfE"), COPY)
    );
    await assertFails(
      setDoc(doc(db(BEN), "sharedCards", "zYxWvUtSrQpOnMlKjIhGfE"), {
        ...COPY,
        ownerUid: BEN,
      })
    );
    await assertFails(
      updateDoc(doc(db(ANA), "sharedCards", TOKEN), {
        "card.headline": "words",
      })
    );
    await assertFails(
      updateDoc(doc(db(BEN), "sharedCards", TOKEN), { ownerUid: BEN })
    );
    await assertFails(setDoc(doc(anon(), "sharedCards", TOKEN), COPY));
  });

  it("no client deletes one: the sheet's callable takes a copy back", async () => {
    await assertFails(deleteDoc(doc(db(ANA), "sharedCards", TOKEN)));
    await assertFails(deleteDoc(doc(db(BEN), "sharedCards", TOKEN)));
  });
});
