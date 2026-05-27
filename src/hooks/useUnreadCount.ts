import { useState, useEffect } from "react";
import {
  collection,
  limit,
  query,
  where,
  onSnapshot,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";

const LAST_SEEN_KEY = "tropos-social-last-seen";

// Cap the unread-counter subscription so this hook can't fan out to
// every activity in the global /activities collection. The badge UI
// only renders "N" up to a max display value — beyond UNREAD_CAP we
// surface "UNREAD_CAP+" instead. With a 50-doc ceiling, per-client
// bandwidth + read cost stays bounded regardless of total app
// activity (pre-cap, 1k active users posting twice/day streamed
// ~2k docs to every client on every change).
const UNREAD_CAP = 50;

export function useUnreadCount() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);
  const [capped, setCapped] = useState(false);

  useEffect(() => {
    if (!user?.uid) return;

    const lastSeen = localStorage.getItem(LAST_SEEN_KEY);
    const since = lastSeen
      ? Timestamp.fromDate(new Date(lastSeen))
      : Timestamp.fromDate(new Date(Date.now() - 86400000));

    const q = query(
      collection(db, "activities"),
      where("createdAt", ">", since),
      where("visibility", "in", ["public", "followers"]),
      limit(UNREAD_CAP + 1)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const newItems = snap.docs.filter(
          (d) => d.data().authorId !== user.uid
        );
        setCapped(newItems.length > UNREAD_CAP);
        setCount(Math.min(newItems.length, UNREAD_CAP));
      },
      () => {
        setCount(0);
        setCapped(false);
      }
    );

    return unsub;
  }, [user?.uid]);

  const markSeen = () => {
    localStorage.setItem(LAST_SEEN_KEY, new Date().toISOString());
    setCount(0);
    setCapped(false);
  };

  return { count, markSeen, capped };
}
