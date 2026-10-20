/**
 * Integration: a scheduled job's run is recorded in jobRuns/{name}, and a
 * run whose first query fails is recorded as failed, not as a success.
 *
 * Driven through the real weeklyPerformanceRollup export against the
 * emulator, with only the active-user query answered by the test. Before,
 * that failure was logged and the job returned: Cloud Functions counted a
 * success, and nothing anywhere said the week's rollup had not run.
 *
 * Gated on FIRESTORE_EMULATOR_HOST — skips in an ordinary unit run.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const suite = EMULATOR_HOST ? describe : describe.skip;

let db;
let weeklyPerformanceRollup;

beforeAll(() => {
  if (!EMULATOR_HOST) return;
  weeklyPerformanceRollup = require("../../index").weeklyPerformanceRollup;
  db = require("firebase-admin").firestore();
});

/** Answer only the sweep's `users where lastActiveAt >=` query. */
function answerActiveUsers(answer) {
  const collection = db.collection.bind(db);
  return vi
    .spyOn(db, "collection")
    .mockImplementation((name) =>
      name === "users" ? { where: () => ({ get: answer }) } : collection(name)
    );
}

const record = async () =>
  (await db.doc("jobRuns/weeklyPerformanceRollup").get()).data();

suite("a scheduled job leaves a record of its run", () => {
  let spy;
  beforeEach(async () => {
    await db.doc("jobRuns/weeklyPerformanceRollup").delete();
  });
  afterEach(() => spy && spy.mockRestore());

  it("records a run that finished, with what it did", async () => {
    spy = answerActiveUsers(async () => ({ docs: [] }));
    await weeklyPerformanceRollup.run({});
    expect(await record()).toMatchObject({
      name: "weeklyPerformanceRollup",
      lastOutcome: "ok",
      lastSummary: { users: 0, failed: 0 },
      lastError: null,
      running: false,
    });
  });

  it("records a run whose first query failed as failed, and fails the run", async () => {
    spy = answerActiveUsers(async () => {
      throw new Error("deadline exceeded");
    });
    // Before: the run resolved, and no record existed.
    await expect(weeklyPerformanceRollup.run({})).rejects.toThrow(
      "deadline exceeded"
    );
    const run = await record();
    expect(run).toMatchObject({
      lastOutcome: "failed",
      lastError: "deadline exceeded",
      running: false,
    });
    expect(run.lastStartedAt).toBeDefined();
  });
});
