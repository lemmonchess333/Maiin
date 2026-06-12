import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  compose,
  resolveCompose,
  getShareDefault,
  clearShareDefault,
  enqueueShare,
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

beforeEach(() => {
  localStorage.clear();
});

describe("compose / resolveCompose", function () {
  it("opens the sheet (returns an unresolved promise) when no preference is stored", async function () {
    const promise = compose(WORKOUT_PREVIEW);
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

  it("short-circuits with the saved 'always' preference instead of opening the sheet", async function () {
    resolveCompose({ visibility: "public", caption: "" }, true);
    // Above call had no in-flight compose; it just persists the default
    // when remember is true and a type is in state. Repro the contract:
    // user opens the sheet once, picks "Make public" with remember,
    // closes; the next compose() should resolve immediately.
    const first = compose(WORKOUT_PREVIEW);
    resolveCompose({ visibility: "public", caption: "" }, true);
    await first;
    const second = compose(WORKOUT_PREVIEW);
    await expect(second).resolves.toEqual({
      visibility: "public",
      caption: "",
    });
    expect(getShareDefault("workout")).toBe("public");
  });

  it("returns null without opening the sheet when 'never' is stored", async function () {
    const first = compose(RUN_PREVIEW);
    resolveCompose(null, true);
    await first;
    expect(getShareDefault("run")).toBe("never");
    await expect(compose(RUN_PREVIEW)).resolves.toBeNull();
  });

  it("scopes preferences per type — workout default does not leak to runs", async function () {
    const first = compose(WORKOUT_PREVIEW);
    resolveCompose({ visibility: "followers", caption: "" }, true);
    await first;
    expect(getShareDefault("workout")).toBe("followers");
    expect(getShareDefault("run")).toBeNull();
  });

  it("does not persist a preference when remember is false", async function () {
    const first = compose(WORKOUT_PREVIEW);
    resolveCompose({ visibility: "followers", caption: "yo" }, false);
    await first;
    expect(getShareDefault("workout")).toBeNull();
  });

  it("clearShareDefault removes the saved 'always' preference", async function () {
    const first = compose(WORKOUT_PREVIEW);
    resolveCompose({ visibility: "public", caption: "" }, true);
    await first;
    clearShareDefault("workout");
    expect(getShareDefault("workout")).toBeNull();
  });

  it("supports the 'crews' visibility added in PR 3.5 — short-circuits when stored as the always-pref", async function () {
    // Composer-side 'crews' is a real persisted preference. Callers
    // (useProgram + RunSummary) map it to a followers-visibility post
    // tagged with crewId; the composer just records the user's intent.
    const first = compose(RUN_PREVIEW);
    resolveCompose({ visibility: "crews", caption: "" }, true);
    await first;
    expect(getShareDefault("run")).toBe("crews");
    await expect(compose(RUN_PREVIEW)).resolves.toEqual({
      visibility: "crews",
      caption: "",
    });
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
    const p = compose(WORKOUT_PREVIEW);
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
    const p = compose(WORKOUT_PREVIEW); // would emit if still subscribed
    expect(count).toBe(1); // no further calls
    resolveCompose(null, false);
    await p;
  });
});
