/**
 * F5c (STATUS 2026-11-21): a soft-deleted meal is removed for good 30 days
 * after it was deleted, by the hourly `purgeSoftDeletedMeals`
 * (lib/mealPurge.js), against the in-memory Firestore.
 *
 * What it pins: a meal goes once its 30 days are up and not a moment
 * before; an active, restored or never-deleted meal stays; a meal restored
 * between the query and the delete stays (the transaction reads it again);
 * a device clock behind the server does not cut the 30 days short; an
 * account mid-deletion is left to the deletion executor (F5c pin (b)); a
 * run stops at its cap or its time limit and the next run takes the rest;
 * one account's failure does not stop the others; and the delete it makes
 * fires nothing that Delete permanently does not.
 */
import { describe, it, expect, vi } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");
const { withStoredTimestamps } = require("./helpers/storedTimestamps.cjs");
const { Timestamp } = require("firebase-admin/firestore");
const purge = require("../lib/mealPurge");
const badgeAwards = require("../lib/badgeAwards");
const { recordJobRun } = require("../lib/jobRuns");

const DAY = 86_400_000;
const MINUTE = 60_000;
const NOW = Date.UTC(2026, 10, 21, 12, 45);
const ago = (ms) => Timestamp.fromMillis(NOW - ms);
const RETENTION = purge.DELETED_MEAL_RETENTION_DAYS * DAY;

/** A meal as the app writes one, soft-deleted at `deletedAt` (a Timestamp,
 *  the app's `Timestamp.now()`), or null once restored. */
function meal(deletedAt, over = {}) {
  return {
    date: "2026-10-01",
    foodName: "Porridge",
    items: [{ name: "Oats" }],
    totalCalories: 400,
    createdAt: ago(60 * DAY),
    deletedAt,
    ...over,
  };
}

function world(seed, options) {
  return withStoredTimestamps(memoryFirestore(seed), options);
}

function run(db, over = {}) {
  return purge.purgeSoftDeletedMeals({
    firestore: db,
    toTimestamp: (ms) => Timestamp.fromMillis(ms),
    nowMs: NOW,
    ...over,
  });
}

const paths = (db, prefix = "users/") =>
  [...db.data.keys()].filter((p) => p.startsWith(prefix)).sort();

