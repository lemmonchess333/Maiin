/**
 * The Firebase app and Auth — everything the LOGIN screen needs, and
 * nothing that drags Firestore in with it.
 *
 * Split out of `firebase.ts` because that module creates Auth, Firestore,
 * Storage and Functions in one go at import time. A static import is
 * unconditional, so ANY importer of `auth` — and the login screen is one —
 * pulled the whole Firestore SDK: 369 KB, decoded and parsed before the
 * login form could paint, for a screen that never reads a document.
 *
 * The rule this file exists to keep: **nothing here may import
 * `firebase/firestore`, `firebase/storage` or `firebase/functions`,
 * directly or transitively.** `eagerGraph.test.ts` fails if Firestore
 * becomes reachable from App.tsx again.
 *
 * `firebase.ts` re-exports `app` / `auth` / `firebaseConfig` from here, so
 * existing importers are unaffected and there is one place that owns the
 * app handle.
 */
import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { logger } from "@/lib/logger";
import { initAppCheck } from "@/lib/appCheck";
import { initAnalytics } from "@/lib/analyticsProvider";

// Firebase config now lives in the shared pure module so the service-worker
// registration derives the same values (packet 17).
import { firebaseConfig } from "./firebaseConfig";
export { firebaseConfig } from "./firebaseConfig";

// Loud self-report when the web build shipped without a Firebase config (the
// VITE_FIREBASE_* secrets were unset at build time). A blank apiKey makes EVERY
// sign-in fail with auth/internal-error ("Sign-in is temporarily unavailable"),
// so surface the real cause in the console instead of leaving it a mystery.
// Skipped for emulator builds, which don't need real config.
if (!firebaseConfig.apiKey && import.meta.env.VITE_USE_EMULATORS !== "true") {
  logger.error(
    "[Firebase] VITE_FIREBASE_API_KEY is empty — this build has no Firebase " +
      "config, so ALL auth/data calls will fail with auth/internal-error. This " +
      "is a deploy/secrets issue (set the VITE_FIREBASE_* GitHub Actions " +
      "secrets and redeploy), not a user error."
  );
}

export const app = initializeApp(firebaseConfig);

// App Check runs BEFORE Firestore / Storage / Functions handles are
// created — the first call into those services triggers the App
// Check token request, so we need the provider installed by then.
// That ordering still holds after the split: `firebase.ts` imports this
// module, so this file's body runs to completion before any of those
// handles exist. See src/lib/appCheck.ts for the web / native split.
initAppCheck(app);

// Analytics provider — the delivery backend behind analyticsClient.emit().
// Web-only, lazily loaded, and a no-op unless VITE_FIREBASE_MEASUREMENT_ID
// is set. See src/lib/analyticsProvider.ts for gating + the native split.
initAnalytics(app);

// Auth keeps Firebase's default local persistence on purpose: Tropos is a
// mobile-first app and a session that survives an app restart is the
// expected behaviour. Destructive actions (account deletion) re-authenticate
// on their own path rather than by shortening the session.
export const auth = getAuth(app);

// Emulator wiring for AUTH only; the data services connect in `firebase.ts`
// beside the handles they belong to. Each service connects at its own
// module scope, so a handle is always wired before anything can use it.
//
// Previously this also required `import.meta.env.DEV`, which scoped
// it to `npm run dev` only — CI's `npm run build` runs in
// production mode, so the gate never fired even when CI explicitly
// wanted emulator wiring. Dropping the DEV check lets the
// preview-built E2E suite point Firebase at the emulators by
// passing VITE_USE_EMULATORS=true at build time.
//
// Production builds without the flag set are unaffected — the
// emulator-connect calls only fire when the env var is the
// literal string "true".
if (import.meta.env.VITE_USE_EMULATORS === "true") {
  connectAuthEmulator(auth, "http://127.0.0.1:9099");
}
