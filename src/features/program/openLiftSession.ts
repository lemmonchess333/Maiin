/**
 * Programme sessions open on this device. The automatic week rollover waits
 * while one is (`useProgram`).
 *
 * A session records the week it was started in, and its finish lands only
 * on that week (`commitWorkoutCompletion` checks the week number and the
 * day). Rolled over in between, the finish found a different week: the
 * workout saved, but the day stayed undone and its progression was dropped.
 * That happens to a session that runs past Sunday midnight, and to one
 * started in an app left open since the week before.
 *
 * Module state rather than React state: the rollover lives in `useProgram`,
 * which every programme surface mounts, while Train opens the session.
 */
const open = new Set<symbol>();
const listeners = new Set<() => void>();
let version = 0;

function notify() {
  version++;
  listeners.forEach((listener) => listener());
}

/** Marks a programme session open. Call the returned function to close it;
 *  a second call does nothing. */
export function openLiftSession(): () => void {
  const token = Symbol("lift-session");
  open.add(token);
  notify();
  return () => {
    if (open.delete(token)) notify();
  };
}

export function isLiftSessionOpen(): boolean {
  return open.size > 0;
}

/** For `useSyncExternalStore`, with `liftSessionVersion`. */
export function subscribeLiftSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const liftSessionVersion = () => version;
