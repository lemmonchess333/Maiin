/**
 * A restricted account, against the real rules engine (S4e, STATUS
 * 2026-10-06).
 *
 * A moderator restricts an account from the report queue, which writes
 * `globalRestrictedUids/{uid}`. Until this suite, no rule read that
 * document: a restricted account could still post to the feed and Spaces,
 * follow, join and start a partner streak by writing straight to
 * Firestore, whatever the app showed. `isRestricted()` now refuses every
 * client write that reaches another person; the callables refuse the rest
 * (`functions/lib/restriction.js`).
 *
 * Each refusal is paired with the same write from an account that is not
 * restricted, so a rule that refuses everything cannot pass here. The
 * second half pins what a restriction leaves open: logging, the person's
 * own profile, blocking, and taking things back (unfollowing, leaving,
 * narrowing or deleting a post, ending a partner streak).
 *
 * Run: `npm run test:rules`. Skipped when FIRESTORE_EMULATOR_HOST is unset,
 * a hard failure when CI sets REQUIRE_FIRESTORE_EMULATOR=1. The projectId
 * is this suite's own: the rules suites run in parallel workers against
 * one emulator, and a shared id lets one file's clearFirestore() wipe
 * another's seeds.
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
  type Firestore,
} from "firebase/firestore";
import { emptyStreakState } from "./src/features/partnerStreak/streakEngine";

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
if (process.env.REQUIRE_FIRESTORE_EMULATOR === "1" && !EMULATOR_HOST) {
  throw new Error(
    "FIRESTORE_EMULATOR_HOST is required when REQUIRE_FIRESTORE_EMULATOR=1."
  );
}
const suite = EMULATOR_HOST ? describe : describe.skip;

const PROJECT_ID = "tropos-restriction-rules-test";
const RESTRICTED = "restricted-uid";
const CLEAR = "clear-uid";
const OTHER = "other-uid";
const SPACE = "womens-running";
const CIRCLE = "circle-1";
const CHALLENGE = "weekly-2026-01-01";
/** Public content needs a verified email; both accounts have one, so a
 *  refusal here is the restriction and not the verification gate. */
const VERIFIED = { email_verified: true };

