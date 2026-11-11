import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
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

/* Soc15: a tier reached is a medal, and the card opens it, with a way to
   the trophy case where it stays after this card has gone. */
describe("ChallengeFinaleCard's medal", () => {
  const ended = {
    id: "monthly-2026-10-01",
    name: "October Mileage",
    metric: "total_km",
    type: "monthly",
    tiers: { bronze: 10, silver: 25, gold: 50 },
    participantCount: 4,
    startDate: { toDate: () => new Date(Date.UTC(2026, 9, 1)) },
    endDate: { toDate: () => new Date(Date.UTC(2026, 10, 1)) },
  } as unknown as Challenge;

  const card = (progress: Partial<ChallengeParticipant>) =>
    render(
      <MemoryRouter>
        <ChallengeFinaleCard
          challenge={ended}
          myProgress={{ ...me, ...progress } as ChallengeParticipant}
          selfUid="me"
        />
      </MemoryRouter>
    );

  it("opens the medal, with its dates and a way to the trophy case", async () => {
    card({ tierAchieved: "silver", currentValue: 31.2 });
    fireEvent.click(screen.getByRole("button", { name: "See your medal" }));
    const sheet = await screen.findByRole("dialog");
    expect(
      within(sheet).getByText("Silver · October Mileage")
    ).toBeInTheDocument();
    expect(within(sheet).getByText("1–31 October 2026")).toBeInTheDocument();
    expect(
      within(sheet).getByRole("link", { name: "See all your medals" })
    ).toHaveAttribute("href", "/user/me");
  });

  it("offers no medal below bronze", () => {
    card({ tierAchieved: null, currentValue: 4 });
    expect(screen.getByText(/You logged/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "See your medal" })).toBeNull();
  });
});
