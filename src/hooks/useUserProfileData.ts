import { useCallback, useEffect, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  batchGetKudos,
  getFollowerCount,
  getFollowingCount,
} from "@/lib/socialApi";
import { activityToFeedItem, createdAtMs } from "@/lib/activityFeedItem";
import { BADGE_DEFINITIONS, type EarnedBadge } from "@/features/streaks/badges";
import { logger } from "@/lib/logger";
import type { FeedItem } from "@/hooks/useSocialFeed";

/** Posts the profile lists, newest first. Also the window "This week"
 *  is counted from, so it is larger than a week's sessions for anyone. */
export const PROFILE_POSTS_LIMIT = 20;
/** Badges shown under the week card, newest first. */
export const PROFILE_BADGES_SHOWN = 4;

export interface ProfileIdentity {
  displayName: string;
  photoURL?: string;
}

/** `missing`: no profile document at all (a deleted account, a bad
 *  link). `error`: the read itself failed (offline, say), which is not
 *  evidence the profile is gone, so it offers a retry instead. */
export type ProfileStatus = "loading" | "missing" | "error" | "ready";

interface PostsState {
  items: FeedItem[];
  loading: boolean;
}

function postsQuery(uid: string, visibility: string | string[]) {
  return query(
    collection(db, "activities"),
    where("authorId", "==", uid),
    // One clause either way, so the index check reads one field.
    where("visibility", Array.isArray(visibility) ? "in" : "==", visibility),
    orderBy("createdAt", "desc"),
    limit(PROFILE_POSTS_LIMIT)
  );
}

/**
 * The visibility filter of each query a profile runs for its posts.
 *
 * Rules are not filters: a query for public AND followers-only posts is
 * refused whole for anyone who does not follow the person, which is most
 * people opening a profile from Explore (`firestore.rules.test.ts`, the
 * "profile:" cases). So someone else's profile asks for each kind on its
 * own, and the followers-only query fails quietly for a non-follower.
 * Your own profile asks for both at once, which the owner may, and never
 * for private sessions, because it shows what other people see.
 */
export function profilePostVisibilities(isOwn: boolean): (string | string[])[] {
  return isOwn ? [["public", "followers"]] : ["public", "followers"];
}

async function readPosts(uid: string, isOwn: boolean): Promise<FeedItem[]> {
  const snaps = await Promise.all(
    profilePostVisibilities(isOwn).map((visibility) => {
      const read = getDocs(postsQuery(uid, visibility));
      if (visibility === "public" || isOwn) return read;
      return read.catch((err: { code?: string }) => {
        if (err?.code !== "permission-denied") {
          logger.warn("[profile] followers-only posts read failed", err);
        }
        return null;
      });
    })
  );
  const byId = new Map<string, FeedItem>();
  for (const snap of snaps) {
    for (const d of snap?.docs ?? []) {
      byId.set(d.id, activityToFeedItem(d.id, d.data()));
    }
  }
  return [...byId.values()]
    .sort((a, b) => createdAtMs(b.createdAt) - createdAtMs(a.createdAt))
    .slice(0, PROFILE_POSTS_LIMIT);
}

function newestBadges(earnedMap: Record<string, string>): EarnedBadge[] {
  const earned: EarnedBadge[] = [];
  for (const [id, earnedAt] of Object.entries(earnedMap)) {
    const def = BADGE_DEFINITIONS.find((b) => b.id === id);
    if (!def) {
      // Schema drift: an id the client catalogue doesn't know. Skip it.
      logger.warn(`[profile] unknown badge id: ${id}`);
      continue;
    }
    earned.push({ ...def, earnedAt });
  }
  return earned
    .sort((a, b) => (b.earnedAt ?? "").localeCompare(a.earnedAt ?? ""))
    .slice(0, PROFILE_BADGES_SHOWN);
}

/**
 * Everything the profile page reads, for one (viewer, profile) pair. The
 * page is keyed by that pair, so a new profile starts from a fresh hook
 * and nothing from the last one can show while it loads.
 *
 * The page renders once the identity read settles; the posts, counts and
 * badges arrive after and fill in.
 */
