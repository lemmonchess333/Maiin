# App Check rollout — Tropos / Maiin

Closes the install / configure / enforce flow for Firebase App Check
across web + native. Audit P0 #6 was the trigger; the rollout is staged
across four phases so a misconfigured client never bricks Firestore /
Storage / Cloud Functions for users in flight.

## Current state

- Web uses `ReCaptchaV3Provider` with `VITE_RECAPTCHA_V3_SITE_KEY`.
  `VITE_APP_CHECK_DEBUG_TOKEN` is read only in development builds.
- Native bootstrap registers `appCheckNative.ts` synchronously before Firebase
  services are created. Its CustomProvider lazily loads the pinned
  `@capacitor-firebase/app-check` plugin, awaits initialization, and forwards
  the native SDK's token and exact `expireTimeMillis`. Missing or expired
  tokens fail; no one-hour expiry or debug token is invented.
- iOS installs its App Attest provider factory in AppDelegate before native
  Firebase configuration. The signing entitlement specifies the production environment.
- Client wiring is implemented; signed-device attestation is **not verified**.
  Backend enforcement remains off. The Android project is not committed, so
  Android registration and build verification remain outstanding.

## Phases 1–2 — Install and wire the native client

The dependency, provider bridge, bootstrap, iOS entitlement and SPM registration
are committed. On the build workstation run:

```bash
npm ci
npm run build
npx cap sync ios
```

Capacitor 8.4's SPM symlink option avoids the App Check package identity
collision. Generated symlinks are machine-local and recreated by `cap sync`.
The regenerated package manifest also registers existing background location,
RevenueCat, Health and Live Activities dependencies.

Before releasing an iOS build:

1. Open `ios/App/App.xcodeproj` in a compatible Xcode version and resolve SPM.
   Compile/archive the actual native project; a web build does not check Swift.
2. Add the correct `GoogleService-Info.plist` to the app target. Confirm its
   Firebase app and the signed bundle both identify `com.tropos.app`.
3. Enable App Attest for the Apple App ID and provisioning profile. Inspect
   the signed app's production App Attest entitlement.
4. Register the iOS app with the App Attest provider in Firebase App Check.
5. Use a signed physical iPhone to verify token issuance, refresh and normal
   authenticated requests. Exercise offline and unsupported-device behavior.
   Do not put token contents in logs, screenshots or release notes.

The bridge tests cover initialization ordering, exact expiry, web exclusion,
failure propagation and retry. These tests cannot establish device attestation.
Firebase's [App Attest setup](https://firebase.google.com/docs/app-check/ios/app-attest-provider)
describes the native initialization and registration requirements.

## Phase 3 — Verify in unenforced mode (at least 1 week)

Deploy the client without changing enforcement. Follow the operator gate in
CLAUDE.md: wait 24–48 hours for telemetry, then require **at least 99% verified
requests sustained for at least seven days** before any per-callable flip.
Measure the legitimate web and released native population, including the actual
callable being considered. Do not substitute mocked test results for metrics.

If coverage is below the gate, diagnose bundle ID, signing registration,
reCAPTCHA domain, unsupported devices and transient failures. Resolve legitimate
client failures before enforcing. Registration being active only means the
provider was installed; it does not prove that attestation succeeded.

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

| Tier                                  | Callables                                                         | If it breaks                                                                                    |
| ------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 1 — low risk (flip first)             | `sendTestPush`, `backfillMyActivityCategories`                    | a non-critical feature errors; user retries                                                     |
| 2 — core flows                        | `completeOnboarding`, `configurePlan`                             | new users can't onboard / can't edit plan — flip only after Tier 1 is stable for days           |
| 3 — destructive / billing (flip LAST) | `deleteMyAccount`, `verifyApplePurchase`, `restoreApplePurchases` | account deletion or purchase/restore breaks — highest blast radius, flip last and watch closely |

> **A canary needs traffic.** Tier 1 listed five callables until
> 2026-07-26; three of them could not have served the purpose:
> `refreshMyCrewLeaderboard` no longer exists (deleted with crews in
> #1700), `askGeminiText` was retired for having no client caller, and
> `computePerformanceWeek` is still exported but is called from no client
> code path. Flipping `enforceAppCheck` on an endpoint nothing calls
> produces no verified-request telemetry and no rejection signal — it
> goes green because nothing exercises it, which reads as evidence when
> it is the absence of evidence. Only `sendTestPush` and
> `backfillMyActivityCategories` have real client call sites, so those
> are the tier.
>
> Before adding a callable to any tier, confirm the client actually calls
> it (`grep -rn '<name>' src/ --include=*.ts --include=*.tsx`). An
> uncalled callable belongs in the "retire or wire up" pile, not the
> rollout plan.

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
`weeklyFellBehindCheck`, `onWorkoutCreated`, `onRunCreated`,
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
- Token availability and expiry metadata only; never display or log token
  contents, including prefixes.
- The verification rate from the last 100 Firebase calls (read via
  network interceptor, separate effort).

## Delivery status

PR #2212 merged the pinned native plugin, synchronous bootstrap registration,
CustomProvider bridge, iOS provider factory, production entitlement and SPM
registration. Web builds, unit tests and Capacitor sync passed. The native
plugin and bootstrap are no longer pending implementation.

Still outstanding: compile/archive the signed Xcode project, confirm provider
registration and production entitlement on a physical iPhone, and verify token
issuance, refresh and authenticated requests. Android project setup is separate
and remains absent from this repository. Keep enforcement off until the actual
released-client metrics meet the Phase 3 gate; code and mocked tests do not
satisfy it.
