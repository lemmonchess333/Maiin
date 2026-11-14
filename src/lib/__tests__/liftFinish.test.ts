/**
 * Finishing a lift and saving it (App1 Q20): every event in every state,
 * and the combination `docs/state-machines.md` named, a saved workout that
 * also "needs attention", shown unreachable from either way a session
 * opens.
 */
import { describe, expect, it } from "vitest";
import {
  liftFinishAtOpen,
  liftFinishTransition,
  liftFinishView,
  type LiftFinish,
  type LiftFinishEvent,
} from "../liftFinish";

const W = "programme-w1";
const W2 = "programme-w2";

const STATES: Record<string, LiftFinish> = {
  logging: { kind: "logging" },
  review: { kind: "review" },
  saving: { kind: "saving", retry: false },
  savingRetry: { kind: "saving", retry: true },
  queued: { kind: "queued", workoutId: W },
  synced: { kind: "synced", workoutId: W },
  needsAttention: { kind: "needsAttention" },
};

const EVENTS: Record<string, LiftFinishEvent> = {
  finish: { type: "finish" },
  edit: { type: "edit" },
  save: { type: "save" },
  savedLocally: { type: "savedLocally", workoutId: W2 },
  acknowledged: { type: "acknowledged", workoutId: W2 },
  failed: { type: "failed" },
};

/** Where each event takes each state; "same" is the event ignored. */
const TABLE: Record<
  keyof typeof STATES,
  Record<keyof typeof EVENTS, LiftFinish | "same">
> = {
  logging: {
    finish: { kind: "review" },
    edit: "same",
    save: "same",
    savedLocally: "same",
    acknowledged: "same",
    failed: "same",
  },
  review: {
    finish: "same",
    edit: { kind: "logging" },
    save: { kind: "saving", retry: false },
    savedLocally: "same",
    acknowledged: "same",
    failed: "same",
  },
  saving: {
    finish: "same",
    edit: "same",
    save: "same",
    savedLocally: { kind: "queued", workoutId: W2 },
    acknowledged: { kind: "synced", workoutId: W2 },
    failed: { kind: "needsAttention" },
  },
  savingRetry: {
    finish: "same",
    edit: "same",
    save: "same",
    savedLocally: { kind: "queued", workoutId: W2 },
    acknowledged: { kind: "synced", workoutId: W2 },
    failed: { kind: "needsAttention" },
  },
  queued: {
    finish: "same",
    edit: "same",
    save: "same",
    savedLocally: "same",
    acknowledged: { kind: "synced", workoutId: W2 },
    failed: { kind: "needsAttention" },
  },
  synced: {
    finish: "same",
    edit: "same",
    save: "same",
    savedLocally: "same",
    acknowledged: "same",
    failed: "same",
  },
  needsAttention: {
    finish: "same",
    edit: "same",
    save: { kind: "saving", retry: true },
    savedLocally: "same",
    acknowledged: { kind: "synced", workoutId: W2 },
    failed: "same",
  },
};

const cases = Object.keys(STATES).flatMap((state) =>
  Object.keys(EVENTS).map((event) => ({ state, event }))
);

describe("liftFinishTransition", () => {
  it.each(cases)("$event in $state", ({ state, event }) => {
    const from = STATES[state];
    const expected = TABLE[state][event];
    const next = liftFinishTransition(from, EVENTS[event]);
    if (expected === "same") expect(next).toBe(from);
    else {
      expect(next).toEqual(expected);
      expect(next).not.toBe(from);
    }
  });

  it("covers every state kind and every event type", () => {
    const kinds = new Set(Object.values(STATES).map((s) => s.kind));
    expect([...kinds].sort()).toEqual(
      [
        "logging",
        "needsAttention",
        "queued",
        "review",
        "saving",
        "synced",
      ].sort()
    );
    expect(Object.values(EVENTS).map((e) => e.type)).toEqual([
      "finish",
      "edit",
      "save",
      "savedLocally",
      "acknowledged",
      "failed",
    ]);
  });
});

