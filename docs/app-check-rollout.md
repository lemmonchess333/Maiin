# App Check rollout — Tropos / Maiin

Closes the install / configure / enforce flow for Firebase App Check
across web + native. Audit P0 #6 was the trigger; the rollout is staged
across four phases so a misconfigured client never bricks Firestore /
Storage / Cloud Functions for users in flight.

## Current state (after PR F scaffolding)

- **Web (production + dev):** `ReCaptchaV3Provider` initialised from
  `VITE_RECAPTCHA_V3_SITE_KEY`. Debug-provider bypass via
  `VITE_APP_CHECK_DEBUG_TOKEN`. Configured in Firebase console under
  App Check → Register web app.
- **Native (Capacitor iOS / Android):** **no attestation today.**
  `initAppCheck()` returns `false` on native unless
  `setNativeAppCheckProvider()` has been called with a factory.
  Until the plugin lands, the Cloud Functions referenced by native
  builds have no device-attestation signal — a modified iOS / Android
  client can call any Cloud Function without proving it's a genuine
  app installation.

## Phase 1 — Install the native plugin (DEV ONLY)

Run from a workstation with Xcode + Android Studio installed (cannot
ship from headless code environments).

```bash
npm install @capacitor-firebase/app-check
npx cap sync
```

iOS additional steps:

1. Open `ios/App/App.xcworkspace` in Xcode.
2. Verify the App Attest capability is added to the target's "Signing
   & Capabilities" tab.
3. In Firebase console → App Check → iOS app → register an App
   Attest provider. Copy the App ID prefix into Apple's Developer
   portal under App Attest configuration.

Android additional steps:

1. Open `android/` in Android Studio.
2. Confirm `applicationId` matches the package name registered in
   Firebase console.
3. Firebase console → App Check → Android app → register Play
   Integrity. Add the SHA-256 fingerprint(s) for debug + release
   signing keys.

## Phase 2 — Wire the provider (CLIENT)

In a new bootstrap file `src/lib/appCheckNative.ts` (created during
Phase 2, not in PR F):

```ts
import { FirebaseAppCheck } from "@capacitor-firebase/app-check";
import { CustomProvider } from "firebase/app-check";
import { setNativeAppCheckProvider } from "@/lib/appCheck";

// Call once at app boot, BEFORE initAppCheck.
export function registerNativeAppCheck() {
  setNativeAppCheckProvider(
    () =>
      new CustomProvider({
        getToken: async () => {
          const { token } = await FirebaseAppCheck.getToken();
          // Plugin returns opaque token + expiry. Firebase's
          // CustomProvider expects millis-since-epoch.
          return {
            token,
            expireTimeMillis: Date.now() + 60 * 60 * 1000, // 1h
          };
        },
      })
  );
}
```

Then in `src/main.tsx` (or wherever `initAppCheck` is currently
called):

```ts
import { Capacitor } from "@capacitor/core";
import { initAppCheck } from "@/lib/appCheck";

if (Capacitor.isNativePlatform()) {
  const { registerNativeAppCheck } = await import("@/lib/appCheckNative");
  registerNativeAppCheck();
}
initAppCheck(firebaseApp);
```

The dynamic import ensures the plugin's native code only loads on
native builds — web bundles stay slim.

## Phase 3 — Verify in unenforced mode (1 week)

Deploy the Phase 2 client. Do NOT flip enforcement yet.

Use the Firebase console's **App Check → Recent requests** view to
confirm:

- Web app: > 95% of requests carry a verified App Check token.
- iOS app: > 90% of requests carry a verified token. (Some App
  Attest requests legitimately fail on devices that don't support
  it — old hardware, jailbroken, restricted by MDM. 10% is the
  guideline failure budget Apple publishes.)
- Android app: > 95% verified token rate.

If any rate is below threshold, stop here and diagnose. Common
causes:

- iOS: bundle ID mismatch between Firebase console and Xcode
  project.
- Android: SHA-256 fingerprint not registered for the signing key
  currently shipping.
- Web: reCAPTCHA site key for the wrong domain.

