/**
 * Firestore rules unit tests — Goal Spaces, and the server-only ledgers.
 *
 * These blocks were the largest untested region left in `firestore.rules`.
 * Enumerating every `match` against the three existing rules specs left ten
 * blocks whose collection appeared in no test at all, including the ones
 * guarding money and moderation: `scanUsage` (the Gemini scan quota),
 * `trialLedger` (the anti-trial-farming tombstone), `globalRestrictedUids`,
 * and `goalSpaceInvites` (the bearer index a client read would let anyone
 * enumerate).
 *
 * Every one of them is currently correct. That is the point: the project
 * already settled this question when it closed the PR #818 row — a rule
 * whose comment describes an attack, with nothing executing it, "is a
 * comment". These are the rules where a later loosening is both
 * catastrophic and silent, so they get executed.
 *
 * The goal-space EVENT create rule carries five separate security clauses —
 * member gate, uid binding, a closed `kind` enum that deliberately excludes
 * the server-owned `weekly_check_in`, a `hasOnly` field allowlist keeping
 * `weeklyFocus`/`supporterIds` server-written, and a 200-char text cap.
 * Each is asserted against its own rejection, alongside an acceptance so
 * that "deny everything" cannot pass this file.
 *
 * Same emulator-gated harness as the sibling specs. The projectId is
 * distinct on purpose: vitest runs these files in parallel workers against
 * one emulator, and a shared projectId means one file's clearFirestore()
 * wipes another's seeds mid-test.
 */
import { describe, it, beforeAll, afterAll, beforeEach } from "vitest";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const REQUIRE_EMULATOR = process.env.REQUIRE_FIRESTORE_EMULATOR === "1";
if (REQUIRE_EMULATOR && !EMULATOR_HOST) {
  throw new Error(
    "FIRESTORE_EMULATOR_HOST is required when REQUIRE_FIRESTORE_EMULATOR=1."
  );
}
const suite = EMULATOR_HOST ? describe : describe.skip;

const MEMBER = "gs-member-uid";
const OTHER = "gs-other-uid";
const SPACE = "gs-space-1";
const PROJECT_ID = "tropos-goalspaces-rules-test";

