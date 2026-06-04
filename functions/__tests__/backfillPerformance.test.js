/**
 * Unit tests for the one-off PI backfill (scripts/backfillPerformance.js).
 *
 * The script delegates the actual scoring/write to the production engine
 * (computeAndWritePerformanceForUser) and the user-selection shape to the same
 * bounded `lastActiveAt` query as weeklyPerformanceRollup. These tests pin the
 * script's own glue: arg parsing, the bounded (never-full-scan) query, dry-run
 * writing nothing, the tombstone guard skipping deletions, per-user error
 * isolation, and batched concurrency — via injected fakes (main is
 * dependency-injected so no admin/emulator is needed).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { main, parseArgs, BATCH_SIZE } = require("../scripts/backfillPerformance");

// Silence the script's console.* progress output during tests.
beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const Timestamp = { fromDate: (d) => ({ __ts: d.getTime() }) };

function fakeDb(uids, { onQuery } = {}) {
  return {
    collection() {
      return {
        where(field, op, value) {
          if (onQuery) onQuery(field, op, value);
          return {
            async get() {
              return { docs: uids.map((id) => ({ id })) };
            },
          };
        },
      };
    },
  };
}

describe("parseArgs", () => {
  it("defaults to a live run with a 30-day cutoff", () => {
    expect(parseArgs(["node", "s.js"])).toEqual({ dryRun: false, cutoffDays: 30 });
  });

  it("parses --dry-run and --cutoff-days", () => {
    expect(parseArgs(["node", "s.js", "--dry-run", "--cutoff-days=7"])).toEqual({
      dryRun: true,
      cutoffDays: 7,
    });
  });

  it("rejects an invalid cutoff", () => {
    const exit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exit");
    });
    expect(() => parseArgs(["node", "s.js", "--cutoff-days=0"])).toThrow();
    expect(() => parseArgs(["node", "s.js", "--cutoff-days=abc"])).toThrow();
    exit.mockRestore();
  });

  it("rejects unknown flags", () => {
    const exit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exit");
    });
    expect(() => parseArgs(["node", "s.js", "--wat"])).toThrow();
    exit.mockRestore();
  });
});

describe("main", () => {
  let computeFn;
  beforeEach(() => {
    computeFn = vi.fn(async (uid) => ({
      performanceIndex: 50,
      loadBand: "moderate",
      weekKey: "2026-06-04",
      uid,
    }));
  });

  it("queries with a bounded lastActiveAt cutoff (never a full scan)", async () => {
    const seen = {};
    const db = fakeDb(["u1"], {
      onQuery: (field, op) => {
        seen.field = field;
        seen.op = op;
      },
    });
    await main({
      dryRun: false,
      cutoffDays: 30,
      db,
      Timestamp,
      computeFn,
      shouldProceed: async () => true,
    });
    expect(seen.field).toBe("lastActiveAt");
    expect(seen.op).toBe(">=");
  });

  it("recomputes every eligible user via the canonical engine", async () => {
    const db = fakeDb(["u1", "u2", "u3"]);
    const summary = await main({
      dryRun: false,
      cutoffDays: 30,
      db,
      Timestamp,
      computeFn,
      shouldProceed: async () => true,
    });
    expect(computeFn).toHaveBeenCalledTimes(3);
    // null compute key => "today", matching weeklyPerformanceRollup
    expect(computeFn).toHaveBeenCalledWith("u1", null);
    expect(summary).toEqual({ recomputed: 3, skippedDeletion: 0, errors: 0 });
  });

  it("dry-run writes nothing", async () => {
    const db = fakeDb(["u1", "u2"]);
    const summary = await main({
      dryRun: true,
      cutoffDays: 30,
      db,
      Timestamp,
      computeFn,
      shouldProceed: async () => true,
    });
    expect(computeFn).not.toHaveBeenCalled();
    expect(summary).toEqual({ recomputed: 0, skippedDeletion: 0, errors: 0 });
  });

  it("skips users with deletion in progress (tombstone guard)", async () => {
    const db = fakeDb(["keep", "deleting"]);
    const summary = await main({
      dryRun: false,
      cutoffDays: 30,
      db,
      Timestamp,
      computeFn,
      shouldProceed: async (uid) => uid !== "deleting",
    });
    expect(computeFn).toHaveBeenCalledTimes(1);
    expect(computeFn).toHaveBeenCalledWith("keep", null);
    expect(summary).toEqual({ recomputed: 1, skippedDeletion: 1, errors: 0 });
  });

  it("isolates a per-user failure without aborting the run", async () => {
    const db = fakeDb(["good1", "bad", "good2"]);
    computeFn = vi.fn(async (uid) => {
      if (uid === "bad") throw new Error("boom");
      return { performanceIndex: 60, loadBand: "moderate", weekKey: "2026-06-04" };
    });
    const summary = await main({
      dryRun: false,
      cutoffDays: 30,
      db,
      Timestamp,
      computeFn,
      shouldProceed: async () => true,
    });
    expect(summary).toEqual({ recomputed: 2, skippedDeletion: 0, errors: 1 });
  });

  it("processes more than one batch (bounded concurrency)", async () => {
    const many = Array.from({ length: BATCH_SIZE * 2 + 3 }, (_, i) => `u${i}`);
    const db = fakeDb(many);
    const summary = await main({
      dryRun: false,
      cutoffDays: 30,
      db,
      Timestamp,
      computeFn,
      shouldProceed: async () => true,
    });
    expect(computeFn).toHaveBeenCalledTimes(many.length);
    expect(summary.recomputed).toBe(many.length);
  });

  it("propagates a query failure (abort, not silent full scan)", async () => {
    const db = {
      collection: () => ({
        where: () => ({
          get: async () => {
            throw new Error("index missing");
          },
        }),
      }),
    };
    await expect(
      main({
        dryRun: false,
        cutoffDays: 30,
        db,
        Timestamp,
        computeFn,
        shouldProceed: async () => true,
      })
    ).rejects.toThrow("index missing");
    expect(computeFn).not.toHaveBeenCalled();
  });
});