Diagnostics inside the app: the operator diagnostics page (audit P2
#17, separate ticket) reads `getAppCheckToken()` and `isAppCheckActive()`
from `src/lib/appCheck.ts` to surface "App Check: active / inactive"

- a debug-only token preview.

## Phase 4 — Enable enforcement (per-service, staged)

In the Firebase console → App Check → APIs tab:

1. **Cloud Functions first** — least-risk to flip. If clients break,
   the Function returns 403 and the user sees an error toast; they
   can retry / reinstall. Wait 24 hours, watch error-reporting for
   App-Check-rejection spikes.
2. **Cloud Storage second** — affects photo upload (avatar, progress
   photos, share cards). Flip after Functions has been stable for a
   week.
3. **Firestore last** — affects EVERY read/write. The biggest blast
   radius. Only flip after Functions + Storage have been enforced
   without incident for at least two weeks.

Each enforcement flip is reversible from the same console panel.
Rollback playbook below.

## Phase 4b — per-callable enforcement (`functions/index.js`)

The Console "Cloud Functions" toggle above is the coarse switch. This repo's
convention (CLAUDE.md → App Check) is **per-callable** enforcement in code:
add `enforceAppCheck: true` to a function's `runWith({...})`. This lets you
stage one endpoint at a time and keep destructive ones unenforced until last.

**`enforceAppCheck` only applies to `https.onCall`.** `https.onRequest`
functions are raw HTTP — the flag does nothing; if you want to gate one you
must verify the `X-Firebase-AppCheck` header in code. **And some `onRequest`
functions must stay open forever** (see Never enforce).

### ✅ `onCall` — enforce, staged low-risk → destructive

Add `enforceAppCheck: true` ONE at a time, watching error-reporting for
App-Check-rejection spikes between each (the rate must already be ≥99% per
Phase 3 before starting). Order:

| Tier                                  | Callables                                                                                                             | If it breaks                                                                                    |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 1 — low risk (flip first)             | `askGeminiText`, `sendTestPush`, `backfillMyActivityCategories`, `refreshMyCrewLeaderboard`, `computePerformanceWeek` | a non-critical feature errors; user retries                                                     |
| 2 — core flows                        | `completeOnboarding`, `configurePlan`                                                                                 | new users can't onboard / can't edit plan — flip only after Tier 1 is stable for days           |
| 3 — destructive / billing (flip LAST) | `deleteMyAccount`, `verifyApplePurchase`, `restoreApplePurchases`                                                     | account deletion or purchase/restore breaks — highest blast radius, flip last and watch closely |

### ⚠️ `onRequest`, client-called — manual verification only

`analyzeFood`, `analyzeFoodText`, `createCheckoutSession` are client-called raw
HTTP. The `enforceAppCheck` flag is a no-op here. Gating them (optional, lower
priority) means verifying the `X-Firebase-AppCheck` header in the handler.
Don't bother until the `onCall` rollout is complete and stable.

### ⛔ Never enforce — EXTERNAL webhooks

These are called by Stripe / Apple servers, which **cannot send an App Check
token**. Enforcing (via the flag OR a manual header check OR an over-broad
Console API toggle) would 403 every delivery and **silently break billing /
subscription reconciliation**:

- `stripeWebhook` — authed by the Stripe signature (`STRIPE_WEBHOOK_SECRET`).
- `appleIAPWebhook` — authed by the signed JWS payload.

Both declaration sites carry an inline `⛔ NEVER add enforceAppCheck` marker so
a future "secure all HTTP functions" pass can't accidentally break them.

### No App Check (no client request)

The scheduled (`pubsub.schedule`) and Firestore-trigger functions —
`weeklyPerformanceRollup`, `dailyPerformanceRefresh`, `rolloverChallenges`,
`hourlyStreakNudge`, `dailyRaceReconciliationSweep`,
`crewWeeklyLeaderboardRollup`, `onWorkoutCreated`, `onRunCreated`,
`onActivityCreated`, `onChallengeParticipant{Created,Deleted}` — never receive
a client request, so App Check does not apply to them.

## Rollback playbook

If enforcement causes user-facing breakage:

1. Firebase console → App Check → APIs → toggle enforcement OFF for
   the affected service.
2. Effect is global within ~60 seconds.
3. No client deploy required.
4. Triage in App Check → Recent requests to find the failing token
   source (UA / app version / specific device cohort).

## Operator diagnostics

`src/lib/appCheck.ts` exposes:

- `isAppCheckActive()` — boolean, true when a provider is installed.
- `getAppCheckToken()` — Promise resolving to the current token or
  `null` on failure. Never throws.

When the operator-diagnostics route lands (audit P2 #17), surface:

- Provider type (reCAPTCHA / App Attest / Play Integrity / none).
- Token age in seconds.
- First 8 chars of the token (so support can correlate with Cloud
  Logging without exposing the full token).
- The verification rate from the last 100 Firebase calls (read via
  network interceptor, separate effort).

## What this PR (F) ships

- `src/lib/appCheck.ts` rewritten to support a clean injection
  point (`setNativeAppCheckProvider`) for the native plugin.
- `getAppCheckToken()` + `isAppCheckActive()` diagnostic helpers
  exported.
- This rollout doc.

## What this PR does NOT ship

- The actual `@capacitor-firebase/app-check` install (requires
  Xcode / Android Studio).
- Native build steps (requires real-device verification).
- The bootstrap wiring in `src/main.tsx` (depends on the plugin
  install).
- Enforcement flip (gated on Phase 3 verification).
