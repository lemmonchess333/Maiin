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
 * only be confirmed on a real build — see LAUNCH_TODO #15. The web path is
 * unaffected either way.
 */
import {
  GoogleAuthProvider,
  OAuthProvider,
  type AuthCredential,
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

/** Native Apple sign-in → Firebase credential for `signInWithCredential`. */
export async function getAppleCredentialNative(): Promise<AuthCredential> {
  const { FirebaseAuthentication } =
    await import("@capacitor-firebase/authentication");
  const result = await FirebaseAuthentication.signInWithApple();
  // Apple needs the raw nonce that was hashed into the idToken request so
  // Firebase can verify the token wasn't replayed.
  return new OAuthProvider("apple.com").credential({
    idToken: result.credential?.idToken ?? undefined,
    rawNonce: result.credential?.nonce ?? undefined,
  });
}
