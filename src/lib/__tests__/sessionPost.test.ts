// @vitest-environment jsdom — the share queue lives in localStorage.
/**
 * `sessionPost` — the one path a finish screen posts a session through, and
 * the Undo that takes it back.
 *
 * Sharing is automatic once the user has answered the question, so the
 * properties worth holding are the ones a tap used to paper over: a session
 * is posted once however many times its finish screen asks, a post can be
 * taken back completely (the post AND the session's link to it), and
 * nothing waits on a write that cannot settle offline.
 *
 * Driven through the one Firestore fake (ADR-0009): the assertions are
 * about documents that exist or do not.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("firebase/firestore");
const h = vi.hoisted(() => ({ failNext: null as Error | null }));
// Signed in, so the offline save queue flushes for this account.
vi.mock("@/lib/firebase", () => ({
  db: {},
  auth: { currentUser: { uid: "u1" } },
}));
vi.mock("@/lib/socialApi", async () => {
  const { collection } = await import("firebase/firestore");
  const { db } = await import("@/lib/firebase");
  const { addDocGuarded } = await import("@/lib/firestoreWrite");
  return {
    postActivity: vi.fn(async (activity: Record<string, unknown>) => {
      if (h.failNext) {
        const err = h.failNext;
        h.failNext = null;
        throw err;
      }
      const ref = await addDocGuarded(collection(db, "activities"), activity);
      return ref.id;
    }),
  };
});

import {
  resetFirestore,
  seedFirestore,
  readDoc,
  allPaths,
  deferWrites,
  pendingWrites,
  releaseAllWrites,
  releaseWrite,
  resumeWrites,
  failNextFirestore,
  unfiredFailures,
} from "@/test/firestoreHarness";
import { db } from "@/lib/firebase";
import { postActivity } from "@/lib/socialApi";
import type { ActivityPost } from "@/lib/activityPost";
import { flushQueue, queueWorkoutCompletion } from "@/lib/offlineQueue";
import { recordSharedActivity, type ShareSource } from "@/lib/sessionDelete";
import {
  getQueueLength,
  cancelQueuedShare,
  drainQueue,
  resolveCompose,
  subscribeShareComposer,
  type ShareDecision,
} from "@/lib/shareComposer";
import {
  createSessionShare,
  isSessionShareAction,
  liveSessionPost,
  withdrawSessionPost,
} from "@/lib/sessionPost";

const UID = "u1";
let sessionN = 0;
let workoutId = "";

function workoutShare(id = workoutId) {
  return createSessionShare({
    uid: UID,
    type: "workout",
    source: { kind: "workout", id },
    preview: () => ({ type: "workout", title: "Push", meta: [] }),
    payload: (d: ShareDecision): ActivityPost => ({
      authorId: UID,
      authorName: "Alex",
      type: "workout",
      visibility: d.visibility,
      ...(d.caption ? { caption: d.caption } : {}),
      workoutName: "Push",
    }),
  });
}

function activityPaths(): string[] {
  return allPaths().filter((p) => p.startsWith("activities/"));
}

function setOnline(value: boolean) {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(value);
}

/** What the app's drain does with each queued post (ShareComposerSheet):
 *  post it, link it to its session, and pass the post's id back. */
async function drainPost(
  payload: Record<string, unknown>,
  source?: ShareSource
): Promise<string> {
  const activityId = await postActivity(payload as unknown as ActivityPost);
  if (source) await recordSharedActivity(UID, source, activityId);
  return activityId;
}

