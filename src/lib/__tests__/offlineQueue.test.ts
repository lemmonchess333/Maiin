// @vitest-environment jsdom — needs DOM/storage APIs; the rest of this directory runs in the fast node environment (audit batch 2).
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  queueWrite,
  queueDurableWrite,
  queueWorkoutCompletion,
  discardRefusedSaves,
  getRefusedSaveCount,
  getQueueLength,
  getFailedMealSaveCount,
  pendingDocumentWrites,
  flushQueue,
  safeSave,
  safeMerge,
} from "../offlineQueue";
import {
  resetFirestore,
  readDoc,
  failNextFirestore,
  unfiredFailures,
  writeLog,
  deferWrites,
  resumeWrites,
  pendingWrites,
  releaseAllWrites,
} from "@/test/firestoreHarness";

vi.mock("firebase/firestore");
const { auth } = vi.hoisted(() => ({
  auth: { currentUser: { uid: "user-a" } as { uid: string } | null },
}));
vi.mock("@/lib/firebase", () => ({ auth }));
const { clearCompletedWorkoutDraft } = vi.hoisted(() => ({
  clearCompletedWorkoutDraft: vi.fn(),
}));
vi.mock("@/hooks/useWorkoutDraft", () => ({ clearCompletedWorkoutDraft }));

/** Ids the fake mints for `doc(collectionRef)` — the client-minted-id
 *  shape these tests pin. */
const GENERATED_ID = /^fake-id-\d+$/;

/**
 * MIGRATED off the inline SDK factory 2026-07-26 (ADR-0009: one fake).
 *
 * The queue was filed under BROAD SDK SURFACE, but it only ever touched
 * `collection` / `doc` / `addDoc` / `setDoc` — all long since covered.
 * What the inline factory really carried was a hand-rolled id minter
 * (`gen-N`) reimplementing the fake's `nextId()`, which is why the
 * client-minted-id assertions were written against `/gen-\d+$/`: a
 * pattern only the stub could ever produce.
 *
 * Failure injection moves to `failNextFirestore`, so a flush failure is
 * raised by the same layer that stores the successes — the previous
 * `mockRejectedValueOnce` could disagree with the store about what
 * landed.
 */
// Mock errorReporting to avoid transitive Firebase dependency
vi.mock("@/lib/errorReporting", () => ({
  captureError: vi.fn(),
}));

// Mock crypto.randomUUID
vi.stubGlobal("crypto", { randomUUID: () => "test-uuid-" + Math.random() });

const UID_A = "user-a";
const UID_B = "user-b";

