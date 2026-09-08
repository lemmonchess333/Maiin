/**
 * Counts the surfaces a finished session puts between the user and the
 * page they came from.
 *
 * The batch that collapsed the lift finish to one screen removed a PR
 * toast, a volume-PR toast, a plateau modal over the completion screen, an
 * auto-opening share sheet and a streak-reminder modal. Nothing stops them
 * accruing again one well-meant addition at a time, and the pile-up is
 * invisible to whoever adds the next one — each is reasonable alone.
 *
 * So this is a REGRESSION SIGNAL, not a metric. With one user the number
 * it emits is not a cohort reading; its job is to be 1, and to stop being
 * 1 loudly. Read `completion_surfaces` that way.
 *
 * Module-level state rather than context: the counters are toasts and the
 * surface coordinator, neither of which sits under the session's tree, and
 * a session is singular anyway — there is no second finish running
 * concurrently for the state to collide with.
 */

let windowOpen = false;
let count = 0;

/** Open the window. Called when a session ends, before anything renders. */
export function beginCompletionWindow(): void {
  windowOpen = true;
  count = 0;
}

/**
 * Record one surface. A no-op outside a completion window, which is what
 * lets the global toast wrapper call it unconditionally — the overwhelming
 * majority of toasts in the app have nothing to do with a finish.
 */
export function noteCompletionSurface(): void {
  if (windowOpen) count += 1;
}

/**
 * Close the window and return what it counted, or null if no window was
 * open (an unmount that never followed a finish). Callers emit; keeping
 * the analytics call out of here leaves the counting testable on its own.
 */
export function flushCompletionSurfaces(): number | null {
  if (!windowOpen) return null;
  windowOpen = false;
  const total = count;
  count = 0;
  return total;
}
