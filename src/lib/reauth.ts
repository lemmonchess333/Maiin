/** Reauthenticate the existing JS Firebase user, then refresh auth_time.
 * Native OAuth uses the same credential seam as sign-in; it never replaces
 * the current user. Popup failures remain retryable in the open dialog:
 * redirecting away must not be mistaken for completed reauthentication.
 */
import { Capacitor } from "@capacitor/core";
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  OAuthProvider,
  getAuth,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  revokeAccessToken,
  type User,
} from "firebase/auth";

export async function reauthWithPassword(
  user: User,
  password: string
): Promise<void> {
  if (!user.email) throw new Error("auth/missing-email");
  await reauthenticateWithCredential(
    user,
    EmailAuthProvider.credential(user.email, password)
  );
  await user.getIdToken(true);
}

export async function reauthWithGoogle(user: User): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const { getGoogleCredentialNative } = await import("./nativeAuth");
    await reauthenticateWithCredential(user, await getGoogleCredentialNative());
  } else {
    await reauthenticateWithPopup(user, new GoogleAuthProvider());
  }
  await user.getIdToken(true);
}

export async function reauthWithApple(
  user: User,
  options: { forDeletion?: boolean } = {}
): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const native = await import("./nativeAuth");
    if (options.forDeletion) {
      await native.reauthAndRevokeAppleNative(user);
      return;
    }
    await reauthenticateWithCredential(
      user,
      await native.getAppleCredentialNative()
    );
  } else {
    const provider = new OAuthProvider("apple.com");
    provider.addScope("email");
    provider.addScope("name");
    const result = await reauthenticateWithPopup(user, provider);
    await user.getIdToken(true);
    if (options.forDeletion) {
      const token = OAuthProvider.credentialFromResult(result)?.accessToken;
      if (!token)
        throw new Error("Apple confirmation was incomplete. Please try again.");
      await revokeAccessToken(getAuth(), token);
    }
    return;
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
  providerId: string
): providerId is SupportedReauthProviderId {
  return (SUPPORTED_REAUTH_PROVIDERS as readonly string[]).includes(providerId);
}
