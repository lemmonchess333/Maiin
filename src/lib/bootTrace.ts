/**
 * What the app has done since it started, for the moment it does not get
 * past its startup spinner.
 *
 * The first TestFlight builds (1.2.0 (7) and (8), 2026-11-08) held the
 * spinner on a phone, with no Mac to attach Safari's inspector and nothing
 * on screen to say why. Each step of starting up names itself here, and an
 * uncaught error or rejected promise is kept beside them; BootStallNotice
 * shows the list under the spinner once starting has taken too long, so a
 * screenshot says which step never finished.
 *
 * Pure and dependency-free: firebaseApp.ts and main.tsx write to it before
 * anything else loads, and it must never pull Firestore into the login
 * screen's import graph (eagerGraph.test.ts).
 */

export interface BootStep {
  /** Milliseconds since this module loaded. */
  at: number;
  step: string;
}

/** Enough to cover a full start-up and a few errors, small enough to read. */
const MAX_STEPS = 40;

const startedAt = Date.now();
let steps: BootStep[] = [];
const listeners = new Set<() => void>();

export function traceBoot(step: string): void {
  steps = [...steps, { at: Date.now() - startedAt, step }].slice(-MAX_STEPS);
  for (const listener of listeners) listener();
}

export function bootSteps(): readonly BootStep[] {
  return steps;
}

export function subscribeBootTrace(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** A thrown reason as a step reads it: an Error's name and words, a
 *  string as it is, anything else as JSON. */
export function describeReason(reason: unknown): string {
  if (reason instanceof Error) return `${reason.name}: ${reason.message}`;
  if (typeof reason === "string") return reason;
  try {
    return JSON.stringify(reason);
  } catch {
    return String(reason);
  }
}

let errorsWatched = false;

/** Keep uncaught errors and rejections in the list. Safe to call twice. */
export function watchBootErrors(): void {
  if (errorsWatched || typeof window === "undefined") return;
  errorsWatched = true;
  window.addEventListener("error", (event) => {
    traceBoot(`Error: ${describeReason(event.error ?? event.message)}`);
  });
  window.addEventListener("unhandledrejection", (event) => {
    traceBoot(`Unhandled: ${describeReason(event.reason)}`);
  });
}
