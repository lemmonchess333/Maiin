// @vitest-environment jsdom — needs DOM/storage APIs; the rest of this directory runs in the fast node environment (audit batch 2).
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  compose,
  resolveCompose,
  getShareDefault,
  clearShareDefault,
  setShareDefault,
  answerShareQuestion,
  finishShareStart,
  enqueueShare,
  cancelQueuedShare,
  getQueueLength,
  drainQueue,
  subscribeShareComposer,
  type ActivityPreview,
} from "../shareComposer";

const WORKOUT_PREVIEW: ActivityPreview = {
  type: "workout",
  title: "Push Day",
  meta: ["1h 12m", "12,840kg volume"],
};

const RUN_PREVIEW: ActivityPreview = {
  type: "run",
  title: "Run",
  meta: ["5.20km", "28:14"],
};

// The always-pref is uid-scoped (audit F9). Tests use a single signed-in uid
// unless they specifically exercise the cross-account isolation.
const UID = "u1";

beforeEach(() => {
  localStorage.clear();
});

describe("compose / resolveCompose", function () {
  it("an explicit share action opens the sheet without rewriting a remembered default", async () => {
    setShareDefault(UID, "workout", "never");
    const listener = vi.fn();
    const stop = subscribeShareComposer(listener);
    const promise = compose(UID, WORKOUT_PREVIEW);
    expect(listener).toHaveBeenLastCalledWith(
      expect.objectContaining({ open: true })
    );
    resolveCompose({ visibility: "followers", caption: "" }, false);
    await expect(promise).resolves.toEqual({
      visibility: "followers",
      caption: "",
    });
    expect(getShareDefault(UID, "workout")).toBe("never");
    stop();
  });
  it("opens the sheet (returns an unresolved promise) when no preference is stored", async function () {
    const promise = compose(UID, WORKOUT_PREVIEW);
    let settled = false;
    void promise.then(() => {
      settled = true;
    });
    // Microtask flush — promise should not resolve without an explicit
    // resolveCompose call from the sheet.
    await Promise.resolve();
    expect(settled).toBe(false);
    resolveCompose({ visibility: "followers", caption: "" }, false);
    await expect(promise).resolves.toEqual({
      visibility: "followers",
      caption: "",
    });
  });

  it("opens the sheet even when a default is saved: the finish screen applies the default, not compose", async function () {
    /* compose() used to short-circuit on a saved default. From 2026-09-06
       every caller bypassed that, so the default applied nowhere and the
       Settings row promising "Shared automatically" shared nothing. The
       default is applied by the finish screen now (finishShareStart), and
       compose() is only ever the one-off sheet. */
    for (const saved of ["public", "never"] as const) {
      setShareDefault(UID, "workout", saved);
      const promise = compose(UID, WORKOUT_PREVIEW);
      let settled = false;
      void promise.then(() => {
        settled = true;
      });
      await Promise.resolve();
      expect(settled, `saved ${saved}`).toBe(false);
      resolveCompose(null, false);
      await expect(promise).resolves.toBeNull();
      expect(getShareDefault(UID, "workout")).toBe(saved);
    }
  });

  it("the sheet's remember box saves the default the finish screen will apply", async function () {
    const first = compose(UID, RUN_PREVIEW);
    resolveCompose(null, true);
    await first;
    expect(getShareDefault(UID, "run")).toBe("never");
    expect(finishShareStart(getShareDefault(UID, "run"), false)).toEqual({
      kind: "hold",
      reason: "never",
    });
  });

  it("scopes preferences per type — workout default does not leak to runs", async function () {
    const first = compose(UID, WORKOUT_PREVIEW);
    resolveCompose({ visibility: "followers", caption: "" }, true);
    await first;
    expect(getShareDefault(UID, "workout")).toBe("followers");
    expect(getShareDefault(UID, "run")).toBeNull();
  });

  it("does not persist a preference when remember is false", async function () {
    const first = compose(UID, WORKOUT_PREVIEW);
    resolveCompose({ visibility: "followers", caption: "yo" }, false);
    await first;
    expect(getShareDefault(UID, "workout")).toBeNull();
  });

  it("clearShareDefault removes the saved 'always' preference", async function () {
    const first = compose(UID, WORKOUT_PREVIEW);
    resolveCompose({ visibility: "public", caption: "" }, true);
    await first;
    clearShareDefault(UID, "workout");
    expect(getShareDefault(UID, "workout")).toBeNull();
  });

  it("migrates a stored legacy 'crews' always-pref to 'followers' (crews retirement)", async function () {
    // The retired 'crews' audience was the followers fan-out plus a
    // crewId tag; a persisted pref falls back to its underlying
    // fan-out rather than silently clearing.
    localStorage.setItem(`tropos.share.always.${UID}.run`, "crews");
    expect(getShareDefault(UID, "run")).toBe("followers");
    expect(finishShareStart(getShareDefault(UID, "run"), false)).toEqual({
      kind: "post",
      visibility: "followers",
    });
  });

  it("does NOT leak the always-pref across a shared-device account switch (audit F9)", async function () {
    // User A saves "always public" for workouts.
    const a = compose("user-a", WORKOUT_PREVIEW);
    resolveCompose({ visibility: "public", caption: "" }, true);
    await a;
    expect(getShareDefault("user-a", "workout")).toBe("public");

    // User B signs in on the SAME device. B's workout must NOT inherit A's
    // pref: getShareDefault is null for B, so the finish screen asks B
    // rather than auto-posting under B's account, and compose opens the
    // sheet (unresolved).
    expect(getShareDefault("user-b", "workout")).toBeNull();
    expect(
      finishShareStart(getShareDefault("user-b", "workout"), false)
    ).toEqual({ kind: "ask" });
    const b = compose("user-b", WORKOUT_PREVIEW);
    let settled = false;
    void b.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    resolveCompose(null, false);
    await b;
  });
});