describe("which meals go", () => {
  it("keeps a deleted meal for 30 days (the owner's call, F5c STATUS 2026-11-21)", () => {
    expect(purge.DELETED_MEAL_RETENTION_DAYS).toBe(30);
  });

  it("removes a meal 30 days after it was deleted, and keeps the rest", async () => {
    const db = world({
      "users/u1/meals/old": meal(ago(31 * DAY)),
      "users/u1/meals/due": meal(ago(RETENTION)),
      "users/u1/meals/nearly": meal(ago(RETENTION - MINUTE)),
      "users/u1/meals/recent": meal(ago(2 * DAY)),
      "users/u1/meals/restored": meal(null),
      "users/u1/meals/live": meal(undefined),
    });
    const summary = await run(db);
    expect(paths(db)).toEqual([
      "users/u1/meals/live",
      "users/u1/meals/nearly",
      "users/u1/meals/recent",
      "users/u1/meals/restored",
    ]);
    expect(summary).toMatchObject({ purged: 2, more: false });
  });

  it("keeps a meal restored after the query found it", async () => {
    /* The person taps Restore while the job runs. The transaction reads
       the meal again and sees `deletedAt: null`, so nothing is deleted. */
    const db = memoryFirestore({
      "users/u1/meals/m1": meal(ago(40 * DAY)),
    });
    withStoredTimestamps(db, {
      beforeTransaction: () => db.data.set("users/u1/meals/m1", meal(null)),
    });
    const summary = await run(db);
    expect(paths(db)).toEqual(["users/u1/meals/m1"]);
    expect(summary).toMatchObject({ purged: 0, notDue: 1 });
  });

  it("counts the 30 days from when the server took the delete, if that is later", async () => {
    /* A phone whose clock runs 40 days behind stamps `deletedAt` 40 days
       in the past. The server took the write an hour ago, so the meal
       still has its 30 days. A meal the server took 31 days ago goes. */
    const db = world(
      {
        "users/u1/meals/slowClock": meal(ago(40 * DAY)),
        "users/u1/meals/due": meal(ago(40 * DAY)),
      },
      {
        updateTimes: {
          "users/u1/meals/slowClock": ago(60 * MINUTE),
          "users/u1/meals/due": ago(31 * DAY),
        },
      }
    );
    const summary = await run(db);
    expect(paths(db)).toEqual(["users/u1/meals/slowClock"]);
    expect(summary).toMatchObject({ purged: 1, notDue: 1 });
  });

  it("keeps a meal whose last write the server cannot date", async () => {
    /* The Admin SDK always gives a snapshot its updateTime. Without one
       there is no telling when the delete reached the server, so the meal
       stays rather than going on the phone's clock alone. */
    const db = world(
      { "users/u1/meals/m1": meal(ago(40 * DAY)) },
      { updateTimes: { "users/u1/meals/m1": undefined } }
    );
    const summary = await run(db);
    expect(db.data.has("users/u1/meals/m1")).toBe(true);
    expect(summary).toMatchObject({ purged: 0, notDue: 1 });
  });

  it("keeps a meal whose deletedAt is not a timestamp by the time it is read", async () => {
    /* The query matches Timestamps only, but the document can be written
       between the query and the transaction. A string or a number in
       `deletedAt` is not a deletion time the job reads, so the meal stays,
       even with a last write long past. */
    const db = memoryFirestore({
      "users/u1/meals/text": meal(ago(40 * DAY)),
      "users/u1/meals/number": meal(ago(40 * DAY)),
    });
    withStoredTimestamps(db, {
      updateTimes: {
        "users/u1/meals/text": ago(40 * DAY),
        "users/u1/meals/number": ago(40 * DAY),
      },
      beforeTransaction: () => {
        db.data.set("users/u1/meals/text", meal("2026-09-01T00:00:00Z"));
        db.data.set("users/u1/meals/number", meal(NOW - 40 * DAY));
      },
    });
    const summary = await run(db);
    expect(paths(db)).toEqual(["users/u1/meals/number", "users/u1/meals/text"]);
    expect(summary).toMatchObject({ purged: 0, notDue: 2 });
  });

  it("touches only meals in a person's diary", async () => {
    const db = world({
      "users/u1/meals/m1": meal(ago(40 * DAY)),
      "recipes/r1/meals/m1": meal(ago(40 * DAY)),
    });
    await run(db);
    expect(db.data.has("users/u1/meals/m1")).toBe(false);
    expect(db.data.has("recipes/r1/meals/m1")).toBe(true);
  });
});

describe("an account being deleted (F5c pin (b))", () => {
  it("leaves its meals to the deletion executor, and goes on with the others", async () => {
    const db = world({
      "users/running/meals/m1": meal(ago(40 * DAY)),
      "accountDeletionRequests/running": { status: "running" },
      "users/review/meals/m1": meal(ago(40 * DAY)),
      "accountDeletionRequests/review": { status: "operator_review" },
      "users/gone/meals/m1": meal(ago(40 * DAY)),
      // The tombstone's expiry is read against the real clock
      // (isTombstoneLive), so it is set from the real clock too.
      "deletedAccounts/gone": {
        expiresAt: Timestamp.fromMillis(Date.now() + DAY),
      },
      "users/cancelled/meals/m1": meal(ago(40 * DAY)),
      "accountDeletionRequests/cancelled": { status: "cancelled" },
      "users/ana/meals/m1": meal(ago(40 * DAY)),
    });
    const summary = await run(db);
    expect(paths(db, "users/")).toEqual([
      "users/gone/meals/m1",
      "users/review/meals/m1",
      "users/running/meals/m1",
    ]);
    expect(summary).toMatchObject({ purged: 2, deleting: 3 });
  });

  it("reads the deletion freeze inside the transaction that deletes", async () => {
    /* The executor starting between the query and the delete is seen: the
       freeze is read in the same transaction as the meals. A server
       transaction locks what it reads, so a request written after those
       reads waits for the commit, and the executor then finds the meals
       already gone. */
    const db = memoryFirestore({
      "users/u1/meals/m1": meal(ago(40 * DAY)),
    });
    withStoredTimestamps(db, {
      beforeTransaction: () =>
        db.data.set("accountDeletionRequests/u1", { status: "running" }),
    });
    const summary = await run(db);
    expect(db.data.has("users/u1/meals/m1")).toBe(true);
    expect(summary).toMatchObject({ purged: 0, deleting: 1 });
  });
});

