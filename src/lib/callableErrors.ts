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
  if (
    code.endsWith("failed-precondition") ||
    /failed-precondition:/.test(message)
  ) {
    const why = stripCallablePrefix(message);
    return why || null;
  }
  return null;
}