beforeEach(() => {
  resetFirestore();
  localStorage.clear();
  vi.mocked(postActivity).mockClear();
  h.failNext = null;
  // The post registry lives for the app's life, so each test posts a
  // session no other test has.
  workoutId = `w-${++sessionN}`;
  seedFirestore({ [`users/${UID}/workouts/${workoutId}`]: { date: "x" } });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("posting a session", () => {
  it("posts with a decision and no sheet, and links the post to the session", async () => {
    const opened = vi.fn();
    const stop = subscribeShareComposer((s) => s.open && opened());
    const outcome = await workoutShare().post({
      visibility: "followers",
      caption: "",
    });
    stop();
    expect(opened).not.toHaveBeenCalled();
    expect(outcome.status).toBe("posted");
    if (outcome.status !== "posted") return;
    expect(readDoc(`activities/${outcome.activityId}`)).toMatchObject({
      visibility: "followers",
    });
    expect(readDoc(`users/${UID}/workouts/${workoutId}`)).toMatchObject({
      sharedActivityId: outcome.activityId,
    });
  });

  it("without a decision, opens the sheet and posts what the user picks", async () => {
    const pending = workoutShare().post();
    resolveCompose({ visibility: "public", caption: "Felt good" });
    const outcome = await pending;
    expect(outcome).toMatchObject({ status: "posted", visibility: "public" });
    expect(postActivity).toHaveBeenCalledWith(
      expect.objectContaining({ caption: "Felt good", visibility: "public" })
    );
  });

  it("declining in the sheet posts nothing", async () => {
    const pending = workoutShare().post();
    resolveCompose(null);
    await expect(pending).resolves.toEqual({ status: "declined" });
    expect(activityPaths()).toEqual([]);
  });

  it("offline, queues the post instead of waiting on a write that cannot settle", async () => {
    setOnline(false);
    const outcome = await workoutShare().post({
      visibility: "followers",
      caption: "",
    });
    expect(outcome).toEqual({ status: "queued", visibility: "followers" });
    expect(postActivity).not.toHaveBeenCalled();
    expect(getQueueLength(UID)).toBe(1);
  });

  it("a connection that drops during the post queues it", async () => {
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    vi.mocked(postActivity).mockImplementationOnce(async () => {
      online.mockReturnValue(false);
      throw new Error("unavailable");
    });
    const outcome = await workoutShare().post({
      visibility: "public",
      caption: "",
    });
    expect(outcome).toEqual({ status: "queued", visibility: "public" });
    expect(getQueueLength(UID)).toBe(1);
  });

  it("a failure while online is reported, not swallowed, and can be retried", async () => {
    h.failNext = new Error("permission-denied");
    const share = workoutShare();
    await expect(
      share.post({ visibility: "followers", caption: "" })
    ).rejects.toThrow("permission-denied");
    expect(liveSessionPost(share)).toBeUndefined();
    await expect(
      share.post({ visibility: "followers", caption: "" })
    ).resolves.toMatchObject({ status: "posted" });
  });
});

describe("a session is posted once", () => {
  it("concurrent posts, and a second action for the same session, share the first post", async () => {
    // A resumed save chain builds a second action for the same session, and
    // StrictMode runs the finish screen's effect twice.
    const first = workoutShare();
    const second = workoutShare();
    const decision = { visibility: "followers" as const, caption: "" };
    const [a, b] = await Promise.all([
      first.post(decision),
      second.post(decision),
    ]);
    expect(postActivity).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
    await expect(workoutShare().post(decision)).resolves.toEqual(a);
    expect(postActivity).toHaveBeenCalledTimes(1);
    expect(activityPaths()).toHaveLength(1);
  });

  it("another session is its own post", async () => {
    const decision = { visibility: "followers" as const, caption: "" };
    await workoutShare().post(decision);
    await workoutShare("w-other").post(decision);
    expect(activityPaths()).toHaveLength(2);
  });
});

describe("Undo", () => {
  it("deletes the post and clears the session's link, and the session can be shared again", async () => {
    const share = workoutShare();
    const outcome = await share.post({ visibility: "followers", caption: "" });
    if (outcome.status !== "posted") throw new Error("expected a post");
    await expect(withdrawSessionPost(share, outcome)).resolves.toBe("removed");
    expect(activityPaths()).toEqual([]);
    expect(
      readDoc(`users/${UID}/workouts/${workoutId}`)?.sharedActivityId
    ).toBeNull();
    expect(liveSessionPost(share)).toBeUndefined();
    await expect(
      share.post({ visibility: "public", caption: "" })
    ).resolves.toMatchObject({ status: "posted", visibility: "public" });
  });

  it("drops a queued post from the queue", async () => {
    setOnline(false);
    const share = workoutShare();
    const outcome = await share.post({ visibility: "followers", caption: "" });
    if (outcome.status !== "queued") throw new Error("expected a queue");
    await expect(withdrawSessionPost(share, outcome)).resolves.toBe(
      "cancelled"
    );
    expect(getQueueLength(UID)).toBe(0);
    expect(liveSessionPost(share)).toBeUndefined();
  });

  it("a queued post already on its way is taken back once it lands, not reported cancelled", async () => {
    setOnline(false);
    const share = workoutShare();
    const outcome = await share.post({ visibility: "followers", caption: "" });
    if (outcome.status !== "queued") throw new Error("expected a queue");
    // Back online: the drain sends the post, and the user taps Undo while
    // the request is still on its way.
    setOnline(true);
    deferWrites();
    const draining = drainQueue(UID, drainPost);
    await vi.waitFor(() => expect(pendingWrites()).toHaveLength(1));
    resumeWrites();
    let settled = false;
    const undo = withdrawSessionPost(share, outcome).then((result) => {
      settled = true;
      return result;
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    // It cannot be finished before the post it has to take back exists.
    expect(settled).toBe(false);

    expect(releaseWrite()).toBe(true);
    await draining;
    await expect(undo).resolves.toBe("removed");
    expect(activityPaths()).toEqual([]);
    expect(
      readDoc(`users/${UID}/workouts/${workoutId}`)?.sharedActivityId
    ).toBeNull();
  });

  it("takes back a post the drain sent by the id the drain passed back, even when its link was lost", async () => {
    setOnline(false);
    const share = workoutShare();
    const outcome = await share.post({ visibility: "followers", caption: "" });
    if (outcome.status !== "queued") throw new Error("expected a queue");
    setOnline(true);
    // The post lands; writing its link onto the session does not.
    failNextFirestore("updateDoc", {
      path: `users/${UID}/workouts/${workoutId}`,
      code: "unavailable",
    });
    await drainQueue(UID, drainPost);
    expect(unfiredFailures()).toEqual([]);
    expect(activityPaths()).toHaveLength(1);

    const result = await withdrawSessionPost(share, outcome);
    expect(activityPaths()).toEqual([]);
    expect(result).toBe("removed");
  });

  it("finds a queued post that drained while the screen was open, by the session's link", async () => {
    setOnline(false);
    const share = workoutShare();
    const outcome = await share.post({ visibility: "followers", caption: "" });
    if (outcome.status !== "queued") throw new Error("expected a queue");
    // The drain posted it and recorded the link.
    cancelQueuedShare(UID, share.source);
    seedFirestore({
      "activities/drained": { authorId: UID, type: "workout" },
      [`users/${UID}/workouts/${workoutId}`]: {
        date: "x",
        sharedActivityId: "drained",
      },
    });
    setOnline(true);
    await withdrawSessionPost(share, outcome);
    expect(activityPaths()).toEqual([]);
    expect(
      readDoc(`users/${UID}/workouts/${workoutId}`)?.sharedActivityId
    ).toBeNull();
  });

  it("offline, returns without waiting for the server, and the delete lands on reconnect", async () => {
    const share = workoutShare();
    const outcome = await share.post({ visibility: "followers", caption: "" });
    if (outcome.status !== "posted") throw new Error("expected a post");
    setOnline(false);
    deferWrites();
    await withdrawSessionPost(share, outcome);
    expect(pendingWrites()).toContain(`activities/${outcome.activityId}`);
    releaseAllWrites();
    await Promise.resolve();
    expect(activityPaths()).toEqual([]);
  });
});

describe("a workout shared before its save lands", () => {
  it("links the post to the workout once the save lands", async () => {
    // Finished offline: the workout waits in the save queue. The
    // connection is back when the finish screen posts it, before the queue
    // has landed the workout, so the session document does not exist yet.
    const id = `w-queued-${++sessionN}`;
    setOnline(false);
    void queueWorkoutCompletion(db, UID, id, { date: "x", exercises: [] });
    setOnline(true);
    const share = workoutShare(id);
    const outcome = await share.post({ visibility: "followers", caption: "" });
    if (outcome.status !== "posted") throw new Error("expected a post");

    await flushQueue(db, UID);
    // The link is what lets deleting the workout delete its post, and what
    // `/workout/:id` reads to show the workout as shared.
    expect(readDoc(`users/${UID}/workouts/${id}`)).toMatchObject({
      sharedActivityId: outcome.activityId,
    });
  });
});

describe("isSessionShareAction", () => {
  it("accepts an action and refuses anything else crossing the receipt boundary", () => {
    expect(isSessionShareAction(workoutShare())).toBe(true);
    expect(isSessionShareAction(async () => {})).toBe(false);
    expect(isSessionShareAction({ post: () => {} })).toBe(false);
    expect(isSessionShareAction(undefined)).toBe(false);
  });
});
