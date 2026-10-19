/**
 * Join / leave + membership state for one space (Spc1 PR2).
 *
 * Optimistic flips with revert-on-failure (kudos idiom); writes go
 * through the guarded wrappers (never raw setDoc — offline-queue +
 * undefined-stripping invariant). Member count is the same aggregate
 * read the directory uses.
 *
 * A restricted account can leave but not join (S4e): `restricted` lets
 * the page say so, and a Join tap says why instead of writing.
 *
 * The page is not remounted between spaces (a notification can open one
 * Space over another), so what it knows is kept per space: another space
 * reads as unknown until its own reads answer, and a join or leave that
 * settles after the page has moved on changes nothing on the new one.
 */
import { useCallback, useEffect, useState } from "react";
import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { setDocGuarded, deleteDocGuarded } from "@/lib/firestoreWrite";
import { useAuth } from "@/lib/auth";
import { haptic } from "@/lib/haptic";
import { toast } from "@/lib/toast";
import { useRestrictedStatus } from "@/hooks/useRestrictedStatus";
import { showRestrictedToast } from "@/lib/accountRestriction";
import { spaceDef } from "./spaceDefs";

interface Membership {
  spaceId: string | undefined;
  joined: boolean | null;
  memberCount: number | null;
}

const unknownIn = (spaceId: string | undefined): Membership => ({
  spaceId,
  joined: null,
  memberCount: null,
});

export function useSpaceMembership(spaceId: string | undefined) {
  const { user, profile } = useAuth();
  const { isRestricted } = useRestrictedStatus(user?.uid);
  const [membership, setMembership] = useState<Membership>(() =>
    unknownIn(spaceId)
  );
  const [busy, setBusy] = useState(false);
  const { joined, memberCount } =
    membership.spaceId === spaceId ? membership : unknownIn(spaceId);

  /* Change what is known about `id`. On a read or a tap the page is on
     `id`; once a write settles it may not be, and then the result is
     dropped rather than written over the space now open. */
  const update = useCallback(
    (
      id: string,
      change: (m: Membership) => Partial<Membership>,
      settled = false
    ) =>
      setMembership((prev) => {
        if (settled && prev.spaceId !== id) return prev;
        const base = prev.spaceId === id ? prev : unknownIn(id);
        return { ...base, ...change(base) };
      }),
    []
  );

  useEffect(() => {
    if (!user || !spaceId || !spaceDef(spaceId)) return;
    let cancelled = false;
    (async () => {
      const [memberRes, countRes] = await Promise.allSettled([
        getDoc(doc(db, "spaces", spaceId, "members", user.uid)),
        getCountFromServer(collection(db, "spaces", spaceId, "members")),
      ]);
      if (cancelled) return;
      update(spaceId, () => ({
        ...(memberRes.status === "fulfilled"
          ? { joined: memberRes.value.exists() }
          : {}),
        ...(countRes.status === "fulfilled"
          ? { memberCount: countRes.value.data().count }
          : {}),
      }));
    })();
    return () => {
      cancelled = true;
    };
  }, [user, spaceId, update]);

  const join = useCallback(async () => {
    if (!user || !spaceId || busy) return;
    if (isRestricted) {
      haptic("error");
      showRestrictedToast();
      return;
    }
    setBusy(true);
    update(spaceId, (m) => ({
      joined: true,
      memberCount: m.memberCount === null ? null : m.memberCount + 1,
    }));
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
      update(
        spaceId,
        (m) => ({
          joined: false,
          memberCount:
            m.memberCount === null ? null : Math.max(0, m.memberCount - 1),
        }),
        true
      );
      haptic("error");
      toast.error("Couldn't join the space. Try again.");
    } finally {
      setBusy(false);
    }
  }, [user, profile, spaceId, busy, isRestricted, update]);

  const leave = useCallback(async () => {
    if (!user || !spaceId || busy) return;
    setBusy(true);
    update(spaceId, (m) => ({
      joined: false,
      memberCount:
        m.memberCount === null ? null : Math.max(0, m.memberCount - 1),
    }));
    haptic("light");
    try {
      await deleteDocGuarded(doc(db, "spaces", spaceId, "members", user.uid));
    } catch {
      update(
        spaceId,
        (m) => ({
          joined: true,
          memberCount: m.memberCount === null ? null : m.memberCount + 1,
        }),
        true
      );
      haptic("error");
      toast.error("Couldn't leave the space. Try again.");
    } finally {
      setBusy(false);
    }
  }, [user, spaceId, busy, update]);

  return { joined, memberCount, busy, join, leave, restricted: isRestricted };
}
