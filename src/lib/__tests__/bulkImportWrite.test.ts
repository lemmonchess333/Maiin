import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  batchSet: vi.fn(),
  batchCommit: vi.fn(),
  doc: vi.fn((_db: unknown, col: string, id: string) => ({
    path: `${col}/${id}`,
  })),
  queueDurableWritesBatch: vi.fn(),
}));

vi.mock("firebase/firestore", () => ({
  doc: (...args: unknown[]) =>
    mocks.doc(...(args as [unknown, string, string])),
  writeBatch: () => ({
    set: (...args: unknown[]) => mocks.batchSet(...args),
    commit: () => mocks.batchCommit(),
  }),
}));
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/offlineQueue", () => ({
  queueDurableWritesBatch: (...args: unknown[]) =>
    mocks.queueDurableWritesBatch(...args),
}));

import {
  BULK_IMPORT_BATCH_SIZE,
  commitBulkImportWrites,
  type BulkImportEntry,
} from "@/lib/bulkImportWrite";

function makeEntries(count: number, merge = false): BulkImportEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    collectionPath: "users/u-1/meals",
    docId: `csv-${i}`,
    data: { date: "2026-10-20", foodName: `Meal ${i}`, totalCalories: 400 },
    ...(merge ? { merge: true } : {}),
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.batchCommit.mockResolvedValue(undefined);
  Object.defineProperty(globalThis, "navigator", {
    value: { onLine: true },
    configurable: true,
  });
});

describe("commitBulkImportWrites", () => {
  it("chunks writes into 450-op Firestore writeBatches and reports progress", async () => {
    const entries = makeEntries(BULK_IMPORT_BATCH_SIZE + 50, true);
    const progress: { written: number; total: number }[] = [];

    const written = await commitBulkImportWrites("u-1", entries, (p) =>
      progress.push(p)
    );

    expect(written).toBe(500);
    expect(mocks.batchCommit).toHaveBeenCalledTimes(2);
    expect(mocks.batchSet).toHaveBeenCalledTimes(500);
    expect(mocks.batchSet).toHaveBeenCalledWith(
      { path: "users/u-1/meals/csv-0" },
      expect.objectContaining({ foodName: "Meal 0" }),
      { merge: true }
    );
    expect(progress).toEqual([
      { written: 450, total: 500 },
      { written: 500, total: 500 },
    ]);
    expect(mocks.queueDurableWritesBatch).not.toHaveBeenCalled();
  });

  it("enqueues all entries in one offline batch when navigator.onLine is false", async () => {
    Object.defineProperty(globalThis, "navigator", {
      value: { onLine: false },
      configurable: true,
    });
    const entries = makeEntries(12);
    const onProgress = vi.fn();

    const written = await commitBulkImportWrites("u-1", entries, onProgress);

    expect(written).toBe(12);
    expect(mocks.batchCommit).not.toHaveBeenCalled();
    expect(mocks.queueDurableWritesBatch).toHaveBeenCalledOnce();
    expect(mocks.queueDurableWritesBatch).toHaveBeenCalledWith("u-1", entries);
    expect(onProgress).toHaveBeenCalledWith({ written: 12, total: 12 });
  });

  it("falls back to queueDurableWritesBatch on transient network errors mid-import", async () => {
    mocks.batchCommit
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(
        Object.assign(new Error("unavailable"), { code: "unavailable" })
      );

    const entries = makeEntries(BULK_IMPORT_BATCH_SIZE + 25);
    await commitBulkImportWrites("u-1", entries);

    expect(mocks.batchCommit).toHaveBeenCalledTimes(2);
    expect(mocks.queueDurableWritesBatch).toHaveBeenCalledOnce();
    expect(mocks.queueDurableWritesBatch).toHaveBeenCalledWith(
      "u-1",
      entries.slice(BULK_IMPORT_BATCH_SIZE)
    );
  });

  it("rethrows permanent Firestore errors such as permission-denied", async () => {
    mocks.batchCommit.mockRejectedValueOnce(
      Object.assign(new Error("Missing or insufficient permissions"), {
        code: "permission-denied",
      })
    );

    await expect(commitBulkImportWrites("u-1", makeEntries(3))).rejects.toThrow(
      /permissions/i
    );
    expect(mocks.queueDurableWritesBatch).not.toHaveBeenCalled();
  });
});