describe("offlineQueue", () => {
  beforeEach(() => {
    resetFirestore();
    localStorage.clear();
    auth.currentUser = { uid: UID_A };
  });

  it.each([null, { uid: UID_B }])(
    "keeps an old flush queued when the current account is %j",
    async (currentUser) => {
      queueWrite(
        UID_A,
        `users/${UID_A}/logs`,
        { calories: 100 },
        "2026-09-07",
        true
      );
      auth.currentUser = currentUser;
      expect(
        await flushQueue({} as Parameters<typeof flushQueue>[0], UID_A)
      ).toBe(0);
      expect(writeLog()).toEqual([]);
      expect(getQueueLength(UID_A)).toBe(1);
      auth.currentUser = { uid: UID_A };
      expect(
        await flushQueue({} as Parameters<typeof flushQueue>[0], UID_A)
      ).toBe(1);
      expect(getQueueLength(UID_A)).toBe(0);
    }
  );

  it("stops between writes when the account changes during an acknowledgement", async () => {
    queueWrite(UID_A, `users/${UID_A}/logs`, { calories: 100 }, "first", true);
    queueWrite(UID_A, `users/${UID_A}/logs`, { calories: 200 }, "second", true);
    deferWrites();
    const flushing = flushQueue({} as Parameters<typeof flushQueue>[0], UID_A);
    await vi.waitFor(() =>
      expect(pendingWrites()).toEqual([`users/${UID_A}/logs/first`])
    );
    auth.currentUser = { uid: UID_B };
    resumeWrites();
    releaseAllWrites();
    expect(await flushing).toBe(1);
    expect(writeLog().map((w) => w.path)).toEqual([
      `users/${UID_A}/logs/first`,
    ]);
    expect(getQueueLength(UID_A)).toBe(1);
    auth.currentUser = { uid: UID_A };
    expect(
      await flushQueue({} as Parameters<typeof flushQueue>[0], UID_A)
    ).toBe(1);
  });

  it("starts with empty queue", () => {
    expect(getQueueLength()).toBe(0);
  });

  it("queues a write and increments length", () => {
    queueWrite(UID_A, "users/abc/meals", { name: "chicken" });
    expect(getQueueLength()).toBe(1);
  });

  it("queues multiple writes", () => {
    queueWrite(UID_A, "users/abc/meals", { name: "chicken" });
    queueWrite(UID_A, "users/abc/meals", { name: "rice" });
    queueWrite(UID_A, "users/abc/workouts", { type: "push" });
    expect(getQueueLength()).toBe(3);
  });

  it("queues write with docId and merge flag", () => {
    queueWrite(UID_A, "users/abc", { name: "updated" }, "profile", true);
    expect(getQueueLength()).toBe(1);
    const stored = JSON.parse(
      localStorage.getItem("tropos_offline_queue") || "[]"
    );
    expect(stored[0].docId).toBe("profile");
    expect(stored[0].merge).toBe(true);
    expect(stored[0].uid).toBe(UID_A);
  });

  it("flushes only this user's items on success", async () => {
    queueWrite(UID_A, "users/abc/meals", { name: "chicken" });
    queueWrite(UID_A, "users/abc/meals", { name: "rice" });

    const mockDb = {} as Parameters<typeof flushQueue>[0];
    const count = await flushQueue(mockDb, UID_A);

    expect(count).toBe(2);
    expect(getQueueLength()).toBe(0);
  });

  it("returns 0 when flushing empty queue", async () => {
    const mockDb = {} as Parameters<typeof flushQueue>[0];
    const count = await flushQueue(mockDb, UID_A);
    expect(count).toBe(0);
  });

  it("keeps failed items in queue after flush", async () => {
    queueWrite(UID_A, "users/abc/meals", { name: "chicken" });
    queueWrite(UID_A, "users/abc/meals", { name: "will-fail" });

    // One of the two writes fails. Which one is immaterial to the
    // contract under test — a partial flush must retire exactly the
    // items that landed and leave the rest queued.
    failNextFirestore("addDoc", {
      path: "users/abc/meals",
      code: "unavailable",
    });

    const mockDb = {} as Parameters<typeof flushQueue>[0];
    const count = await flushQueue(mockDb, UID_A);

    // Assert the injected failure actually fired — a path typo would
    // otherwise leave this quietly exercising a clean flush.
    expect(unfiredFailures()).toEqual([]);
    expect(count).toBe(1);
    expect(getQueueLength()).toBe(1);
  });

  it("handles corrupted localStorage gracefully", () => {
    localStorage.setItem("tropos_offline_queue", "not-json{{{");
    expect(getQueueLength()).toBe(0);
  });

  it("only flushes items belonging to the given uid", async () => {
    queueWrite(UID_A, "users/abc/meals", { name: "chicken" });
    queueWrite(UID_B, "users/bcd/meals", { name: "tofu" });
    queueWrite(UID_A, "users/abc/meals", { name: "rice" });

    const mockDb = {} as Parameters<typeof flushQueue>[0];
    const count = await flushQueue(mockDb, UID_A);

    // Only UID_A's two items flushed; UID_B's item still in queue.
    expect(count).toBe(2);
    expect(getQueueLength()).toBe(1);
    expect(getQueueLength(UID_B)).toBe(1);
    expect(getQueueLength(UID_A)).toBe(0);
  });

  /**
   * The flush is a read-modify-write across a network round trip, and
   * `queueWrite` is a synchronous localStorage write — so anything the
   * user logs while the queue is draining lands in the middle of it.
   *
   * `deferWrites` is what makes that expressible: it holds the flush
   * suspended exactly where a real in-flight write would be, so the
   * interleaving is constructed rather than raced for. Without it the
   * test would depend on the mock's microtask depth, which is not a
   * property anyone should be pinning.
   */
  describe("a write queued DURING a flush", () => {
    it("survives the flush that was already in progress", async () => {
      queueWrite(UID_A, "users/abc/meals", { name: "chicken" }, "meal-1");

      deferWrites();
      const mockDb = {} as Parameters<typeof flushQueue>[0];
      const flushing = flushQueue(mockDb, UID_A);
      // Prove the flush really is suspended mid-write before continuing —
      // otherwise this test could assert an interleaving that never
      // happened and pass for the wrong reason.
      await vi.waitFor(() =>
        expect(pendingWrites()).toEqual(["users/abc/meals/meal-1"])
      );

      // The user logs something while the queue is draining.
      queueWrite(UID_A, "users/abc/meals", { name: "rice" }, "meal-2");

      resumeWrites();
      releaseAllWrites();
      expect(await flushing).toBe(1);

      // meal-1 flushed and retired; meal-2 must still be queued. It was
      // silently destroyed before the flush subtracted rather than
      // overwriting.
      expect(getQueueLength(UID_A)).toBe(1);
      const stored = JSON.parse(
        localStorage.getItem("tropos_offline_queue") || "[]"
      );
      expect(stored.map((q: { docId: string }) => q.docId)).toEqual(["meal-2"]);
    });

    it("is flushed by the NEXT flush, not stranded", async () => {
      // The queue surviving is only half of it — a survivor nothing ever
      // drains is a leak with extra steps.
      queueWrite(UID_A, "users/abc/meals", { name: "chicken" }, "meal-1");

      deferWrites();
      const mockDb = {} as Parameters<typeof flushQueue>[0];
      const flushing = flushQueue(mockDb, UID_A);
      await vi.waitFor(() => expect(pendingWrites()).toHaveLength(1));
      queueWrite(UID_A, "users/abc/meals", { name: "rice" }, "meal-2");
      resumeWrites();
      releaseAllWrites();
      await flushing;

      expect(await flushQueue(mockDb, UID_A)).toBe(1);
      expect(getQueueLength(UID_A)).toBe(0);
      expect(writeLog().map((w) => w.path)).toContain("users/abc/meals/meal-2");
    });

    it("leaves a failed item queued without stranding a mid-flush write", async () => {
      // Both preservation paths at once: the old code carried failures
      // forward in an explicit `remaining` list, and subtracting has to
      // keep them by never removing them.
      queueWrite(UID_A, "users/abc/meals", { name: "chicken" }, "meal-1");
      queueWrite(UID_A, "users/abc/meals", { name: "will-fail" }, "meal-2");
      failNextFirestore("setDoc", {
        path: "users/abc/meals/meal-2",
        code: "unavailable",
      });

      deferWrites();
      const mockDb = {} as Parameters<typeof flushQueue>[0];
      const flushing = flushQueue(mockDb, UID_A);
      await vi.waitFor(() =>
        expect(pendingWrites()).toEqual(["users/abc/meals/meal-1"])
      );
      queueWrite(UID_A, "users/abc/meals", { name: "rice" }, "meal-3");

      resumeWrites();
      releaseAllWrites();
      // meal-1 landed, meal-2 rejected at issue.
      expect(await flushing).toBe(1);

      expect(unfiredFailures()).toEqual([]);
      const stored = JSON.parse(
        localStorage.getItem("tropos_offline_queue") || "[]"
      );
      expect(stored.map((q: { docId: string }) => q.docId).sort()).toEqual([
        "meal-2",
        "meal-3",
      ]);
    });

    it("does not resurrect another user's item it never touched", async () => {
      queueWrite(UID_A, "users/abc/meals", { name: "chicken" }, "meal-1");
      queueWrite(UID_B, "users/bcd/meals", { name: "tofu" }, "meal-b");

      const mockDb = {} as Parameters<typeof flushQueue>[0];
      expect(await flushQueue(mockDb, UID_A)).toBe(1);
      expect(getQueueLength(UID_A)).toBe(0);
      expect(getQueueLength(UID_B)).toBe(1);
    });
  });

  /**
   * `AppRoutes` calls `flushQueue` on BOTH the auth-user change and the
   * `online` event, and signing in while already online fires the two
   * within a tick — so overlapping flushes are the ordinary case.
   */
  describe("overlapping flushes", () => {
    it("replays each queued item exactly once", async () => {
      queueWrite(UID_A, "users/abc/meals", { name: "chicken" }, "meal-1");
      queueWrite(UID_A, "users/abc/meals", { name: "rice" }, "meal-2");

      const mockDb = {} as Parameters<typeof flushQueue>[0];
      const [first, second] = await Promise.all([
        flushQueue(mockDb, UID_A),
        flushQueue(mockDb, UID_A),
      ]);

      // The second waits, re-reads, and finds nothing left to do.
      expect(first + second).toBe(2);
      expect(getQueueLength(UID_A)).toBe(0);
      // Two items, two writes — not four. Unserialised, both flushes
      // replay the same snapshot.
      expect(writeLog()).toHaveLength(2);
    });

    it("keeps running after a flush whose write rejects", async () => {
      // A rejected pass must not break the chain for every later one.
      queueWrite(UID_A, "users/abc/meals", { name: "will-fail" }, "meal-1");
      failNextFirestore("setDoc", {
        path: "users/abc/meals/meal-1",
        code: "unavailable",
      });

      const mockDb = {} as Parameters<typeof flushQueue>[0];
      expect(await flushQueue(mockDb, UID_A)).toBe(0);
      expect(unfiredFailures()).toEqual([]);

      // Same item, no failure armed this time.
      expect(await flushQueue(mockDb, UID_A)).toBe(1);
      expect(getQueueLength(UID_A)).toBe(0);
    });
  });

  it("drops legacy items missing a uid field", () => {
    // Simulate a pre-uid-scoping write left in localStorage.
    localStorage.setItem(
      "tropos_offline_queue",
      JSON.stringify([
        {
          id: "legacy-1",
          collectionPath: "meals",
          data: { foo: 1 },
          timestamp: 0,
        },
        {
          id: "tagged-1",
          uid: UID_A,
          collectionPath: "meals",
          data: { foo: 2 },
          timestamp: 0,
        },
      ])
    );
    // Legacy item filtered out on read — counted as if it never existed.
    expect(getQueueLength()).toBe(1);
    expect(getQueueLength(UID_A)).toBe(1);
  });

  // ── CORE-01: idempotent creates + accountable quota handling ──
  /**
   * A save the rules refuse for good (or one Firestore cannot store) fails
   * the same way on every flush. Every failure used to stop the flush, so
   * one such meal kept every meal, run and edit behind it on the phone.
   */
  describe("a save the rules refuse for good", () => {
    const meals = `users/${UID_A}/meals`;
    const db = {} as Parameters<typeof flushQueue>[0];
    beforeEach(() => vi.stubGlobal("navigator", { onLine: true }));

    it("syncs what is queued behind it, and keeps it as needing attention", async () => {
      queueDurableWrite(UID_A, meals, "refused", { foodName: "Oats" });
      queueDurableWrite(UID_A, meals, "fine", { foodName: "Eggs" });
      failNextFirestore("commit", { code: "permission-denied" });

      expect(await flushQueue(db, UID_A)).toBe(1);
      expect(unfiredFailures()).toEqual([]);
      expect(readDoc(`${meals}/fine`)?.foodName).toBe("Eggs");
      expect(readDoc(`${meals}/refused`)).toBeUndefined();
      expect(pendingDocumentWrites(UID_A, meals).map((w) => w.id)).toEqual([
        "refused",
      ]);
      expect(getFailedMealSaveCount(UID_A)).toBe(1);
    });

    it("holds a later change to the same document behind it", async () => {
      queueDurableWrite(UID_A, meals, "refused", { foodName: "Oats" });
      queueDurableWrite(UID_A, meals, "refused", { deletedAt: 1 }, true);
      queueDurableWrite(UID_A, meals, "fine", { foodName: "Eggs" });
      failNextFirestore("commit", { code: "invalid-argument" });

      expect(await flushQueue(db, UID_A)).toBe(1);
      // Applied on its own, the Undo would create a meal that is only a
      // deletion stamp.
      expect(readDoc(`${meals}/refused`)).toBeUndefined();
      expect(readDoc(`${meals}/fine`)?.foodName).toBe("Eggs");
      expect(pendingDocumentWrites(UID_A, meals)).toHaveLength(2);
    });

    it("still stops at a save that may land later", async () => {
      queueDurableWrite(UID_A, meals, "first", { foodName: "Oats" });
      queueDurableWrite(UID_A, meals, "second", { foodName: "Eggs" });
      failNextFirestore("commit", { code: "unavailable" });

      expect(await flushQueue(db, UID_A)).toBe(0);
      expect(readDoc(`${meals}/second`)).toBeUndefined();
      expect(pendingDocumentWrites(UID_A, meals)).toHaveLength(2);
    });

    it("drops a best-effort change no flush can land, and keeps one that can", async () => {
      queueWrite(UID_A, `users/${UID_A}/logs`, { meals: 2 }, "d1", true);
      queueWrite(UID_A, `users/${UID_A}/logs`, { meals: 3 }, "d2", true);
      failNextFirestore("setDoc", {
        path: `users/${UID_A}/logs/d1`,
        code: "permission-denied",
      });
      failNextFirestore("setDoc", {
        path: `users/${UID_A}/logs/d2`,
        code: "unavailable",
      });

      expect(await flushQueue(db, UID_A)).toBe(0);
      const stored = JSON.parse(
        localStorage.getItem("tropos_offline_queue") || "[]"
      );
      expect(stored.map((q: { docId: string }) => q.docId)).toEqual(["d2"]);
    });

    it("can be discarded, with what waits behind it, and only by its account", async () => {
      queueDurableWrite(UID_A, meals, "refused", { foodName: "Oats" });
      queueDurableWrite(UID_A, meals, "refused", { deletedAt: 1 }, true);
      queueDurableWrite(UID_A, meals, "waiting", { foodName: "Eggs" });
      queueDurableWrite(UID_B, `users/${UID_B}/meals`, "theirs", {});
      failNextFirestore("commit", { code: "permission-denied" });
      vi.stubGlobal("navigator", { onLine: false });
      await flushQueue(db, UID_A);
      vi.stubGlobal("navigator", { onLine: true });
      // Offline, nothing was tried: nothing is refused yet.
      expect(getRefusedSaveCount(UID_A)).toBe(0);
      expect(await discardRefusedSaves(UID_A)).toBe(0);

      await flushQueue(db, UID_A);
      expect(getRefusedSaveCount(UID_A)).toBe(1);
      expect(await discardRefusedSaves(UID_A)).toBe(1);
      expect(pendingDocumentWrites(UID_A, meals)).toEqual([]);
      expect(readDoc(`${meals}/waiting`)?.foodName).toBe("Eggs");
      expect(getQueueLength(UID_B)).toBe(1);
    });

    it("discarding a refused workout retires its finished-session draft", async () => {
      clearCompletedWorkoutDraft.mockClear();
      failNextFirestore("commit", { code: "permission-denied" });
      const settled = queueWorkoutCompletion(db, UID_A, "programme-c1", {
        completionId: "c1",
        date: "2026-10-20",
        exercises: [],
      });
      expect(await settled).toBe("failed");
      expect(getRefusedSaveCount(UID_A)).toBe(1);

      expect(await discardRefusedSaves(UID_A)).toBe(1);
      expect(getQueueLength(UID_A)).toBe(0);
      expect(clearCompletedWorkoutDraft).toHaveBeenCalledWith(UID_A, "c1");
    });

    it("tells safeMerge's caller, and queues nothing", async () => {
      failNextFirestore("setDoc", {
        path: `users/${UID_A}/logs/d1`,
        code: "permission-denied",
      });
      await expect(
        safeMerge(db, UID_A, `users/${UID_A}/logs`, "d1", { meals: 2 })
      ).rejects.toMatchObject({ code: "permission-denied" });
      expect(getQueueLength(UID_A)).toBe(0);

      failNextFirestore("setDoc", {
        path: `users/${UID_A}/logs/d1`,
        code: "unavailable",
      });
      await safeMerge(db, UID_A, `users/${UID_A}/logs`, "d1", { meals: 2 });
      expect(getQueueLength(UID_A)).toBe(1);
    });
  });

  describe("CORE-01 idempotent creates", () => {
    it("safeSave online uses setDoc with a client-minted id, not addDoc", async () => {
      vi.stubGlobal("navigator", { onLine: true });
      const mockDb = {} as Parameters<typeof safeSave>[0];
      await safeSave(mockDb, UID_A, "users/abc/meals", { name: "chicken" });

      const writes = writeLog();
      expect(writes.map((w) => w.op)).toEqual(["set"]);
      // The ref carries a concrete generated id, never …/undefined.
      expect(writes[0].path).toMatch(/^users\/abc\/meals\/fake-id-\d+$/);
    });

    it("an ambiguous online failure queues the SAME id — a retry re-sets, never duplicates", async () => {
      failNextFirestore("setDoc", {
        path: "users/abc/meals",
        code: "unavailable",
      });
      vi.stubGlobal("navigator", { onLine: true });
      const mockDb = {} as Parameters<typeof safeSave>[0];
      await safeSave(mockDb, UID_A, "users/abc/meals", { name: "rice" });
      const stored = JSON.parse(
        localStorage.getItem("tropos_offline_queue") || "[]"
      );
      expect(stored).toHaveLength(1);
      // A stable docId rode into the queue → the flush setDoc is idempotent.
      expect(typeof stored[0].docId).toBe("string");
      expect(stored[0].docId).toMatch(GENERATED_ID);
      expect(stored[0].merge).toBeUndefined();
    });

    it("offline safeSave queues with a stable docId too", async () => {
      vi.stubGlobal("navigator", { onLine: false });
      const mockDb = {} as Parameters<typeof safeSave>[0];
      await safeSave(mockDb, UID_A, "users/abc/meals", { name: "eggs" });
      const stored = JSON.parse(
        localStorage.getItem("tropos_offline_queue") || "[]"
      );
      expect(stored[0].docId).toMatch(GENERATED_ID);
    });
  });

  describe("CORE-01 quota handling never bulk-wipes the queue", () => {
    it("sheds the OLDEST item one at a time instead of clearing everything", () => {
      // Seed three items directly.
      localStorage.setItem(
        "tropos_offline_queue",
        JSON.stringify([
          {
            id: "a",
            uid: UID_A,
            collectionPath: "meals",
            data: {},
            timestamp: 1,
          },
          {
            id: "b",
            uid: UID_A,
            collectionPath: "meals",
            data: {},
            timestamp: 2,
          },
          {
            id: "c",
            uid: UID_A,
            collectionPath: "meals",
            data: {},
            timestamp: 3,
          },
        ])
      );
      // Make the FIRST setItem of the next queueWrite throw quota, then
      // succeed once one item has been shed.
      const real = Storage.prototype.setItem;
      let threw = false;
      const spy = vi
        .spyOn(Storage.prototype, "setItem")
        .mockImplementation(function (this: Storage, k: string, v: string) {
          if (!threw && k === "tropos_offline_queue") {
            threw = true;
            const err = new DOMException("quota", "QuotaExceededError");
            throw err;
          }
          return real.call(this, k, v);
        });
      queueWrite(UID_A, "meals", { name: "d" });
      spy.mockRestore();
      const stored = JSON.parse(
        localStorage.getItem("tropos_offline_queue") || "[]"
      );
      // The queue is NOT wiped — only the oldest ("a") was shed; b, c, d remain.
      expect(stored.length).toBeGreaterThan(0);
      expect(stored.map((x: { id: string }) => x.id)).not.toContain("a");
    });
  });
});