describe("finishShareStart — what the finish screen does on save", function () {
  it("asks when no default is saved", function () {
    expect(finishShareStart(null, false)).toEqual({ kind: "ask" });
    expect(finishShareStart(null, true)).toEqual({ kind: "ask" });
  });

  it("posts with the saved audience, with no sheet", function () {
    expect(finishShareStart("followers", false)).toEqual({
      kind: "post",
      visibility: "followers",
    });
    expect(finishShareStart("public", false)).toEqual({
      kind: "post",
      visibility: "public",
    });
  });

  it("holds on 'never'", function () {
    expect(finishShareStart("never", false)).toEqual({
      kind: "hold",
      reason: "never",
    });
    expect(finishShareStart("never", true)).toEqual({
      kind: "hold",
      reason: "never",
    });
  });

  it("never posts for an account the rules will refuse (unverified email)", function () {
    for (const saved of ["followers", "public"] as const) {
      expect(finishShareStart(saved, true)).toEqual({
        kind: "hold",
        reason: "verify",
      });
    }
  });
});

describe("answerShareQuestion — the one question, asked once", function () {
  it("answers for runs and workouts together when neither has a default", function () {
    expect(answerShareQuestion(UID, "workout", "followers").sort()).toEqual([
      "run",
      "workout",
    ]);
    expect(getShareDefault(UID, "workout")).toBe("followers");
    expect(getShareDefault(UID, "run")).toBe("followers");
  });

  it("never overwrites a default the user already chose for the other type", function () {
    setShareDefault(UID, "run", "never");
    expect(answerShareQuestion(UID, "workout", "public")).toEqual(["workout"]);
    expect(getShareDefault(UID, "workout")).toBe("public");
    expect(getShareDefault(UID, "run")).toBe("never");
  });

  it("saves 'Don't share' as never, so the question is not asked again", function () {
    answerShareQuestion(UID, "run", "never");
    expect(finishShareStart(getShareDefault(UID, "run"), false).kind).toBe(
      "hold"
    );
    expect(finishShareStart(getShareDefault(UID, "workout"), false).kind).toBe(
      "hold"
    );
  });

  it("is scoped to the account that answered", function () {
    answerShareQuestion("user-a", "run", "public");
    expect(getShareDefault("user-b", "run")).toBeNull();
    expect(getShareDefault("user-b", "workout")).toBeNull();
  });
});

