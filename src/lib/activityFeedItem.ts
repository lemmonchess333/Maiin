import type { ActivityData, FeedItem } from "@/hooks/useSocialFeed";

/**
 * An `activities/{id}` document as the feed item ActivityCard draws.
 *
 * Following reads the fan-out copies under `feeds/{uid}/items`; Explore
 * and the profile page read activity documents directly, and both build
 * their items here, so a session on someone's profile is the same card
 * the feed shows. (A hand-built one-line summary in its place printed a
 * run's pace as raw seconds and every lift as "0 PRs".)
 */
export function activityToFeedItem(
  id: string,
  data: Record<string, unknown>
): FeedItem {
  const item = data as {
    authorId?: string;
    authorName?: string;
    authorPhotoURL?: string;
    type?: string;
    summary?: string;
    createdAt?: unknown;
    kudosCount?: number;
    prHit?: boolean;
    prExercise?: string;
    prWeight?: number;
    badgeEarned?: string;
    challengeMilestone?: string;
  };
  return {
    id,
    activityId: id,
    authorId: item.authorId || "",
    authorName: item.authorName || "",
    ...(item.authorPhotoURL ? { authorPhotoURL: item.authorPhotoURL } : {}),
    type: (item.type || "workout") as "run" | "workout",
    summary: item.summary || "",
    createdAt: item.createdAt,
    activity: {
      authorId: item.authorId,
      authorName: item.authorName,
      type: item.type,
      kudosCount: item.kudosCount,
      prHit: item.prHit,
      prExercise: item.prExercise,
      prWeight: item.prWeight,
      badgeEarned: item.badgeEarned,
      challengeMilestone: item.challengeMilestone,
      id,
      ...data,
    } as ActivityData,
    kudosCount: item.kudosCount || 0,
    prHit: item.prHit,
    prExercise: item.prExercise,
    prWeight: item.prWeight,
    badgeEarned: item.badgeEarned,
    challengeMilestone: item.challengeMilestone,
  };
}

/** A post's time in milliseconds, whatever shape the read handed back: a
 *  Firestore Timestamp, a Date, or a bare number (the test fake). */
export function createdAtMs(createdAt: unknown): number {
  if (typeof createdAt === "number") return createdAt;
  if (createdAt instanceof Date) return createdAt.getTime();
  const ts = createdAt as { toMillis?: () => number; toDate?: () => Date };
  if (typeof ts?.toMillis === "function") return ts.toMillis();
  if (typeof ts?.toDate === "function") return ts.toDate().getTime();
  return 0;
}
