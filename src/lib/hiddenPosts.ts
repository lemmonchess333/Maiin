/**
 * Hidden posts: the feed posts a person chose not to see again (S4c's
 * "Hide from my feed"), kept in their own account so the choice follows
 * them to every device, and listed under Settings → Social & privacy →
 * Hidden posts, where each can be shown again (App1 Q38).
 *
 * `users/{uid}/hiddenPosts/{activityId}` = `{ hiddenAt, authorId? }`.
 * Owner-only in `firestore.rules`, swept with the account
 * (`functions/accountDeletion.js`). The record holds the author's id and
 * never their name: the list reads the post itself for the name, so a
 * renamed author is shown by their new name, and a post nobody may read
 * any more names nobody.
 *
 * Until App1 the set lived in this device's local storage alone, so a
 * post hidden on the phone came back on the web, on a new phone, and
 * whenever iOS cleared the web view's storage. `migrateLocalHiddenPosts`
 * carries a device's old set into the account once, then forgets it.
 */
import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { deleteDocGuarded, setDocGuarded } from "@/lib/firestoreWrite";
import { readJson, remove } from "@/lib/localStore";
import { createdAtMs } from "@/lib/activityFeedItem";
import { generatedDayType } from "@/lib/liftDayLabel";
import { liftPostExerciseCount } from "@/lib/liftPost";
import { distanceLabel } from "@/lib/runLabels";
import type { DistanceUnit } from "@/lib/distanceUnits";
import { formatDayMonth, formatDayMonthYear } from "@/utils/formatters";

/** One post the person hid. */
export interface HiddenPost {
  activityId: string;
  /** When it was hidden; 0 while the server has not stamped it yet. */
  hiddenAtMs: number;
  /** The post's author, when the hide knew it (a hide carried over from
   *  the device's old list does not). */
  authorId?: string;
}

/** The person's hidden posts, live, newest hidden first. Returns the
 *  unsubscribe. */
export function subscribeHiddenPosts(
  uid: string,
  onChange: (posts: HiddenPost[]) => void,
  onError: (err: unknown) => void
): () => void {
  return onSnapshot(
    collection(db, "users", uid, "hiddenPosts"),
    (snap) => {
      const posts = snap.docs.map((d) => {
        const data = d.data({ serverTimestamps: "estimate" }) as {
          hiddenAt?: unknown;
          authorId?: unknown;
        };
        const authorId =
          typeof data.authorId === "string" && data.authorId
            ? data.authorId
            : undefined;
        return {
          activityId: d.id,
          hiddenAtMs: data.hiddenAt ? createdAtMs(data.hiddenAt) : 0,
          ...(authorId ? { authorId } : {}),
        };
      });
      posts.sort((a, b) => b.hiddenAtMs - a.hiddenAtMs);
      onChange(posts);
    },
    onError
  );
}

/** Hide a post from this account's feed, on every device. */
export function hidePost(
  uid: string,
  activityId: string,
  authorId?: string
): Promise<void> {
  return setDocGuarded(doc(db, "users", uid, "hiddenPosts", activityId), {
    hiddenAt: serverTimestamp(),
    authorId: authorId || undefined,
  });
}

/** Show a hidden post in this account's feed again. */
export function unhidePost(uid: string, activityId: string): Promise<void> {
  return deleteDocGuarded(doc(db, "users", uid, "hiddenPosts", activityId));
}

/**
 * Carry the posts this device hid before App1 (local storage, per
 * account) into the account, then forget the device's copy. The copy
 * goes only once every write has landed, so a write that fails, or waits
 * offline, leaves it to be carried again next time; a post written twice
 * is still one record.
 */
export function migrateLocalHiddenPosts(uid: string): Promise<void> {
  const stored = readJson<unknown>(`tropos.hiddenActivities.${uid}`, null);
  if (!Array.isArray(stored)) return Promise.resolve();
  const ids = stored.filter(
    (id): id is string => typeof id === "string" && !!id && !id.includes("/")
  );
  return Promise.all(ids.map((id) => hidePost(uid, id))).then(() => {
    remove(`tropos.hiddenActivities.${uid}`);
  });
}

/**
 * A hidden post's one line: its name, then its distance or how many
 * exercises, then the day it was posted. "Easy run · 5.2 km · 12 Nov",
 * "Pull · 6 exercises · 3 Oct". A post from another year carries it.
 */
export function hiddenPostLine(
  post: Record<string, unknown>,
  unit: DistanceUnit,
  now: Date = new Date()
): string {
  const isRun = post.type === "run";
  const stored = [post.activityTitle, post.workoutName, post.runName].find(
    (v): v is string => typeof v === "string" && v.trim() !== ""
  );
  const title = stored
    ? (generatedDayType(stored) ?? stored.trim())
    : isRun
      ? "Run"
      : "Lift";
  const parts = [title];
  if (isRun) {
    const metres = typeof post.distance === "number" ? post.distance : 0;
    if (metres > 0) parts.push(distanceLabel(metres, unit));
  } else {
    const count = liftPostExerciseCount(post);
    if (count > 0)
      parts.push(`${count} ${count === 1 ? "exercise" : "exercises"}`);
  }
  const ms = createdAtMs(post.createdAt);
  if (ms > 0) {
    const day = new Date(ms);
    parts.push(
      day.getFullYear() === now.getFullYear()
        ? formatDayMonth(day)
        : formatDayMonthYear(day)
    );
  }
  return parts.join(" · ");
}
