/**
 * Posting a saved session to the feed, and taking the post back.
 *
 * The three finish screens (a programme workout, a saved routine, a run)
 * each built the same chain by hand: open the sheet, post or queue, record
 * the link on the session. The copies had already drifted. The routine's
 * swallowed a failed post, so a failure looked like nothing happening,
 * and only the run's re-queued a post that failed because the connection
 * dropped. Each now supplies only what differs, the preview and the
 * payload, and this module owns the rest.
 *
 * Sharing is automatic once the user has said so ("Share sessions
 * automatically?", asked once; see `finishShareStart`), so a session can be
 * posted without a tap. Two guards follow from that:
 *
 * - A post is remembered per session for the life of the app, so a finish
 *   screen that mounts again for the same session (a retried save, a
 *   remount) shows the existing post instead of posting it twice.
 * - Every post can be taken back from the screen that made it
 *   (`withdrawSessionPost`).
 */
import { doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { deleteDocGuarded } from "@/lib/firestoreWrite";
import { logger } from "@/lib/logger";
import { postActivity } from "@/lib/socialApi";
import type { ActivityPost } from "@/lib/activityPost";
import {
  cancelQueuedShare,
  compose,
  enqueueShare,
  type ActivityPreview,
  type ShareDecision,
  type ShareType,
  type ShareVisibility,
} from "@/lib/shareComposer";
import {
  clearSharedActivity,
  readSharedActivityId,
  recordSharedActivity,
  type ShareSource,
} from "@/lib/sessionDelete";

export type ShareOutcome =
  | { status: "posted"; visibility: ShareVisibility; activityId: string }
  /** Offline: waiting in the share queue, posted on reconnect. */
  | { status: "queued"; visibility: ShareVisibility }
  | { status: "declined" };

export type LiveShareOutcome = Exclude<ShareOutcome, { status: "declined" }>;

export interface SessionShareAction {
  uid: string;
  type: ShareType;
  source: ShareSource;
  /** With a decision, posts without asking. Without one, opens the share
   *  sheet and posts what the user picks there. */
  post: (decision?: ShareDecision) => Promise<ShareOutcome>;
}

/** Receipts cross `Promise<unknown>` boundaries (WorkoutSession's
 *  `onCompleteDay`), so the finish screen checks the shape it was given. */
export function isSessionShareAction(
  value: unknown
): value is SessionShareAction {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<SessionShareAction>;
  return (
    typeof v.uid === "string" &&
    (v.type === "run" || v.type === "workout") &&
    typeof v.post === "function" &&
    !!v.source &&
    typeof v.source.id === "string"
  );
}

const live = new Map<string, LiveShareOutcome>();
/** Posts under way, by session, so a second action for the same session
 *  (a resumed save chain builds a new one) waits on the first post. */
const inflight = new Map<string, Promise<ShareOutcome>>();

function keyOf(uid: string, source: ShareSource): string {
  return `${uid}:${source.kind}:${source.id}`;
}

/** The post this session already has in this app session, if any. */
export function liveSessionPost(
  action: Pick<SessionShareAction, "uid" | "source">
): LiveShareOutcome | undefined {
  return live.get(keyOf(action.uid, action.source));
}

export function createSessionShare({
  uid,
  type,
  source,
  preview,
  payload,
}: {
  uid: string;
  type: ShareType;
  source: ShareSource;
  /** What the share sheet shows. Only built if the sheet opens. */
  preview: () => ActivityPreview;
  payload: (decision: ShareDecision) => ActivityPost;
}): SessionShareAction {
  const key = keyOf(uid, source);
  const post = (decision?: ShareDecision): Promise<ShareOutcome> => {
    const existing = live.get(key);
    if (existing) return Promise.resolve(existing);
    const running = inflight.get(key);
    if (running) return running;
    const started = (async (): Promise<ShareOutcome> => {
      const chosen = decision ?? (await compose(uid, preview()));
      if (!chosen) return { status: "declined" };
      const outcome = await publish(
        uid,
        payload(chosen),
        source,
        chosen.visibility
      );
      live.set(key, outcome);
      return outcome;
    })().finally(() => {
      inflight.delete(key);
    });
    inflight.set(key, started);
    return started;
  };
  return { uid, type, source, post };
}

async function publish(
  uid: string,
  payload: ActivityPost,
  source: ShareSource,
  visibility: ShareVisibility
): Promise<LiveShareOutcome> {
  const queue = (): LiveShareOutcome => {
    enqueueShare(uid, payload, source);
    return { status: "queued", visibility };
  };
  // Checked up front, not only in a catch: offline, the Firestore SDK
  // parks the write rather than rejecting it, so a catch-only branch never
  // runs and the post waits on a promise that never settles.
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return queue();
  }
  try {
    const activityId = await postActivity(payload);
    // The link that lets deleting the session delete its post, and lets
    // `/workout/:id` show it as shared. Best-effort inside the helper.
    await recordSharedActivity(uid, source, activityId);
    return { status: "posted", visibility, activityId };
  } catch (err) {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return queue();
    }
    throw err;
  }
}

/**
 * Takes a session's post back: deletes it (or drops it from the offline
 * queue) and clears the session's link to it. Throws if it could not, and
 * the finish screen then keeps showing the post.
 */
export async function withdrawSessionPost(
  action: Pick<SessionShareAction, "uid" | "source">,
  outcome: LiveShareOutcome
): Promise<void> {
  const { uid, source } = action;
  let activityId: string | null =
    outcome.status === "posted" ? outcome.activityId : null;
  if (outcome.status === "queued" && !cancelQueuedShare(uid, source)) {
    // Not in the queue any more: it drained while this screen was open,
    // and the drain recorded the post's id on the session.
    activityId = await readSharedActivityId(uid, source);
  }
  if (activityId) {
    const writes = Promise.all([
      deleteDocGuarded(doc(db, "activities", activityId)),
      clearSharedActivity(uid, source),
    ]);
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      // Offline, the SDK applies both writes locally and does not settle
      // them until it reconnects, so waiting would leave Undo spinning.
      // The persistent cache keeps them for the reconnect.
      void writes.catch((err) =>
        logger.warn("[sessionPost] offline withdraw failed:", err)
      );
    } else {
      await writes;
    }
  }
  live.delete(keyOf(uid, source));
}
