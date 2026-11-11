/**
 * `partnerBonds/{bondId}` writes, against the real rules engine.
 *
 * No client creates a bond. Each person holds at most MAX_PARTNERS, and a
 * rule cannot count the bonds someone already has, so a create the rules
 * allowed was a create past the limit: the app checked the count, and a
 * script sending the same document did not have to. The startPartnerStreak
 * callable is the one writer (functions/lib/partnerBonds.js): it counts
 * both people's bonds, the mutual follow, a block either way and both
 * accounts' deletion state in the transaction that creates the bond, and
 * writes the cold initial state itself.
 *
 * So the first case below is the document the app sent when it wrote
 * bonds directly, from a member, with the follows in place and nothing
 * blocking it: accepted by the rules before, refused now. The rest pin
 * what stays: `update` is server-only (the engine's state is written by
 * the Admin SDK), and either member may still end a bond.
 *
 * Reads: a member reads the bond, and either of a pair reads the pair's id
 * before there is a bond and gets nothing back, which is how the app
 * learns to offer one. Nobody else may ask about two other people.
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
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, deleteDoc, updateDoc } from "firebase/firestore";
import { readFileSync } from "node:fs";
import { emptyStreakState } from "./src/features/partnerStreak/streakEngine";

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
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

/** A and B follow each other: the consent a bond stands on. */
async function seedMutualFollow() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    for (const [from, to] of [
      [A, B],
      [B, A],
    ]) {
      await setDoc(doc(ctx.firestore(), `following/${from}/users/${to}`), {
        createdAt: new Date(),
      });
    }
  });
}

beforeEach(async () => {
  await env?.clearFirestore();
  if (env) await seedMutualFollow();
});

const A = "user-a";
const B = "user-b";
const BOND = `${A}__${B}`;

/**
 * The cold bond: `members` sorted, the engine's own `emptyStreakState()`
 * spread in, `createdAt` a date standing in for a server timestamp.
 */
function bondDoc(overrides: Record<string, unknown> = {}) {
  return {
    members: [A, B],
    ...emptyStreakState(),
    createdAt: new Date(),
    ...overrides,
  };
}

async function seedBond() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "partnerBonds", BOND), bondDoc());
  });
}

suite("partnerBonds rules", () => {
  it("refuses the cold bond a member would send, with every precondition met", async () => {
    /* The two follow each other, nobody is blocked or being deleted, the
       id is the pair's sorted one and the state is cold: everything the
       create rule held. What it could not hold is the count, so the
       create is the callable's alone. */
    const a = env.authenticatedContext(A).firestore();
    await assertFails(setDoc(doc(a, "partnerBonds", BOND), bondDoc()));
    const b = env.authenticatedContext(B).firestore();
    await assertFails(setDoc(doc(b, "partnerBonds", BOND), bondDoc()));
  });

  it("refuses a create under any other id, or from someone not in it", async () => {
    const a = env.authenticatedContext(A).firestore();
    await assertFails(setDoc(doc(a, "partnerBonds", "bond-2"), bondDoc()));
    const c = env.authenticatedContext("user-c").firestore();
    await assertFails(setDoc(doc(c, "partnerBonds", BOND), bondDoc()));
  });

  it("refuses any client update — streak state is server-only", async () => {
    await seedBond();
    const a = env.authenticatedContext(A).firestore();
    await assertFails(updateDoc(doc(a, "partnerBonds", BOND), { streak: 99 }));
  });

  it("lets a member read and end their own bond", async () => {
    // The paired positives: the server making bonds must not lock members
    // out of the two things they still do.
    await seedBond();
    const a = env.authenticatedContext(A).firestore();
    await assertSucceeds(getDoc(doc(a, "partnerBonds", BOND)));
    const b = env.authenticatedContext(B).firestore();
    await assertSucceeds(deleteDoc(doc(b, "partnerBonds", BOND)));
  });

  it("refuses a non-member reading or ending someone else's bond", async () => {
    await seedBond();
    const c = env.authenticatedContext("user-c").firestore();
    await assertFails(getDoc(doc(c, "partnerBonds", BOND)));
    await assertFails(deleteDoc(doc(c, "partnerBonds", BOND)));
  });

  it("lets either of the pair read a bond that does not exist yet, as nothing", async () => {
    /* getBond reads the pair's id to learn whether to offer a streak.
       Refused here (the members check errors on a missing document), the
       app settled every pair as not eligible and never offered one. */
    for (const uid of [A, B]) {
      const db = env.authenticatedContext(uid).firestore();
      const snap = await assertSucceeds(getDoc(doc(db, "partnerBonds", BOND)));
      expect(snap.exists()).toBe(false);
    }
  });

  it("refuses anyone else asking whether two other people have a bond", async () => {
    // No existence oracle: user-c learns nothing about A and B's pair,
    // nor about an id that names nobody, or names user-c with no pair.
    const c = env.authenticatedContext("user-c").firestore();
    await assertFails(getDoc(doc(c, "partnerBonds", BOND)));
    await assertFails(getDoc(doc(c, "partnerBonds", "bond-2")));
    await assertFails(getDoc(doc(c, "partnerBonds", "user-c")));
    await assertFails(getDoc(doc(c, "partnerBonds", `${A}__user-c__${B}`)));
    await assertFails(
      getDoc(
        doc(env.unauthenticatedContext().firestore(), "partnerBonds", BOND)
      )
    );
  });

  it("still decides an existing bond by its members, whatever its id says", async () => {
    /* A stored bond is read by the members it holds, as before: a caller
       the id names but the document does not is refused. */
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), "partnerBonds", `${A}__user-c`),
        bondDoc()
      );
    });
    const c = env.authenticatedContext("user-c").firestore();
    await assertFails(getDoc(doc(c, "partnerBonds", `${A}__user-c`)));
    const a = env.authenticatedContext(A).firestore();
    await assertSucceeds(getDoc(doc(a, "partnerBonds", `${A}__user-c`)));
  });
});

describe("partnerBonds create", () => {
  it("the rules leave no client create of a bond", () => {
    /* Runs WITHOUT the emulator, so a plain `npm test` still says so if a
       create rule comes back: one would let a client past the limit the
       callable counts. */
    const rules = readFileSync("firestore.rules", "utf8");
    const start = rules.indexOf("match /partnerBonds/");
    const block = rules.slice(start, rules.indexOf("\n    }", start));
    const creates = block.match(/allow\s+[a-z,\s]*\bcreate\b[^;]*;/g) ?? [];
    expect(creates).toEqual(["allow create: if false;"]);
    expect(block).not.toMatch(/allow\s+[a-z,\s]*\bwrite\b/);
  });
});
