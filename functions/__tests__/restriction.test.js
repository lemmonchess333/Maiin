/**
 * A restricted account, refused on the server (S4e, STATUS 2026-10-06).
 *
 * `resolveReport` with `restrictUser` has written `globalRestrictedUids`
 * since S4e first shipped, and until 2026-10-06 no callable read it: a
 * restricted account could still give props, comment, like, react and use
 * Circles. firestore.rules holds the line for the writes clients make
 * directly (firestore.restriction.rules.test.ts); this file pins the
 * callables' half.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  RESTRICTED_REASON,
  RESTRICTED_MESSAGE,
  isRestricted,
  restrictedError,
  assertNotRestricted,
  refusedAddError,
} = require("../lib/restriction");

/** The one lookup the helper makes: globalRestrictedUids/{uid}. */
function dbWith(restricted, opts = {}) {
  const set = new Set(restricted);
  return {
    collection: (name) => ({
      doc: (uid) => ({
        get: async () => {
          if (opts.throwAll) throw new Error("unavailable");
          return { exists: name === "globalRestrictedUids" && set.has(uid) };
        },
      }),
    }),
  };
}

const fakeFunctions = {
  https: {
    HttpsError: class extends Error {
      constructor(code, message, details) {
        super(message);
        this.code = code;
        this.details = details;
      }
    },
  },
};

describe("isRestricted", () => {
  it("is true for a restricted account and false for anyone else", async () => {
    const db = dbWith(["sam"]);
    expect(await isRestricted(db, "sam")).toBe(true);
    expect(await isRestricted(db, "alex")).toBe(false);
  });

  it("FAILS CLOSED when the lookup errors", async () => {
    /* Refusing a like is recoverable: the person tries again. Delivering a
       comment to the people a moderator meant to protect is not. */
    expect(await isRestricted(dbWith([], { throwAll: true }), "alex")).toBe(
      true
    );
  });

  it("is false rather than throwing on a missing id or database", async () => {
    expect(await isRestricted(dbWith(["sam"]), "")).toBe(false);
    expect(await isRestricted(dbWith(["sam"]), undefined)).toBe(false);
    expect(await isRestricted(null, "sam")).toBe(false);
  });
});

describe("the refusal", () => {
  it("is permission-denied with a reason the app maps to its own words", async () => {
    const err = restrictedError(fakeFunctions);
    expect(err.code).toBe("permission-denied");
    expect(err.details).toEqual({ reason: "account-restricted" });
    expect(err.message).toBe(RESTRICTED_MESSAGE);
    await expect(
      assertNotRestricted(dbWith(["sam"]), "sam", fakeFunctions)
    ).rejects.toMatchObject({ details: { reason: RESTRICTED_REASON } });
    await expect(
      assertNotRestricted(dbWith(["sam"]), "alex", fakeFunctions)
    ).resolves.toBeUndefined();
  });

  it("the toggles' own error carries the reason as its code", () => {
    expect(refusedAddError().code).toBe(RESTRICTED_REASON);
  });
});

describe("the callables actually call it", () => {
  /* The helper being right and the callables calling it are different
     claims (the same pin blockGuard.test.js keeps). The callables need the
     Admin SDK to run, so this reads the source. */
  const SOURCE = require("node:fs").readFileSync(
    new URL("../index.js", import.meta.url),
    "utf8"
  );

  /** One export's source, up to the next top-level export. */
  function exported(name) {
    const start = SOURCE.indexOf(`exports.${name} =`);
    expect(start, `exports.${name} not found`).toBeGreaterThan(-1);
    const end = SOURCE.indexOf("\nexports.", start + 1);
    return SOURCE.slice(start, end === -1 ? undefined : end);
  }

  it.each([
    ["toggleKudosCallable", "socialCounters.toggleKudos("],
    ["toggleSpacePostLikeCallable", "spacePostEngagement.toggleSpacePostLike("],
    [
      "toggleCommentReactionCallable",
      "commentReactions.toggleCommentReaction(",
    ],
  ])(
    "%s reads the restriction first and refuses only an add",
    (name, write) => {
      const body = exported(name);
      const readAt = body.indexOf("restriction.isRestricted(");
      const writeAt = body.indexOf(write);
      expect(readAt).toBeGreaterThan(-1);
      expect(writeAt).toBeGreaterThan(readAt);
      // The toggle is told, so taking one back still works.
      expect(body.slice(writeAt, body.indexOf("})", writeAt))).toContain(
        "refuseAdd"
      );
      // Its refusal reaches the app as the shared error, not "internal".
      expect(body).toContain("throw restriction.restrictedError(functions)");
    }
  );

  it.each([
    ["addCommentCallable", "socialCounters.addComment("],
    ["addSpacePostCommentCallable", "spacePostEngagement.addSpacePostComment("],
  ])("%s refuses before it writes", (name, write) => {
    const body = exported(name);
    const guardAt = body.indexOf("restriction.assertNotRestricted(");
    expect(guardAt).toBeGreaterThan(-1);
    expect(body.indexOf(write)).toBeGreaterThan(guardAt);
  });

  it("Circles refuse starting, joining, checking in and backing, not leaving", () => {
    for (const name of [
      "createGoalSpace",
      "joinGoalSpace",
      "goalSpaceWeeklyCheckIn",
      "backGoalSpaceCheckIn",
    ]) {
      expect(exported(name), name).toContain("reachesOthers: true");
    }
    for (const name of ["leaveGoalSpace", "removeGoalSpaceMember"]) {
      expect(exported(name), name).not.toContain("reachesOthers");
    }
    const gate = SOURCE.slice(
      SOURCE.indexOf("async function goalSpaceCallableGate("),
      SOURCE.indexOf("exports.createGoalSpace =")
    );
    expect(gate).toMatch(
      /if \(reachesOthers\) \{\s*await restriction\.assertNotRestricted\(/
    );
  });

  it("taking things back stays open", () => {
    for (const name of [
      "deleteCommentCallable",
      "deleteSpacePostCommentCallable",
      "createReport",
    ]) {
      expect(exported(name), name).not.toContain("restriction.");
    }
  });
});
