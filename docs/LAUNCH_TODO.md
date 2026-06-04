# Launch TODO — things I still need to do outside code

Everything deferred or "you'll need to do this yourself" that's
accumulated while Claude was shipping commits. Organised roughly
by urgency.

Status legend: ⚠️ blocking · 🟡 needed before submission · 🟢 V1.1 / nice-to-have

---

## ⚠️ Blockers — genuinely stop submission

### 1. Storage CORS — fixes the Progress Photo upload bug

The bucket rejects browser uploads today (`storage/unknown` error
you saw on the Social → Progress tab). Apply a CORS policy from
Cloud Shell — commands ready to paste:

```bash
# 1. Open https://shell.cloud.google.com/?project=adaptive-fitness-af8bb
#    (use desktop — mobile Cloud Shell is flaky)

# 2. Create cors.json
cat > cors.json <<'EOF'
[
  {
    "origin": [
      "https://lemmonchess333.github.io",
      "https://troposfit.com",
      "http://localhost:5173",
      "http://localhost:4173"
    ],
    "method": ["GET", "HEAD", "PUT", "POST", "DELETE", "OPTIONS"],
    "maxAgeSeconds": 3600,
    "responseHeader": ["Content-Type", "Authorization", "Content-Length", "User-Agent", "x-goog-resumable"]
  }
]
EOF

# 3. Apply
gsutil cors set cors.json gs://adaptive-fitness-af8bb.firebasestorage.app

# 4. Verify
gsutil cors get gs://adaptive-fitness-af8bb.firebasestorage.app
```

Then hard-refresh the app and retest Social → Progress → + Add Photo.
If a new error (e.g. `storage/unauthorized`) surfaces, send it back —
different fix (likely Storage rules, not CORS).

### 2. Firebase Functions secrets — Secret Manager (Apple + Stripe + billing)

> **Changed by the firebase-functions v7 migration (PR #913).**
> `functions.config()` was removed (the Cloud Runtime Config API shut
> down 2025-12-31), so the old `firebase functions:config:set apple.*`
> / `stripe.*` commands no longer work — they throw. All runtime
> secrets now come from **Secret Manager** via `defineSecret`, bound to
> each function with `runWith({ secrets: [...] })` and read as
> `process.env.<NAME>`. Provision each one ONCE (interactive prompt for
> the value):

```bash
# Apple Server API (functions/appleIAP.js → restoreApplePurchases)
#   Source: App Store Connect → Users and Access → Keys → In-App Purchase.
#   Download the .p8 once (can't re-download); keep the Key ID + Issuer ID.
firebase functions:secrets:set APPLE_KEY_ID
firebase functions:secrets:set APPLE_ISSUER_ID
firebase functions:secrets:set APPLE_PRIVATE_KEY   # paste full .p8 contents

# Stripe (createCheckoutSession, stripeWebhook, deleteMyAccount, + the 3 Apple callables)
firebase functions:secrets:set STRIPE_SECRET_KEY
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET

# Billing-identity HMAC (account-deletion tombstones → restoreApplePurchases)
firebase functions:secrets:set BILLING_HMAC_SECRET   # 32-byte hex
# BILLING_PREVIOUS_HMAC_SECRET — only during a key-rotation window
```

`ADMIN_UIDS` (moderation allowlist) is **not** a secret — set it as a
plain env var (`functions/.env` or `--set-env-vars ADMIN_UIDS=uid1,uid2`).

**Safety gate:** a `firebase deploy` that references a bound secret which
hasn't been provisioned **fails** before shipping — so provision all of
the above before the first post-migration functions deploy.

### 3. Deploy Cloud Functions + Firestore rules

After `#2` is configured, ship:

```bash
firebase deploy --only functions:verifyApplePurchase,functions:appleIAPWebhook,functions:restoreApplePurchases,functions:deleteMyAccount
firebase deploy --only firestore:rules
```

The rules deploy activates the tightened activities/feeds/
notifications/groups rules — most importantly it fixes the crews
feature that's been silently default-denied in production (rules
file used `/crews/`, code uses `/groups/`).

