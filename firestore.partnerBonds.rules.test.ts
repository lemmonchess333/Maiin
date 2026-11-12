/**
 * What is left of partner bonds, against the real rules engine.
 *
 * `partnerBonds/{bondId}` held a partner streak: a 1:1 bond between two
 * people who follow each other (SOCIAL S3). Partner streaks went on 12
 * November 2026 (Trim1 call 3(b)) and the bond's rule with them, so a
 * bond stored before then is read and written by no one: not either
 * member, not anyone else. The server deletes it with either member's
 * account, and functions/scripts/purgePartnerBondDocs.js deletes the rest.
 *
 * This stays while those documents can still exist, so a rule added later
 * cannot open them by accident.
 *
 * Run: `npm run test:rules`. Skipped when FIRESTORE_EMULATOR_HOST is unset
 * so a plain `npm test` still passes, and a hard failure when CI sets
 * REQUIRE_FIRESTORE_EMULATOR=1 — the same guard its sibling suites use, so
 * the skip can't quietly become the normal case.
 *
 * The projectId is distinct on purpose, per the convention the spaces and
 * goalSpaces suites already document: vitest runs these files in PARALLEL
 * workers against one emulator, so a shared projectId means one file's
 * `clearFirestore()` wipes another's seeds mid-test.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  initializeTestEnvironment,
  assertFails,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, deleteDoc, updateDoc } from "firebase/firestore";
import { readFileSync } from "node:fs";

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
if (process.env.REQUIRE_FIRESTORE_EMULATOR === "1" && !EMULATOR_HOST) {
  throw new Error(
    "FIRESTORE_EMULATOR_HOST is required when REQUIRE_FIRESTORE_EMULATOR=1. " +
      "Start the Firestore emulator before running this test."
  );
}
const suite = EMULATOR_HOST ? describe : describe.skip;

/** Distinct from every sibling suite — see the header. */
const PROJECT_ID = "tropos-partnerbonds-rules-test";

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

const A = "user-a";
const B = "user-b";
// A pair's id was its two uids, sorted and joined.
const BOND = `${A}__${B}`;

/** A bond as the server stored it. */
const bondDoc = () => ({
  members: [A, B],
  streak: 3,
  lastSharedDay: "2026-11-10",
  lastActive: { [A]: "2026-11-10", [B]: "2026-11-10" },
  freezeWeek: {},
});

const db = (uid: string) => env.authenticatedContext(uid).firestore();

suite("partnerBonds/{bondId}, after partner streaks went", () => {
  beforeEach(async () => {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "partnerBonds", BOND), bondDoc());
      // The follows a bond stood on, still in place.
      for (const [from, to] of [
        [A, B],
        [B, A],
      ]) {
        await setDoc(doc(ctx.firestore(), `following/${from}/users/${to}`), {
          followedAt: 1,
        });
        await setDoc(doc(ctx.firestore(), `followers/${to}/users/${from}`), {
          followedAt: 1,
        });
      }
    });
  });

  it("nobody reads a bond left from before: not a member, not anyone else", async () => {
    await assertFails(getDoc(doc(db(A), "partnerBonds", BOND)));
    await assertFails(getDoc(doc(db(B), "partnerBonds", BOND)));
    await assertFails(getDoc(doc(db("user-c"), "partnerBonds", BOND)));
    await assertFails(
      getDoc(
        doc(env.unauthenticatedContext().firestore(), "partnerBonds", BOND)
      )
    );
  });

  it("a pair with no bond cannot ask about one either", async () => {
    await assertFails(getDoc(doc(db(A), "partnerBonds", `${A}__user-c`)));
  });

  it("no client makes, changes or ends a bond, a member included", async () => {
    await assertFails(setDoc(doc(db(A), "partnerBonds", BOND), bondDoc()));
    await assertFails(
      setDoc(doc(db(A), "partnerBonds", `${A}__user-c`), {
        ...bondDoc(),
        members: [A, "user-c"],
      })
    );
    await assertFails(
      updateDoc(doc(db(A), "partnerBonds", BOND), { streak: 99 })
    );
    await assertFails(deleteDoc(doc(db(B), "partnerBonds", BOND)));
  });
});

describe("partnerBonds rule", () => {
  it("the rules have no match for a bond", () => {
    /* Runs WITHOUT the emulator, so a plain `npm test` still says so if a
       rule for bonds comes back. */
    const rules = readFileSync("firestore.rules", "utf8");
    expect(rules).not.toMatch(/match\s+\/partnerBonds\//);
  });
});
