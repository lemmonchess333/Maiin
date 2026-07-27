import { useCallback, useEffect, useRef, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { toggleSpacePostLike } from "@/lib/socialApi";
import { haptic } from "@/lib/haptic";
import { toast } from "@/lib/toast";
import { logger } from "@/lib/logger";

/**
 * SOC-P2c — the viewer's like state for a Space page's posts.
 *
 * Reads: one `likes/{uid}` doc per rendered post, batched in a single
 * Promise.all when the post list lands — the Space detail page is a
 * tap-gated surface with a bounded post list, so this stays a small,
 * predictable read set (no listeners).
 *
 * Toggle: optimistic — the flame flips and the count moves instantly;
 * the server's answer reconciles, and a failure reverts + toasts. The
 * counter itself is server-owned (the callable's transaction); the
 * local delta map only adjusts what THIS session displays.
 *
 * uid-scoped: an account switch resets all local state (queues/caches
 * never leak across accounts — the standing rule).
 */
export function useSpacePostLikes(spaceId: string, postIds: string[]) {
  const { user, profile } = useAuth();
  const uid = user?.uid ?? null;
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [deltas, setDeltas] = useState<Record<string, number>>({});
  const busyRef = useRef<Set<string>>(new Set());

  // Reset on account switch (adjust-during-render idiom is overkill
  // here — the page remounts per space; an effect keyed on uid is
  // enough and keeps the read below in one place).
  const seededForRef = useRef<string | null>(null);
  useEffect(() => {
    if (seededForRef.current === uid) return;
    seededForRef.current = uid;
    setLiked(new Set());
    setDeltas({});
  }, [uid]);

  // Seed liked state once per (uid, post list). Missing docs are the
  // common case — getDoc(exists=false) is still one read each, bounded
  // by the page's post list.
  const seededPostsRef = useRef<string>("");
  useEffect(() => {
    if (!uid || postIds.length === 0) return;
    const key = `${uid}:${postIds.join(",")}`;
    if (seededPostsRef.current === key) return;
    seededPostsRef.current = key;
    let cancelled = false;
    Promise.all(
      postIds.map(async (postId) => {
        try {
          const snap = await getDoc(
            doc(db, "spaces", spaceId, "posts", postId, "likes", uid)
          );
          return snap.exists() ? postId : null;
        } catch {
          return null;
        }
      })
    ).then((results) => {
      if (cancelled) return;
      setLiked(new Set(results.filter((r): r is string => r !== null)));
    });
    return () => {
      cancelled = true;
    };
  }, [uid, spaceId, postIds]);

  const toggle = useCallback(
    async (postId: string) => {
      if (!uid || busyRef.current.has(postId)) return;
      busyRef.current.add(postId);
      haptic("light");
      const wasLiked = liked.has(postId);
      // Optimistic flip.
      setLiked((prev) => {
        const next = new Set(prev);
        if (wasLiked) next.delete(postId);
        else next.add(postId);
        return next;
      });
      setDeltas((prev) => ({
        ...prev,
        [postId]: (prev[postId] ?? 0) + (wasLiked ? -1 : 1),
      }));
      try {
        const serverLiked = await toggleSpacePostLike(spaceId, postId, {
          fromName: profile?.displayName || "Someone",
        });
        // Reconcile if the server disagrees (e.g. a stale seed).
        if (serverLiked === wasLiked) {
          setLiked((prev) => {
            const next = new Set(prev);
            if (serverLiked) next.add(postId);
            else next.delete(postId);
            return next;
          });
          setDeltas((prev) => ({
            ...prev,
            [postId]: (prev[postId] ?? 0) + (serverLiked ? 1 : -1),
          }));
        }
      } catch (err) {
        // Revert the optimistic flip — honest failure, no silent lie.
        logger.error("[SpaceLikes] toggle failed:", err);
        setLiked((prev) => {
          const next = new Set(prev);
          if (wasLiked) next.add(postId);
          else next.delete(postId);
          return next;
        });
        setDeltas((prev) => ({
          ...prev,
          [postId]: (prev[postId] ?? 0) + (wasLiked ? 1 : -1),
        }));
        toast.error("Couldn't update. Try again.");
      } finally {
        busyRef.current.delete(postId);
      }
    },
    [uid, spaceId, liked, profile?.displayName]
  );

  return { liked, deltas, toggle };
}
