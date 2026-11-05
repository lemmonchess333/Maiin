/**
 * Invites that carry who sent them (lib/inviteCodes.js), against an
 * in-memory Firestore with real paths and transactions.
 *
 * What these hold: a person gets one code, the same one each time; a new
 * account that uses it follows the inviter and is followed back, all four
 * edges marked `fromInvite`, whatever approveFollowers says, with any
 * request between the two removed and `invitedAt` stamped; and each check
 * refuses on its own, writing nothing: an unknown or malformed code, the
 * caller's own, a second invite, an account past its first 14 days, a
 * block either way, a restricted or deleting inviter (all three read as an
 * unknown code), a restricted caller, and the inviter's daily cap. The
 * signed-out lookup gives a first name and nothing else.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");
const {
  INVITE_CODE_ALPHABET,
  INVITE_CODE_LENGTH,
  INVITE_WINDOW_DAYS,
  INVITER_DAILY_REDEMPTIONS,
  INVITE_REFUSALS,
  InviteError,
  normaliseInviteCode,
  makeInviteCode,
  isWithinInviteWindow,
  firstNameOf,
  lookupKey,
  getOrCreateInviteCode,
  redeemInvite,
  lookupInviter,
} = require("../lib/inviteCodes");

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 4, 12);
const STAMP = { stamp: "server time" };
const CODE = "K7P49M2H";

/** Maya has a code; Sam is new and has finished setup. */
function world(extra = {}) {
  return memoryFirestore({
    "users/maya": { displayName: "Maya Patel", inviteCode: CODE },
    "users/maya/public/profile": { displayName: "Maya Patel" },
    [`inviteCodes/${CODE}`]: { uid: "maya", createdAt: 1 },
    "users/sam": { displayName: "Sam" },
    "users/sam/public/profile": { displayName: "Sam" },
    ...extra,
  });
}

const redeem = (firestore, opts = {}) =>
  redeemInvite({
    firestore,
    uid: "sam",
    code: CODE,
    nowMs: NOW,
    accountCreatedAtMs: NOW - 2 * DAY,
    serverTimestamp: STAMP,
    ...opts,
  });

/** The refusal's reason, or null when it did not refuse. */
async function reason(promise) {
  try {
    await promise;
    return null;
  } catch (err) {
    if (err instanceof InviteError) {
      expect(INVITE_REFUSALS).toContain(err.reason);
      return err.reason;
    }
    return err.code;
  }
}

const EDGES = [
  "following/sam/users/maya",
  "followers/maya/users/sam",
  "following/maya/users/sam",
  "followers/sam/users/maya",
];

describe("the code itself", () => {
  it("has no character that reads as another", () => {
    for (const ch of "0O1IL")
      expect(INVITE_CODE_ALPHABET.includes(ch), ch).toBe(false);
    expect(INVITE_CODE_LENGTH).toBe(8);
  });

  it("reads what a person types: case, spaces and a dash", () => {
    expect(normaliseInviteCode("k7p4-9m2h")).toBe(CODE);
    expect(normaliseInviteCode(" K7P4 9M2H ")).toBe(CODE);
    expect(normaliseInviteCode("K7P49M2")).toBeNull();
    expect(normaliseInviteCode("K7P49M2HX")).toBeNull();
    expect(normaliseInviteCode("K7P49M2O")).toBeNull();
    expect(normaliseInviteCode("../users")).toBeNull();
    expect(normaliseInviteCode(12345678)).toBeNull();
    expect(normaliseInviteCode("x".repeat(40))).toBeNull();
  });

  it("makes codes from the alphabet only", () => {
    for (let i = 0; i < 50; i++) {
      const code = makeInviteCode();
      expect(normaliseInviteCode(code)).toBe(code);
    }
  });

  it("is open for the first 14 days of an account", () => {
    expect(INVITE_WINDOW_DAYS).toBe(14);
    expect(isWithinInviteWindow(NOW - 14 * DAY, NOW)).toBe(true);
    expect(isWithinInviteWindow(NOW - 14 * DAY - 1, NOW)).toBe(false);
    expect(isWithinInviteWindow(Number.NaN, NOW)).toBe(false);
  });

  it("keys the signed-out lookup on a hash, never the address", () => {
    const key = lookupKey("203.0.113.7");
    expect(key).toMatch(/^invitelookup_[0-9a-f]{32}$/);
    expect(key).not.toContain("203");
    expect(lookupKey("203.0.113.7")).toBe(key);
    expect(lookupKey("203.0.113.8")).not.toBe(key);
  });

  it("takes the first word of a public name", () => {
    expect(firstNameOf("  Maya Patel ")).toBe("Maya");
    expect(firstNameOf("")).toBeNull();
    expect(firstNameOf(null)).toBeNull();
  });
});

