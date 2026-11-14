/**
 * Finishing a lift and saving it, as one state (App1 Q20, 13 November
 * 2026).
 *
 * The workout screen held this as six pieces: `sessionComplete`,
 * `completing`, `saved`, a `saveStatus` of three values or none, a
 * `completionPending` kept twice (a ref for the handlers, state for the
 * screen) and the saved workout's id. Nothing stopped a combination that
 * should not exist, and one was reachable: a session reopened with its save
 * pending reads the server while the person taps Retry sync, the read
 * finds the workout and marks it saved, the retry then fails and marks it
 * "needs attention", and the saved screen says Done above "Needs
 * attention" with no way to retry (`docs/state-machines.md`).
 *
 * Here the flow is one value, moved only by `liftFinishTransition`, and
 * the screen reads what it draws from `liftFinishView`. A save that the
 * server has acknowledged stays saved whatever arrives after it.
 *
 * The finish screen renders before the save, under `review`, and the save
 * starts from that screen's Save workout (`useWeekPulse`'s header tells
 * what assuming otherwise once cost). What the saved screen shows waits
 * for `queued` or `synced`.
 */

/** Where finishing a lift has got to. */
export type LiftFinish =
  /** Sets are being logged. */
  | { kind: "logging" }
  /** Finished and on the review: nothing saved, and it can still be
   *  edited, renamed or given an earlier start. */
  | { kind: "review" }
  /** The save is under way. `retry` when an earlier attempt needs
   *  attention, so the screen keeps offering Retry sync while it runs. */
  | { kind: "saving"; retry: boolean }
  /** Saved on this phone, waiting for the server. */
  | { kind: "queued"; workoutId: string }
  /** Saved, and the server has it. */
  | { kind: "synced"; workoutId: string }
  /** A save was begun and has not landed: the session and its recovery
   *  copy wait here for a retry. A session reopened with its save pending
   *  opens here. */
  | { kind: "needsAttention" };

export type LiftFinishEvent =
  /** The last set is done, or Finish was tapped. */
  | { type: "finish" }
  /** Back from the review to the sets. */
  | { type: "edit" }
  /** Save workout, or Retry sync. */
  | { type: "save" }
  /** The save is on this phone and queued for the server. */
  | { type: "savedLocally"; workoutId: string }
  /** The server has the workout: the save's own answer, the queue's, or a
   *  read on reopening. */
  | { type: "acknowledged"; workoutId: string }
  /** The save did not land: it threw, went unanswered, or the queue gave
   *  up on it. */
  | { type: "failed" };

/** Where a session opens: on its sets, or on Retry sync when it was
 *  closed with its save pending. */
export function liftFinishAtOpen(completionPending: boolean): LiftFinish {
  return completionPending ? { kind: "needsAttention" } : { kind: "logging" };
}

/**
 * The one way the flow moves. An event that does not apply to the state
 * returns the same object, so a caller can tell it was ignored: a second
 * Save while one runs, an Edit once a save has begun, and a failure after
 * the server has the workout.
 */
export function liftFinishTransition(
  state: LiftFinish,
  event: LiftFinishEvent
): LiftFinish {
  switch (event.type) {
    case "finish":
      return state.kind === "logging" ? { kind: "review" } : state;
    case "edit":
      return state.kind === "review" ? { kind: "logging" } : state;
    case "save":
      if (state.kind === "review") return { kind: "saving", retry: false };
      if (state.kind === "needsAttention")
        return { kind: "saving", retry: true };
      return state;
    case "savedLocally":
      return state.kind === "saving"
        ? { kind: "queued", workoutId: event.workoutId }
        : state;
    case "acknowledged":
      return state.kind === "saving" ||
        state.kind === "queued" ||
        state.kind === "needsAttention"
        ? { kind: "synced", workoutId: event.workoutId }
        : state;
    case "failed":
      return state.kind === "saving" || state.kind === "queued"
        ? { kind: "needsAttention" }
        : state;
  }
}

/** What the workout screen and its finish screen draw from the state. */
export interface LiftFinishView {
  /** The finish screen is up: the review, or the saved screen. */
  finishScreen: boolean;
  /** A save is in flight. */
  completing: boolean;
  /** The saved screen, with Done. */
  saved: boolean;
  /** The line under the save, as `SessionCompleteScreen` takes it. */
  saveStatus: "queued" | "synced" | "needs-attention" | undefined;
  /** A save has begun: the sets, the start and the name are fixed, and no
   *  draft is written over the recovery copy. */
  locked: boolean;
  /** Edit workout, the start and the name can be changed. */
  canEdit: boolean;
  /** Save workout or Retry sync would start a save. */
  canSave: boolean;
  /** The saved workout, while it is saved. */
  workoutId: string | null;
}

export function liftFinishView(state: LiftFinish): LiftFinishView {
  switch (state.kind) {
    case "logging":
      return view({});
    case "review":
      return view({ finishScreen: true, canEdit: true, canSave: true });
    case "saving":
      return view({
        finishScreen: true,
        completing: true,
        locked: true,
        saveStatus: state.retry ? "needs-attention" : undefined,
      });
    case "queued":
      return view({
        finishScreen: true,
        saved: true,
        locked: true,
        saveStatus: "queued",
        workoutId: state.workoutId,
      });
    case "synced":
      return view({
        finishScreen: true,
        saved: true,
        locked: true,
        saveStatus: "synced",
        workoutId: state.workoutId,
      });
    case "needsAttention":
      return view({
        finishScreen: true,
        locked: true,
        canSave: true,
        saveStatus: "needs-attention",
      });
  }
}

function view(parts: Partial<LiftFinishView>): LiftFinishView {
  return {
    finishScreen: false,
    completing: false,
    saved: false,
    saveStatus: undefined,
    locked: false,
    canEdit: false,
    canSave: false,
    workoutId: null,
    ...parts,
  };
}
