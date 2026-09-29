import { describe, expect, it } from "vitest";
import { countPostsThisWeek, spaceHeroMeta } from "../spaceHeroMeta";
import { SPACE_MEMBER_COUNT_MIN_VISIBLE } from "../spaceDefs";
import type { SpacePostDoc } from "../spaceTypes";

/* Local wall-clock dates, so the Monday boundary is the viewer's own in
   every CI timezone. Wednesday 23 September 2026. */
const NOW = new Date(2026, 8, 23, 12, 0);
const post = (d: Date | null): Pick<SpacePostDoc, "createdAt"> => ({
  createdAt: (d
    ? { toDate: () => d }
    : null) as unknown as SpacePostDoc["createdAt"],
});
const MONDAY_EARLY = post(new Date(2026, 8, 21, 0, 30));
const SUNDAY_LATE = post(new Date(2026, 8, 20, 23, 30));

describe("countPostsThisWeek", () => {
  it("counts from local Monday midnight, not the last seven days", () => {
    const posts = [post(new Date(2026, 8, 23, 9)), MONDAY_EARLY, SUNDAY_LATE];
    expect(
      countPostsThisWeek(posts, NOW, { size: 3, limit: 50, oldest: posts[2] })
    ).toEqual({ count: 2, capped: false });
  });

  it("counts a post still waiting for its server timestamp", () => {
    expect(
      countPostsThisWeek([post(null)], NOW, { size: 1, limit: 50 }).count
    ).toBe(1);
  });

  it("is capped only when the fetch was full and its oldest post is from this week", () => {
    const full = { size: 50, limit: 50 };
    expect(
      countPostsThisWeek([MONDAY_EARLY], NOW, { ...full, oldest: MONDAY_EARLY })
        .capped
    ).toBe(true);
    expect(
      countPostsThisWeek([MONDAY_EARLY], NOW, { ...full, oldest: SUNDAY_LATE })
        .capped
    ).toBe(false);
    expect(
      countPostsThisWeek([MONDAY_EARLY], NOW, {
        size: 49,
        limit: 50,
        oldest: MONDAY_EARLY,
      }).capped
    ).toBe(false);
  });
});

describe("spaceHeroMeta", () => {
  const floor = SPACE_MEMBER_COUNT_MIN_VISIBLE;

  it("gives the size and this week's posts", () => {
    expect(
      spaceHeroMeta({ memberCount: 18, postsThisWeek: 6, capped: false })
    ).toBe("18 members · 6 posts this week");
  });

  it("says post for one, and 50+ posts when the count is capped", () => {
    expect(
      spaceHeroMeta({ memberCount: 18, postsThisWeek: 1, capped: false })
    ).toBe("18 members · 1 post this week");
    expect(
      spaceHeroMeta({ memberCount: 18, postsThisWeek: 50, capped: true })
    ).toBe("18 members · 50+ posts this week");
  });

  it("leaves out a member count under the floor and a quiet week", () => {
    expect(
      spaceHeroMeta({ memberCount: floor - 1, postsThisWeek: 2, capped: false })
    ).toBe("2 posts this week");
    expect(
      spaceHeroMeta({ memberCount: floor, postsThisWeek: 0, capped: false })
    ).toBe(`${floor} members`);
  });

  it("calls a space with neither a new space, including while loading", () => {
    expect(
      spaceHeroMeta({ memberCount: floor - 1, postsThisWeek: 0, capped: false })
    ).toBe("New space");
    expect(
      spaceHeroMeta({ memberCount: null, postsThisWeek: 0, capped: false })
    ).toBe("New space");
  });
});
