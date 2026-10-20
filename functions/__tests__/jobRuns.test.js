/**
 * The scheduled jobs' run record: a start, then a finish that says how,
 * and the job's own result and failure passed through untouched.
 */
import { describe, it, expect, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { recordJobRun, storableMessage } = require("../lib/jobRuns");

function fakeFirestore({ failWrites = false } = {}) {
  const doc = {};
  const writes = [];
  const firestore = {
    collection: (name) => ({
      doc: (id) => ({
        set: async (fields, options) => {
          writes.push({ path: `${name}/${id}`, fields, options });
          if (failWrites) throw new Error("unavailable");
          Object.assign(doc, fields);
        },
      }),
    }),
  };
  return { firestore, doc, writes };
}

const clock = (...times) => {
  const queue = times.map((t) => new Date(t));
  return () => queue.shift();
};

describe("recordJobRun", () => {
  it("records a start, then a finish with the job's summary", async () => {
    const { firestore, doc, writes } = fakeFirestore();
    const result = await recordJobRun(
      firestore,
      "weeklyPerformanceRollup",
      async () => {
        // While it runs, the record says so.
        expect(doc.running).toBe(true);
        return { users: 12, failed: 1 };
      },
      { now: clock("2026-10-20T23:15:00Z", "2026-10-20T23:16:30Z") }
    );

    expect(result).toEqual({ users: 12, failed: 1 });
    expect(
      writes.every((w) => w.path === "jobRuns/weeklyPerformanceRollup")
    ).toBe(true);
    expect(writes.every((w) => w.options?.merge === true)).toBe(true);
    expect(doc).toEqual({
      name: "weeklyPerformanceRollup",
      lastStartedAt: new Date("2026-10-20T23:15:00Z"),
      lastFinishedAt: new Date("2026-10-20T23:16:30Z"),
      lastOutcome: "ok",
      lastDurationMs: 90000,
      lastSummary: { users: 12, failed: 1 },
      lastError: null,
      running: false,
    });
  });

  it("records a failure and rethrows it, so the run is not counted a success", async () => {
    const { firestore, doc } = fakeFirestore();
    const failure = new Error("lastActiveAt query failed for ana@example.com");
    await expect(
      recordJobRun(firestore, "dailyPerformanceRefresh", async () => {
        throw failure;
      })
    ).rejects.toBe(failure);
    expect(doc).toMatchObject({
      lastOutcome: "failed",
      lastError: "lastActiveAt query failed for <email>",
      running: false,
    });
    expect(doc.lastFailedAt).toEqual(doc.lastFinishedAt);
  });

  it("leaves a start with no finish when the job never ends", async () => {
    const { firestore, doc } = fakeFirestore();
    void recordJobRun(
      firestore,
      "hourlyStreakNudge",
      () => new Promise(() => {})
    );
    await Promise.resolve();
    expect(doc).toMatchObject({ running: true });
    expect(doc.lastFinishedAt).toBeUndefined();
  });

  it("never fails the job for want of a record", async () => {
    const { firestore } = fakeFirestore({ failWrites: true });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      recordJobRun(firestore, "rolloverChallenges", async () => "done")
    ).resolves.toBe("done");
    expect(log).toHaveBeenCalledWith(
      "jobRuns: could not record rolloverChallenges:",
      "unavailable"
    );
    log.mockRestore();
  });
});

describe("storableMessage", () => {
  it("drops addresses and keeps it short", () => {
    expect(
      storableMessage(new Error("bounce for a.b+c@mail.example.org"))
    ).toBe("bounce for <email>");
    expect(storableMessage(new Error("x".repeat(400)))).toHaveLength(300);
    expect(storableMessage("plain")).toBe("plain");
  });
});
