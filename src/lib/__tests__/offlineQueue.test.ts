// @vitest-environment jsdom — needs DOM/storage APIs; the rest of this directory runs in the fast node environment (audit batch 2).
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  queueWrite,
  getQueueLength,
  flushQueue,
  safeSave,
} from "../offlineQueue";

// Mock firebase/firestore
let generatedIdCounter = 0;
vi.mock("firebase/firestore", () => ({
  collection: vi.fn((_db, path) => ({ __collection: true, path })),
  // Two call shapes:
  //   doc(db, path, id)   → an explicit ref (flush / setDoc paths)
  //   doc(collectionRef)  → CORE-01 client-side id generation
  doc: vi.fn((dbOrColl, path, id) => {
    if (path === undefined) {
      generatedIdCounter += 1;
      return {
        id: `gen-${generatedIdCounter}`,
        path: `${(dbOrColl as { path?: string })?.path}/gen-${generatedIdCounter}`,
      };
    }
    return { path: `${path}/${id}`, id };
  }),
  addDoc: vi.fn().mockResolvedValue({ id: "mock-id" }),
  setDoc: vi.fn().mockResolvedValue(undefined),
}));

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
    localStorage.clear();
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
    const { addDoc } = await import("firebase/firestore");
    const mockAddDoc = vi.mocked(addDoc);

    queueWrite(UID_A, "users/abc/meals", { name: "chicken" });
    queueWrite(UID_A, "users/abc/meals", { name: "will-fail" });

    // First call succeeds, second fails
    mockAddDoc
      .mockResolvedValueOnce({ id: "ok" } as never)
      .mockRejectedValueOnce(new Error("network error"));

    const mockDb = {} as Parameters<typeof flushQueue>[0];
    const count = await flushQueue(mockDb, UID_A);

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
  describe("CORE-01 idempotent creates", () => {
    it("safeSave online uses setDoc with a client-minted id, not addDoc", async () => {
      const { setDoc, addDoc } = await import("firebase/firestore");
      vi.mocked(setDoc).mockClear();
      vi.mocked(addDoc).mockClear();
      vi.stubGlobal("navigator", { onLine: true });
      const mockDb = {} as Parameters<typeof safeSave>[0];
      await safeSave(mockDb, UID_A, "users/abc/meals", { name: "chicken" });
      expect(addDoc).not.toHaveBeenCalled();
      expect(setDoc).toHaveBeenCalledTimes(1);
      // The ref carries a concrete generated id (…/gen-N), never …/undefined.
      const ref = vi.mocked(setDoc).mock.calls[0][0] as { path: string };
      expect(ref.path).toMatch(/\/gen-\d+$/);
    });

    it("an ambiguous online failure queues the SAME id — a retry re-sets, never duplicates", async () => {
      const { setDoc } = await import("firebase/firestore");
      vi.mocked(setDoc).mockRejectedValueOnce(new Error("network lost"));
      vi.stubGlobal("navigator", { onLine: true });
      const mockDb = {} as Parameters<typeof safeSave>[0];
      await safeSave(mockDb, UID_A, "users/abc/meals", { name: "rice" });
      const stored = JSON.parse(
        localStorage.getItem("tropos_offline_queue") || "[]"
      );
      expect(stored).toHaveLength(1);
      // A stable docId rode into the queue → the flush setDoc is idempotent.
      expect(typeof stored[0].docId).toBe("string");
      expect(stored[0].docId).toMatch(/^gen-\d+$/);
      expect(stored[0].merge).toBeUndefined();
    });

    it("offline safeSave queues with a stable docId too", async () => {
      vi.stubGlobal("navigator", { onLine: false });
      const mockDb = {} as Parameters<typeof safeSave>[0];
      await safeSave(mockDb, UID_A, "users/abc/meals", { name: "eggs" });
      const stored = JSON.parse(
        localStorage.getItem("tropos_offline_queue") || "[]"
      );
      expect(stored[0].docId).toMatch(/^gen-\d+$/);
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
