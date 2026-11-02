/**
 * Cross-test: the app reads the community goal's total off the fields the
 * server writes, in the unit it writes them (ADR-0008: pin the running
 * copies, not prose).
 *
 * The server's credit path runs here for real, on the in-memory Firestore,
 * and the client's readers take the challenge doc it leaves. A field
 * renamed or a unit changed on either side reads as a goal stuck at 0,
 * hidden for good, with every single-side test still green.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import {
  collectiveRunners,
  collectiveTotal,
  showsCollectiveGoal,
} from "../collectiveGoal";
import type { Challenge } from "../useChallenges";

const require_ = createRequire(import.meta.url);
const { memoryFirestore, increment } = require_(
  "../../../../functions/__tests__/helpers/memoryFirestore.cjs"
);
const server = require_("../../../../functions/lib/communityGoal") as {
  communityGoalKm: (challenge: unknown) => number;
  creditRunToCommunityGoals: (
    db: unknown,
    args: Record<string, unknown>
  ) => Promise<number>;
  reverseRunFromCommunityGoals: (
    db: unknown,
    args: Record<string, unknown>
  ) => Promise<number>;
};

const GOAL = "group-goal-2026-11-01";
const fieldValue = { increment, serverTimestamp: () => "now" };

function freshGoal() {
  return memoryFirestore({
    [`challenges/${GOAL}`]: {
      name: "Together: 1,000 km",
      type: "monthly",
      metric: "total_km",
      collectiveTarget: 1000,
      tiers: { bronze: 1000, silver: 1000, gold: 1000 },
      startDate: new Date("2026-11-01T00:00:00Z"),
      endDate: new Date("2026-12-01T00:00:00Z"),
    },
  });
}

async function saveRun(
  db: ReturnType<typeof freshGoal>,
  uid: string,
  runId: string,
  distance: number
) {
  const run = { date: "2026-11-03", distance, duration: distance * 0.3 };
  db.data.set(`users/${uid}/runs/${runId}`, run);
  await server.creditRunToCommunityGoals(db, {
    uid,
    runId,
    data: run,
    activityDateKey: run.date,
    sourceRef: db.doc(`users/${uid}/runs/${runId}`),
    fieldValue,
  });
}

const doc = (db: ReturnType<typeof freshGoal>) =>
  db.data.get(`challenges/${GOAL}`) as Challenge;

describe("the community goal, server to app", () => {
  it("reads the server's total and runners", async () => {
    const db = freshGoal();
    await saveRun(db, "ana", "r1", 5000);
    await saveRun(db, "ana", "r2", 2500);
    await saveRun(db, "ben", "r1", 4200);
    expect(collectiveTotal(doc(db))).toBe(11.7);
    expect(collectiveTotal(doc(db))).toBe(server.communityGoalKm(doc(db)));
    expect(collectiveRunners(doc(db))).toBe(2);
    expect(showsCollectiveGoal(doc(db))).toBe(true);
  });

  it("hides a goal nobody has run towards, and one taken back to 0", async () => {
    const db = freshGoal();
    expect(showsCollectiveGoal(doc(db))).toBe(false);
    await saveRun(db, "ana", "r1", 5137);
    expect(showsCollectiveGoal(doc(db))).toBe(true);
    db.data.delete("users/ana/runs/r1");
    await server.reverseRunFromCommunityGoals(db, {
      uid: "ana",
      runId: "r1",
      fieldValue,
    });
    expect(collectiveTotal(doc(db))).toBe(0);
    expect(collectiveRunners(doc(db))).toBe(0);
    expect(showsCollectiveGoal(doc(db))).toBe(false);
  });
});
