/**
 * ChallengeCard — founding state (SOC-P1a).
 *
 * "0 joined" was the loudest locked-lobby signal on the Social tab: three
 * photo cards all reading zero above the fold, the most-seen state for
 * every cold-start user. Below FOUNDING_COUNT_MIN the meta row withholds
 * the number and reads as a founding invitation instead. Counts are real
 * or withheld — never inflated — so the numeric display must return the
 * moment the count clears the floor.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Timestamp } from "firebase/firestore";

import { ChallengeCard } from "../ChallengeCard";
import type { Challenge } from "../useChallenges";

vi.mock("firebase/firestore");
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("../useChallengePercentile", () => ({
  useChallengePercentile: () => null,
}));
vi.mock("@/lib/editorialImages", () => ({
  challengeEditorialImage: () => null,
}));
vi.mock("@/components/social/BlockAwareAvatar", () => ({
  default: () => null,
}));

function makeChallenge(participantCount: number): Challenge {
  const now = Date.now();
  return {
    id: "global-monthly-2026-07-01",
    name: "July Hybrid Hero",
    description: "Combined workout volume + km run",
    type: "monthly",
    metric: "hybrid_score",
    icon: "trophy",
    tiers: { bronze: 3000, silver: 8000, gold: 15000 },
    startDate: Timestamp.fromMillis(now - 86400_000),
    endDate: Timestamp.fromMillis(now + 86400_000),
    participantCount,
  };
}

function renderCard(participantCount: number, joined: boolean) {
  return render(
    <ChallengeCard
      challenge={makeChallenge(participantCount)}
      joined={joined}
      onJoin={() => {}}
      onLeave={() => {}}
    />
  );
}

describe("ChallengeCard — founding state below the count floor", () => {
  it("never renders '0 joined' (not joined → founding invitation)", () => {
    renderCard(0, false);
    expect(screen.queryByText(/0 joined/)).toBeNull();
    expect(screen.getByText(/founding spots open/i)).toBeInTheDocument();
  });

  it("reads as membership when the user is enrolled and the count is small", () => {
    renderCard(1, true);
    expect(screen.queryByText(/1 joined/)).toBeNull();
    expect(
      screen.getByText(/You're in — founding member/i)
    ).toBeInTheDocument();
  });

  it("shows the real count once it clears the floor", () => {
    renderCard(3, false);
    expect(screen.getByText(/3 joined/)).toBeInTheDocument();
    expect(screen.queryByText(/founding/i)).toBeNull();
  });

  it("keeps the real count for large cohorts", () => {
    renderCard(148, true);
    expect(screen.getByText(/148 joined/)).toBeInTheDocument();
  });
});
