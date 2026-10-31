import { describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { markDeletedRun } = require("../lib/healthWorkoutLedger");

function harness(initial) {
  let value = initial;
  const ref = { path: "users/u1/healthWorkoutExports/run-1" };
  const tx = {
    get: vi.fn(async () => ({
      exists: value != null,
      data: () => value,
    })),
    update: vi.fn((_, patch) => {
      value = { ...value, ...patch };
    }),
  };
  const db = {
    doc: vi.fn(() => ref),
    runTransaction: (fn) => fn(tx),
  };
  return { db, tx, value: () => value };
}

describe("Apple Health run deletion tombstone", () => {
  it("marks an existing export and is idempotent on trigger retry", async () => {
    const { db, tx, value } = harness({ state: "exported" });
    const timestamp = () => 123;
    expect(await markDeletedRun(db, "u1", "run-1", timestamp)).toBe(true);
    expect(value()).toEqual({ state: "pending-delete", updatedAt: 123 });
    expect(await markDeletedRun(db, "u1", "run-1", timestamp)).toBe(false);
    expect(tx.update).toHaveBeenCalledTimes(1);
    expect(db.doc).toHaveBeenCalledWith(
      "users/u1/healthWorkoutExports/run-1"
    );
  });

  it("does not create a marker for a run with no Health export attempt", async () => {
    const { db, tx } = harness(null);
    expect(await markDeletedRun(db, "u1", "run-1", () => 123)).toBe(false);
    expect(tx.update).not.toHaveBeenCalled();
  });
});
