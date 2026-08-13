/**
 * `partnerBonds/{bondId}` writes, against the real rules engine.
 *
 * Why the CREATE shape matters here more than it usually would. `update` is
 * `if false` — the Admin SDK is the sole writer of streak state — so create
 * is the one client-reachable moment, and whatever it stores is what
 * `applyPartnerActivity` picks up. That function reads `lastSharedDay`,
 * `lastActive` and `freezeWeek` straight off the document and feeds them to
 * the engine; it does not re-derive them.
 *
 * The rule pinned `streak == 0` and nothing else, under a client-side
 * comment reading "Cold state (streak 0) — the rules reject any forged
 * head-start". They rejected one forged head-start. A bond created with the
 * PARTNER's `lastActive` already set to today makes the very next real
 * session register as a shared day that never happened, and a pre-filled
 * `freezeWeek` hands out streak freezes.
 *
 * Nothing was holding it: `allow update: if false` is asserted by prose in
 * three module headers, and no test drove this collection at all.
 *
 * Impact is bounded — a bond needs both members, and the number it inflates
 * is their own shared streak — so this is hardening, not an incident. It is
 * the same `hasOnly` guard the public-profile projection already uses, for
 * the same reason: a field the rule doesn't name is one the engine will
 * nonetheless trust.
 *
 * Run: `npm run test:rules`. Skipped when FIRESTORE_EMULATOR_HOST is unset
 * so a plain `npm test` still passes, and a hard failure when CI sets
 * REQUIRE_FIRESTORE_EMULATOR=1 — the same guard its sibling suites use, so
 * the skip can't quietly become the normal case.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, setDoc, deleteDoc, updateDoc } from "firebase/firestore";
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

let env: RulesTestEnvironment;

beforeAll(async () => {
  if (!EMULATOR_HOST) return;
  env = await initializeTestEnvironment({
    projectId: "demo-tropos",
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

beforeEach(async () => {
  await env?.clearFirestore();
});

const A = "user-a";
const B = "user-b";
const BOND = `${A}__${B}`;

/**
 * The exact document `createBond` sends — `members` sorted, the engine's own
 * `emptyStreakState()` spread in, `createdAt` a serverTimestamp (a literal
 * stands in; the rule checks the key, not the type).
 *
 * Built from the REAL `emptyStreakState` rather than a hand-written copy, so
 * adding a field to the engine's state fails HERE — where the rule that has
 * to allow it lives — instead of silently at a user's first bond.
 */
function bondDoc(overrides: Record<string, unknown> = {}) {
  return {
    members: [A, B],
    ...emptyStreakState(),
    createdAt: new Date(),
    ...overrides,
  };
}

suite("partnerBonds rules", () => {
  it("accepts the document createBond actually sends", async () => {
    // The control that keeps every rejection below honest: tighten the rule
    // past what the app sends and this fails first.
    const a = env.authenticatedContext(A).firestore();
    await assertSucceeds(setDoc(doc(a, "partnerBonds", BOND), bondDoc()));
  });

  it("refuses a forged partner head-start in lastActive", async () => {
    /* The gap this suite was written for. `streak: 0` is honest; the
       partner's last-active day is not, and `applyPartnerActivity` trusts
       it — so A's next logged session pairs with a day B never trained. */
    const a = env.authenticatedContext(A).firestore();
    await assertFails(
      setDoc(
        doc(a, "partnerBonds", BOND),
        bondDoc({ lastActive: { [B]: "2026-08-13" } })
      )
    );
  });

  it("refuses a pre-filled freeze ledger", async () => {
    const a = env.authenticatedContext(A).firestore();
    await assertFails(
      setDoc(
        doc(a, "partnerBonds", BOND),
        bondDoc({ freezeWeek: { [A]: "1970-01-05" } })
      )
    );
  });

  it("refuses a forged lastSharedDay", async () => {
    const a = env.authenticatedContext(A).firestore();
    await assertFails(
      setDoc(doc(a, "partnerBonds", BOND), bondDoc({ lastSharedDay: "2026-08-13" }))
    );
  });

  it("refuses an unlisted field the engine might later read", async () => {
    // What `hasOnly` buys beyond the value pins: the shape can't grow.
    const a = env.authenticatedContext(A).firestore();
    await assertFails(
      setDoc(doc(a, "partnerBonds", BOND), bondDoc({ freezesRemaining: 99 }))
    );
  });

  it("still refuses a non-zero streak", async () => {
    // The one pin that already existed — kept, so hardening can't drop it.
    const a = env.authenticatedContext(A).firestore();
    await assertFails(
      setDoc(doc(a, "partnerBonds", BOND), bondDoc({ streak: 40 }))
    );
  });

  it("refuses a bond the author is not a member of", async () => {
    const c = env.authenticatedContext("user-c").firestore();
    await assertFails(setDoc(doc(c, "partnerBonds", BOND), bondDoc()));
  });

  it("refuses any client update — streak state is server-only", async () => {
    /* `allow update: if false` is asserted by prose in three module headers
       and by nothing else. This is the executable version. */
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "partnerBonds", BOND), bondDoc());
    });
    const a = env.authenticatedContext(A).firestore();
    await assertFails(
      updateDoc(doc(a, "partnerBonds", BOND), { streak: 99 })
    );
  });

  it("lets a member read and dissolve their own bond", async () => {
    // The paired positives: hardening create must not lock members out of
    // the two operations they legitimately have.
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "partnerBonds", BOND), bondDoc());
    });
    const b = env.authenticatedContext(B).firestore();
    await assertSucceeds(deleteDoc(doc(b, "partnerBonds", BOND)));
  });

  it("refuses a non-member dissolving someone else's bond", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "partnerBonds", BOND), bondDoc());
    });
    const c = env.authenticatedContext("user-c").firestore();
    await assertFails(deleteDoc(doc(c, "partnerBonds", BOND)));
  });
});

describe("partnerBonds create shape", () => {
  it("the rule's field list matches the engine's state, plus members/createdAt", () => {
    /* Runs WITHOUT the emulator, so a plain `npm test` still catches the
       drift that matters most: adding a field to `emptyStreakState` without
       adding it to `hasOnly` makes every bond creation fail for every user,
       and the suite above would only say so on a machine with the emulator
       up. */
    const rules = readFileSync("firestore.rules", "utf8");
    const block = rules.slice(rules.indexOf("match /partnerBonds/"));
    const listed = (block.match(/hasOnly\(\[([\s\S]*?)\]\)/)?.[1] ?? "")
      .split(",")
      .map((s) => s.trim().replace(/^'|'$/g, ""))
      .filter(Boolean);
    const expected = [
      "members",
      ...Object.keys(emptyStreakState()),
      "createdAt",
    ];
    expect([...listed].sort()).toEqual([...expected].sort());
  });
});
