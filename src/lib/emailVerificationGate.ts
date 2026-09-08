/**
 * Client half of the verified-email gate on public writes.
 *
 * The server side is authoritative and reads only the `email_verified`
 * token claim: `firestore.rules` (`isEmailVerified()`) on activity and
 * space-post creates, and the two comment callables. This predicate decides
 * when the client should SAY so up front — show the notice and hold the
 * primary post/comment action — instead of letting the write fail behind a
 * generic toast.
 *
 * It is narrower than the server check on purpose. Only an email/password
 * account can act on "verify your email": it has an address the resend
 * callable can mail. OAuth accounts (Google, Apple) arrive with the claim
 * already true, and were one ever to carry it false there is nothing the
 * notice could offer them, so they are left to the server's answer. A
 * missing user, or a user object without `providerData` (test doubles,
 * partially hydrated sessions), is treated as not gated — the server still
 * refuses if it must; this only decides whether to warn.
 */
import type { User } from "firebase/auth";

export type VerifiableUser = Pick<User, "emailVerified" | "providerData">;

export function needsEmailVerification(
  user: Partial<VerifiableUser> | null | undefined
): boolean {
  if (!user || !Array.isArray(user.providerData)) return false;
  const hasPassword = user.providerData.some(
    (p) => p?.providerId === "password"
  );
  return hasPassword && user.emailVerified === false;
}
