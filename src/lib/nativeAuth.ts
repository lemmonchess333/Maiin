/**
 * Native OAuth sign-in seam (Google + Apple).
 *
 * Web is NEVER routed here — `auth.tsx` keeps using `signInWithPopup` on the
 * web. These run only on the Capacitor native shell, where `signInWithPopup`
 * can't work: the OAuth popup/redirect returns to `capacitor://localhost`,
 * which isn't a Firebase authorized domain, so popup sign-in fails on device.
 *
 * Flow: drive the native Google/Apple sheet via
 * `@capacitor-firebase/authentication`, then hand a Firebase `AuthCredential`
 * back to `auth.tsx`, which completes sign-in via `signInWithCredential` on
 * the **JS SDK**. The JS SDK stays the single source of auth state the rest
 * of the app reads (`onAuthStateChanged`, `auth.currentUser`). For that to be
 * clean the plugin must run with `skipNativeAuth: true` (set in
 * `capacitor.config.ts`) so it only returns the credential rather than also
 * signing into the native SDK.
 *
 * The plugin is loaded via dynamic `import()` so its chunk never ships in the
 * web bundle (mirrors `analyticsProvider.ts` / `appCheck.ts`).
 *
 * ⚠️ UNVERIFIED ON DEVICE. Written against the plugin's documented credential
 * shape; the token/nonce wiring and the Xcode-side config (reversed-client-id
 * URL scheme, GoogleService-Info.plist, "Sign in with Apple" capability) can
 * only be confirmed on a real build (docs/qa/testflight-script.md, step 9).
 * The web path is unaffected either way.
 */
import {
  GoogleAuthProvider,
  OAuthProvider,
  getAuth,
  reauthenticateWithCredential,
  type AuthCredential,
  type User,
} from "firebase/auth";

/** Native Google sign-in → Firebase credential for `signInWithCredential`. */
export async function getGoogleCredentialNative(): Promise<AuthCredential> {
  const { FirebaseAuthentication } =
    await import("@capacitor-firebase/authentication");
  const result = await FirebaseAuthentication.signInWithGoogle();
  return GoogleAuthProvider.credential(
    result.credential?.idToken ?? null,
    result.credential?.accessToken ?? null
  );
}

/**
 * Native Apple sign-in → Firebase credential, and the name Apple shared.
 *
 * Apple gives the person's name only on the first sign-in, and only to the
 * app: the identity token carries none, so a credential alone leaves the
 * account nameless (with Hide My Email, the address is no help either).
 * The plugin passes it as `user.displayName` with native auth skipped.
 */
export async function getAppleSignInNative(): Promise<{
  credential: AuthCredential;
  displayName: string | null;
}> {
  const { FirebaseAuthentication } =
    await import("@capacitor-firebase/authentication");
  const result = await FirebaseAuthentication.signInWithApple();
  // Apple needs the raw nonce that was hashed into the idToken request so
  // Firebase can verify the token wasn't replayed.
  const credential = new OAuthProvider("apple.com").credential({
    idToken: result.credential?.idToken ?? undefined,
    rawNonce: result.credential?.nonce ?? undefined,
  });
  const name = result.user?.displayName?.trim();
  return { credential, displayName: name ? name : null };
}

/** Native Apple sign-in → Firebase credential for `signInWithCredential`. */
export async function getAppleCredentialNative(): Promise<AuthCredential> {
  return (await getAppleSignInNative()).credential;
}

/** Apple requires token revocation when deleting an account. Keep the native
 * SDK signed out (skipNativeAuth), reauthenticate the EXISTING JS user first,
 * then use Firebase's documented revocation endpoint with the native code.
 * The plugin's revokeAccessToken uses Auth.auth().currentUser internally and
 * never completes when skipNativeAuth leaves that native user unset.
 * Request shape matches Firebase iOS RevokeTokenRequest (CODE, no redirect
 * URI for native Apple authorization). Never log or persist either token.
 * https://docs.cloud.google.com/identity-platform/docs/reference/rest/v2/accounts/revokeToken
 */
export async function reauthAndRevokeAppleNative(user: User): Promise<void> {
  const { FirebaseAuthentication } =
    await import("@capacitor-firebase/authentication");
  const result = await FirebaseAuthentication.signInWithApple();
  const code = result.credential?.authorizationCode;
  const idToken = result.credential?.idToken;
  const rawNonce = result.credential?.nonce;
  if (!code || !idToken || !rawNonce) {
    throw new Error("Apple confirmation was incomplete. Try again.");
  }
  await reauthenticateWithCredential(
    user,
    new OAuthProvider("apple.com").credential({ idToken, rawNonce })
  );
  const firebaseToken = await user.getIdToken(true);
  const auth = getAuth();
  if (auth.currentUser?.uid !== user.uid) throw new Error("auth/user-mismatch");
  const { App } = await import("@capacitor/app");
  const { id: bundleId } = await App.getInfo();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v2/accounts:revokeToken?key=${encodeURIComponent(auth.app.options.apiKey ?? "")}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Ios-Bundle-Identifier": bundleId,
        },
        body: JSON.stringify({
          providerId: "apple.com",
          tokenType: "CODE",
          token: code,
          idToken: firebaseToken,
          ...(auth.tenantId ? { tenantId: auth.tenantId } : {}),
        }),
        signal: controller.signal,
      }
    );
    if (!response.ok)
      throw new Error("Couldn't disconnect Sign in with Apple. Try again.");
  } finally {
    clearTimeout(timeout);
  }
}
