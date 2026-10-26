/**
 * Starting a partner streak (lib/partnerBonds.js), against an in-memory
 * Firestore with real paths, queries and transactions.
 *
 * What these hold: a bond is made for two people who follow each other,
 * cold, at the pair's id; a pair already bonded gets its bond back
 * whatever the counts; the limit holds for the starter AND the partner,
 * and only their own bonds count toward it; no follow either way, a block
 * either way, an account being deleted and a malformed partner are each
 * refused; and a refusal writes nothing.
 *
 * The emulator test (integration/partnerStreakStart.test.js) holds the
 * callable's own gates and two starts racing for one person's last place.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");
const {
  MAX_PARTNERS,
  PartnerBondError,
  startPartnerBond,
} = require("../lib/partnerBonds");

const CREATED = { stamp: "server time" };

/** Me and Bob, who follow each other, plus anything else seeded. */
function world(extra = {}) {
  return memoryFirestore({
    "following/me/users/bob": { createdAt: 1 },
    "following/bob/users/me": { createdAt: 1 },
    ...extra,
  });
}

/** `count` bonds for `uid`, each with a different partner. */
function bondsFor(uid, count, prefix = "p") {
  const out = {};
  for (let i = 0; i < count; i++) {
    const members = [uid, `${prefix}${i}`].sort();
    out[`partnerBonds/${members.join("__")}`] = { members, streak: 2 };
  }
  return out;
}

const start = (firestore, uid = "me", partnerUid = "bob") =>
  startPartnerBond({ firestore, uid, partnerUid, createdAt: CREATED });

/** The refusal's reason, or null when it did not refuse. */
async function reason(promise) {
  try {
    await promise;
    return null;
  } catch (err) {
    expect(err).toBeInstanceOf(PartnerBondError);
    return err.reason;
  }
}

const bondPaths = (firestore) =>
  [...firestore.data.keys()].filter((p) => p.startsWith("partnerBonds/"));

describe("startPartnerBond — a new bond", () => {
  it("makes a cold bond at the pair's sorted id", async () => {
    const firestore = world();
    await expect(start(firestore)).resolves.toEqual({
      bondId: "bob__me",
      created: true,
    });
    expect(firestore.data.get("partnerBonds/bob__me")).toEqual({
      members: ["bob", "me"],
      streak: 0,
      lastSharedDay: null,
      lastActive: {},
      freezeWeek: {},
      createdAt: CREATED,
    });
  });

  it("gives a pair already bonded its bond back, untouched, even at the limit", async () => {
    const firestore = world({
      ...bondsFor("me", MAX_PARTNERS - 1),
      ...bondsFor("bob", MAX_PARTNERS - 1, "q"),
      "partnerBonds/bob__me": { members: ["bob", "me"], streak: 7 },
    });
    const writes = firestore.operations.length;
    await expect(start(firestore)).resolves.toEqual({
      bondId: "bob__me",
      created: false,
    });
    expect(firestore.operations.length).toBe(writes);
    expect(firestore.data.get("partnerBonds/bob__me").streak).toBe(7);
  });
});

describe("startPartnerBond — the limit", () => {
  it("allows a last place, then refuses the starter past MAX_PARTNERS", async () => {
    const below = world(bondsFor("me", MAX_PARTNERS - 1));
    await expect(start(below)).resolves.toMatchObject({ created: true });

    const full = world(bondsFor("me", MAX_PARTNERS));
    expect(await reason(start(full))).toBe("partner-limit-yours");
    expect(full.data.has("partnerBonds/bob__me")).toBe(false);
    expect(bondPaths(full)).toHaveLength(MAX_PARTNERS);
  });

  it("holds the limit for the partner too", async () => {
    const firestore = world(bondsFor("bob", MAX_PARTNERS, "q"));
    expect(await reason(start(firestore))).toBe("partner-limit-theirs");
    expect(firestore.data.has("partnerBonds/bob__me")).toBe(false);
  });

  it("counts only the two people's own bonds", async () => {
    const firestore = world({
      ...bondsFor("me", MAX_PARTNERS - 1),
      ...bondsFor("someone-else", MAX_PARTNERS + 3, "z"),
    });
    await expect(start(firestore)).resolves.toMatchObject({ created: true });
  });

  it("is refused as a failed precondition", async () => {
    const firestore = world(bondsFor("me", MAX_PARTNERS));
    const err = await start(firestore).catch((e) => e);
    expect(err.code).toBe("failed-precondition");
  });
});

describe("startPartnerBond — consent, blocks and deletion", () => {
  it("refuses unless each follows the other", async () => {
    for (const missing of [
      "following/me/users/bob",
      "following/bob/users/me",
    ]) {
      const firestore = world();
      firestore.data.delete(missing);
      expect(await reason(start(firestore)), missing).toBe(
        "mutual-follow-required"
      );
      expect(bondPaths(firestore)).toEqual([]);
    }
  });

  it("refuses a block either way, and says so without the follow", async () => {
    for (const block of ["blocks/me/users/bob", "blocks/bob/users/me"]) {
      const firestore = world({ [block]: { blockedAt: 1 } });
      const err = await start(firestore).catch((e) => e);
      expect(err.reason, block).toBe("blocked-pair");
      expect(err.code).toBe("permission-denied");
      expect(bondPaths(firestore)).toEqual([]);
    }
  });

  it("refuses when either account is being deleted", async () => {
    for (const uid of ["me", "bob"]) {
      const firestore = world({
        [`accountDeletionRequests/${uid}`]: { status: "running" },
      });
      expect(await reason(start(firestore)), uid).toBe("account-unavailable");
      expect(bondPaths(firestore)).toEqual([]);
    }
  });

  it("refuses a malformed partner, or oneself, before reading anything", async () => {
    for (const partnerUid of [undefined, "", 42, "a/b", "x".repeat(129)]) {
      const firestore = world();
      expect(
        await reason(
          startPartnerBond({ firestore, uid: "me", partnerUid, createdAt: 1 })
        )
      ).toBe("partner-required");
    }
    expect(await reason(start(world(), "me", "me"))).toBe(
      "cannot-partner-self"
    );
  });
});
