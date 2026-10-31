/**
 * Your own followers and following lists (Mob2 call 7). Anyone else's
 * profile shows only the counts: most accounts approve their followers
 * (Polish2), and their lists are theirs.
 *
 * A list is read a page at a time, newest follow first, each row with the
 * person's public name and photo. Removing a follower goes through the
 * removeFollower callable, which deletes both edges of the follow: the
 * rules let the person followed delete neither on their own.
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase";

export type FollowListKind = "followers" | "following";

export interface FollowListPerson {
  uid: string;
  displayName: string;
  photoURL?: string;
}

export interface FollowListPage {
  people: FollowListPerson[];
  /** Where the next page starts, or null when this was the last. */
  next: QueryDocumentSnapshot | null;
}

/** The rows a page holds. */
export const FOLLOW_LIST_PAGE = 30;

/** One page of `uid`'s followers or following, newest follow first. */
export async function getFollowListPage(
  uid: string,
  kind: FollowListKind,
  after: QueryDocumentSnapshot | null = null,
  size = FOLLOW_LIST_PAGE
): Promise<FollowListPage> {
  const edges = collection(db, kind, uid, "users");
  const snap = await getDocs(
    after
      ? query(
          edges,
          orderBy("followedAt", "desc"),
          startAfter(after),
          limit(size)
        )
      : query(edges, orderBy("followedAt", "desc"), limit(size))
  );
  const people = await Promise.all(
    snap.docs.map(async (edge) => {
      const profile = await getDoc(
        doc(db, "users", edge.id, "public", "profile")
      ).catch(() => null);
      const data = profile?.exists() ? profile.data() : {};
      return {
        uid: edge.id,
        displayName:
          typeof data.displayName === "string" && data.displayName
            ? data.displayName
            : "Athlete",
        ...(typeof data.photoURL === "string" && data.photoURL
          ? { photoURL: data.photoURL }
          : {}),
      };
    })
  );
  return {
    people,
    next: snap.docs.length === size ? (snap.docs.at(-1) ?? null) : null,
  };
}

/** Takes `followerUid`'s follow of the signed-in person away. */
export async function removeFollower(followerUid: string): Promise<void> {
  await httpsCallable(functions, "removeFollower")({ followerUid });
}
