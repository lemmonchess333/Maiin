import type { FeedItem } from "@/hooks/useSocialFeed";
import { createdAtMs } from "@/lib/activityFeedItem";
import { startOfLocalWeek } from "@/lib/dateHelpers";

export interface ProfileWeek {
  sessions: number;
  distanceM: number;
  volumeKg: number;
}

/**
 * A profile's "This week": the person's shared sessions since local
 * Monday. Shared only, because that is all a profile can read, and the
 * card's labels say "shared" for that reason. A session that carries a
 * distance adds it and one that carries a volume adds that, so a brick
 * session counts towards both.
 */
export function profileWeek(
  items: readonly FeedItem[],
  now: Date = new Date()
): ProfileWeek {
  const from = startOfLocalWeek(now).getTime();
  let sessions = 0;
  let distanceM = 0;
  let volumeKg = 0;
  for (const item of items) {
    if (createdAtMs(item.createdAt) < from) continue;
    sessions += 1;
    const { distance, totalVolume } = item.activity ?? {};
    if (typeof distance === "number" && distance > 0) distanceM += distance;
    if (typeof totalVolume === "number" && totalVolume > 0)
      volumeKg += totalVolume;
  }
  return { sessions, distanceM, volumeKg };
}
