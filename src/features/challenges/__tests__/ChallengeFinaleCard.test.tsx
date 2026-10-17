import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { ChallengeFinaleCard } from "../ChallengeFinaleCard";
import type { Challenge, ChallengeParticipant } from "../useChallenges";

vi.mock("@/hooks/useDistanceUnit", () => ({ useDistanceUnit: () => "km" }));

/* Together pass: an ended challenge says where the person finished only
   among three or more, as the live card's count does. "#1 of 1" ranked
   nobody. */
const me = {
  uid: "me",
  currentValue: 3,
  tierAchieved: "bronze",
  displayName: "Me",
} as unknown as ChallengeParticipant;

const challenge = (participantCount: number) =>
  ({
    id: `weekly-${participantCount}`,
    name: "Weekly Warrior",
    metric: "workout_count",
    tiers: { bronze: 2, silver: 4, gold: 6 },
    participantCount,
  }) as unknown as Challenge;

const text = (participantCount: number) =>
  render(
    <ChallengeFinaleCard
      challenge={challenge(participantCount)}
      myProgress={me}
      leaderboard={[me]}
      selfUid="me"
    />
  ).container.textContent ?? "";

describe("ChallengeFinaleCard's place", () => {
  it("is left out when you were the only one", () => {
    expect(text(1)).not.toMatch(/#1/);
    expect(text(1)).toMatch(/You finished with Bronze/);
  });

  it("is given among three or more", () => {
    expect(text(12)).toMatch(/#1\s*of 12/);
  });
});
