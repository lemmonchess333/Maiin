/**
 * Reading a Cloud Function rejection for the user.
 *
 * Firebase prefixes a callable's message with its code, e.g.
 * "FirebaseError: failed-precondition: Undo the deload week first." Only
 * the sentence is fit to show a user.
 */
export function stripCallablePrefix(message: string): string {
  const cleaned = message.replace(/^FirebaseError:\s*/i, "");
  const marker = cleaned.indexOf("failed-precondition:");
  return (
    marker >= 0
      ? cleaned.slice(marker + "failed-precondition:".length)
      : cleaned
  ).trim();
}

/**
 * The user-fit sentence behind a rejected callable, or null. Only a
 * `failed-precondition` carries prose written for the user ("This workout
 * changed since you started. Refresh and try again."); every other code
 * (invalid-argument, internal, unauthenticated) is a developer message and
 * belongs in error reporting, not in a toast. A rejection's server message
 * is diagnostic data: show the user-fit part, capture the rest, and never
 * flatten it to a generic line — that is what makes "some things don't
 * work" undiagnosable from a device.
 */
export function describeRejection(err: unknown): string | null {
  const code = String((err as { code?: unknown })?.code ?? "");
  const message = String((err as { message?: unknown })?.message ?? "");
  if (!message) return null;
  // The account-deletion locks are failed-precondition too, and their
  // message names the account ("Account <uid> has an in-progress
  // deletion…"); their details carry it as `uid` or `referencedUid`.
  const details = (err as { details?: Record<string, unknown> })?.details;
  if (details && (details.uid != null || details.referencedUid != null))
    return null;
  if (
    code.endsWith("failed-precondition") ||
    /failed-precondition:/.test(message)
  ) {
    const why = stripCallablePrefix(message);
    return why || null;
  }
  return null;
}

/** Whether a callable refused the call for coming too often
 *  (`resource-exhausted`): trying again at once is refused too. */
export function isRateLimitedRejection(err: unknown): boolean {
  return String((err as { code?: unknown })?.code ?? "").endsWith(
    "resource-exhausted"
  );
}

/** What a plan save refused for coming too often says, in place of
 *  "Try again", which would be refused as well. */
export const PLAN_SAVES_TOO_OFTEN =
  "You've changed your plan a lot in the last few minutes. Wait a few minutes, then save again.";

/**
 * The sentence the app threw for the person ("Sign in again to log
 * food."), or `fallback` for anything else. The app's own sentences are
 * plain `Error`s with no code. An SDK error carries a `code` and the SDK's
 * text ("Missing or insufficient permissions."), and a `TypeError` is a
 * browser's ("Failed to fetch"); neither is copy. For save paths whose
 * writes are queued, where the app's sentences are what reach the catch.
 */
export function appErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error &&
    err.name === "Error" &&
    err.message &&
    !("code" in err)
    ? err.message
    : fallback;
}
