import { describe, expect, it } from "vitest";
import { featuredChallengesFirst } from "../challengeOrder";

describe("featuredChallengesFirst", () => {
  it("moves the rotating goal first while preserving every core goal's order", () => {
    const core = [{ id: "monthly-2026-10-01" }, { id: "seasonal-2026-autumn" }];
    const featured = { id: "featured-monthly-2026-10-01" };
    const input = [core[0], featured, core[1]];
    expect(featuredChallengesFirst(input)).toEqual([featured, ...core]);
    expect(input).toEqual([core[0], featured, core[1]]);
  });

  it("keeps the original order when there is no featured goal", () => {
    const input = [
      { id: "strength-monthly-2026-10-01" },
      { id: "monthly-2026-10-01" },
    ];
    expect(featuredChallengesFirst(input)).toEqual(input);
  });
});
