/**
 * computePerformanceWeek refuses a weekKey that is not a day.
 *
 * The key becomes the id of the performance document the callable writes,
 * and it went in unchecked: any string the caller sent named a document,
 * and a non-date one failed deep in the engine and came back as INTERNAL
 * with the raw error text. Now anything but null or a real YYYY-MM-DD is
 * refused up front with invalid-argument, before the engine reads a thing.
 *
 * Run through the real callable (`.run`) over an in-memory Firestore, so
 * the deletion lock and the rate limit it passes first are the real ones.
 */
import { describe, it, expect, afterEach } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "demo-tropos";

const admin = require("firebase-admin");
const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");
const { computePerformanceWeek } = require("../index");

function installFirestore(db) {
  const real = admin.firestore;
  const firestore = Object.assign(() => db, {
    FieldValue: real.FieldValue,
    Timestamp: real.Timestamp,
  });
  Object.defineProperty(admin, "firestore", {
    configurable: true,
    get: () => firestore,
  });
}

afterEach(() => {
  delete admin.firestore;
});

const context = { auth: { uid: "u1", token: {} } };

describe("computePerformanceWeek's weekKey", () => {
  it.each([
    ["not a date at all", "not-a-date"],
    ["a day that does not exist", "2026-02-30"],
    ["a path", "../../users/victim"],
    ["a number", 20260101],
  ])("refuses %s with invalid-argument", async (_label, weekKey) => {
    const db = memoryFirestore({ "users/u1": {} });
    installFirestore(db);
    await expect(
      computePerformanceWeek.run({ weekKey }, context)
    ).rejects.toMatchObject({ code: "invalid-argument" });
    // Refused before the engine: no performance document was written.
    expect(
      [...db.data.keys()].filter((path) => path.includes("/performance/"))
    ).toEqual([]);
  });

  it("still refuses a caller who is not signed in first", async () => {
    await expect(
      computePerformanceWeek.run({ weekKey: "nope" }, {})
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });
});
