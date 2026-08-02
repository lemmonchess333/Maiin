import { useState, useEffect, useRef } from "react";
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
  const [count, setCount] = useState(0);
  const [capped, setCapped] = useState(false);
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
        // Exclude the user's own activity (fan-out writes to the author's
        // own feed too) — a badge should signal OTHERS' activity.
        const newItems = snap.docs.filter((d) => d.data().authorId !== uid);
        setError(false);
        setCapped(newItems.length > UNREAD_CAP);
        setCount(Math.min(newItems.length, UNREAD_CAP));
      },
      () => {
        if (!isCurrent()) return;
        // Honest error state — do NOT reset count to 0 (that would read
        // as "all caught up"). Keep the last known good value and flag
        // the error; the badge can choose to hide over an error.
        setError(true);
      }
    );

    return unsub;
  }, [uid]);

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
    setCount(0);
    setCapped(false);
  };

  return { count, markSeen, capped, error };
}
