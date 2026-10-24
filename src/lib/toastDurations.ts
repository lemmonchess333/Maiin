/**
 * How long a toast stays, by what it carries (Polish3 (7)): long enough to
 * read a sentence, longer for an error, and longer again for a toast with
 * a button in it, since reaching the button takes a reader longer than
 * reading the words. Sonner pauses the clock while a finger or the pointer
 * is on a toast, and every toast closes from its × or a swipe.
 *
 * Its own module, importing nothing, so code that only needs a number (a
 * deleted meal's Undo window) does not load sonner, and a suite that mocks
 * `@/lib/toast` wholesale still reads the real numbers.
 */
export const TOAST_DURATION_MS = {
  /** Success, info and plain toasts. */
  default: 3000,
  /** Errors and warnings: what went wrong, and what to do about it. */
  error: 6000,
  /** A toast with an action or a cancel (Undo, Retry): time to reach it. */
  action: 8000,
} as const;

/** The toast kinds `@/lib/toast` shows. */
export type ToastKind =
  | "default"
  | "success"
  | "info"
  | "message"
  | "warning"
  | "error"
  | "loading";

/**
 * The life of one toast. The kind's duration is a floor, not a default a
 * call site can lower: a shorter `duration` passed at a call site is raised
 * to it, and a longer one stands. A loading toast keeps whatever it was
 * given (sonner never closes one by itself; it closes when its id is shown
 * again as a success or an error, which come through here).
 */
export function toastDuration(
  kind: ToastKind,
  options?: { duration?: number; action?: unknown; cancel?: unknown }
): number | undefined {
  if (kind === "loading") return options?.duration;
  const floor =
    options?.action != null || options?.cancel != null
      ? TOAST_DURATION_MS.action
      : kind === "error" || kind === "warning"
        ? TOAST_DURATION_MS.error
        : TOAST_DURATION_MS.default;
  return Math.max(options?.duration ?? 0, floor);
}
