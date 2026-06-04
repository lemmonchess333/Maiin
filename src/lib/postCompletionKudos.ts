/**
 * Phase 2 — post-completion kudos.
 *
 * The proposal's safest social pattern: AFTER the user finishes a workout/run,
 * if someone they FOLLOW also trained today, offer a one-tap, dismissible
 * "Send kudos?" prompt. Social appears after achievement, never before action;
 * it's optional, rate-limited to once/day, and needs no push notification.
 *
 * This module is the pure decision layer — given the user's feed items (which
 * already carry author + activityId + createdAt), pick the kudos candidate.
 * Kept Firestore-free and `now`-injected so it's unit-testable.
 */

/** The fields of a feed item this decision depends on (subset of FeedItem). */
export interface KudosFeedItemLike {
  activityId?: string;
  authorId: string;
  authorName?: string;
  authorPhotoURL?: string;
  type?: "run" | "workout";
  /** Firestore Timestamp ({toDate}), Date, or epoch millis. */
  createdAt?: { toDate: () => Date } | Date | number | unknown;
}

export interface KudosCandidate {
  activityId: string;
  authorId: string;
  authorName: string;
  authorPhotoURL?: string;
  type: "run" | "workout";
}

/** Local YYYY-MM-DD (the user's "today", not UTC). */
export function localDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toDate(v: KudosFeedItemLike["createdAt"]): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v === "number") return new Date(v);
  if (
    typeof v === "object" &&
    typeof (v as { toDate?: unknown }).toDate === "function"
  ) {
    try {
      return (v as { toDate: () => Date }).toDate();
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * From a newest-first feed, pick the most recent activity posted TODAY by
 * someone other than the current user. Returns null when there's nothing to
 * kudos — in which case no prompt should show (no fabricated social proof).
 */
export function pickKudosCandidate(
  items: KudosFeedItemLike[],
  myUid: string,
  now: Date
): KudosCandidate | null {
  const today = localDayKey(now);
  for (const it of items) {
    if (it.authorId === myUid) continue;
    if (!it.activityId || !it.authorName) continue;
    const created = toDate(it.createdAt);
    if (!created || localDayKey(created) !== today) continue;
    return {
      activityId: it.activityId,
      authorId: it.authorId,
      authorName: it.authorName,
      authorPhotoURL: it.authorPhotoURL,
      type: it.type === "run" ? "run" : "workout",
    };
  }
  return null;
}