export function useUserProfileData(uid: string, viewerUid: string | null) {
  const isOwn = viewerUid === uid;
  const [status, setStatus] = useState<ProfileStatus>("loading");
  const [identity, setIdentity] = useState<ProfileIdentity | null>(null);
  const [streak, setStreak] = useState(0);
  const [trainingForSpaceId, setTrainingForSpaceId] = useState<string | null>(
    null
  );
  const [followers, setFollowers] = useState<number | null>(null);
  const [followingCount, setFollowingCount] = useState<number | null>(null);
  const [badges, setBadges] = useState<EarnedBadge[]>([]);
  const [posts, setPosts] = useState<PostsState>({ items: [], loading: true });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const live = () => !cancelled;

    // Identity: your own document for your own profile (the public copy
    // can trail it); the public projection for anyone else, which is the
    // only copy other people may read.
    const ownDoc = isOwn
      ? getDoc(doc(db, "users", uid))
      : Promise.resolve(null);
    const publicDoc = getDoc(doc(db, "users", uid, "public", "profile"));
    Promise.allSettled([ownDoc, publicDoc]).then(([own, pub]) => {
      if (!live()) return;
      const ownData =
        own.status === "fulfilled" && own.value?.exists()
          ? own.value.data()
          : null;
      const pubData =
        pub.status === "fulfilled" && pub.value.exists()
          ? pub.value.data()
          : null;
      if (pubData) {
        setStreak((pubData.currentStreak as number) ?? 0);
        // SOC-P2f — the chip validates kind + upcoming date itself.
        setTrainingForSpaceId(
          typeof pubData.trainingForSpaceId === "string"
            ? pubData.trainingForSpaceId
            : null
        );
        if (!isOwn) {
          const summary = pubData.badgeSummary as
            | { earnedMap?: Record<string, string> }
            | undefined;
          setBadges(newestBadges(summary?.earnedMap ?? {}));
        }
      }
      const source = ownData ?? pubData;
      if (source) {
        setIdentity({
          displayName: (source.displayName as string | undefined) || "Athlete",
          photoURL: (source.photoURL as string | null | undefined) ?? undefined,
        });
        setStatus("ready");
        return;
      }
      const failed = own.status === "rejected" || pub.status === "rejected";
      if (failed) {
        logger.warn(
          `[profile] identity read failed for ${uid}`,
          own.status === "rejected"
            ? own.reason
            : (pub as PromiseRejectedResult).reason
        );
      }
      setStatus(failed ? "error" : "missing");
    });

    getFollowerCount(uid)
      .then((n) => live() && setFollowers(n))
      .catch(() => live() && setFollowers(0));
    getFollowingCount(uid)
      .then((n) => live() && setFollowingCount(n))
      .catch(() => live() && setFollowingCount(0));

    // Your own badges come from the live record (owner-only), so their
    // dates are the real ones rather than the public summary's copy.
    if (isOwn) {
      getDoc(doc(db, "users", uid, "streaks", "data"))
        .then((snap) => {
          if (!live() || !snap.exists()) return;
          setBadges(
            newestBadges(
              (snap.data().badges as Record<string, string> | undefined) ?? {}
            )
          );
        })
        .catch(() => {});
    }

    readPosts(uid, isOwn)
      .then(async (items) => {
        if (!viewerUid || items.length === 0) return items;
        const liked = await batchGetKudos(
          items.map((i) => i.activityId),
          viewerUid
        ).catch(() => ({}) as Record<string, boolean>);
        return items.map((i) => ({
          ...i,
          liked: liked[i.activityId] || false,
        }));
      })
      .then((items) => live() && setPosts({ items, loading: false }))
      .catch((err) => {
        logger.warn(`[profile] posts read failed for ${uid}`, err);
        if (live()) setPosts({ items: [], loading: false });
      });

    return () => {
      cancelled = true;
    };
  }, [uid, viewerUid, isOwn, attempt]);

  const retry = useCallback(() => {
    setStatus("loading");
    setPosts({ items: [], loading: true });
    setAttempt((n) => n + 1);
  }, []);

  /** Following or unfollowing from the page moves the count at once. */
  const adjustFollowers = useCallback((delta: number) => {
    setFollowers((n) => (n === null ? n : Math.max(0, n + delta)));
  }, []);

  return {
    status,
    identity,
    streak,
    trainingForSpaceId,
    followers,
    followingCount,
    badges,
    posts: posts.items,
    postsLoading: posts.loading,
    retry,
    adjustFollowers,
  };
}
