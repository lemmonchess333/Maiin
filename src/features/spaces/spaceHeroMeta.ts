import { startOfLocalWeek } from "@/lib/dateHelpers";
import { SPACE_MEMBER_COUNT_MIN_VISIBLE } from "./spaceDefs";
import type { SpacePostDoc } from "./spaceTypes";

/**
 * How many of `posts` (what the viewer can see) were written since local
 * Monday. `capped` is true when there are older posts still to load and
 * the oldest post loaded is still from this week, so the real number may
 * be higher and the line says "50+".
 *
 * A post still waiting for its server timestamp was written moments ago,
 * so it counts.
 */
export function countPostsThisWeek(
  posts: Pick<SpacePostDoc, "createdAt">[],
  now: Date,
  fetch: {
    /** The last page read came back full, so another may follow. */
    hasMore: boolean;
    oldest?: Pick<SpacePostDoc, "createdAt">;
  }
): { count: number; capped: boolean } {
  const weekStart = startOfLocalWeek(now).getTime();
  const isThisWeek = (p: Pick<SpacePostDoc, "createdAt">) => {
    const at = p.createdAt?.toDate?.();
    return !at || at.getTime() >= weekStart;
  };
  return {
    count: posts.filter(isThisWeek).length,
    capped:
      fetch.hasMore && fetch.oldest !== undefined && isThisWeek(fetch.oldest),
  };
}

/**
 * The line under a space's name: how big it is and how busy this week.
 * A member count under the visibility floor is left out rather than shown
 * small, and so is a week with no posts; with neither, it is a new space.
 */
export function spaceHeroMeta({
  memberCount,
  postsThisWeek,
  capped,
}: {
  memberCount: number | null;
  postsThisWeek: number;
  capped: boolean;
}): string {
  const parts: string[] = [];
  if (memberCount !== null && memberCount >= SPACE_MEMBER_COUNT_MIN_VISIBLE) {
    parts.push(`${memberCount.toLocaleString()} members`);
  }
  if (postsThisWeek > 0) {
    const noun = postsThisWeek === 1 && !capped ? "post" : "posts";
    parts.push(`${postsThisWeek}${capped ? "+" : ""} ${noun} this week`);
  }
  return parts.length > 0 ? parts.join(" · ") : "New space";
}
