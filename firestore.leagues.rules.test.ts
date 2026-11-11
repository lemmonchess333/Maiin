/**
 * Weekly leagues (Soc15 call 3), against the real rules engine.
 *
 * A league shows a first name, a photo and a week's points to about twenty
 * people who chose to be shown, and to nobody else: a member reads their
 * group and its standings, and someone outside it is refused. Each person
 * reads their own membership and results. The figure the locked card shows
 * is readable by anyone signed in. No client writes any of it, its own
 * included: the server counts the sessions, and a standing a client could
 * write would be a claim.
 *
 * Run: `npm run test:rules`. Skipped when FIRESTORE_EMULATOR_HOST is unset,
 * a hard failure when CI sets REQUIRE_FIRESTORE_EMULATOR=1. Its own
 * projectId, because the rules suites run in parallel against one emulator.
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

const PROJECT_ID = "tropos-leagues-rules-test";
const ALICE = "lg-alice"; // in the group
const BOB = "lg-bob"; // in the group
const CAROL = "lg-carol"; // in another group
const GROUP = "2026-11-09-001";
const WEEK = "2026-11-09";

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
const signedOut = (): Firestore =>
  env.unauthenticatedContext().firestore() as unknown as Firestore;

const seed = (path: string, data: Record<string, unknown>) =>
  env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), data);
  });

const standing = (uid: string) => ({
  uid,
  name: uid,
  tier: "gold",
  points: 75,
  done: 3,
  planned: 4,
  reachedAt: 1,
});

suite("weekly leagues", () => {
  beforeEach(async () => {
    await env.clearFirestore();
    await seed(`leagueGroups/${GROUP}`, {
      weekKey: WEEK,
      tier: "gold",
      memberUids: [ALICE, BOB],
      size: 2,
    });
    await seed(`leagueGroups/${GROUP}/standings/${ALICE}`, standing(ALICE));
    await seed(`leagueGroups/${GROUP}/standings/${BOB}`, standing(BOB));
    await seed("leagueGroups/other-001", {
      weekKey: WEEK,
      tier: "bronze",
      memberUids: [CAROL],
      size: 1,
    });
    await seed(`leagueMembers/${ALICE}`, {
      uid: ALICE,
      tier: "gold",
      groupId: GROUP,
      weekKey: WEEK,
    });
    await seed(`users/${ALICE}/leagueResults/2026-11-02`, {
      weekKey: "2026-11-02",
      tier: "silver",
      newTier: "gold",
      rank: 2,
      of: 18,
      points: 100,
      outcome: "up",
    });
    await seed(`leagueWeeks/${WEEK}`, { formed: { groups: 2 } });
    await seed("leagueStatus/current", {
      joined: 12,
      needed: 10,
      open: true,
      weekKey: WEEK,
    });
  });

  describe("a group and its standings", () => {
    it("a member reads their group, and every standing in it", async () => {
      await assertSucceeds(getDoc(doc(db(ALICE), "leagueGroups", GROUP)));
      await assertSucceeds(
        getDocs(collection(db(ALICE), "leagueGroups", GROUP, "standings"))
      );
      await assertSucceeds(
        getDoc(doc(db(BOB), "leagueGroups", GROUP, "standings", ALICE))
      );
    });

    it("someone outside the group is refused both", async () => {
      await assertFails(getDoc(doc(db(CAROL), "leagueGroups", GROUP)));
      await assertFails(
        getDocs(collection(db(CAROL), "leagueGroups", GROUP, "standings"))
      );
      await assertFails(
        getDoc(doc(db(CAROL), "leagueGroups", GROUP, "standings", ALICE))
      );
    });

    it("someone taken out of the group is refused from then on", async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        await updateDoc(doc(ctx.firestore(), "leagueGroups", GROUP), {
          memberUids: [BOB],
          size: 1,
        });
      });
      await assertFails(
        getDocs(collection(db(ALICE), "leagueGroups", GROUP, "standings"))
      );
    });

    it("signed out, nobody reads them", async () => {
      await assertFails(getDoc(doc(signedOut(), "leagueGroups", GROUP)));
      await assertFails(
        getDoc(doc(signedOut(), "leagueGroups", GROUP, "standings", ALICE))
      );
    });

    it("a query across groups is refused", async () => {
      await assertFails(getDocs(collection(db(ALICE), "leagueGroups")));
    });
  });

  describe("a membership and its results", () => {
    it("the person reads their own", async () => {
      await assertSucceeds(getDoc(doc(db(ALICE), "leagueMembers", ALICE)));
      await assertSucceeds(
        getDocs(collection(db(ALICE), "users", ALICE, "leagueResults"))
      );
    });

    it("nobody else does, a groupmate included", async () => {
      await assertFails(getDoc(doc(db(BOB), "leagueMembers", ALICE)));
      await assertFails(
        getDoc(doc(db(BOB), "users", ALICE, "leagueResults", "2026-11-02"))
      );
    });
  });

  describe("the figure and the turn's markers", () => {
    it("any signed-in person reads the figure; nobody signed out does", async () => {
      await assertSucceeds(getDoc(doc(db(CAROL), "leagueStatus", "current")));
      await assertFails(getDoc(doc(signedOut(), "leagueStatus", "current")));
    });

    it("no client reads the turn's markers", async () => {
      await assertFails(getDoc(doc(db(ALICE), "leagueWeeks", WEEK)));
    });
  });

  describe("no client writes any of it", () => {
    it("not a standing, its own included, and not a group", async () => {
      await assertFails(
        updateDoc(doc(db(ALICE), "leagueGroups", GROUP, "standings", ALICE), {
          points: 100,
        })
      );
      await assertFails(
        setDoc(
          doc(db(ALICE), "leagueGroups", GROUP, "standings", ALICE),
          standing(ALICE)
        )
      );
      await assertFails(
        deleteDoc(doc(db(ALICE), "leagueGroups", GROUP, "standings", BOB))
      );
      await assertFails(
        updateDoc(doc(db(ALICE), "leagueGroups", GROUP), {
          memberUids: [ALICE, BOB, CAROL],
        })
      );
      await assertFails(
        setDoc(doc(db(CAROL), "leagueGroups", "new-001"), {
          weekKey: WEEK,
          memberUids: [CAROL],
        })
      );
    });

    it("not a membership, a result, a marker or the figure", async () => {
      await assertFails(
        updateDoc(doc(db(ALICE), "leagueMembers", ALICE), { tier: "diamond" })
      );
      await assertFails(
        setDoc(doc(db(CAROL), "leagueMembers", CAROL), {
          uid: CAROL,
          tier: "bronze",
        })
      );
      await assertFails(deleteDoc(doc(db(ALICE), "leagueMembers", ALICE)));
      await assertFails(
        setDoc(doc(db(ALICE), "users", ALICE, "leagueResults", WEEK), {
          outcome: "up",
          newTier: "diamond",
        })
      );
      await assertFails(
        setDoc(doc(db(ALICE), "leagueWeeks", WEEK), { formed: null })
      );
      await assertFails(
        setDoc(doc(db(ALICE), "leagueStatus", "current"), {
          joined: 100,
          open: true,
        })
      );
    });

    it("not the opt-in on the profile: only setLeagueSharing writes it", async () => {
      await seed(`users/${CAROL}`, { uid: CAROL, displayName: "Carol" });
      await assertFails(
        updateDoc(doc(db(CAROL), "users", CAROL), { leagueOptIn: true })
      );
    });
  });
});
