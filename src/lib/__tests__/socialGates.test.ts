import { describe, it, expect } from "vitest";
import {
  SOCIAL_GATES,
  shouldShowFollowingFeed,
  shouldShowLeaderboard,
  shouldShowChallengePercentile,
} from "../socialGates";

describe("SOCIAL_GATES thresholds (pinned to the researched values)", () => {
  it("matches the spec", () => {
    expect(SOCIAL_GATES.FOLLOWING_FEED_MIN_FOLLOWS).toBe(3);
    expect(SOCIAL_GATES.LEADERBOARD_MIN_COHORT).toBe(20);
    expect(SOCIAL_GATES.CHALLENGE_PERCENTILE_MIN_PARTICIPANTS).toBe(50);
  });
});

describe("shouldShowFollowingFeed", () => {
  // SOC-P1b: the predicate now means "follow graph built" — it picks the
  // progress row vs the standard empty state; it no longer hides the list.
  it("graph reads as built at/above 3 follows", () => {
    expect(shouldShowFollowingFeed(0)).toBe(false);
    expect(shouldShowFollowingFeed(2)).toBe(false);
    expect(shouldShowFollowingFeed(3)).toBe(true);
    expect(shouldShowFollowingFeed(10)).toBe(true);
  });
});

describe("shouldShowLeaderboard", () => {
  it("hidden below a 20-member cohort", () => {
    expect(shouldShowLeaderboard(19)).toBe(false);
    expect(shouldShowLeaderboard(20)).toBe(true);
    expect(shouldShowLeaderboard(100)).toBe(true);
  });
});

describe("shouldShowChallengePercentile", () => {
  it("personal-only below 50 participants, percentile at/above", () => {
    expect(shouldShowChallengePercentile(0)).toBe(false);
    expect(shouldShowChallengePercentile(49)).toBe(false);
    expect(shouldShowChallengePercentile(50)).toBe(true);
  });
});
describe("shouldRenderFollowingList (SOC-P1b)", () => {
  it("renders from the FIRST follow — no ≥3 hard gate", async () => {
    const { shouldRenderFollowingList } = await import("../socialGates");
    expect(shouldRenderFollowingList(0)).toBe(false);
    expect(shouldRenderFollowingList(1)).toBe(true);
    expect(shouldRenderFollowingList(2)).toBe(true);
    expect(shouldRenderFollowingList(3)).toBe(true);
  });
});