describe("getOrCreateInviteCode", () => {
  it("makes one code, stored for the server and copied to the owner", async () => {
    const firestore = world();
    const codes = ["A2B3C4D5"];
    const got = await getOrCreateInviteCode({
      firestore,
      uid: "sam",
      createdAt: STAMP,
      makeCode: () => codes.shift() ?? "Z9Y8X7W6",
    });
    expect(got).toEqual({ code: "A2B3C4D5", created: true });
    expect(firestore.data.get("inviteCodes/A2B3C4D5")).toEqual({
      uid: "sam",
      createdAt: STAMP,
    });
    expect(firestore.data.get("users/sam").inviteCode).toBe("A2B3C4D5");
  });

  it("returns the code a person already has", async () => {
    const firestore = world();
    await expect(
      getOrCreateInviteCode({
        firestore,
        uid: "maya",
        createdAt: STAMP,
        makeCode: () => "A2B3C4D5",
      })
    ).resolves.toEqual({ code: CODE, created: false });
    expect(firestore.data.has("inviteCodes/A2B3C4D5")).toBe(false);
  });

  it("never takes a code someone else holds", async () => {
    const firestore = world();
    const codes = [CODE, "A2B3C4D5"];
    const got = await getOrCreateInviteCode({
      firestore,
      uid: "sam",
      createdAt: STAMP,
      makeCode: () => codes.shift() ?? "Z9Y8X7W6",
    });
    expect(got.code).toBe("A2B3C4D5");
    expect(firestore.data.get(`inviteCodes/${CODE}`).uid).toBe("maya");
  });

  it("refuses an account being deleted, and one with no setup", async () => {
    const deleting = world({
      "accountDeletionRequests/sam": { status: "running" },
    });
    expect(
      await reason(
        getOrCreateInviteCode({
          firestore: deleting,
          uid: "sam",
          createdAt: STAMP,
        })
      )
    ).toBe("account-unavailable");
    expect(
      await reason(
        getOrCreateInviteCode({
          firestore: world(),
          uid: "nobody",
          createdAt: STAMP,
        })
      )
    ).toBe("setup-unfinished");
  });
});

describe("redeemInvite — joining from an invite", () => {
  it("follows both ways at once, marked as from the invite", async () => {
    const firestore = world();
    await expect(redeem(firestore)).resolves.toEqual({
      inviterUid: "maya",
      alreadyJoined: false,
    });
    for (const path of EDGES)
      expect(firestore.data.get(path), path).toEqual({
        followedAt: STAMP,
        fromInvite: true,
      });
    expect(firestore.data.get("users/sam").invitedAt).toBe(STAMP);
    expect(firestore.data.get(`inviteCodes/${CODE}`).redemptions).toEqual([
      NOW,
    ]);
  });

  it("counts as accepting, whatever either approves", async () => {
    const firestore = world({
      "users/maya": { inviteCode: CODE, approveFollowers: true },
      "users/sam": { approveFollowers: true },
      "followRequests/maya/users/sam": { requestedAt: 1 },
      "followRequests/sam/users/maya": { requestedAt: 1 },
    });
    await redeem(firestore);
    for (const path of EDGES) expect(firestore.data.has(path), path).toBe(true);
    expect(firestore.data.has("followRequests/maya/users/sam")).toBe(false);
    expect(firestore.data.has("followRequests/sam/users/maya")).toBe(false);
  });

  it("keeps a follow that was already there", async () => {
    const firestore = world({
      "following/sam/users/maya": { followedAt: 5 },
      "followers/maya/users/sam": { followedAt: 5 },
    });
    await redeem(firestore);
    expect(firestore.data.get("following/sam/users/maya")).toEqual({
      followedAt: 5,
    });
    expect(firestore.data.get("following/maya/users/sam").fromInvite).toBe(
      true
    );
  });

  it("answers a second call for the same invite as the first, writing nothing", async () => {
    const firestore = world();
    await redeem(firestore);
    const before = firestore.operations.length;
    await expect(redeem(firestore)).resolves.toEqual({
      inviterUid: "maya",
      alreadyJoined: true,
    });
    expect(firestore.operations.length).toBe(before);
  });

  it("reads a typed code as stored", async () => {
    const firestore = world();
    await redeem(firestore, { code: "k7p4-9m2h" });
    expect(firestore.data.has("following/sam/users/maya")).toBe(true);
  });
});

