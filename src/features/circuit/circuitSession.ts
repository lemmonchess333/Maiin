/**
 * The circuit page's states (Circ1 (10), (11), (A)), written down so the
 * page cannot hold a combination that should not exist: a clock running
 * under the finish, a save while the end is being asked, a second save.
 *
 *   picking ─choose→ running ⇄ paused
 *   running, paused ─askEnd→ ending ─keepGoing→ running
 *                                   ─end→ finish (7 minutes or more)
 *                                   ─discard→ discarded (under 7: not saved)
 *   running, paused, ending ─complete→ finish
 *   finish ─save→ saving ─saved→ saved
 *                        ─failed→ finish (with the error)
 *   finish ─discard→ discarded (a finish under 7 minutes: skipped through)
 *
 * The 7-minute rule (`circuitCounts`) is the page's to apply when it asks
 * to end: this graph only refuses an end that skips the question.
 */
import type { Circuit, CircuitEffort } from "./circuitTypes";

export type CircuitPhase =
  | "picking"
  | "running"
  | "paused"
  | "ending"
  | "finish"
  | "saving"
  | "saved"
  | "discarded";

export interface CircuitSessionState {
  phase: CircuitPhase;
  circuit: Circuit | null;
  /** The finish's one tap (Circ1 (2)). */
  effort?: CircuitEffort;
  /** Every interval done: the circuit ran to its end. */
  finished: boolean;
  /** Why the last save failed, shown on the finish. */
  error?: string;
  /** The saved workout's id. */
  workoutId?: string;
}

export type CircuitSessionEvent =
  | { type: "choose"; circuit: Circuit }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "askEnd" }
  | { type: "keepGoing" }
  | { type: "end" }
  | { type: "discard" }
  | { type: "complete" }
  | { type: "rate"; effort: CircuitEffort | undefined }
  | { type: "save" }
  | { type: "saved"; workoutId: string }
  | { type: "failed"; error: string };

export const CIRCUIT_SESSION_START: CircuitSessionState = {
  phase: "picking",
  circuit: null,
  finished: false,
};

/** The next state, or the same state when the event does not apply. */
export function stepCircuitSession(
  state: CircuitSessionState,
  event: CircuitSessionEvent
): CircuitSessionState {
  switch (event.type) {
    case "choose":
      return state.phase === "picking"
        ? {
            phase: "running",
            circuit: event.circuit,
            finished: false,
          }
        : state;
    case "pause":
      return state.phase === "running" ? { ...state, phase: "paused" } : state;
    case "resume":
      return state.phase === "paused" ? { ...state, phase: "running" } : state;
    case "askEnd":
      return state.phase === "running" || state.phase === "paused"
        ? { ...state, phase: "ending" }
        : state;
    case "keepGoing":
      return state.phase === "ending" ? { ...state, phase: "running" } : state;
    case "end":
      return state.phase === "ending"
        ? { ...state, phase: "finish", finished: false }
        : state;
    case "discard":
      return state.phase === "ending" || state.phase === "finish"
        ? { ...state, phase: "discarded" }
        : state;
    case "complete":
      return state.phase === "running" ||
        state.phase === "paused" ||
        state.phase === "ending"
        ? { ...state, phase: "finish", finished: true }
        : state;
    case "rate":
      return state.phase === "finish"
        ? { ...state, effort: event.effort }
        : state;
    case "save":
      return state.phase === "finish"
        ? { ...state, phase: "saving", error: undefined }
        : state;
    case "saved":
      return state.phase === "saving"
        ? { ...state, phase: "saved", workoutId: event.workoutId }
        : state;
    case "failed":
      return state.phase === "saving"
        ? { ...state, phase: "finish", error: event.error }
        : state;
  }
}

/** Whether the session clock runs in this phase. */
export function circuitClockRuns(phase: CircuitPhase): boolean {
  return phase === "running";
}
