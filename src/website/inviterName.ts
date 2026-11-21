/**
 * Who sent an invite, for the website's invite line: the first word of
 * the inviter's public name, as the server gives it to the signed-out
 * welcome (`lookupInvite`, functions/lib/inviteCodes.js), or null.
 *
 * The website carries no Firebase SDK, so it asks the callable over its
 * plain HTTPS protocol: a POST of `{ data }`, answered with `{ result }`.
 * The callable needs no sign-in and limits each address to a few lookups
 * an hour. Any failure, a project the build was not given, or a slow
 * answer is null, and the line says "A friend" as it does until then.
 */

/** How long the line waits on the name before it keeps "A friend". */
const LOOKUP_TIMEOUT_MS = 4000;

/** Where the callable answers: Cloud Functions' default region, as
 *  firebase.json's `publicPostPage` rewrite names it. */
export function lookupInviteUrl(projectId: string): string {
  return `https://us-central1-${projectId}.cloudfunctions.net/lookupInvite`;
}

export async function lookupInviterName(
  code: string,
  projectId: string = import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "",
  fetchImpl: typeof fetch = (...args) => fetch(...args)
): Promise<string | null> {
  if (!projectId) return null;
  try {
    const response = await fetchImpl(lookupInviteUrl(projectId), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: { code } }),
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as {
      result?: { inviter?: { firstName?: unknown } | null };
    };
    const name = body?.result?.inviter?.firstName;
    return typeof name === "string" && name.trim() ? name.trim() : null;
  } catch {
    return null;
  }
}