describe("redeemInvite — refusals write nothing", () => {
  async function refused(firestore, opts) {
    const before = [...firestore.data.keys()].sort();
    const why = await reason(redeem(firestore, opts));
    expect([...firestore.data.keys()].sort()).toEqual(before);
    for (const path of EDGES)
      expect(firestore.data.has(path), path).toBe(false);
    return why;
  }

  it("an unknown or malformed code", async () => {
    expect(await refused(world(), { code: "A2B3C4D5" })).toBe("code-not-found");
    expect(await refused(world(), { code: "not a code" })).toBe(
      "code-not-found"
    );
  });

  it("the caller's own code", async () => {
    expect(await refused(world(), { uid: "maya" })).toBe("own-code");
  });

  it("a second invite", async () => {
    const firestore = world({
      "users/sam": { invitedAt: 1 },
      [`inviteCodes/A2B3C4D5`]: { uid: "lee" },
    });
    expect(await refused(firestore)).toBe("already-invited");
  });

  it("an account past its first 14 days", async () => {
    expect(await refused(world(), { accountCreatedAtMs: NOW - 15 * DAY })).toBe(
      "account-not-new"
    );
    expect(await refused(world(), { accountCreatedAtMs: Number.NaN })).toBe(
      "account-not-new"
    );
  });

  it("a block either way, said as an unknown code", async () => {
    expect(
      await refused(world({ "blocks/maya/users/sam": { blockedAt: 1 } }))
    ).toBe("code-not-found");
    expect(
      await refused(world({ "blocks/sam/users/maya": { blockedAt: 1 } }))
    ).toBe("code-not-found");
  });

  it("a restricted or deleting inviter, said as an unknown code", async () => {
    expect(
      await refused(world({ "globalRestrictedUids/maya": { uid: "maya" } }))
    ).toBe("code-not-found");
    expect(
      await refused(
        world({ "accountDeletionRequests/maya": { status: "running" } })
      )
    ).toBe("code-not-found");
  });

  it("a restricted or deleting caller", async () => {
    expect(
      await refused(world({ "globalRestrictedUids/sam": { uid: "sam" } }))
    ).toBe("account-restricted");
    expect(
      await refused(
        world({ "accountDeletionRequests/sam": { status: "running" } })
      )
    ).toBe("account-unavailable");
  });

  it("an account that has not finished setup", async () => {
    expect(await refused(world(), { uid: "newcomer" })).toBe(
      "setup-unfinished"
    );
  });

  it("the inviter's cap for the day, counting only the last 24 hours", async () => {
    const full = Array.from(
      { length: INVITER_DAILY_REDEMPTIONS },
      (_, i) => NOW - i * 60_000
    );
    expect(
      await refused(
        world({ [`inviteCodes/${CODE}`]: { uid: "maya", redemptions: full } })
      )
    ).toBe("invite-limit");

    const yesterday = full.map((t) => t - DAY);
    const firestore = world({
      [`inviteCodes/${CODE}`]: { uid: "maya", redemptions: yesterday },
    });
    await redeem(firestore);
    expect(firestore.data.get(`inviteCodes/${CODE}`).redemptions).toEqual([
      NOW,
    ]);
  });
});

describe("lookupInviter — the signed-out welcome line", () => {
  it("gives the first word of the inviter's public name, and nothing else", async () => {
    await expect(
      lookupInviter({ firestore: world(), code: "k7p4-9m2h" })
    ).resolves.toEqual({ firstName: "Maya" });
  });

  it("gives nothing for an unknown code, or a restricted or deleting inviter", async () => {
    expect(await lookupInviter({ firestore: world(), code: "A2B3C4D5" })).toBe(
      null
    );
    expect(await lookupInviter({ firestore: world(), code: "nope" })).toBe(
      null
    );
    expect(
      await lookupInviter({
        firestore: world({ "globalRestrictedUids/maya": { uid: "maya" } }),
        code: CODE,
      })
    ).toBe(null);
    expect(
      await lookupInviter({
        firestore: world({
          // Dated from the real clock: transactionAccountsLive compares
          // the tombstone's expiresAt with Date.now(), so a date pinned
          // to NOW goes stale (unit-future, and any run a day later).
          "deletedAccounts/maya": {
            deletedAt: Date.now(),
            expiresAt: Date.now() + DAY,
          },
        }),
        code: CODE,
      })
    ).toBe(null);
  });
});
