import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));

const queueMocks = vi.hoisted(() => ({
  queueDurableWritesBatch: vi.fn(),
}));
vi.mock("@/lib/offlineQueue", () => ({
  queueDurableWritesBatch: (...args: unknown[]) =>
    queueMocks.queueDurableWritesBatch(...args),
}));

import {
  batchLog,
  failNextFirestore,
  readDoc,
  resetFirestore,
  seedFirestore,
} from "@/test/firestoreHarness";
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
  resetFirestore();
  vi.clearAllMocks();
  Object.defineProperty(globalThis, "navigator", {
    value: { onLine: true },
    configurable: true,
  });
});

describe("commitBulkImportWrites", () => {
  it("chunks writes into 450-op Firestore writeBatches and reports progress", async () => {
    seedFirestore({
      "users/u-1/meals/csv-0": { existingTag: "keep" },
    });
    const entries = makeEntries(BULK_IMPORT_BATCH_SIZE + 50, true);
    const progress: { written: number; total: number }[] = [];

    const written = await commitBulkImportWrites("u-1", entries, (p) =>
      progress.push(p)
    );

    expect(written).toBe(500);
    expect(batchLog()).toHaveLength(2);
    expect(batchLog()[0]).toHaveLength(BULK_IMPORT_BATCH_SIZE);
    expect(batchLog()[1]).toHaveLength(50);
    expect(readDoc("users/u-1/meals/csv-0")).toMatchObject({
      existingTag: "keep",
      foodName: "Meal 0",
    });
    expect(progress).toEqual([
      { written: 450, total: 500 },
      { written: 500, total: 500 },
    ]);
    expect(queueMocks.queueDurableWritesBatch).not.toHaveBeenCalled();
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
    expect(batchLog()).toHaveLength(0);
    expect(queueMocks.queueDurableWritesBatch).toHaveBeenCalledOnce();
    expect(queueMocks.queueDurableWritesBatch).toHaveBeenCalledWith(
      "u-1",
      entries
    );
    expect(onProgress).toHaveBeenCalledWith({ written: 12, total: 12 });
  });

  it("falls back to queueDurableWritesBatch on transient network errors mid-import", async () => {
    const entries = makeEntries(BULK_IMPORT_BATCH_SIZE + 25);

    await commitBulkImportWrites("u-1", entries, ({ written }) => {
      if (written === BULK_IMPORT_BATCH_SIZE) {
        failNextFirestore("commit", { code: "unavailable" });
      }
    });

    expect(batchLog()).toHaveLength(1);
    expect(queueMocks.queueDurableWritesBatch).toHaveBeenCalledOnce();
    expect(queueMocks.queueDurableWritesBatch).toHaveBeenCalledWith(
      "u-1",
      entries.slice(BULK_IMPORT_BATCH_SIZE)
    );
  });

  it("rethrows permanent Firestore errors such as permission-denied", async () => {
    failNextFirestore("commit", { code: "permission-denied" });

    await expect(commitBulkImportWrites("u-1", makeEntries(3))).rejects.toThrow(
      /permission-denied/i
    );
    expect(queueMocks.queueDurableWritesBatch).not.toHaveBeenCalled();
  });
});
