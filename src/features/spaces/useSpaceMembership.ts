/**
 * Join / leave + membership state for one space (Spc1 PR2).
 *
 * Optimistic flips with revert-on-failure (kudos idiom); writes go
 * through the guarded wrappers (never raw setDoc — offline-queue +
 * undefined-stripping invariant). Member count is the same aggregate
 * read the directory uses.
 */
import { useCallback, useEffect, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  getCountFromServer,
  getDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { setDocGuarded } from "@/lib/firestoreWrite";
import { useAuth } from "@/lib/auth";
import { haptic } from "@/lib/haptic";
import { toast } from "@/lib/toast";
import { spaceDef } from "./spaceDefs";

export function useSpaceMembership(spaceId: string | undefined) {
  const { user, profile } = useAuth();
  const [joined, setJoined] = useState<boolean | null>(null);
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user || !spaceId || !spaceDef(spaceId)) return;
    let cancelled = false;
    (async () => {
      const [memberRes, countRes] = await Promise.allSettled([
        getDoc(doc(db, "spaces", spaceId, "members", user.uid)),
        getCountFromServer(collection(db, "spaces", spaceId, "members")),
      ]);
      if (cancelled) return;
      if (memberRes.status === "fulfilled") {
        setJoined(memberRes.value.exists());
      }
      if (countRes.status === "fulfilled") {
        setMemberCount(countRes.value.data().count);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, spaceId]);

  const join = useCallback(async () => {
    if (!user || !spaceId || busy) return;
    setBusy(true);
    setJoined(true);
    setMemberCount((c) => (c === null ? c : c + 1));
    haptic("light");
    try {
      await setDocGuarded(doc(db, "spaces", spaceId, "members", user.uid), {
        joinedAt: serverTimestamp(),
        /* Include identity fields only when they're real strings — a
           null value fails the rules' `is string` checks and denies
           the whole join (stripUndefined strips undefined, not null). */
        ...(profile?.displayName ? { displayName: profile.displayName } : {}),
        ...(profile?.photoURL ? { photoURL: profile.photoURL } : {}),
        uid: user.uid,
      });
    } catch {
      setJoined(false);
      setMemberCount((c) => (c === null ? c : Math.max(0, c - 1)));
      haptic("error");
      toast.error("Couldn't join the space. Try again.");
    } finally {
      setBusy(false);
    }
  }, [user, profile, spaceId, busy]);

  const leave = useCallback(async () => {
    if (!user || !spaceId || busy) return;
    setBusy(true);
    setJoined(false);
    setMemberCount((c) => (c === null ? c : Math.max(0, c - 1)));
    haptic("light");
    try {
      await deleteDoc(doc(db, "spaces", spaceId, "members", user.uid));
    } catch {
      setJoined(true);
      setMemberCount((c) => (c === null ? c : c + 1));
      haptic("error");
      toast.error("Couldn't leave the space. Try again.");
    } finally {
      setBusy(false);
    }
  }, [user, spaceId, busy]);

  return { joined, memberCount, busy, join, leave };
}