describe("offline queue", function () {
  const UID_A = "user-a";
  const UID_B = "user-b";

  it("enqueueShare appends payloads and getQueueLength reflects them", function () {
    enqueueShare(UID_A, { type: "workout", workoutName: "Push Day" });
    enqueueShare(UID_A, { type: "run", runName: "Easy 5k" });
    expect(getQueueLength()).toBe(2);
    expect(getQueueLength(UID_A)).toBe(2);
  });

  it("drainQueue posts each item and empties the queue on success", async function () {
    enqueueShare(UID_A, { type: "workout", workoutName: "Push Day" });
    enqueueShare(UID_A, { type: "run", runName: "Easy 5k" });
    const post = vi.fn().mockResolvedValue(undefined);
    await drainQueue(UID_A, post);
    expect(post).toHaveBeenCalledTimes(2);
    expect(getQueueLength()).toBe(0);
  });

  it("drainQueue keeps failed items in the queue for the next attempt", async function () {
    enqueueShare(UID_A, { id: "a" });
    enqueueShare(UID_A, { id: "b" });
    const post = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("network"));
    await drainQueue(UID_A, post);
    expect(post).toHaveBeenCalledTimes(2);
    expect(getQueueLength()).toBe(1);
  });

  it("drainQueue is a no-op on an empty queue", async function () {
    const post = vi.fn();
    await drainQueue(UID_A, post);
    expect(post).not.toHaveBeenCalled();
  });

  it("carries the item's source through to the drain", async function () {
    /* The source is what lets a DRAINED post record `sharedActivityId`
       back onto its session — the link `deleteLoggedSession` needs to
       clear the post. Before it existed, any session shared offline
       stranded its post on delete, while the same share made online was
       cleanable: two different delete outcomes for one user action,
       decided by network state the user can't see. */
    enqueueShare(
      UID_A,
      { type: "run", runName: "Easy 5k" },
      {
        kind: "run",
        id: "r-42",
      }
    );
    const post = vi.fn().mockResolvedValue(undefined);
    await drainQueue(UID_A, post);
    expect(post).toHaveBeenCalledWith(
      { type: "run", runName: "Easy 5k" },
      { kind: "run", id: "r-42" }
    );
  });

  it("a legacy item without a source drains with undefined, not a crash", async function () {
    // Items queued before the field existed — and any future writer that
    // has nothing to link — must behave exactly as pre-fix: post, no link.
    enqueueShare(UID_A, { type: "workout" });
    const post = vi.fn().mockResolvedValue(undefined);
    await drainQueue(UID_A, post);
    expect(post).toHaveBeenCalledWith({ type: "workout" }, undefined);
  });

  it("a failed post keeps its source for the retry", async function () {
    /* Losing the source on requeue would make the RETRY succeed as a
       link-less post — the stranded-post bug reappearing only for shares
       that failed once, the least observable slice. */
    enqueueShare(UID_A, { id: "a" }, { kind: "workout", id: "w-9" });
    const failing = vi.fn().mockRejectedValue(new Error("network"));
    await drainQueue(UID_A, failing);
    expect(getQueueLength(UID_A)).toBe(1);
    const retry = vi.fn().mockResolvedValue(undefined);
    await drainQueue(UID_A, retry);
    expect(retry).toHaveBeenCalledWith(
      { id: "a" },
      { kind: "workout", id: "w-9" }
    );
  });

  it("keeps one pending post per session: queueing a session again replaces it", function () {
    /* A retried save re-runs its finish screen, and with sharing automatic
       that queues the same session again. Two items would post it twice. */
    const source = { kind: "workout" as const, id: "w-1" };
    enqueueShare(UID_A, { attempt: 1 }, source);
    enqueueShare(UID_A, { attempt: 2 }, source);
    enqueueShare(UID_A, { attempt: 1 }, { kind: "run", id: "w-1" });
    enqueueShare(UID_B, { attempt: 1 }, source);
    enqueueShare(UID_A, { noSource: true });
    enqueueShare(UID_A, { noSource: true });
    expect(getQueueLength(UID_A)).toBe(4);
    expect(getQueueLength(UID_B)).toBe(1);
  });

  it("cancelQueuedShare drops only that account's post for that session", async function () {
    const source = { kind: "run" as const, id: "r-1" };
    enqueueShare(UID_A, { mine: true }, source);
    enqueueShare(UID_A, { other: true }, { kind: "run", id: "r-2" });
    enqueueShare(UID_B, { theirs: true }, source);
    expect(cancelQueuedShare(UID_A, source)).toBe(true);
    expect(cancelQueuedShare(UID_A, source)).toBe(false);
    const post = vi.fn().mockResolvedValue(undefined);
    await drainQueue(UID_A, post);
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith(
      { other: true },
      { kind: "run", id: "r-2" }
    );
    expect(getQueueLength(UID_B)).toBe(1);
  });

  it("a post cancelled while the drain is running is not posted", async function () {
    const first = { kind: "run" as const, id: "r-1" };
    const second = { kind: "run" as const, id: "r-2" };
    enqueueShare(UID_A, { n: 1 }, first);
    enqueueShare(UID_A, { n: 2 }, second);
    const post = vi.fn(async (payload: Record<string, unknown>) => {
      // The user taps Undo on the second session while the first posts.
      if (payload.n === 1) cancelQueuedShare(UID_A, second);
    });
    await drainQueue(UID_A, post);
    expect(post).toHaveBeenCalledTimes(1);
    expect(getQueueLength(UID_A)).toBe(0);
  });

  it("a post queued while the drain is running survives it", async function () {
    enqueueShare(UID_A, { n: 1 });
    const post = vi.fn(async () => {
      enqueueShare(UID_A, { n: 2 }, { kind: "workout", id: "w-late" });
    });
    await drainQueue(UID_A, post);
    expect(getQueueLength(UID_A)).toBe(1);
  });

  it("drainQueue only replays items belonging to the given uid", async function () {
    enqueueShare(UID_A, { type: "workout", workoutName: "A's push day" });
    enqueueShare(UID_B, { type: "run", runName: "B's 10k" });
    enqueueShare(UID_A, { type: "run", runName: "A's easy 5k" });
    const post = vi.fn().mockResolvedValue(undefined);
    await drainQueue(UID_A, post);
    expect(post).toHaveBeenCalledTimes(2); // both A items
    // B's item still pending — preserved for B's next sign-in.
    expect(getQueueLength()).toBe(1);
    expect(getQueueLength(UID_B)).toBe(1);
  });
});