suite("firestore.rules — goal spaces and server-only ledgers", () => {
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
    // Membership is Admin-SDK-written (joinGoalSpace); seeded directly.
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), "goalSpaces", SPACE, "members", MEMBER),
        { uid: MEMBER, joinedAt: serverTimestamp() }
      );
      await setDoc(doc(ctx.firestore(), "goalSpaces", SPACE), {
        name: "Test space",
      });
    });
  });

  const asMember = () => env.authenticatedContext(MEMBER).firestore();
  const asOther = () => env.authenticatedContext(OTHER).firestore();

  /** The minimal event a member is allowed to write. */
  const validEvent = (overrides: Record<string, unknown> = {}) => ({
    id: "e1",
    uid: MEMBER,
    kind: "session_completed",
    createdAt: serverTimestamp(),
    ...overrides,
  });

  const eventRef = (db: ReturnType<typeof asMember>, id = "e1") =>
    doc(db, "goalSpaces", SPACE, "events", id);

  describe("space and member documents", () => {
    it("lets a member read the space and its roster", async () => {
      const db = asMember();
      await assertSucceeds(getDoc(doc(db, "goalSpaces", SPACE)));
      await assertSucceeds(
        getDoc(doc(db, "goalSpaces", SPACE, "members", MEMBER))
      );
    });

    it("refuses a non-member — membership is the whole gate", async () => {
      const db = asOther();
      await assertFails(getDoc(doc(db, "goalSpaces", SPACE)));
      await assertFails(
        getDoc(doc(db, "goalSpaces", SPACE, "members", MEMBER))
      );
    });

    it("refuses a signed-out reader", async () => {
      const db = env.unauthenticatedContext().firestore();
      await assertFails(getDoc(doc(db, "goalSpaces", SPACE)));
    });

    it("lets nobody write the space, member or not", async () => {
      /* Spaces are created and mutated only by the callables. A member
         with write access could rename the space or edit its focus. */
      await assertFails(
        setDoc(doc(asMember(), "goalSpaces", SPACE), { name: "hijacked" })
      );
      await assertFails(
        setDoc(doc(asOther(), "goalSpaces", "brand-new"), { name: "mine" })
      );
    });

    it("stops a user adding themselves to the roster", async () => {
      /* The join flow is a callable. If members were self-writable, the
         membership gate above would protect nothing — anyone could write
         their own member doc and then read the space. */
      await assertFails(
        setDoc(doc(asOther(), "goalSpaces", SPACE, "members", OTHER), {
          uid: OTHER,
        })
      );
    });
  });

  describe("events — the client-creatable subset", () => {
    it("accepts a member's own event of an allowed kind", async () => {
      await assertSucceeds(setDoc(eventRef(asMember()), validEvent()));
    });

    it("accepts every kind the rule lists, and no others", async () => {
      /* Enumerated rather than sampled: the list is the contract, and a
         kind quietly dropped from it would silently stop a feature. */
      const db = asMember();
      for (const kind of [
        "joined",
        "session_completed",
        "milestone",
        "needs_support",
        "routine_shared",
      ]) {
        await assertSucceeds(
          setDoc(eventRef(db, `ok-${kind}`), validEvent({ kind }))
        );
      }
      for (const kind of ["weekly_check_in", "admin", "arbitrary"]) {
        await assertFails(
          setDoc(eventRef(db, `no-${kind}`), validEvent({ kind }))
        );
      }
    });

    it("keeps weekly_check_in server-only", async () => {
      /* Called out separately from the sweep above because it is the one
         with a live server owner: `goalSpaceWeeklyCheckIn` writes a
         deterministic ${uid}_${weekKey} id, and a client auto-id write
         would bypass both the one-per-week guarantee and the closed
         weeklyFocus enum. */
      await assertFails(
        setDoc(
          eventRef(asMember(), `${MEMBER}_2026-08-10`),
          validEvent({ kind: "weekly_check_in" })
        )
      );
    });

    it("refuses a non-member's event", async () => {
      await assertFails(
        setDoc(eventRef(asOther()), validEvent({ uid: OTHER }))
      );
    });

    it("stops a member posting an event as somebody else", async () => {
      // The uid binding: without it a member could forge another member's
      // activity into the shared feed.
      await assertFails(
        setDoc(eventRef(asMember()), validEvent({ uid: OTHER }))
      );
    });

    it("refuses server-written fields smuggled in by the client", async () => {
      /* `weeklyFocus` and `supporterIds` are server-owned; the `hasOnly`
         allowlist is what keeps them that way. Asserted with the exact
         field names the rule's comment names, plus an arbitrary one. */
      const db = asMember();
      await assertFails(
        setDoc(eventRef(db, "f1"), validEvent({ weeklyFocus: "consistency" }))
      );
      await assertFails(
        setDoc(eventRef(db, "f2"), validEvent({ supporterIds: [OTHER] }))
      );
      await assertFails(
        setDoc(eventRef(db, "f3"), validEvent({ somethingElse: 1 }))
      );
    });

    it("caps text at 200 characters, and accepts exactly 200", async () => {
      // The pair matters: a cap tested only from above could be off by one
      // in the direction that silently rejects legitimate text.
      const db = asMember();
      await assertSucceeds(
        setDoc(eventRef(db, "t200"), validEvent({ text: "x".repeat(200) }))
      );
      await assertFails(
        setDoc(eventRef(db, "t201"), validEvent({ text: "x".repeat(201) }))
      );
    });

    it("refuses text that is not a string", async () => {
      await assertFails(
        setDoc(eventRef(asMember(), "tnum"), validEvent({ text: 42 }))
      );
    });

    it("refuses a member whose account is mid-deletion", async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), "accountDeletionRequests", MEMBER), {
          uid: MEMBER,
          status: "running",
        });
      });
      await assertFails(setDoc(eventRef(asMember(), "frozen"), validEvent()));
    });

    it("makes events append-only", async () => {
      /* No update, no delete — a member cannot retract or rewrite what the
         space has already seen. Seeded past the create rule so the denial
         is about update/delete rather than about creation. */
      await env.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(
          doc(ctx.firestore(), "goalSpaces", SPACE, "events", "seeded"),
          { id: "seeded", uid: MEMBER, kind: "milestone" }
        );
      });
      const db = asMember();
      await assertFails(
        updateDoc(eventRef(db, "seeded"), { kind: "needs_support" })
      );
      await assertFails(deleteDoc(eventRef(db, "seeded")));
    });

    it("lets a member read events and a non-member not", async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(
          doc(ctx.firestore(), "goalSpaces", SPACE, "events", "seeded"),
          { id: "seeded", uid: MEMBER, kind: "milestone" }
        );
      });
      await assertSucceeds(getDoc(eventRef(asMember(), "seeded")));
      await assertFails(getDoc(eventRef(asOther(), "seeded")));
    });
  });

  describe("server-only ledgers", () => {
    beforeEach(async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        await setDoc(doc(db, "scanUsage", MEMBER), { count: 3 });
        await setDoc(doc(db, "trialLedger", MEMBER), { grantedAt: 1 });
        await setDoc(doc(db, "globalRestrictedUids", MEMBER), { at: 1 });
        await setDoc(doc(db, "goalSpaceInvites", "ABC123"), { spaceId: SPACE });
        await setDoc(doc(db, "config", "app"), { minVersion: "1.0.0" });
      });
    });

    it("shows a user their own scan quota and nobody else's", async () => {
      /* The quota indicator reads this. Writes are Admin-SDK only — a
         client write would reset the counter and uncap Gemini spend,
         which is the one bug in this file with a direct cash cost. */
      await assertSucceeds(getDoc(doc(asMember(), "scanUsage", MEMBER)));
      await assertFails(getDoc(doc(asOther(), "scanUsage", MEMBER)));
      await assertFails(
        setDoc(doc(asMember(), "scanUsage", MEMBER), { count: 0 })
      );
    });

    it("hides the trial ledger from its own subject", async () => {
      /* Deliberately stricter than scanUsage: the tombstone outlives
         account deletion so the 7-day trial cannot be re-farmed by
         self-deleting and re-onboarding. The owner has no read either. */
      await assertFails(getDoc(doc(asMember(), "trialLedger", MEMBER)));
      await assertFails(
        setDoc(doc(asMember(), "trialLedger", MEMBER), { grantedAt: 0 })
      );
      await assertFails(deleteDoc(doc(asMember(), "trialLedger", MEMBER)));
    });

    it("lets a restricted user see their own marker but not clear it", async () => {
      // Self-service un-restriction would make the moderation flag
      // decorative.
      await assertSucceeds(
        getDoc(doc(asMember(), "globalRestrictedUids", MEMBER))
      );
      await assertFails(
        getDoc(doc(asOther(), "globalRestrictedUids", MEMBER))
      );
      await assertFails(
        deleteDoc(doc(asMember(), "globalRestrictedUids", MEMBER))
      );
    });

    it("keeps invite codes unreadable", async () => {
      /* A bearer index: a client read lets anyone enumerate codes and
         walk into private spaces. Denied for members too — knowing one
         space does not entitle you to the code table. */
      await assertFails(getDoc(doc(asMember(), "goalSpaceInvites", "ABC123")));
      await assertFails(
        setDoc(doc(asMember(), "goalSpaceInvites", "NEW999"), {
          spaceId: SPACE,
        })
      );
    });

    it("serves config to signed-in clients, read-only", async () => {
      await assertSucceeds(getDoc(doc(asMember(), "config", "app")));
      await assertFails(
        setDoc(doc(asMember(), "config", "app"), { minVersion: "99.0.0" })
      );
      await assertFails(
        getDoc(doc(env.unauthenticatedContext().firestore(), "config", "app"))
      );
    });
  });
});
