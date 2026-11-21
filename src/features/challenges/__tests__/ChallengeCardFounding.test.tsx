/**
 * ChallengeCard: who has joined, the goal and the time left.
 *
 * Below 3 participants (PEOPLE_COUNT_MIN_VISIBLE) the card says it is
 * filling up (App1 Q6, `src/lib/fillingUp.ts`) rather than a count. "0
 * joined" was the loudest empty-lobby signal on the Social tab, and the
 * founding line that once stood in for it ("Just launched · founding spots
 * open") said "just launched" late in the month. Counts are real, never
 * inflated, and "Filling up" claims no time.
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

describe("ChallengeCard: who has joined, below the floor", () => {
  it("says it is filling up, not '0 joined' and no founding line (App1 Q6)", () => {
    const { container } = renderCard(0, false);
    expect(text(container)).toContain("Filling up");
    expect(text(container)).not.toMatch(/joined|founding|launched/i);
  });

  it("says so to an enrolled person too, with no count of one", () => {
    const { container } = renderCard(2, true);
    expect(text(container)).toContain("Filling up");
    expect(text(container)).not.toMatch(/joined|founding|You’re in/i);
    expect(text(container)).not.toContain("—");
  });

  it("says neither while the count is not a number", () => {
    const { container } = renderCard(undefined as unknown as number, false);
    expect(text(container)).not.toMatch(/Filling up|joined/);
  });

  it("shows the real count once it clears the floor", () => {
    const { container } = renderCard(3, false);
    expect(text(container)).toContain("3 joined");
    expect(text(container)).not.toMatch(/founding|Filling up/i);
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
