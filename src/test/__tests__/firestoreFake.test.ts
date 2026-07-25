/**
 * The fake is load-bearing for every hook test that follows it, so it is
 * itself tested — including the `__mocks__` resolution, which is the part
 * a future reader will most doubt ("does `vi.mock` with no factory really
 * pick up our file?"). If this suite passes, the seam works.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("firebase/firestore");

import {
  collection,
  doc,
  query,
  where,
  orderBy,
  limit,
  getDoc,
  getDocs,
  onSnapshot,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  runTransaction,
  serverTimestamp,
  increment,
  arrayUnion,
  Timestamp,
} from "firebase/firestore";
import {
  seedFirestore,
  resetFirestore,
  readDoc,
  allPaths,
  writeLog,
  failNextFirestore,
  unfiredFailures,
} from "../firestoreHarness";

const db = {} as never;

beforeEach(() => resetFirestore());

describe("__mocks__ resolution", () => {
  it("bare vi.mock('firebase/firestore') resolves to our fake", () => {
    // The real SDK's collection() would throw on a `{}` handle.
    const ref = collection(db, "users", "u1", "meals");
    expect(ref).toMatchObject({ __kind: "collection", path: "users/u1/meals" });
  });
});

describe("reads", () => {
  it("getDoc reflects seeded data and absence", async () => {
    seedFirestore({ "users/u1": { displayName: "Myles" } });
    const present = await getDoc(doc(db, "users", "u1"));
    expect(present.exists()).toBe(true);
    expect(present.data()).toEqual({ displayName: "Myles" });

    const missing = await getDoc(doc(db, "users", "nope"));
    expect(missing.exists()).toBe(false);
    expect(missing.data()).toBeUndefined();
  });

  it("getDocs returns only immediate children of the collection", async () => {
    seedFirestore({
      "users/u1/meals/m1": { calories: 200 },
      "users/u1/meals/m2": { calories: 500 },
      "users/u1/meals/m2/items/i1": { nested: true },
      "users/u2/meals/m9": { calories: 1 },
    });
    const snap = await getDocs(collection(db, "users", "u1", "meals"));
    expect(snap.size).toBe(2);
    expect(snap.docs.map((d) => d.id).sort()).toEqual(["m1", "m2"]);
  });

  it("where / orderBy / limit compose", async () => {
    seedFirestore({
      "users/u1/runs/a": { distance: 5000, date: "2026-07-01" },
      "users/u1/runs/b": { distance: 10000, date: "2026-07-02" },
      "users/u1/runs/c": { distance: 21097, date: "2026-07-03" },
    });
    const snap = await getDocs(
      query(
        collection(db, "users", "u1", "runs"),
        where("distance", ">=", 10000),
        orderBy("date", "desc"),
        limit(1)
      )
    );
    expect(snap.docs.map((d) => d.id)).toEqual(["c"]);
  });

  it("supports array-contains and in", async () => {
    seedFirestore({
      "bonds/b1": { members: ["u1", "u2"] },
      "bonds/b2": { members: ["u3"] },
    });
    const contains = await getDocs(
      query(collection(db, "bonds"), where("members", "array-contains", "u1"))
    );
    expect(contains.docs.map((d) => d.id)).toEqual(["b1"]);
  });
});

describe("writes", () => {
  it("setDoc merge preserves untouched fields; overwrite does not", async () => {
    seedFirestore({ "users/u1": { a: 1, b: 2 } });
    await setDoc(doc(db, "users", "u1"), { b: 99 }, { merge: true });
    expect(readDoc("users/u1")).toEqual({ a: 1, b: 99 });

    await setDoc(doc(db, "users", "u1"), { c: 3 });
    expect(readDoc("users/u1")).toEqual({ c: 3 });
  });

  it("updateDoc on a missing document throws, like real Firestore", async () => {
    await expect(
      updateDoc(doc(db, "users", "ghost"), { a: 1 })
    ).rejects.toThrow(/missing document/);
  });

  it("addDoc generates an id and stores under the collection", async () => {
    const ref = await addDoc(collection(db, "users", "u1", "meals"), {
      foodName: "Eggs",
    });
    expect(ref.path).toBe(`users/u1/meals/${ref.id}`);
    expect(readDoc(ref.path)).toEqual({ foodName: "Eggs" });
  });

  it("deleteDoc removes it", async () => {
    seedFirestore({ "users/u1": { a: 1 } });
    await deleteDoc(doc(db, "users", "u1"));
    expect(allPaths()).toEqual([]);
  });

  it("field sentinels resolve on write", async () => {
    seedFirestore({ "c/d": { n: 5, tags: ["a"] } });
    await setDoc(
      doc(db, "c", "d"),
      { n: increment(3), tags: arrayUnion("b"), at: serverTimestamp() },
      { merge: true }
    );
    const row = readDoc("c/d") as Record<string, unknown>;
    expect(row.n).toBe(8);
    expect(row.tags).toEqual(["a", "b"]);
    expect(row.at).toBeInstanceOf(Timestamp);
  });

  it("writeBatch applies atomically on commit, not before", async () => {
    seedFirestore({ "c/d": { a: 1 } });
    const batch = writeBatch(db);
    batch.set(doc(db, "c", "e"), { a: 2 });
    batch.delete(doc(db, "c", "d"));
    expect(allPaths()).toEqual(["c/d"]); // nothing applied yet
    await batch.commit();
    expect(allPaths()).toEqual(["c/e"]);
  });

  it("runTransaction can read-modify-write", async () => {
    seedFirestore({ "c/d": { n: 1 } });
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(doc(db, "c", "d"));
      tx.update(doc(db, "c", "d"), { n: (snap.data()!.n as number) + 10 });
    });
    expect(readDoc("c/d")).toEqual({ n: 11 });
  });

  it("records an ordered write log for assertions", async () => {
    await setDoc(doc(db, "c", "d"), { a: 1 });
    await setDoc(doc(db, "c", "d"), { a: 2 }, { merge: true });
    expect(writeLog().map((w) => w.op)).toEqual(["set", "set:merge"]);
  });
});

describe("onSnapshot", () => {
  it("fires immediately and again on mutation", async () => {
    seedFirestore({ "users/u1/meals/m1": { calories: 100 } });
    const seen: number[] = [];
    const unsub = onSnapshot(collection(db, "users", "u1", "meals"), (snap) => {
      seen.push((snap as { size: number }).size);
    });
    expect(seen).toEqual([1]); // immediate

    await addDoc(collection(db, "users", "u1", "meals"), { calories: 200 });
    await Promise.resolve();
    await Promise.resolve();
    expect(seen[seen.length - 1]).toBe(2);

    unsub();
    await addDoc(collection(db, "users", "u1", "meals"), { calories: 300 });
    await Promise.resolve();
    await Promise.resolve();
    expect(seen[seen.length - 1]).toBe(2); // unsubscribed
  });

  it("coalesces a batch into ONE snapshot, as real Firestore does", async () => {
    const fires: number[] = [];
    onSnapshot(collection(db, "c"), (snap) =>
      fires.push((snap as { size: number }).size)
    );
    const batch = writeBatch(db);
    batch.set(doc(db, "c", "a"), { n: 1 });
    batch.set(doc(db, "c", "b"), { n: 2 });
    batch.set(doc(db, "c", "e"), { n: 3 });
    await batch.commit();
    await Promise.resolve();
    await Promise.resolve();
    // 1 immediate (empty) + 1 coalesced for the whole batch.
    expect(fires).toEqual([0, 3]);
  });

  it("supports the observer-object call shape", async () => {
    const seen: number[] = [];
    onSnapshot(collection(db, "c"), {
      next: (snap: unknown) => seen.push((snap as { size: number }).size),
    });
    expect(seen).toEqual([0]);
  });
});

describe("injected failures", () => {
  it("fails the next matching read with a code-carrying error", async () => {
    seedFirestore({ "groups/a": { name: "A" } });
    failNextFirestore("getDocs", { code: "permission-denied" });

    await expect(getDocs(collection(db, "groups"))).rejects.toMatchObject({
      name: "FirebaseError",
      code: "permission-denied",
    });
    // Armed once, so the retry succeeds — this is what lets a test drive a
    // hook through failure AND recovery in one render.
    const snap = await getDocs(collection(db, "groups"));
    expect(snap.size).toBe(1);
    expect(unfiredFailures()).toEqual([]);
  });

  it("scopes by path, leaving other collections readable", async () => {
    seedFirestore({ "groups/a": { n: 1 }, "users/u1": { n: 2 } });
    failNextFirestore("getDoc", { path: "users/u1" });

    await expect(getDoc(doc(db, "users", "u1"))).rejects.toThrow();
    expect((await getDoc(doc(db, "groups", "a"))).exists()).toBe(true);
  });

  it("leaves the store untouched when a write fails", async () => {
    seedFirestore({ "c/d": { a: 1 } });
    failNextFirestore("updateDoc");
    await expect(updateDoc(doc(db, "c", "d"), { a: 2 })).rejects.toThrow();
    expect(readDoc("c/d")).toEqual({ a: 1 });
    expect(writeLog()).toEqual([]);
  });

  it("routes an onSnapshot failure to the error callback", async () => {
    failNextFirestore("onSnapshot");
    const errors: unknown[] = [];
    onSnapshot(
      collection(db, "c"),
      () => {},
      (e: unknown) => errors.push(e)
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ code: "permission-denied" });
  });

  it("reports failures that were armed but never hit", () => {
    failNextFirestore("getDocs", { path: "typoed-collection" });
    expect(unfiredFailures()).toEqual([
      { op: "getDocs", path: "typoed-collection" },
    ]);
  });
});

describe("harness guardrails", () => {
  it("rejects seeding a COLLECTION path (odd segment count)", () => {
    expect(() => seedFirestore({ "users/u1/meals": { a: 1 } })).toThrow(
      /COLLECTION path/
    );
  });
});