suite("firestore.rules — a restricted account", () => {
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
    await env.withSecurityRulesDisabled(async (ctx) => {
      const admin = ctx.firestore();
      // The document resolveReport writes for a manual restriction.
      await setDoc(doc(admin, "globalRestrictedUids", RESTRICTED), {
        uid: RESTRICTED,
        restrictedAt: serverTimestamp(),
        restrictionEndsAt: null,
        lastActionedReport: "report-1",
        strikes: null,
      });
      // Both accounts already belong to the Space and the Circle, so a
      // post or an event is refused for the restriction alone.
      for (const uid of [RESTRICTED, CLEAR]) {
        await setDoc(doc(admin, `spaces/${SPACE}/members/${uid}`), {
          joinedAt: new Date(),
          displayName: "Member",
          uid,
        });
        await setDoc(doc(admin, `goalSpaces/${CIRCLE}/members/${uid}`), {
          uid,
          joinedAt: serverTimestamp(),
        });
      }
    });
  });

  const db = (uid: string): Firestore =>
    env.authenticatedContext(uid, VERIFIED).firestore() as unknown as Firestore;

  const seed = (path: string, data: Record<string, unknown>) =>
    env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), path), data);
    });

  const activity = (uid: string, visibility: string) => ({
    authorId: uid,
    authorName: "Alex",
    type: "run",
    visibility,
    createdAt: serverTimestamp(),
    kudosCount: 0,
    commentCount: 0,
  });

  const spacePost = (uid: string) => ({
    authorId: uid,
    authorName: "Alex",
    body: "Long run done.",
    likeCount: 0,
    commentCount: 0,
    createdAt: new Date(),
  });

  /**
   * Every write that reaches another person, as the app sends it. Each runs
   * once as the clear account (must succeed) and once as the restricted
   * one (must fail).
   */
  const reaching: Array<{
    name: string;
    write: (uid: string, client: Firestore) => Promise<unknown>;
  }> = [
    {
      name: "a public feed post",
      write: (uid, c) =>
        setDoc(doc(c, "activities", `${uid}-a1`), activity(uid, "public")),
    },
    {
      name: "a followers-only feed post",
      write: (uid, c) =>
        setDoc(doc(c, "activities", `${uid}-a1`), activity(uid, "followers")),
    },
    {
      name: "a Space post",
      write: (uid, c) =>
        setDoc(doc(c, `spaces/${SPACE}/posts/${uid}-p1`), spacePost(uid)),
    },
    {
      name: "joining a Space",
      write: (uid, c) =>
        setDoc(doc(c, `spaces/runners/members/${uid}`), {
          joinedAt: new Date(),
          displayName: "Alex",
          uid,
        }),
    },
    {
      name: "joining a challenge",
      write: (uid, c) =>
        setDoc(doc(c, `challenges/${CHALLENGE}/participants/${uid}`), {
          currentValue: 0,
          tierAchieved: null,
          joinedAt: serverTimestamp(),
        }),
    },
    {
      name: "following someone",
      write: (uid, c) =>
        setDoc(doc(c, `following/${uid}/users/${OTHER}`), {
          createdAt: serverTimestamp(),
        }),
    },
    {
      name: "the follower edge",
      write: (uid, c) =>
        setDoc(doc(c, `followers/${OTHER}/users/${uid}`), {
          createdAt: serverTimestamp(),
        }),
    },
    {
      name: "starting a partner streak",
      write: (uid, c) => {
        const members = [uid, OTHER].sort();
        return setDoc(doc(c, "partnerBonds", members.join("__")), {
          members,
          ...emptyStreakState(),
          createdAt: serverTimestamp(),
        });
      },
    },
    {
      name: "a Circle event",
      write: (uid, c) =>
        setDoc(doc(c, `goalSpaces/${CIRCLE}/events/${uid}-e1`), {
          id: `${uid}-e1`,
          uid,
          kind: "needs_support",
          text: "Struggling this week",
          createdAt: serverTimestamp(),
        }),
    },
  ];

  describe("refuses what reaches another person", () => {
    for (const { name, write } of reaching) {
      it(`${name}: allowed when clear, refused when restricted`, async () => {
        await assertSucceeds(write(CLEAR, db(CLEAR)));
        await assertFails(write(RESTRICTED, db(RESTRICTED)));
      });
    }

    it("editing a Space post", async () => {
      for (const uid of [CLEAR, RESTRICTED]) {
        await seed(`spaces/${SPACE}/posts/${uid}-p1`, spacePost(uid));
      }
      const edit = (uid: string) =>
        updateDoc(doc(db(uid), `spaces/${SPACE}/posts/${uid}-p1`), {
          body: "Edited.",
        });
      await assertSucceeds(edit(CLEAR));
      await assertFails(edit(RESTRICTED));
    });

    it("making a post seen by more people", async () => {
      const widen = async (uid: string, from: string, to: string) => {
        await seed(`activities/${uid}-a1`, activity(uid, from));
        return updateDoc(doc(db(uid), "activities", `${uid}-a1`), {
          visibility: to,
        });
      };
      for (const [from, to] of [
        ["private", "followers"],
        ["private", "public"],
        ["followers", "public"],
      ]) {
        await assertSucceeds(widen(CLEAR, from, to));
        await assertFails(widen(RESTRICTED, from, to));
      }
    });
  });

  describe("leaves the rest open", () => {
    const me = () => db(RESTRICTED);

    it("a private post, and narrowing or deleting a shared one", async () => {
      await assertSucceeds(
        setDoc(doc(me(), "activities", "mine"), activity(RESTRICTED, "private"))
      );
      for (const [from, to] of [
        ["public", "followers"],
        ["public", "private"],
        ["followers", "private"],
      ]) {
        await seed("activities/shared", activity(RESTRICTED, from));
        await assertSucceeds(
          updateDoc(doc(me(), "activities", "shared"), { visibility: to })
        );
      }
      await assertSucceeds(deleteDoc(doc(me(), "activities", "shared")));
    });

    it("deleting their own Space post and leaving the Space", async () => {
      await seed(`spaces/${SPACE}/posts/mine`, spacePost(RESTRICTED));
      await assertSucceeds(deleteDoc(doc(me(), `spaces/${SPACE}/posts/mine`)));
      await assertSucceeds(
        deleteDoc(doc(me(), `spaces/${SPACE}/members/${RESTRICTED}`))
      );
    });

    it("leaving a challenge", async () => {
      await seed(`challenges/${CHALLENGE}/participants/${RESTRICTED}`, {
        currentValue: 0,
        tierAchieved: null,
        joinedAt: new Date(),
      });
      await assertSucceeds(
        deleteDoc(
          doc(me(), `challenges/${CHALLENGE}/participants/${RESTRICTED}`)
        )
      );
    });

    it("unfollowing, from both sides of the edge", async () => {
      await seed(`following/${RESTRICTED}/users/${OTHER}`, { at: 1 });
      await seed(`followers/${OTHER}/users/${RESTRICTED}`, { at: 1 });
      await assertSucceeds(
        deleteDoc(doc(me(), `following/${RESTRICTED}/users/${OTHER}`))
      );
      await assertSucceeds(
        deleteDoc(doc(me(), `followers/${OTHER}/users/${RESTRICTED}`))
      );
    });

    it("ending a partner streak", async () => {
      const members = [RESTRICTED, OTHER].sort();
      const id = members.join("__");
      await seed(`partnerBonds/${id}`, {
        members,
        ...emptyStreakState(),
        createdAt: new Date(),
      });
      await assertSucceeds(deleteDoc(doc(me(), "partnerBonds", id)));
    });

    it("blocking someone", async () => {
      await assertSucceeds(
        setDoc(doc(me(), `blocks/${RESTRICTED}/users/${OTHER}`), {
          blockedAt: serverTimestamp(),
        })
      );
    });

    it("logging, and their own profile", async () => {
      await assertSucceeds(
        setDoc(doc(me(), `users/${RESTRICTED}/workouts/w1`), { name: "Push" })
      );
      await assertSucceeds(
        setDoc(doc(me(), `users/${RESTRICTED}/public/profile`), {
          uid: RESTRICTED,
          displayName: "Alex",
        })
      );
    });

    it("reading their own restriction, and nobody else's", async () => {
      await assertSucceeds(
        getDoc(doc(me(), "globalRestrictedUids", RESTRICTED))
      );
      await assertFails(
        getDoc(doc(db(OTHER), "globalRestrictedUids", RESTRICTED))
      );
      await assertFails(
        deleteDoc(doc(me(), "globalRestrictedUids", RESTRICTED))
      );
    });
  });
});
