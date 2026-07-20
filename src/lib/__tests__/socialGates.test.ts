import { describe, it, expect } from "vitest";
import {
  SOCIAL_GATES,
  shouldShowFollowingFeed,
  shouldShowLeaderboard,
  shouldShowChallengePercentile,
  isSoloUser,
} from "../socialGates";

describe("SOCIAL_GATES thresholds (pinned to the researched values)", () => {
  it("matches the spec", () => {
    expect(SOCIAL_GATES.FOLLOWING_FEED_MIN_FOLLOWS).toBe(3);
    expect(SOCIAL_GATES.LEADERBOARD_MIN_COHORT).toBe(20);
    expect(SOCIAL_GATES.CHALLENGE_PERCENTILE_MIN_PARTICIPANTS).toBe(50);
  });
});

describe("shouldShowFollowingFeed", () => {
  it("hidden below 3 follows, shown at/above", () => {
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

describe("isSoloUser", () => {
  it("solo when no partner bonds exist", () => {
    expect(isSoloUser({ partnerCount: 0 })).toBe(true);
  });

  it("not solo once a partner bond exists", () => {
    expect(isSoloUser({ partnerCount: 1 })).toBe(false);
    expect(isSoloUser({ partnerCount: 2 })).toBe(false);
  });
});
