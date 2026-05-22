/**
 * Reauth helpers used by AccountSection's inline reauth flow.
 *
 * Background: the server-side recent-auth gate (R1A Chunk 2) rejects
 * `deleteMyAccount` calls if the user's `auth_time` JWT claim is too
 * old. Pre-Chunk 4, the client surfaced this as a toast telling the
 * user to manually sign out and back in. Chunk 4 instead reauthenticates
 * inline against the user's existing provider, force-refreshes the
 * JWT so the server sees the new `auth_time`, and auto-retries the
 * deletion call.
 *
 * Three flows mirror the three sign-in surfaces in auth.tsx:
 *   - Email/Password: reauthenticateWithCredential
 *   - Google:         reauthenticateWithPopup (with redirect fallback)
 *   - Apple:          reauthenticateWithPopup (with redirect fallback)
 *
 * CRITICAL: every helper calls `user.getIdToken(true)` after the
 * reauth succeeds. Without this, the JWT in-flight still carries the
 * old `auth_time`, so the auto-retry deletion hits the recent-auth
 * gate AGAIN — silent failure. The force-refresh ensures the next
 * callable reads the fresh token with the new auth_time.
 *
 * Errors:
 *   - Wrong password / cancelled popup / network drop → throw with
 *     Firebase Auth's standard code so the caller can map via
 *     friendlyAuthError.
 *   - Popup blocked by browser / in-app browser → catch the specific
 *     code and retry with reauthenticateWithRedirect. The redirect
 *     navigates away from the page entirely; the caller should treat
 *     this as a one-way operation (caller will lose modal state).
 *   - user-token-expired → not recoverable inline; rethrow so the
 *     caller can fall back to the manual sign-out flow.
 */

import {
  EmailAuthProvider,
  GoogleAuthProvider,
  OAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  reauthenticateWithRedirect,
  type User,
} from "firebase/auth";

/**
 * Email/Password reauth. No popup; runs against the current user's
 * email and the password the user just typed into the reauth view.
 */
export async function reauthWithPassword(
  user: User,
  password: string,
): Promise<void> {
  if (!user.email) {
    throw new Error("auth/missing-email");
  }
  const credential = EmailAuthProvider.credential(user.email, password);
  await reauthenticateWithCredential(user, credential);
  /* Force JWT refresh so the next callable's recent-auth gate
     sees the new auth_time claim. See module docstring. */
  await user.getIdToken(true);
}

/**
 * Google reauth via OAuth popup; falls back to redirect if the
 * environment doesn't support popups (in-app browsers, some
 * Lockdown Mode configs).
 */
export async function reauthWithGoogle(user: User): Promise<void> {
  const provider = new GoogleAuthProvider();
  try {
    await reauthenticateWithPopup(user, provider);
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "auth/operation-not-supported-in-this-environment") {
      /* Popup unavailable — navigate to OAuth provider and back.
         User loses modal state; on return the page reloads and
         the deletion flow has to be restarted manually. */
      await reauthenticateWithRedirect(user, provider);
      return;
    }
    throw err;
  }
  await user.getIdToken(true);
}

/**
 * Apple reauth via OAuth popup. Same shape as Google but with
 * the `email` + `name` scopes that the original signInWithApple
 * declared (matches auth.tsx:519-520).
 */
export async function reauthWithApple(user: User): Promise<void> {
  const provider = new OAuthProvider("apple.com");
  provider.addScope("email");
  provider.addScope("name");
  try {
    await reauthenticateWithPopup(user, provider);
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "auth/operation-not-supported-in-this-environment") {
      await reauthenticateWithRedirect(user, provider);
      return;
    }
    throw err;
  }
  await user.getIdToken(true);
}

/**
 * Provider IDs we know how to reauth inline. Used by AccountSection
 * to dedupe `user.providerData` entries down to the providers we
 * actually support. Unknown providers (Phone, Twitter, GitHub) fall
 * through to the manual sign-out fallback.
 */
export const SUPPORTED_REAUTH_PROVIDERS = Object.freeze([
  "password",
  "google.com",
  "apple.com",
] as const);

export type SupportedReauthProviderId =
  (typeof SUPPORTED_REAUTH_PROVIDERS)[number];

export function isSupportedReauthProvider(
  providerId: string,
): providerId is SupportedReauthProviderId {
  return (SUPPORTED_REAUTH_PROVIDERS as readonly string[]).includes(providerId);
}
