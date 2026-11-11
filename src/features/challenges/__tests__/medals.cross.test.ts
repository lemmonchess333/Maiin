/**
 * The medal the server writes and the medal the app reads, held together
 * (Soc15). The server is the one writer (functions/lib/medals.js); the
 * app reads its public summary into a Medal (`parseMedalSummary`) and
 * builds the same Medal from a finished challenge's own figures for the
 * finale card (`medalFromChallenge`). Run the RUNNING server copy over
 * the same challenges and standings, and the three must agree: a field
 * the server renames, or a window it reads differently, fails here rather
 * than drawing an empty trophy case.
 *
 * The community-goal and tier rules are pinned both ways too: what the
 * server will not award, the app will not draw.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { medalFromChallenge, parseMedal, parseMedalSummary } from "../medals";

const require = createRequire(import.meta.url);
const server = require("../../../../functions/lib/medals.js") as {
  decideMedal: (args: Record<string, unknown>) => {
    kind: string;
    medal?: Record<string, unknown>;
  };
  summaryEntryFor: (medal: Record<string, unknown>) => Record<string, unknown>;
  nextMedalSummary: (
    current: unknown,
    id: string,
    entry: unknown
  ) => Record<string, unknown>;
  isMedalChallenge: (challenge: unknown, id: string) => boolean;
};

function utcMonth(offset: number) {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1)
  );
}

const CHALLENGES = [
  {
    id: "monthly-x",
    name: "Mileage",
    type: "monthly",
    metric: "total_km",
    tiers: { bronze: 10, silver: 25, gold: 50 },
  },
  {
    id: "fastest-5k-x",
    name: "Fastest 5K",
    type: "monthly",
    metric: "fastest_effort",
    targetDistance: 5000,
    tiers: { bronze: 2100, silver: 1800, gold: 1500 },
  },
  {
    id: "weekly-x",
    name: "Weekly Warrior",
    type: "weekly",
    metric: "workout_count",
    tiers: { bronze: 2, silver: 4, gold: 6 },
  },
].map((c) => ({ ...c, startDate: utcMonth(0), endDate: utcMonth(1) }));

const STANDINGS = [
  { tierAchieved: "bronze", currentValue: 12.345 },
  { tierAchieved: "silver", currentValue: 1700 },
  { tierAchieved: "gold", currentValue: 7 },
];

describe("the server's medal and the app's agree", () => {
  for (const challenge of CHALLENGES) {
    for (const participant of STANDINGS) {
      it(`${challenge.id}, ${participant.tierAchieved}`, () => {
        const at = challenge.startDate.getTime() + 86_400_000;
        const decision = server.decideMedal({
          challengeId: challenge.id,
          challenge,
          participant,
          observedMs: at,
          existing: null,
          eventMs: at,
          isDelete: false,
        });
        expect(decision.kind).toBe("set");
        const summary = server.nextMedalSummary(
          {},
          challenge.id,
          server.summaryEntryFor(decision.medal!)
        );
        const [read] = parseMedalSummary(summary);
        const own = medalFromChallenge(challenge, participant);
        expect(read).toEqual(own);
        // The owner's record reads the same, with the day it came.
        expect(parseMedal(challenge.id, decision.medal)).toEqual({
          ...own,
          earnedAt: new Date(at).toISOString(),
        });
      });
    }
  }

  it("neither awards a community goal", () => {
    const goal = {
      ...CHALLENGES[0],
      id: "group-goal-x",
      collectiveTarget: 1000,
    };
    expect(server.isMedalChallenge(goal, goal.id)).toBe(false);
    expect(
      medalFromChallenge(goal, { tierAchieved: "gold", currentValue: 1200 })
    ).toBeNull();
  });
});
