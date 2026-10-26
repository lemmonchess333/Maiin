import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * partnerStreakApi — bond lifecycle.
 *
 * Starting a bond is the server's: `createBond` asks the startPartnerStreak
 * callable, which holds the mutual follow, a block either way and the
 * partner limit for both people in one transaction
 * (functions/__tests__/partnerBonds.test.js and its emulator test hold
 * those). So what this file holds for a start is the hand-off: the local
 * identity guards, the callable named with the partner, its bond id
 * returned, a refusal passed through for the card to put into words, and
 * no bond written by the client, which the rules would refuse.
 *
 * Reading a pair's bond and ending it are still the client's, against the
 * one Firestore fake (ADR-0009), with bonds as seeded documents.
 */

const callable = vi.hoisted(() => vi.fn());
vi.mock("firebase/functions", () => ({
  getFunctions: vi.fn(() => ({})),
  httpsCallable: vi.fn(() => callable),
}));
vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({
  db: {},
  auth: { currentUser: { uid: "me" } },
}));

import { httpsCallable } from "firebase/functions";
import { bondId, createBond, dissolveBond, getBond } from "../partnerStreakApi";
import {
  seedFirestore,
  resetFirestore,
  readDoc,
  writeLog,
  allPaths,
} from "@/test/firestoreHarness";

const bondWrites = () =>
  writeLog().filter((w) => w.path.startsWith("partnerBonds/"));

beforeEach(() => {
  resetFirestore();
  vi.clearAllMocks();
  callable.mockResolvedValue({ data: { bondId: "bob__me", created: true } });
});
afterEach(() => {
  resetFirestore();
});

describe("bondId", () => {
  it("is order-independent (same id whoever initiates)", () => {
    expect(bondId("alice", "bob")).toBe(bondId("bob", "alice"));
  });

  it("is deterministic and pair-unique", () => {
    expect(bondId("alice", "bob")).toBe("alice__bob");
    expect(bondId("bob", "alice")).toBe("alice__bob");
  });
});

describe("createBond", () => {
  it("rejects an identity mismatch (me !== authed uid) without asking the server", async () => {
    await expect(createBond("someone-else", "bob")).rejects.toThrow(
      /Identity mismatch/
    );
    expect(callable).not.toHaveBeenCalled();
  });

  it("rejects bonding with yourself without asking the server", async () => {
    await expect(createBond("me", "me")).rejects.toThrow(/yourself/);
    expect(callable).not.toHaveBeenCalled();
  });

  it("asks startPartnerStreak for the partner and returns its bond id", async () => {
    await expect(createBond("me", "bob")).resolves.toBe("bob__me");
    expect(httpsCallable).toHaveBeenCalledWith(
      expect.anything(),
      "startPartnerStreak"
    );
    expect(callable).toHaveBeenCalledWith({ partnerUid: "bob" });
  });

  it("returns the pair's existing bond when the server says it already has one", async () => {
    callable.mockResolvedValue({ data: { bondId: "bob__me", created: false } });
    await expect(createBond("me", "bob")).resolves.toBe("bob__me");
  });

  it("passes a refusal through unchanged, for the card to say why", async () => {
    const refusal = Object.assign(new Error("partner-limit-yours"), {
      code: "functions/failed-precondition",
      details: { reason: "partner-limit-yours" },
    });
    callable.mockRejectedValue(refusal);
    await expect(createBond("me", "bob")).rejects.toBe(refusal);
  });

  it("writes no bond itself: the rules refuse a client create", async () => {
    await createBond("me", "bob");
    expect(bondWrites()).toEqual([]);
  });
});

describe("dissolveBond", () => {
  it("deletes the bond doc by id", async () => {
    seedFirestore({
      "partnerBonds/bob__me": { members: ["bob", "me"], streak: 4 },
    });
    await dissolveBond("bob__me");
    expect(readDoc("partnerBonds/bob__me")).toBeUndefined();
    expect(allPaths()).not.toContain("partnerBonds/bob__me");
  });
});

describe("getBond", () => {
  it("reads the pair's bond as { id, ...data }, whichever way round it is asked", async () => {
    seedFirestore({
      "partnerBonds/bob__me": { members: ["bob", "me"], streak: 4 },
    });
    const bond = { id: "bob__me", members: ["bob", "me"], streak: 4 };
    await expect(getBond("me", "bob")).resolves.toEqual(bond);
    await expect(getBond("bob", "me")).resolves.toEqual(bond);
  });

  it("is null for a pair with no bond", async () => {
    seedFirestore({
      "partnerBonds/other__q1": { members: ["other", "q1"], streak: 9 },
    });
    await expect(getBond("me", "bob")).resolves.toBeNull();
  });
});