describe("liftFinishAtOpen", () => {
  it("opens on the sets, or on Retry sync for a save left pending", () => {
    expect(liftFinishAtOpen(false)).toEqual({ kind: "logging" });
    expect(liftFinishAtOpen(true)).toEqual({ kind: "needsAttention" });
  });
});

describe("liftFinishView", () => {
  const blank = {
    finishScreen: false,
    completing: false,
    saved: false,
    saveStatus: undefined,
    locked: false,
    canEdit: false,
    canSave: false,
    workoutId: null,
  };

  it.each([
    ["logging", blank],
    ["review", { ...blank, finishScreen: true, canEdit: true, canSave: true }],
    [
      "saving",
      { ...blank, finishScreen: true, completing: true, locked: true },
    ],
    [
      "savingRetry",
      {
        ...blank,
        finishScreen: true,
        completing: true,
        locked: true,
        saveStatus: "needs-attention",
      },
    ],
    [
      "queued",
      {
        ...blank,
        finishScreen: true,
        saved: true,
        locked: true,
        saveStatus: "queued",
        workoutId: W,
      },
    ],
    [
      "synced",
      {
        ...blank,
        finishScreen: true,
        saved: true,
        locked: true,
        saveStatus: "synced",
        workoutId: W,
      },
    ],
    [
      "needsAttention",
      {
        ...blank,
        finishScreen: true,
        locked: true,
        canSave: true,
        saveStatus: "needs-attention",
      },
    ],
  ] as const)("draws %s", (state, expected) => {
    expect(liftFinishView(STATES[state])).toEqual(expected);
  });
});

/** Every state reachable from either way a session opens. */
function reachable(): LiftFinish[] {
  const seen = new Map<string, LiftFinish>();
  const queue = [liftFinishAtOpen(false), liftFinishAtOpen(true)];
  while (queue.length > 0) {
    const state = queue.shift()!;
    const key = JSON.stringify(state);
    if (seen.has(key)) continue;
    seen.set(key, state);
    for (const event of Object.values(EVENTS))
      queue.push(liftFinishTransition(state, event));
  }
  return [...seen.values()];
}

describe("the combinations that should not exist", () => {
  const all = reachable();

  it("reaches every state from the two openings", () => {
    expect(all.map((s) => s.kind).sort()).toEqual(
      [
        "logging",
        "needsAttention",
        "queued",
        "review",
        "saving",
        "saving",
        "synced",
      ].sort()
    );
  });

  it.each(all.map((state) => [JSON.stringify(state), state] as const))(
    "%s is never saved and needing attention, nor saved while saving",
    (_, state) => {
      const view = liftFinishView(state);
      expect(view.saved && view.saveStatus === "needs-attention").toBe(false);
      expect(view.saved && view.completing).toBe(false);
      expect(view.workoutId !== null).toBe(view.saved);
      expect(view.finishScreen).toBe(state.kind !== "logging");
      // The lock is the state, not a copy beside it.
      expect(view.locked).toBe(
        state.kind !== "logging" && state.kind !== "review"
      );
      expect(view.canEdit && view.locked).toBe(false);
      // What the screen offers is what the state accepts.
      expect(view.canSave).toBe(
        liftFinishTransition(state, { type: "save" }) !== state
      );
      expect(view.canEdit).toBe(
        liftFinishTransition(state, { type: "edit" }) !== state
      );
    }
  );

  it("a retry that fails after the server has the workout leaves it saved", () => {
    // Reopened with its save pending; Retry sync; the read on reopening
    // finds the workout; then the retry fails. This was Done above
    // "Needs attention", with no retry offered.
    let state = liftFinishAtOpen(true);
    state = liftFinishTransition(state, { type: "save" });
    state = liftFinishTransition(state, {
      type: "acknowledged",
      workoutId: W,
    });
    state = liftFinishTransition(state, { type: "failed" });
    expect(state).toEqual({ kind: "synced", workoutId: W });
    expect(liftFinishView(state)).toMatchObject({
      saved: true,
      saveStatus: "synced",
    });
  });

  it("an edit once a save has begun is refused, so the sets cannot change under it", () => {
    for (const state of all)
      if (state.kind !== "logging" && state.kind !== "review")
        expect(liftFinishTransition(state, { type: "edit" })).toBe(state);
  });
});
