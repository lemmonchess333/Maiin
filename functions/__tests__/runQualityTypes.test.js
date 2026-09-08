/**
 * The server's quality-run predicate must compare against spellings the
 * client actually writes.
 *
 * `aggregateWindow` counted a run as quality when `activityType` was
 * "tempo" or "interval". The client's `ActivityType` union
 * (src/types/run.ts) has never contained "interval" — the app writes
 * "intervals" — so an interval session saved without `intervalData`
 * scored no quality bonus at all: a hidden −10 swing on run load, and
 * therefore on the performance index and the deload suggestion built
 * from it. Found by the 2026-09-05 logic evaluation (F6).
 *
 * Two pins. The first drives the running copy with a document shaped the
 * way RunSummary writes it. The second reads the client union from its
 * source file and asserts that EVERY activity-type literal the server
 * compares against is a member — so a literal the client cannot produce
 * fails here, whatever its spelling.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

const require = createRequire(import.meta.url);
// performanceEngine.js calls admin.firestore() at module load; initialise
// the shared test app first (same pattern as performanceEngine.test.js).
const admin = require("firebase-admin");
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: process.env.GCLOUD_PROJECT || "tropos-unit-test",
  });
}
const engine = require("../performanceEngine.js");
const { aggregateWindow } = engine._internal;

const start = new Date("2026-08-03T00:00:00Z");
const end = new Date("2026-08-31T00:00:00Z");
const ts = (iso) => ({ toDate: () => new Date(iso) });
const run = (activityType, extra = {}) => ({
  completedAt: ts("2026-08-10T07:00:00Z"),
  distance: 8000,
  activityType,
  ...extra,
});

describe("runQualityCount — activity-type literals", () => {
  it("counts an interval session saved without intervalData", () => {
    const agg = aggregateWindow(start, end, [], [run("intervals")], [], []);
    expect(agg.runQualityCount).toBe(1);
  });

  it("counts tempo, and intervalData on any type", () => {
    const runs = [run("tempo"), run("easy", { intervalData: { reps: 6 } })];
    const agg = aggregateWindow(start, end, [], runs, [], []);
    expect(agg.runQualityCount).toBe(2);
  });

  it("does not count an easy run", () => {
    const agg = aggregateWindow(start, end, [], [run("easy")], [], []);
    expect(agg.runQualityCount).toBe(0);
  });

  it("compares only against literals in the client ActivityType union", () => {
    const clientSource = readFileSync(
      resolve(here, "../../src/types/run.ts"),
      "utf8"
    );
    const unionMatch = clientSource.match(
      /export type ActivityType =([\s\S]*?);/
    );
    expect(
      unionMatch,
      "ActivityType union not found in src/types/run.ts"
    ).not.toBeNull();
    const clientLiterals = new Set(
      [...unionMatch[1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1])
    );
    expect(clientLiterals.has("intervals")).toBe(true);

    const serverSource = readFileSync(
      resolve(here, "../performanceEngine.js"),
      "utf8"
    );
    const compared = [...serverSource.matchAll(/\bat === "([a-z_]+)"/g)].map(
      (m) => m[1]
    );
    expect(compared.length).toBeGreaterThan(0);
    for (const literal of compared) {
      expect(
        clientLiterals.has(literal),
        `server compares activityType to "${literal}", which the client never writes`
      ).toBe(true);
    }
  });
});
