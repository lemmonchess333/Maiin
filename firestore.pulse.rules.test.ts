/**
 * The live pulse (Soc15), against the real rules engine.
 *
 * `pulse/{dateKey}` is one day's count of sessions across Tropos, kept by
 * the session triggers (functions/lib/pulse.js). It names no one, so any
 * signed-in person reads it; no client writes it, since any client could
 * move it. Each person's credits (`users/{uid}/pulseCredits`) have no rule:
 * nobody reads or writes them from the app, their owner included, or a
 * client could take its own sessions off or put them on twice.
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

const PROJECT_ID = "tropos-pulse-rules-test";
const ANA = "pulse-ana";
const BEN = "pulse-ben";
/** Today's key, from the clock; the rules care about none of its value. */
const dayFrom = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const DAY = dayFrom(0);
const COUNT = { sessions: 14, updatedAt: 1, expiresAt: 2 };
const CREDIT = { kind: "workout", sessionId: "w1", dateKey: DAY };

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

const seed = (path: string, data: Record<string, unknown>) =>
  env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), data);
  });

suite("pulse/{dateKey}", () => {
  beforeEach(async () => {
    await env.clearFirestore();
    await seed(`pulse/${DAY}`, COUNT);
  });

  it("anyone signed in reads a day's count", async () => {
    await assertSucceeds(getDoc(doc(db(ANA), "pulse", DAY)));
    await assertSucceeds(getDoc(doc(db(BEN), "pulse", DAY)));
    // A day nobody has saved a session for reads as no document.
    await assertSucceeds(getDoc(doc(db(ANA), "pulse", dayFrom(-400))));
  });

  it("signed out, nobody reads it", async () => {
    await assertFails(getDoc(doc(anon(), "pulse", DAY)));
  });

  it("no client writes it", async () => {
    const day = doc(db(ANA), "pulse", DAY);
    await assertFails(setDoc(day, { ...COUNT, sessions: 9999 }));
    await assertFails(updateDoc(day, { sessions: 15 }));
    await assertFails(deleteDoc(day));
    await assertFails(setDoc(doc(db(BEN), "pulse", dayFrom(1)), COUNT));
    await assertFails(setDoc(doc(anon(), "pulse", DAY), COUNT));
  });
});

suite("users/{uid}/pulseCredits", () => {
  const path = `users/${ANA}/pulseCredits/workout_w1`;

  beforeEach(async () => {
    await env.clearFirestore();
    await seed(path, CREDIT);
  });

  it("owner, another user and a signed-out caller are all denied read and write", async () => {
    for (const as of [db(ANA), db(BEN), anon()]) {
      await assertFails(getDoc(doc(as, path)));
      await assertFails(setDoc(doc(as, path), { ...CREDIT, dateKey: "x" }));
      await assertFails(deleteDoc(doc(as, path)));
    }
    await assertFails(
      setDoc(doc(db(ANA), `users/${ANA}/pulseCredits/run_r2`), {
        kind: "run",
        sessionId: "r2",
        dateKey: DAY,
      })
    );
  });
});
