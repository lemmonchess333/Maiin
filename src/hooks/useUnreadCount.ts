import { useState, useEffect, useMemo, useRef } from "react";
import {
  collection,
  limit,
  orderBy,
  query,
  where,
  onSnapshot,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useUid } from "@/lib/auth";
import {
  socialPreferenceKey,
  purgeLegacySocialKey,
} from "@/lib/socialPreferenceKeys";
import { useBlockedUsers } from "./useBlockedUsers";
import { useHiddenActivities } from "./useHiddenActivities";

// Cap the unread-counter subscription so this hook can't fan out to
// the user's whole feed. The badge UI only renders "N" up to a max
// display value — beyond UNREAD_CAP we surface "UNREAD_CAP+" instead.
const UNREAD_CAP = 50;

/**
 * SOCIAL-ATTENTION-01. Two changes over the pre-existing badge hook:
 *
 * 1. **Reads the user's OWN feed, not the global collection.** The badge
 *    counted new docs in the global `/activities` collection (a global
 *    read every client issued). It now reads `feeds/{uid}/items` — the
 *    server-fanned per-user feed that the Following tab already renders
 *    (`getFeed` / `useSocialFeed`). So the badge counts exactly what the
 *    user will see when they open Social, from a strictly owner-scoped
 *    read (firestore.rules: `feeds/{uid}/items` read is `isOwner(uid)`).
 *
 * 2. **uid-scoped last-seen + honest error state.** The last-seen pointer
 *    was a global localStorage key, so on a shared browser account B
 *    inherited account A's "seen" instant. It's now scoped by uid. A read
 *    error no longer masquerades as "0 unread" — the last known good count
 *    is preserved and an `error` flag is exposed, so a transient blip
 *    can't silently clear a real badge. A uid + generation guard stops a
 *    late callback from a torn-down listener writing the previous
 *    account's count.
 */
export function useUnreadCount() {
  const uid = useUid();
  // Same suppression the feed applies, so the badge and the screen agree.
  const { blocked } = useBlockedUsers();
  const { hidden } = useHiddenActivities();
  const [rows, setRows] = useState<
    { authorId: string; activityId: string }[]
  >([]);
  const [error, setError] = useState(false);
  // Bumped on every (re)subscribe so a stale snapshot/error callback from
  // a torn-down listener can't commit the previous account's state.
  const genRef = useRef(0);

  useEffect(() => {
    if (!uid) return;

    const myGen = ++genRef.current;
    const isCurrent = () => genRef.current === myGen;

    // Never migrate the pre-uid-scoping global key — purge it.
    purgeLegacySocialKey("unread-last-seen");
    const seenKey = socialPreferenceKey(uid, "unread-last-seen");

    let lastSeen: string | null = null;
    try {
      lastSeen = localStorage.getItem(seenKey);
    } catch {
      /* private mode — treat as never-seen */
    }
    const since = lastSeen
      ? Timestamp.fromDate(new Date(lastSeen))
      : Timestamp.fromDate(new Date(Date.now() - 86400000));

    const q = query(
      collection(db, "feeds", uid, "items"),
      where("createdAt", ">", since),
      orderBy("createdAt", "desc"),
      limit(UNREAD_CAP + 1)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        if (!isCurrent()) return;
        /* Store the raw rows and let the suppression happen in a memo below.
           The QUERY does not depend on the block/hide lists, and putting those
           Sets in this effect's deps is a resubscribe loop: `useBlockedUsers`
           returns `cache.get(uid) ?? new Set()`, so before the block list has
           settled — cold start, and every test — that is a NEW Set every
           render. Keep the listener keyed on `uid` alone. */
        setRows(
          snap.docs.map((d) => {
            const data = d.data();
            return {
              authorId: typeof data.authorId === "string" ? data.authorId : "",
              activityId:
                typeof data.activityId === "string" ? data.activityId : "",
            };
          })
        );
        setError(false);
      },
      () => {
        if (!isCurrent()) return;
        // Honest error state — do NOT reset to 0 (that would read as "all
        // caught up"). Keep the last known good rows and flag the error.
        setError(true);
      }
    );

    return unsub;
  }, [uid]);

  /* The badge counts what the FEED will render, not what the collection
     holds. `useSocialFeed` drops blocked authors and user-hidden activities
     before rendering; counting them meant a user who blocked someone still
     got badged by their posts, opened Social and found nothing new.

     `highlightsOnly` is deliberately NOT applied: it is a VIEW toggle, not a
     "don't show me this" action. A user browsing highlights still wants to
     know real activity arrived. Blocking and hiding are explicit suppression;
     a view filter is not. */
  const visible = useMemo(
    () =>
      rows.filter((r) => {
        // Exclude the user's own activity (fan-out writes to the author's own
        // feed too) — a badge should signal OTHERS' activity.
        if (!uid || r.authorId === uid) return false;
        if (blocked.has(r.authorId)) return false;
        if (hidden.has(r.activityId)) return false;
        return true;
      }).length,
    [rows, uid, blocked, hidden]
  );
  const count = Math.min(visible, UNREAD_CAP);
  const capped = visible > UNREAD_CAP;

  const markSeen = () => {
    if (!uid) return;
    try {
      localStorage.setItem(
        socialPreferenceKey(uid, "unread-last-seen"),
        new Date().toISOString()
      );
    } catch {
      /* private mode — in-memory clear below still hides the badge */
    }
    // Clear the in-memory rows so the badge hides immediately; the next
    // snapshot re-queries from the new last-seen instant.
    setRows([]);
  };

  return { count, markSeen, capped, error };
}
