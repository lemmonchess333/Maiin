/**
 * Server-side enforcement of a block.
 *
 * Blocking was client-side suppression only: `blocks/{blocker}/users/{target}`
 * was written and read by the client, and nothing in functions/ consulted it.
 * A blocked user could still kudos and comment — the callable wrote the
 * counter, the sub-doc AND the notification, and the recipient's app then hid
 * the feed row while the tray row and the push had already been delivered.
 *
 * A notification is the part a suppression-on-read model cannot take back,
 * which is why this moved to the server rather than being patched further on
 * the client.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { isBlockedBetween, blockedError } = require("../lib/blockGuard");

/** Minimal Firestore stand-in: a set of existing doc paths. */
function dbWith(paths, opts = {}) {
  const set = new Set(paths);
  /* Mirrors the collection()/doc() chain the guard uses — which is the idiom
     the rest of functions/ uses and the one the other test fakes implement. */
  return {
    collection: (c) => ({
      doc: (blocker) => ({
        collection: (c2) => ({
          doc: (blocked) => {
            const path = `${c}/${blocker}/${c2}/${blocked}`;
            return {
              get: async () => {
                if (opts.throwOn === path) throw new Error("unavailable");
                if (opts.throwAll) throw new Error("unavailable");
                return { exists: set.has(path) };
              },
            };
          },
        }),
      }),
    }),
  };
}

describe("isBlockedBetween", () => {
  it("refuses when the OWNER blocked the actor", async () => {
    // The protection users actually ask for.
    const db = dbWith(["blocks/owner/users/actor"]);
    expect(await isBlockedBetween(db, "owner", "actor")).toBe(true);
  });

  it("refuses when the ACTOR blocked the owner", async () => {
    /* You do not get to keep engaging with someone you blocked. Allowing it
       would also leak the blocker's activity back to them through their own
       kudos. */
    const db = dbWith(["blocks/actor/users/owner"]);
    expect(await isBlockedBetween(db, "owner", "actor")).toBe(true);
  });

  it("allows an ordinary interaction between strangers", async () => {
    // Guards the guard: a predicate that always refused would satisfy both
    // assertions above and silently disable kudos for everyone.
    const db = dbWith([]);
    expect(await isBlockedBetween(db, "owner", "actor")).toBe(false);
  });

  it("ignores an unrelated block between other people", async () => {
    const db = dbWith(["blocks/someone/users/else"]);
    expect(await isBlockedBetween(db, "owner", "actor")).toBe(false);
  });

  it("never treats self-interaction as blocked", async () => {
    // A stale self-block doc must not lock a user out of their own activity.
    const db = dbWith(["blocks/me/users/me"]);
    expect(await isBlockedBetween(db, "me", "me")).toBe(false);
  });

  it("FAILS CLOSED when the block lookup errors", async () => {
    /* The decision that matters most here. A block that stops working when
       Firestore hiccups is not a block. Refusing an interaction is
       recoverable — the user retries; delivering one to someone who blocked
       you is not. */
    const db = dbWith([], { throwAll: true });
    expect(await isBlockedBetween(db, "owner", "actor")).toBe(true);
  });

  it("fails closed even when only ONE of the two lookups errors", async () => {
    // Promise.all rejects on the first failure; the catch must cover it.
    const db = dbWith([], { throwOn: "blocks/actor/users/owner" });
    expect(await isBlockedBetween(db, "owner", "actor")).toBe(true);
  });

  it("returns false rather than throwing on missing or malformed ids", async () => {
    const db = dbWith([]);
    expect(await isBlockedBetween(db, "", "actor")).toBe(false);
    expect(await isBlockedBetween(db, "owner", "")).toBe(false);
    expect(await isBlockedBetween(db, null, "actor")).toBe(false);
    expect(await isBlockedBetween(db, "owner", undefined)).toBe(false);
    expect(await isBlockedBetween(null, "owner", "actor")).toBe(false);
  });
});

describe("blockedError", () => {
  const fakeFunctions = {
    https: {
      HttpsError: class extends Error {
        constructor(code, message) {
          super(message);
          this.code = code;
        }
      },
    },
  };

  it("is permission-denied, and does not confirm the block", () => {
    /* Telling the blocked party "you are blocked" discloses something the
       blocker did not choose to share, and invites them around it.
       `permission-denied` is honest: authenticated, well-formed, not allowed. */
    const err = blockedError(fakeFunctions);
    expect(err.code).toBe("permission-denied");
    expect(err.message).toBe("This content isn't available.");
    expect(err.message.toLowerCase()).not.toContain("block");
  });
});

describe("the interaction callables actually call it", () => {
  /* The guard being correct and the callables invoking it are different
     claims, and this arc has been caught by the second one three times. The
     compute path needs the Admin SDK, so this reads the source — the same
     approach performanceEngine's wiring pins use. */
  const SOURCE = require("node:fs").readFileSync(
    new URL("../index.js", import.meta.url),
    "utf8"
  );

  it("kudos checks the block before any write", () => {
    /* Order matters: the guard must sit BEFORE socialCounters.toggleKudos,
       or the counter, sub-doc and notification have already landed. */
    const guardAt = SOURCE.indexOf("blockGuard.isBlockedBetween");
    const writeAt = SOURCE.indexOf("socialCounters.toggleKudos");
    expect(guardAt).toBeGreaterThan(-1);
    expect(writeAt).toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(writeAt);
  });

  it("comments check the block before any write", () => {
    const writeAt = SOURCE.indexOf("socialCounters.addComment");
    const guardAt = SOURCE.lastIndexOf("blockGuard.isBlockedBetween", writeAt);
    expect(guardAt).toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(writeAt);
  });

  it("throws the shared error rather than an ad-hoc one", () => {
    // A bespoke message here would re-leak what blockedError is careful not
    // to disclose.
    expect(SOURCE).toContain("throw blockGuard.blockedError(functions)");
    expect(
      SOURCE.match(/throw blockGuard\.blockedError\(functions\)/g).length
    ).toBeGreaterThanOrEqual(2);
  });
});