**After deploy — deployed-source spot-check (firebase-functions v7
migration).** CI-green does not prove the upload landed (the
dedup/bundle-hash gotcha in CLAUDE.md). View the deployed source in the
Console (`console.cloud.google.com/functions/details/us-central1/<name>/source`)
and confirm it contains the `firebase-functions/v1` import and the
`defineSecret(...)` lines. If absent, re-run `deploy-functions.yml` via
`workflow_dispatch`.

**ACTION — clear the stranded deploy backlog (Secret Manager).** Every
`functions/` deploy has been failing because the **Secret Manager API was
disabled** on `adaptive-fitness-af8bb` (the deploy resolves the bound secrets
— `APPLE_KEY_ID`, `STRIPE_*`, `BILLING_HMAC_SECRET` — against it and 403s:
_"API has not been used in project … or it is disabled"_). So recent
`functions/` changes — the **server perf-engine cold-start reconciliation**
and the **transactional + idempotent challenge sync** — never actually
shipped. `deploy-functions.yml` now enables Secret Manager and waits for it
to propagate before deploying. **Re-run `deploy-functions.yml` via
`workflow_dispatch`, confirm green, then spot-check the deployed source:**
`safeRatio` returns `1.0` (not `1.2`), the deload threshold is `>= 85`, and
the challenge sync writes an `applied/{sourceId}` marker. If the enable step
errors on permissions instead, enable it once by hand:
`gcloud services enable secretmanager.googleapis.com --project adaptive-fitness-af8bb`.

### 4. App Store Connect — IAP products + webhook URL

- Register IAP products matching the IDs in
  `src/lib/purchaseProvider.ts`:
  - `com.tropos.app.pro.monthly`
  - `com.tropos.app.pro.yearly`
- In App Store Connect → App Information → App Store Server
  Notifications, set the **Production URL** and **Sandbox URL** to
  the deployed `appleIAPWebhook` function URL (format:
  `https://us-central1-adaptive-fitness-af8bb.cloudfunctions.net/appleIAPWebhook`).

---

## 🟡 Needed before App Store submission (but not day-blockers)

### 5. reCAPTCHA v3 site key + App Check enforcement

Currently App Check is wired but running unenforced because the site
key isn't set. Without it, backend services aren't protected from
scraped clients / curl / bots.

1. Register a site at https://www.google.com/recaptcha/admin →
   reCAPTCHA v3 → add domains `lemmonchess333.github.io`,
   `troposfit.com`, `localhost`.
2. Copy the **site key** into:
   - GitHub Actions secret `VITE_RECAPTCHA_V3_SITE_KEY`
   - Firebase console → App Check → Web → reCAPTCHA v3 provider
3. In Firebase console → App Check, **enable enforcement** per
   service one at a time (Firestore first, then Storage, then
   Functions). Do this gradually so existing clients don't get
   locked out mid-deploy.

### 5a. Account-deletion kill-switch — pre-create the boolean

The deletion executor (`functions/accountDeletion.js`) reads
`system/config.deletionExecutorEnabled` on every invocation. It is
**fail-open by design**: a missing field, missing doc, or read failure
all default to ENABLED (so an infra blip can't lock users out of
deleting their account — a compliance requirement). The field only
_halts_ deletions when it is present **and the boolean `false`**.

The operator gotcha: the Firebase Console "Add field" UI defaults new
values to **string** type. A string `"false"` is NOT the boolean
`false` — the executor logs `deleteAccount.kill_switch_malformed` and
**fails open** (deletions keep running). So in an incident you cannot
reliably pause deletions unless the field already exists as a boolean.

Pre-create it once, before launch, as a **boolean**:

1. Firebase Console → Firestore → `system` collection → `config` doc
   (create both if absent).
2. Add field `deletionExecutorEnabled`, type **boolean**, value
   `true`.
3. To pause deletions during an incident, flip that same field to
   boolean `false` (do NOT type a string). Confirm in Cloud Logging
   that new deletion calls throw `executor-disabled` and that no
   `kill_switch_malformed` lines appear.

