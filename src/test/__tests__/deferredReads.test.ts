/**
 * Deferred reads in the Firestore fake — the machinery account-switch
 * race tests need.
 *
 * The hazard being modelled: user A's in-flight read resolves AFTER the
 * switch to user B and overwrites B's rows with A's. Both reads SUCCEED,
 * so nothing throws and nothing logs; the user simply sees someone
 * else's data. A fake that always resolves immediately cannot produce
 * that interleaving, which is why the four account-switch suites still
 * carry hand-rolled deferred-promise harnesses.
 *
 * Tested directly rather than only through a consumer, because a subtly
 * wrong ordering primitive makes every suite built on it lie in the same
 * direction — and they'd all still be green.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("firebase/firestore");

import {
  collection,
  getDocs,
  doc,
  getDoc,
  type Firestore,
} from "firebase/firestore";
import {
  seedFirestore,
  resetFirestore,
  deferReads,
  resumeReads,
  pendingReads,
  releaseRead,
  releaseAllReads,
} from "@/test/firestoreHarness";

/* The mock ignores the handle entirely — it exists only to satisfy the
   real SDK's signatures, which every consuming suite gets for free by
   mocking `@/lib/firebase`. This suite calls the SDK directly, so it
   supplies its own. */
const db = {} as unknown as Firestore;

beforeEach(() => {
  resetFirestore();
});

describe("pass-through by default", () => {
  it("resolves immediately when nothing is deferred", async () => {
    seedFirestore({ "users/a/runs/r1": { km: 5 } });
    const snap = await getDocs(collection(db, "users", "a", "runs"));
    expect(snap.docs).toHaveLength(1);
    expect(pendingReads()).toEqual([]);
  });
});

describe("holding and releasing", () => {
  it("holds a read until released, and reports it as pending", async () => {
    seedFirestore({ "users/a/runs/r1": { km: 5 } });
    deferReads();

    let settled = false;
    const p = getDocs(collection(db, "users", "a", "runs")).then((s) => {
      settled = true;
      return s;
    });

    await Promise.resolve();
    expect(settled).toBe(false); // still held
    expect(pendingReads()).toEqual(["users/a/runs"]);

    expect(releaseRead()).toBe(true);
    const snap = await p;
    expect(snap.docs).toHaveLength(1);
    expect(pendingReads()).toEqual([]);
  });

  it("releases OUT OF ORDER — the whole point", async () => {
    // A issued first, B second; B answers first, A answers late. This is
    // the account-switch interleaving.
    seedFirestore({
      "users/a/runs/r1": { km: 1 },
      "users/b/runs/r1": { km: 2 },
      "users/b/runs/r2": { km: 3 },
    });
    deferReads();

    const order: string[] = [];
    const a = getDocs(collection(db, "users", "a", "runs")).then((s) => {
      order.push("a");
      return s;
    });
    const b = getDocs(collection(db, "users", "b", "runs")).then((s) => {
      order.push("b");
      return s;
    });

    await Promise.resolve();
    expect(pendingReads()).toEqual(["users/a/runs", "users/b/runs"]);

    releaseRead(1); // B
    await b;
    releaseRead(0); // A, late
    await a;

    expect(order).toEqual(["b", "a"]);
    // Each read still answers for ITS OWN uid — the isolation that makes
    // a leak assertion meaningful rather than fabricated.
    expect((await a).docs).toHaveLength(1);
    expect((await b).docs).toHaveLength(2);
  });

  it("returns false when nothing is at that index", async () => {
    // So a test cannot claim an interleaving that never happened: assert
    // on the return rather than assuming the release landed.
    expect(releaseRead()).toBe(false);
    expect(releaseRead(3)).toBe(false);
  });

  it("answers with the data as of when the read was ISSUED", async () => {
    // Holding a read reorders DELIVERY; it must not let later seeding
    // rewrite what was fetched, or a race test would be asserting against
    // a snapshot that never existed.
    seedFirestore({ "users/a/runs/r1": { km: 1 } });
    deferReads();
    const p = getDocs(collection(db, "users", "a", "runs"));

    seedFirestore({ "users/a/runs/r2": { km: 9 } }); // after the read

    releaseAllReads();
    expect((await p).docs).toHaveLength(1);
  });

  it("defers document reads too, not just queries", async () => {
    seedFirestore({ "users/a": { name: "A" } });
    deferReads();
    const p = getDoc(doc(db, "users", "a"));
    await Promise.resolve();
    expect(pendingReads()).toEqual(["users/a"]);
    releaseAllReads();
    expect((await p).data()).toEqual({ name: "A" });
  });

  it("resumeReads stops holding NEW reads but keeps existing ones held", async () => {
    seedFirestore({ "users/a/runs/r1": { km: 1 } });
    deferReads();
    const held = getDocs(collection(db, "users", "a", "runs"));
    await Promise.resolve();

    resumeReads();
    const immediate = await getDocs(collection(db, "users", "a", "runs"));
    expect(immediate.docs).toHaveLength(1); // not held
    expect(pendingReads()).toEqual(["users/a/runs"]); // the first still is

    releaseAllReads();
    await held;
  });
});

describe("reset", () => {
  it("releases held reads rather than dropping them", async () => {
    // A dropped promise never settles, so a test awaiting one would hang
    // to the suite timeout instead of failing with a usable message.
    seedFirestore({ "users/a/runs/r1": { km: 1 } });
    deferReads();
    const p = getDocs(collection(db, "users", "a", "runs"));
    await Promise.resolve();

    resetFirestore();

    await expect(p).resolves.toBeDefined();
    expect(pendingReads()).toEqual([]);
  });

  it("clears the deferring flag, so the next test starts pass-through", async () => {
    deferReads();
    resetFirestore();
    seedFirestore({ "users/a/runs/r1": { km: 1 } });
    const snap = await getDocs(collection(db, "users", "a", "runs"));
    expect(snap.docs).toHaveLength(1);
  });
});