describe("subscribeShareComposer", function () {
  it("calls the listener immediately with the current (closed) state", function () {
    const seen: { open: boolean }[] = [];
    const unsub = subscribeShareComposer((s) => seen.push({ open: s.open }));
    expect(seen).toHaveLength(1);
    expect(seen[0].open).toBe(false);
    unsub();
  });

  it("notifies subscribers when compose opens the sheet", async function () {
    const states: { open: boolean; type: string | null }[] = [];
    const unsub = subscribeShareComposer((s) =>
      states.push({ open: s.open, type: s.type })
    );
    // No stored pref (localStorage cleared in beforeEach) → compose opens + emits.
    const p = compose(UID, WORKOUT_PREVIEW);
    // Initial emit (closed) + the open emit.
    expect(states[states.length - 1]).toEqual({ open: true, type: "workout" });
    resolveCompose({ visibility: "followers", caption: "" }, false);
    await p;
    unsub();
  });

  it("stops notifying after unsubscribe", async function () {
    let count = 0;
    const unsub = subscribeShareComposer(() => count++);
    expect(count).toBe(1); // immediate call
    unsub();
    const p = compose(UID, WORKOUT_PREVIEW); // would emit if still subscribed
    expect(count).toBe(1); // no further calls
    resolveCompose(null, false);
    await p;
  });
});