Without this pre-creation the rail still defends correctly (it fails
open), but you have no tested pause lever on the day you need one.

### 5b. Scheduled-function timeouts — verify the perf rollup at scale

The cron sweeps (`weeklyPerformanceRollup`, `dailyPerformanceRefresh`,
`dailyRaceReconciliationSweep`, `weeklyFellBehindCheck`,
`crewWeeklyLeaderboardRollup`) iterate every active user/crew. They
previously had **no `timeoutSeconds`**, so they inherited the 60s v1
default and would be hard-killed mid-sweep at scale (a prefix of users
processed, the rest silently left stale — no error, green schedule).
They now carry `SCHEDULED_CAP = { maxInstances: 1, timeoutSeconds: 540 }`.

Post-deploy at real scale, spot-check Cloud Logging that each sweep's
`processing N users` and `done` lines bracket a wall-clock well under
540s. If any sweep approaches the cap, shard it (process a slice per
tick keyed off `lastActiveAt`) rather than raising memory — 540s is the
v1 ceiling.

### 6. Native App Check provider (for TestFlight / App Store builds)

The native branch of `src/lib/appCheck.ts` is a stub today — iOS
builds run without attestation. Steps to finish:

```bash
npm install @capacitor-firebase/app-check
npx cap sync ios
```

Then register the iOS app's App Attest provider in the Firebase
console (App Check → iOS → App Attest), and replace the stub in
`appCheck.ts` `native` branch with a CustomProvider calling the
plugin's `getToken()`.

### 6a. iOS native analytics — add GoogleService-Info.plist

Firebase Analytics is wired and unit-tested on BOTH platforms behind the
`analyticsProvider.ts` seam, and **web delivery is confirmed live** (events
visible in Firebase → Realtime — `home_card_tapped`, `page_view`, etc.).
The native iOS path uses the `@capacitor-firebase/analytics` plugin (already
installed) → native Firebase SDK, which reads its config from
`GoogleService-Info.plist`. There is **no** measurement-ID env var on native
(the `VITE_FIREBASE_MEASUREMENT_ID` secret is web-only — the plist drives
native).

The only remaining step — whenever you do the iOS session (needs Mac/Xcode):

1. Download `GoogleService-Info.plist` from Firebase Console → Project
   settings → Your apps → **iOS app** (Analytics is already enabled on the
   project; same place you grabbed the web `measurementId`).
2. Add it to the Xcode project (`ios/App/App/`), then:

   ```bash
   npm run build:ios   # runs cap sync ios
   ```

That lights up the native path the same way as web — **no code needed, it's
already wired and tested.** Spot-check on a device / TestFlight build via
Firebase → Realtime (or DebugView). If it stays empty, check
`/diagnostics → Analytics` on-device: `error` means the plist is missing or
not synced.

### 7. Deploy the haptics fix + test on a real iPhone

Every `haptic()` call on iOS was silently doing nothing (dead API)
until commit `79233a1`. New code uses `@capacitor/haptics`. Needs
verification on a physical iPhone build — the web haptic path can't
test it.

### 8. Info.plist usage descriptions — ✅ done

