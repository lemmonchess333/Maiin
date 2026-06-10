import { describe, it, expect } from "vitest";
import {
  SOCIAL_GATES,
  shouldShowFollowingFeed,
  shouldShowCrewSurface,
  shouldShowLeaderboard,
  shouldShowChallengePercentile,
  isSoloUser,
} from "../socialGates";

describe("SOCIAL_GATES thresholds (pinned to the researched values)", () => {
  it("matches the spec", () => {
    expect(SOCIAL_GATES.FOLLOWING_FEED_MIN_FOLLOWS).toBe(3);
    expect(SOCIAL_GATES.CREW_ACTIVATION_MIN_MEMBERS).toBe(3);
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

describe("shouldShowCrewSurface", () => {
  it("aspirational below 3 members, real surface at/above", () => {
    expect(shouldShowCrewSurface(0)).toBe(false);
    expect(shouldShowCrewSurface(1)).toBe(false); // just the user
    expect(shouldShowCrewSurface(2)).toBe(false);
    expect(shouldShowCrewSurface(3)).toBe(true);
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
  it("solo when no partners and no activated crew", () => {
    expect(isSoloUser({ partnerCount: 0, crewMemberCount: 0 })).toBe(true);
    expect(isSoloUser({ partnerCount: 0, crewMemberCount: 1 })).toBe(true);
    expect(isSoloUser({ partnerCount: 0, crewMemberCount: 2 })).toBe(true);
  });

  it("not solo once a partner bond exists", () => {
    expect(isSoloUser({ partnerCount: 1, crewMemberCount: 0 })).toBe(false);
  });

  it("not solo once the crew is activated (≥3 members)", () => {
    expect(isSoloUser({ partnerCount: 0, crewMemberCount: 3 })).toBe(false);
  });

  it("not solo with both a partner and an activated crew", () => {
    expect(isSoloUser({ partnerCount: 2, crewMemberCount: 5 })).toBe(false);
  });
});
