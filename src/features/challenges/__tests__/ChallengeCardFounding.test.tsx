/**
 * ChallengeCard: the joined count, the goal and the time left.
 *
 * Below FOUNDING_COUNT_MIN participants the card says nothing about who
 * has joined. "0 joined" was the loudest empty-lobby signal on the Social
 * tab, and the founding line that replaced it ("Just launched · founding
 * spots open") said "just launched" late in the month. Counts are real or
 * withheld, never inflated, and nothing stands in for one.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Timestamp } from "firebase/firestore";

import { ChallengeCard } from "../ChallengeCard";
import type { Challenge } from "../useChallenges";
import { groupText } from "@/test/localeGrouping";

vi.mock("firebase/firestore");
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
// The card reads the distance unit from the profile (km here).
vi.mock("@/hooks/useDistanceUnit", () => ({ useDistanceUnit: () => "km" }));
vi.mock("../useChallengePercentile", () => ({
  useChallengePercentile: () => null,
}));
vi.mock("@/lib/editorialImages", () => ({
  challengeEditorialImage: () => null,
}));
vi.mock("@/components/social/BlockAwareAvatar", () => ({
  default: () => null,
}));

function makeChallenge(
  participantCount: number,
  over: Partial<Challenge> = {}
): Challenge {
  const now = Date.now();
  return {
    id: "global-monthly-2026-07-01",
    name: "July Hybrid Hero",
    description: "Running and lifting both count, toward one score.",
    type: "monthly",
    metric: "hybrid_score",
    icon: "trophy",
    tiers: { bronze: 3000, silver: 8000, gold: 15000 },
    startDate: Timestamp.fromMillis(now - 86400_000),
    endDate: Timestamp.fromMillis(now + 6 * 86400_000),
    participantCount,
    ...over,
  };
}

function renderCard(
  participantCount: number,
  joined: boolean,
  props: { showTimeLeft?: boolean; over?: Partial<Challenge> } = {}
) {
  return render(
    <ChallengeCard
      challenge={makeChallenge(participantCount, props.over)}
      joined={joined}
      onJoin={() => {}}
      onLeave={() => {}}
      showTimeLeft={props.showTimeLeft}
    />
  );
}

const text = (container: HTMLElement) =>
  (container.textContent ?? "").replace(/\s+/g, " ");

describe("ChallengeCard: the joined count below the floor", () => {
  it("says nothing about who has joined, not '0 joined' and no founding line", () => {
    const { container } = renderCard(0, false);
    expect(text(container)).not.toMatch(/joined|founding|launched/i);
  });

  it("says nothing for an enrolled person either: the card is theirs already", () => {
    const { container } = renderCard(1, true);
    expect(text(container)).not.toMatch(/joined|founding|You're in/i);
    expect(text(container)).not.toContain("—");
  });

  it("shows the real count once it clears the floor", () => {
    const { container } = renderCard(3, false);
    expect(text(container)).toContain("3 joined");
    expect(text(container)).not.toMatch(/founding/i);
  });

  it("keeps the real count for large cohorts", () => {
    const { container } = renderCard(148, true);
    expect(text(container)).toContain("148 joined");
  });
});

describe("ChallengeCard: the goal", () => {
  it("says the goal from the challenge's own target, not the stored description", () => {
    const { container } = renderCard(0, false);
    expect(text(container)).toContain(
      `Score ${groupText(3000)} points from running and lifting this month.`
    );
    expect(text(container)).not.toContain("toward one score");
  });

  it("falls back to the stored description for a metric it cannot phrase", () => {
    const { container } = renderCard(0, false, {
      over: { metric: "streak_days", description: "Keep a streak going." },
    });
    expect(text(container)).toContain("Keep a streak going.");
  });

  it("does not repeat the first tier under the goal for a joined card at zero", () => {
    const { container } = renderCard(0, true);
    expect(text(container)).not.toMatch(/Bronze at/);
  });
});

describe("ChallengeCard: time left", () => {
  it("is on the hero by default", () => {
    renderCard(0, false);
    expect(screen.getByText(/^\d+ days left$/)).toBeInTheDocument();
  });

  it("is left off when another card says it", () => {
    const { container } = renderCard(0, false, { showTimeLeft: false });
    expect(text(container)).not.toMatch(/left/);
  });
});
