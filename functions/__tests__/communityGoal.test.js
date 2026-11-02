/**
 * The community goal counts every saved run, joined or not, and a deleted
 * run comes back off it (lib/communityGoal.js, ADR-0012).
 *
 * Driven through the in-memory Firestore, which applies transactions,
 * queries and increments as Firestore does. The emulator suite
 * (integration/communityGoal.test.js) drives the same paths through the
 * real run triggers.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const { memoryFirestore, increment } = require("./helpers/memoryFirestore.cjs");
const {
  isCommunityGoal,
  communityGoalMeters,
  creditRunToCommunityGoals,
  reverseRunFromCommunityGoals,
  backfillCommunityGoal,
} = require("../lib/communityGoal");
const { USER_SUBCOLLECTIONS } = require("../accountDeletion");

const fieldValue = { increment, serverTimestamp: () => "now" };

const GOAL = "group-goal-2026-11-01";
const MILEAGE = "monthly-2026-11-01";
const OCTOBER_GOAL = "group-goal-2026-10-01";

const goalDoc = (start, end) => ({
  name: "Together: 1,000 km",
  type: "monthly",
  metric: "total_km",
  collectiveTarget: 1000,
  tiers: { bronze: 1000, silver: 1000, gold: 1000 },
  startDate: new Date(`${start}T00:00:00Z`),
  endDate: new Date(`${end}T00:00:00Z`),
  participantCount: 0,
});

let db;

beforeEach(() => {
  db = memoryFirestore({
    [`challenges/${GOAL}`]: goalDoc("2026-11-01", "2026-12-01"),
    [`challenges/${OCTOBER_GOAL}`]: goalDoc("2026-10-01", "2026-11-01"),
    // A member-only km challenge in the same month: not a community goal.
    [`challenges/${MILEAGE}`]: {
      ...goalDoc("2026-11-01", "2026-12-01"),
      collectiveTarget: undefined,
      tiers: { bronze: 10, silver: 25, gold: 50 },
    },
  });
});

const goal = (id = GOAL) => db.data.get(`challenges/${id}`);

async function saveRun(uid, runId, run) {
  const path = `users/${uid}/runs/${runId}`;
  db.data.set(path, run);
  return creditRunToCommunityGoals(db, {
    uid,
    runId,
    data: run,
    activityDateKey: run.date,
    sourceRef: db.doc(path),
    fieldValue,
  });
}

async function deleteRun(uid, runId) {
  db.data.delete(`users/${uid}/runs/${runId}`);
  return reverseRunFromCommunityGoals(db, { uid, runId, fieldValue });
}

const run = (date, distance, duration = distance * 0.3) => ({
  date,
  distance,
  duration,
});

describe("isCommunityGoal", () => {
  it("is a km challenge with a shared target", () => {
    expect(isCommunityGoal(goalDoc("2026-11-01", "2026-12-01"))).toBe(true);
    expect(isCommunityGoal({ metric: "total_km" })).toBe(false);
    expect(
      isCommunityGoal({ metric: "hybrid_score", collectiveTarget: 1000 })
    ).toBe(false);
    expect(isCommunityGoal(null)).toBe(false);
  });
});

describe("communityGoalMeters", () => {
  it("is the run's km credit, in whole metres", () => {
    expect(communityGoalMeters(run("2026-11-03", 5137, 1544))).toBe(5140);
  });

  it("is nothing for a run that counts nowhere", () => {
    // Flagged, saved anyway, too short, past 500 km, faster than on foot.
    expect(
      communityGoalMeters({ ...run("2026-11-03", 5000), isInvalid: true })
    ).toBe(0);
    expect(
      communityGoalMeters({ ...run("2026-11-03", 5000), savedAnyway: true })
    ).toBe(0);
    expect(communityGoalMeters(run("2026-11-03", 40, 60))).toBe(0);
    expect(communityGoalMeters(run("2026-11-03", 600000, 300000))).toBe(0);
    expect(communityGoalMeters(run("2026-11-03", 20000, 480))).toBe(0);
  });
});

describe("a saved run", () => {
  it("adds to the goal from someone who never joined", async () => {
    await expect(saveRun("ana", "r1", run("2026-11-03", 5000))).resolves.toBe(
      1
    );
    expect(goal()).toMatchObject({
      collectiveMeters: 5000,
      collectiveRunners: 1,
    });
    // Nobody joined: the participant path has nothing to credit.
    expect([...db.data.keys()].some((k) => k.includes("/participants/"))).toBe(
      false
    );
    // Only the community goal, not the member-only km challenge.
    expect(goal(MILEAGE).collectiveMeters).toBeUndefined();
  });

  it("counts a person once, however many runs they save", async () => {
    await saveRun("ana", "r1", run("2026-11-03", 5000));
    await saveRun("ana", "r2", run("2026-11-04", 8000));
    await saveRun("ben", "r1", run("2026-11-04", 3000));
    expect(goal()).toMatchObject({
      collectiveMeters: 16000,
      collectiveRunners: 2,
    });
  });

  it("adds nothing when the trigger is delivered again", async () => {
    const r = run("2026-11-03", 5000);
    await saveRun("ana", "r1", r);
    await expect(saveRun("ana", "r1", r)).resolves.toBe(0);
    expect(goal()).toMatchObject({
      collectiveMeters: 5000,
      collectiveRunners: 1,
    });
  });

  it("counts towards the goal of its own day's month only", async () => {
    await saveRun("ana", "r1", run("2026-10-31", 5000));
    expect(goal(OCTOBER_GOAL).collectiveMeters).toBe(5000);
    expect(goal().collectiveMeters).toBeUndefined();
  });

  it("adds nothing outside every goal's window", async () => {
    await expect(saveRun("ana", "r1", run("2026-12-02", 5000))).resolves.toBe(
      0
    );
    expect(goal().collectiveMeters).toBeUndefined();
    await expect(
      saveRun("ana", "r2", { ...run("2026-11-03", 5000), date: undefined })
    ).resolves.toBe(0);
  });

  it("adds nothing for a run too far or too fast to be real", async () => {
    await saveRun("ana", "r1", run("2026-11-03", 600000, 300000));
    await saveRun("ana", "r2", run("2026-11-03", 20000, 480));
    await saveRun("ana", "r3", { ...run("2026-11-03", 5000), isInvalid: true });
    expect(goal().collectiveMeters).toBeUndefined();
    expect(goal().collectiveRunners).toBeUndefined();
  });

  it("adds nothing from a restricted account", async () => {
    db.data.set("globalRestrictedUids/ana", { restrictedAt: "x" });
    await expect(saveRun("ana", "r1", run("2026-11-03", 5000))).resolves.toBe(
      0
    );
    expect(goal().collectiveMeters).toBeUndefined();
  });

  it("adds nothing for a run deleted before its credit lands", async () => {
    const r = run("2026-11-03", 5000);
    await expect(
      creditRunToCommunityGoals(db, {
        uid: "ana",
        runId: "gone",
        data: r,
        activityDateKey: r.date,
        sourceRef: db.doc("users/ana/runs/gone"),
        fieldValue,
      })
    ).resolves.toBe(0);
    expect(goal().collectiveMeters).toBeUndefined();
  });
});

describe("a deleted run", () => {
  it("comes back off the total, and its runner with their last run", async () => {
    await saveRun("ana", "r1", run("2026-11-03", 5000));
    await saveRun("ana", "r2", run("2026-11-04", 8000));
    await saveRun("ben", "r1", run("2026-11-04", 3000));

    await expect(deleteRun("ana", "r1")).resolves.toBe(1);
    expect(goal()).toMatchObject({
      collectiveMeters: 11000,
      collectiveRunners: 2,
    });

    await deleteRun("ana", "r2");
    expect(goal()).toMatchObject({
      collectiveMeters: 3000,
      collectiveRunners: 1,
    });
    expect(db.data.has(`users/ana/communityGoal/${GOAL}`)).toBe(false);
  });

  it("takes off what was added, not what the run says now", async () => {
    await saveRun("ana", "r1", run("2026-11-03", 5000));
    await saveRun("ben", "r1", run("2026-11-03", 3000));
    // The run doc was edited after it counted; the marker holds the credit.
    db.data.set("users/ana/runs/r1", run("2026-11-03", 9000));
    await deleteRun("ana", "r1");
    expect(goal().collectiveMeters).toBe(3000);
  });

  it("takes nothing off when the delete is delivered again", async () => {
    await saveRun("ana", "r1", run("2026-11-03", 5000));
    await saveRun("ben", "r1", run("2026-11-03", 3000));
    await deleteRun("ana", "r1");
    await expect(deleteRun("ana", "r1")).resolves.toBe(0);
    expect(goal()).toMatchObject({
      collectiveMeters: 3000,
      collectiveRunners: 1,
    });
  });

  it("takes nothing off for a run that never counted", async () => {
    await saveRun("ana", "r1", run("2026-11-03", 5000));
    await saveRun("ben", "r1", { ...run("2026-11-03", 5000), isInvalid: true });
    await expect(deleteRun("ben", "r1")).resolves.toBe(0);
    expect(goal()).toMatchObject({
      collectiveMeters: 5000,
      collectiveRunners: 1,
    });
  });

  it("brings the total back to exactly 0", async () => {
    await saveRun("ana", "r1", run("2026-11-03", 5137, 1544));
    await saveRun("ana", "r2", run("2026-11-03", 3333, 1000));
    await deleteRun("ana", "r1");
    await deleteRun("ana", "r2");
    expect(goal()).toMatchObject({
      collectiveMeters: 0,
      collectiveRunners: 0,
    });
  });

  it("counts afresh when saved again under the same id", async () => {
    await saveRun("ana", "r1", run("2026-11-03", 5000));
    await deleteRun("ana", "r1");
    await saveRun("ana", "r1", run("2026-11-03", 5000));
    expect(goal()).toMatchObject({
      collectiveMeters: 5000,
      collectiveRunners: 1,
    });
  });

  it("comes off after the account is restricted", async () => {
    await saveRun("ana", "r1", run("2026-11-03", 5000));
    db.data.set("globalRestrictedUids/ana", { restrictedAt: "x" });
    await deleteRun("ana", "r1");
    expect(goal()).toMatchObject({
      collectiveMeters: 0,
      collectiveRunners: 0,
    });
  });

  it("fails, for a retry, when a goal could not be updated", async () => {
    await saveRun("ana", "r1", run("2026-11-03", 5000));
    db.failures.set(`get:challenges/${GOAL}`, new Error("ABORTED: contention"));
    await expect(deleteRun("ana", "r1")).rejects.toThrow(/not reversed/);
    // Nothing committed, so the retry takes the run off once.
    db.failures.clear();
    await expect(deleteRun("ana", "r1")).resolves.toBe(1);
    expect(goal().collectiveMeters).toBe(0);
  });
});

describe("backfillCommunityGoal", () => {
  it("adds the month's runs saved before the goal counted them, once", async () => {
    // Saved before: on the store, with no credit.
    db.data.set("users/ana/runs/r1", run("2026-11-01", 5000));
    db.data.set("users/ana/runs/r2", run("2026-11-02", 3000));
    db.data.set("users/ben/runs/r1", run("2026-10-30", 4000));
    db.data.set("users/ben/runs/r2", {
      ...run("2026-11-02", 4000),
      savedAnyway: true,
    });
    db.data.set("users/ana", {});
    db.data.set("users/ben", {});
    // Saved after: already counted by the trigger.
    db.data.set("users/cal", {});
    await saveRun("cal", "r1", run("2026-11-02", 2000));

    const totals = await backfillCommunityGoal(db, {
      challengeId: GOAL,
      fieldValue,
    });
    expect(totals).toEqual({ users: 3, runs: 4, credited: 2 });
    expect(goal()).toMatchObject({
      collectiveMeters: 10000,
      collectiveRunners: 2,
    });

    // Run again: nothing more.
    await backfillCommunityGoal(db, { challengeId: GOAL, fieldValue });
    expect(goal()).toMatchObject({
      collectiveMeters: 10000,
      collectiveRunners: 2,
    });
  });

  it("refuses a challenge that is not a community goal", async () => {
    await expect(
      backfillCommunityGoal(db, { challengeId: MILEAGE, fieldValue })
    ).rejects.toThrow(/not a community goal/);
  });
});

describe("wiring", () => {
  const INDEX = readFileSync(new URL("../index.js", import.meta.url), "utf8");
  const slice = (name) => {
    const start = INDEX.indexOf(`exports.${name} = functions`);
    expect(start).toBeGreaterThan(-1);
    return INDEX.slice(start, INDEX.indexOf("\nexports.", start + 1));
  };

  it("the run trigger credits the goal inside its eligibility gate", () => {
    const trigger = slice("onRunCreated");
    const gate = trigger.indexOf("if (isCountable) {");
    const credit = trigger.indexOf("communityGoal.creditRunToCommunityGoals(");
    const otherwise = trigger.indexOf("} else {", gate);
    expect(gate).toBeGreaterThan(-1);
    expect(credit).toBeGreaterThan(gate);
    expect(credit).toBeLessThan(otherwise);
  });

  it("the run delete trigger takes it back off", () => {
    expect(slice("onRunDeleted")).toContain(
      "communityGoal.reverseRunFromCommunityGoals("
    );
  });

  it("account deletion sweeps the person's credits", () => {
    expect(USER_SUBCOLLECTIONS).toContain("communityGoal");
  });
});