describe("how much one run does", () => {
  const due = (n, uid = "u1") =>
    Object.fromEntries(
      Array.from({ length: n }, (_, i) => [
        `users/${uid}/meals/m${String(i).padStart(3, "0")}`,
        meal(ago(40 * DAY + i * MINUTE)),
      ])
    );

  it("stops at its cap, and the next run takes the rest", async () => {
    const db = world(due(5));
    expect(await run(db, { runCap: 3 })).toMatchObject({
      purged: 3,
      more: true,
    });
    expect(paths(db)).toHaveLength(2);
    expect(await run(db, { runCap: 3 })).toMatchObject({
      purged: 2,
      more: false,
    });
    expect(paths(db)).toEqual([]);
  });

  it("reads past meals it must leave, so they never hold up the rest", async () => {
    /* A page of meals from an account mid-deletion comes first; the run
       pages on past them in the same hour. */
    const db = world({
      ...due(4, "a-deleting"),
      "accountDeletionRequests/a-deleting": { status: "running" },
      ...due(3, "b-ana"),
    });
    const summary = await run(db, { pageSize: 2 });
    expect(paths(db, "users/b-ana")).toEqual([]);
    expect(paths(db, "users/a-deleting")).toHaveLength(4);
    expect(summary).toMatchObject({ purged: 3, deleting: 4, read: 7 });
  });

  it("deletes in transactions of at most its size, one account each", async () => {
    const db = world({ ...due(5, "u1"), ...due(2, "u2") });
    const sizes = [];
    const runTransaction = db.runTransaction;
    db.runTransaction = (fn) =>
      runTransaction(async (tx) => {
        let deletes = 0;
        const owners = new Set();
        const value = await fn({
          ...tx,
          delete: (ref) => {
            deletes++;
            owners.add(ref.path.split("/")[1]);
            return tx.delete(ref);
          },
        });
        sizes.push([deletes, [...owners]]);
        return value;
      });
    await run(db, { transactionSize: 2 });
    expect(sizes).toEqual([
      [2, ["u1"]],
      [2, ["u1"]],
      [1, ["u1"]],
      [2, ["u2"]],
    ]);
  });

  it("stops at its time limit and says so", async () => {
    const db = world(due(4));
    let t = 0;
    const summary = await run(db, {
      transactionSize: 1,
      timeLimitMs: 2,
      clock: () => t++,
    });
    expect(summary.stoppedAtTimeLimit).toBe(true);
    expect(summary.more).toBe(true);
    expect(summary.purged).toBeLessThan(4);
    expect(paths(db).length + summary.purged).toBe(4);
  });

  it("goes on with the other accounts when one fails, then fails the run with its counts", async () => {
    const db = world({ ...due(1, "u1"), ...due(1, "u2") });
    db.failures.set("delete:users/u1/meals/m000", new Error("unavailable"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const failure = await run(db).catch((err) => err);
    log.mockRestore();
    // The other account's meal still went.
    expect(db.data.has("users/u2/meals/m000")).toBe(false);
    expect(db.data.has("users/u1/meals/m000")).toBe(true);
    expect(failure).toBeInstanceOf(Error);
    expect(failure.summary).toMatchObject({ purged: 1, failed: 1, read: 2 });
    expect(failure.message).toMatch(/1 of 2 meals failed/);
  });

  it("a run with a failed transaction is recorded as failed in jobRuns, with its counts", async () => {
    /* A Firestore outage fails every transaction. Recorded as "ok" with
       `failed: N` in the summary, it would read as a quiet hour. */
    const db = world({ ...due(2, "u1") });
    db.failures.set("delete:users/u1/meals/m000", new Error("unavailable"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      recordJobRun(db, "purgeSoftDeletedMeals", () => run(db))
    ).rejects.toThrow(/2 of 2 meals failed/);
    log.mockRestore();
    expect(db.data.get("jobRuns/purgeSoftDeletedMeals")).toMatchObject({
      lastOutcome: "failed",
      running: false,
      lastError: expect.stringMatching(/2 of 2 meals failed.*purged 0/),
    });
  });

  it("a run with nothing failed is recorded as ok", async () => {
    const db = world(due(2));
    await expect(
      recordJobRun(db, "purgeSoftDeletedMeals", () => run(db))
    ).resolves.toMatchObject({ purged: 2, failed: 0 });
    expect(db.data.get("jobRuns/purgeSoftDeletedMeals")).toMatchObject({
      lastOutcome: "ok",
      lastSummary: expect.objectContaining({ purged: 2, failed: 0 }),
    });
  });

  it("fails the run when it cannot find the meals, so the run record says so", async () => {
    const db = world(due(1));
    db.failures.set("query:meals", new Error("FAILED_PRECONDITION: index"));
    await expect(run(db)).rejects.toThrow("FAILED_PRECONDITION");
  });

  it("keeps the summary to counts: it is stored in jobRuns", async () => {
    const db = world({
      ...due(1, "u1"),
      ...due(1, "u2"),
      "accountDeletionRequests/u2": { status: "running" },
    });
    const summary = await run(db);
    expect(JSON.stringify(summary)).not.toMatch(/u1|u2|m000/);
    expect(Object.values(summary).every((v) => typeof v !== "object")).toBe(
      true
    );
  });
});

describe("what the purge sets off", () => {
  it("its delete reads and writes nothing in onMealWritten, as Delete permanently's does", async () => {
    /* The purge is a document delete, the same write the person's own
       Delete permanently makes, so it fires onMealWritten with no `after`.
       The badge award stops there: a badge already earned stays (badges
       are history), and nothing is counted or reversed. */
    const untouchable = new Proxy(
      {},
      {
        get() {
          throw new Error("onMealWritten read Firestore on a delete");
        },
      }
    );
    await expect(
      badgeAwards.awardForMeal(
        untouchable,
        "u1",
        "m1",
        meal(ago(40 * DAY)),
        null,
        { nowMs: NOW }
      )
    ).resolves.toEqual([]);
  });
});

describe("its index and its wiring", () => {
  it("the collection-group query on deletedAt has its index, and the archive keeps its own", () => {
    /* Production refuses a collection-group query without its index; the
       fake does not, so the index is pinned here. The override replaces
       the field's automatic indexes, so the collection's own pair stays
       in it: Recently deleted orders by deletedAt, newest first. */
    const { fieldOverrides } = JSON.parse(
      readFileSync(
        new URL("../../firestore.indexes.json", import.meta.url),
        "utf8"
      )
    );
    const override = fieldOverrides.find(
      (o) => o.collectionGroup === "meals" && o.fieldPath === "deletedAt"
    );
    expect(override?.indexes).toEqual(
      expect.arrayContaining([
        { order: "ASCENDING", queryScope: "COLLECTION" },
        { order: "DESCENDING", queryScope: "COLLECTION" },
        { order: "ASCENDING", queryScope: "COLLECTION_GROUP" },
      ])
    );
  });

  it("the hourly job runs this purge, recorded in jobRuns", () => {
    const index = readFileSync(new URL("../index.js", import.meta.url), "utf8");
    const start = index.indexOf("exports.purgeSoftDeletedMeals = functions");
    expect(start).toBeGreaterThan(-1);
    const body = index.slice(start, index.indexOf("\nexports.", start + 1));
    expect(body).toMatch(/runWith\(SCHEDULED_CAP\)/);
    expect(body).toMatch(/jobRuns\.recordJobRun\(db, "purgeSoftDeletedMeals"/);
    expect(body).toMatch(/mealPurge\.purgeSoftDeletedMeals\(\{/);
  });
});
