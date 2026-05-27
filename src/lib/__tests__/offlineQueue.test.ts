import { describe, it, expect, beforeEach, vi } from "vitest";
import { queueWrite, getQueueLength, flushQueue } from "../offlineQueue";

// Mock firebase/firestore
vi.mock("firebase/firestore", () => ({
  collection: vi.fn((_db, path) => ({ path })),
  doc: vi.fn((_db, path, id) => ({ path: `${path}/${id}` })),
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
});