Verified on `main` (post-#547): `ios/App/App/Info.plist` already
contains all three required keys with the exact strings below:

- `NSCameraUsageDescription` — "Tropos uses your camera to scan food and barcodes for faster logging."
- `NSLocationWhenInUseUsageDescription` — "Tropos uses your location to track runs and calculate distance."
- `NSPhotoLibraryUsageDescription` — "Tropos lets you attach progress photos to track visual changes over time."

`NSMotionUsageDescription` deliberately omitted — no pedometer in code.

### 9. App Store Connect metadata + assets

- Screenshots (6.7" iPhone required)
- Privacy policy URL
- Support URL
- Category: Health & Fitness
- Reviewer notes mentioning:
  - AI food analysis disclaimer
  - IAP sandbox demo account
  - Any crew / social content moderation flow

---

## 🟢 V1.1 — post-launch iOS feature work

These are the "makes Tropos feel like a real iPhone fitness app"
items from the GPT 5.5 review. None block submission.

### 10. HealthKit integration

The single biggest iOS-credibility upgrade. Priority order:

- Steps (read)
- Active Energy (read)
- Body Weight (bidirectional)
- Workouts (write completed sessions)
- Heart Rate (read, later)
- Sleep / Recovery (read, later)

Needs `@capacitor-community/health` or similar plugin + iOS
entitlement config.

### 11. Background run tracking — Step 2 (native; needs Mac/Xcode)

Full plan: **`docs/run-background-gps.md`**.

**Step 1 is done (web-safe).** `useGPS` now reads fixes through a
`LocationSource` seam (`src/lib/locationSource.ts`) instead of
`navigator.geolocation` directly, and the run-start fixes shipped (starts on
a weak/indoor fix instead of spinning "Acquiring GPS" forever; countdown no
longer stalls; plain permission / offline / no-lock copy).

**Step 2 (this item) is the native part.** Geolocation is still browser-level
— it stops when the phone locks / backgrounds (every real run). Add
`@capacitor-community/background-geolocation` (foreground service), write a
`nativeLocationSource`, flip the one branch in `getLocationSource()`, add iOS
`Info.plist` location strings + `UIBackgroundModes: location` and the Android
`ACCESS_BACKGROUND_LOCATION` permission + foreground-service notification,
then device-test: screen-lock mid-run, app backgrounded, airplane-mode → back.

Follow-ups:

- Auto-pause when stationary
- GPS confidence indicator
- Route smoothing / Kalman filter (partially exists in `gps.ts`)
- Post-run privacy-zone redaction before publishing routes

### 12. Live Activities / Dynamic Island

Biggest visual differentiator on iPhone 14+. Run timer + pace, or
workout rest timer, live on the lock screen + Dynamic Island. Needs
a native ActivityKit integration — Capacitor wrapper packages
exist, worth evaluating.

### 13. Home Screen Widgets

- Today's calories / protein
- Next workout
- Streak
- Weekly training progress
- Start Run shortcut

### 14. Native share sheets

Currently `navigator.share` where supported, clipboard fallback.
Works but the native share sheet via `@capacitor/share` on iOS is
visually richer (and matches App Store expectation).

### 15. Sign in with Apple + Google — native flow

**iOS parity gap (audit 2026-06-04).** Both OAuth sign-ins in
`src/lib/auth.tsx` use `signInWithPopup` with no native branch. OAuth
popups don't work inside the Capacitor WKWebView — the redirect returns to
`capacitor://localhost`, which isn't a Firebase authorized domain — so on a
native build **Google sign-in fails outright and Apple sign-in is fragile**.
Email/password sign-in is unaffected (works natively).

Fix is the same both-ways seam as the rest of the app: keep the web popup,
add a native branch behind `isNativePlatform()` that uses a native sign-in
plugin → `signInWithCredential`:

- Apple: `@capacitor-community/apple-sign-in`
- Google: `@capacitor-firebase/authentication` (or
  `@codetrix-studio/capacitor-google-auth`)

Without this, native users can only sign in with email/password.

### 15a. Native remote push (APNs) — server-initiated push parity

**iOS parity gap (audit 2026-06-04).** `src/lib/pushNotifications.ts` is
pure web FCM (`firebase/messaging` + a service worker). The Capacitor
WKWebView has no usable service worker, so `isPushSupported()` returns false
and **server-sent push silently no-ops on iOS** (device tokens are even
hardcoded `platform: "web"`).

Scope note: the **reminder** notifications (meal / streak / workout) use
`@capacitor/local-notifications` and **do** work natively — only
_server-initiated_ remote push is missing on device. Not a submission
blocker; it's an engagement-parity gap.

Fix: `@capacitor/push-notifications` (APNs) or
`@capacitor-firebase/messaging`, register the native token with
`platform: "ios"`, and teach the server senders to dispatch via APNs/FCM
for native tokens. Needs the iOS Push Notifications capability +
`GoogleService-Info.plist` (the same plist as analytics) in Xcode.

### 16. Apple Watch companion (far future)

- Start / stop run
- Heart rate display
- Rest timer
- Set logging
- Workout controls

Major project, not on the critical path.

---

## 🟢 Deferred code / polish items

Things I explicitly deferred mid-session with a clear "follow-up"
note in the commit.

### 17. FoodComposerCard extraction

~17-prop surface, interface pain outweighs extraction value today.
Worth its own PR when the composer grows more logic.

### 18. FoodQuickAddRow extraction

Blocked on splitting the quickMeals merge useMemo (time-relevant
favourites + recent history + seeded fallback with dedupe). That
split is the real prerequisite work.

### 19. Moderation queue + profanity filter

User-generated content surfaces (feed, comments, crews) have:

- ✅ Report button (writes to `/reports/`)
- ✅ Block user
- ✅ Moderation UI for reviewing the reports — `/admin/moderation`
  page gated on `VITE_ADMIN_UIDS` / `ADMIN_UIDS` (client + server).
  Surfaces pending reports with target preview + dismiss / hide
  actions; backed by `listPendingReports` + `resolveReport`
  callables that re-check admin via `adminAuth.assertAdminCallable`.
- ✅ Profanity / toxicity auto-filter — `onActivityCreated` /
  `onCommentCreated` triggers run `leo-profanity` against
  caption / workoutName / runName / comment.text. Profane
  activities auto-flag to `visibility: 'private'`; profane
  comments auto-delete with an audit row under
  `/commentModeration/`. Client-side composer warns the user
  inline at submit time as a UX nicety.
- ✅ Published contact email — `support@troposfit.com` link in
  Settings → Support & Legal → "Report objectionable content"
  with a moderation-prefixed subject so the inbox can route.

Apple Guideline 1.2 territory — landed pre-launch.

#### Operator follow-up — register a moderator (deferred)

The auto-filter runs unconditionally once functions deploy, but
the `/admin/moderation` queue stays locked (fail-closed: empty
allowlist → no admins → every callable rejects) until both
`ADMIN_UIDS` (server) and `VITE_ADMIN_UIDS` (client) are set to
the same uid. Step-by-step:

1. **Get the moderator's Firebase Auth UID** — Firebase Console →
   Authentication → Users, copy the UID column for the operator
   account (28-character string, mixed-case alphanumeric).

2. **Set the server-side allowlist:**

   ```bash
   firebase functions:config:set admin.uids="THE_UID_HERE" \
     --project adaptive-fitness-af8bb
   firebase deploy --only functions \
     --project adaptive-fitness-af8bb
   ```

   Requires `npm install -g firebase-tools` + `firebase login`
   (use `--no-localhost` if running over SSH / Codespaces).

   Multiple moderators later: comma-separate, e.g.
   `admin.uids="uid1,uid2,uid3"`.

3. **Set the client-side allowlist** — edit
   `.github/workflows/deploy.yml`, add to the `npm run build`
   step's `env:` block (must match step 2 exactly):

   ```yaml
   VITE_ADMIN_UIDS: "THE_UID_HERE"
   ```

   Commit + push to main; GitHub Pages auto-redeploys in ~3
   minutes.

4. **Verify** — open `https://lemmonchess333.github.io/Maiin/admin/moderation`
   while signed in as the operator account. Either "All clear. No
   pending reports." or a list of report cards = working. "Not
   authorised" = the UID didn't match somewhere (re-check step 1
   against both env vars).

Until both are set, `/admin/moderation` 403s for everyone and the
`listPendingReports` callable rejects all calls. The auto-flag
triggers run regardless — they're independent of the allowlist
and start filtering UGC the moment functions deploy.

### 20. README replacement — ✅ done

Already replaced (the stale "still the Vite template" note predated the
rewrite). `README.md` now covers app overview, quick start, the full
environment-variable surface (web + Cloud Functions secrets), Firebase
setup, App Check, the local emulator, Capacitor iOS/Android build steps,
a release checklist, an incident runbook, and project conventions.

### 21. Legal pages review — ✅ addressed (lawyer review still recommended)

`src/pages/PrivacyPolicy.tsx` and `src/pages/TermsOfService.tsx` now
cover every item below. Each claim was verified against the actual code
before being written into the legal text:

- ✅ AI food analysis is an estimate, not medical advice — Privacy §8,
  Terms §7
- ✅ GPS routes, privacy zones, public-feed defaults — Privacy §1
  (privacy zones via `applyPrivacyZones`, verified) + §4 (explicit
  sharing, per-post visibility, nothing auto-published — verified
  against `ShareComposerSheet`)
- ✅ Progress photo encryption (client-side AES-GCM) — Privacy §1 + §3
  (verified against `ProgressPhotos.tsx` `crypto.subtle` AES-GCM-256)
- ✅ Subscription auto-renew / cancellation — Terms §4
- ✅ Social content moderation + reporting — Terms §5 (acceptable use),
  §6 (UGC removal), §9 (termination)
- ✅ Data export / deletion rights — Privacy §5, §6 (GDPR), Terms §9

Note: this is plain-language coverage of the real data practices, not a
substitute for a lawyer's review before public launch.

### 22. App icon redesign

Current icon is placeholder-tier per the GPT review. Lean into
orbit / training-trajectory / stylised T / mountain-peak concept
with the purple-orange gradient.

### 23. Tests for the 4 launch-blocker commits

Status update: **3 of 4 are now covered with concrete tests**:

- ✅ IAP verification rejects forged/invalid JWS and blocks writes (`functions/__tests__/applePurchase.test.js`)
- ✅ deleteMyAccount ordering invariant pinned (Auth delete is last) (`functions/__tests__/accountDeletion.test.js`)
- ✅ Haptics platform branching pinned (web vibrate vs Capacitor native path) (`src/lib/__tests__/haptic.test.ts`)

Still missing:

- ⚠️ App Check init path coverage (web/native branch + failure handling)

### 24. 151 exercise copy rewrite

Already done on main via another session (branch
`claude/restructure-exercise-schema-DtX4r`, merged via PRs
#377-383). Nothing to do — noted so we don't re-do it.

---

## Progress log — what IS already shipped on this branch

For context, the accumulated work on `claude/apple-iap-capacitor-uV0vz`
includes:

- Social tab: Suggested People, smart default tab, trajectory card,
  avatars across every surface, skeleton loading, haptic feedback,
  optimistic FollowButton, Invite CTA hero, error handling sweep,
  Discover empty-state CTA, 3 cross-user read bugs fixed
- Food page: Enter-to-log, camera permission fallback, inline edit
  servings + duplicate → refined to Edit-only with stepper, dead
  desktop-keyboard branches removed, platform-agnostic denied copy
- Launch blockers: haptics → Capacitor, Apple IAP verification
  hardened with `@apple/app-store-server-library`, App Check
  initialised (web), account deletion as Cloud Function,
  production-safe error boundary, splash duration 2s → 500ms,
  Capacitor build scripts
- Rules + privacy: activities/feeds/notifications tightened,
  crews rule path fixed to match `/groups/`, privacy manifest
  extended with 5 missing data types, innerHTML → safe DOM
- Component extractions: FoodDateBar, EditServingsSheet with tests
- App-shell hardening (`af8b5a9`): `--tab-bar-height` / `--page-x` /
  `--safe-top` / `--safe-bottom` / `--page-bottom-pad` CSS vars,
  defensive `overflow-x: hidden` on html/body, missing `.safe-area-pt`
  utility defined, Layout bottom padding now clears the home indicator
- Env surface documented (`a2db0dc`): `.env.example` lists
  `VITE_RECAPTCHA_V3_SITE_KEY`, `VITE_APP_CHECK_DEBUG_TOKEN`, and
  the server-side `firebase functions:config:set` reference

**28 commits on branch, 1140 tests green, lint + build clean.**

---

## Environment reality — Windows only, no iOS branch

I'm on Windows with no Mac or Xcode access. There is no separate iOS
branch; all iOS-related files (`ios/App/App/Info.plist`,
`ios/App/App/PrivacyInfo.xcprivacy`, `capacitor.config.ts`, the
Capacitor deps in `package.json`) live on this branch. They're
prepared but unbuildable until someone opens the `.xcworkspace` in
Xcode on a Mac.

**The hard truth:** App Store submission is physically impossible
without a Mac. Xcode is the only way to produce the `.ipa` that
TestFlight accepts. Options:

- Borrow a Mac for a day
- Rent MacinCloud / MacStadium (~$20-40 for a day)
- Buy a used Mac mini (~$400 M1)
- Partner with someone who has one

Everything below is filtered by what's actually doable from Windows.

---

## Windows-doable now (~2 hours of browser + CLI work)

Code side is ready. No code changes needed for any of these.

### Cloud Shell (browser — works on mobile in a pinch)

1. Apply CORS (`#1` above) — fixes Progress photo upload

### Firebase CLI (works on Windows via `npm i -g firebase-tools`)

2. `firebase functions:config:set apple.*` with `.p8` contents
   (`#2` above) — needs the `.p8` downloaded from App Store Connect
3. `firebase deploy --only functions:verifyApplePurchase,functions:appleIAPWebhook,functions:restoreApplePurchases,functions:deleteMyAccount`
4. `firebase deploy --only firestore:rules` — activates tightened
   rules + fixes the `/crews/` → `/groups/` path bug

### App Store Connect (browser — needs active Apple Dev membership)

5. Register IAP products `com.tropos.app.pro.monthly` and
   `com.tropos.app.pro.yearly` → "Ready to Submit"
6. Generate App Store Server API key (download `.p8` once, save
   Key ID + Issuer ID) — this `.p8` is what item 2 consumes
7. Point App Store Server Notifications V2 (Production + Sandbox)
   at the deployed `appleIAPWebhook` URL from item 3

### reCAPTCHA + App Check (browser, ~30 min, do gradually)

8. Register reCAPTCHA v3 site at
   https://www.google.com/recaptcha/admin — domains
   `lemmonchess333.github.io`, `troposfit.com`, `localhost`
9. Paste site key into GitHub Actions secret
   `VITE_RECAPTCHA_V3_SITE_KEY` + Firebase console App Check provider
10. Firebase console → App Check → enforce **Firestore first**, wait
    a day, then Storage, then Functions (gradual rollout so in-flight
    clients aren't locked out mid-deploy)

That's the whole Windows-doable list. Everything else needs a Mac.

---

## Mac required (parking lot)

Pick these up when you have Mac access:

- Open `ios/App.xcworkspace` in Xcode and build to a real iPhone
  (`npm run build:ios` → `npx cap sync ios` → `npx cap open ios`)
- Verify `Info.plist` has the three usage descriptions
  (`NSCameraUsageDescription`, `NSLocationWhenInUseUsageDescription`,
  `NSPhotoLibraryUsageDescription`) — auto-picked up from
  `capacitor.config.ts` but worth eyeballing in Xcode's issue nav
- Verify `PrivacyInfo.xcprivacy` appears in the target's Resources
  and Xcode shows no "missing privacy manifest" warning
- Test haptics on a real iPhone (commit `79233a1` — can't verify on
  web)
- Install native App Check plugin + wire iOS App Attest:
  `npm install @capacitor-firebase/app-check && npx cap sync ios` →
  Firebase console iOS App Attest provider → ping me to swap the
  7-line stub in `src/lib/appCheck.ts`
- Add `GoogleService-Info.plist` to the Xcode project (`ios/App/App/`) +
  `npm run build:ios` to light up **iOS analytics** (item 6a) — web is
  already live; the native path is wired + tested, it just needs the plist
- End-to-end IAP sandbox test: sandbox Apple ID on iPhone →
  subscribe → verify Firestore flips `subscriptionTier` → wait for
  sandbox renewal → confirm webhook fires → cancel → confirm
  `EXPIRED` flips to free
- TestFlight internal build → App Store review submission

No point grinding any of this in parallel from Windows — the native
side will surface its own set of surprises that only show up in Xcode.
