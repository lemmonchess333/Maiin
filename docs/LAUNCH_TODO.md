# Launch TODO — things I still need to do outside code

Everything deferred or "you'll need to do this yourself" that's
accumulated while Claude was shipping commits. Organised roughly
by urgency.

Status legend: ⚠️ blocking  ·  🟡 needed before submission  ·  🟢 V1.1 / nice-to-have

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

### 2. Apple Server API secrets in Firebase Functions config

The hardened IAP verification (`functions/appleIAP.js`) needs the
Apple Server API credentials at runtime. Apply once:

```bash
firebase functions:config:set \
  apple.key_id="YOUR_KEY_ID" \
  apple.issuer_id="YOUR_ISSUER_ID" \
  apple.private_key="$(cat AuthKey_*.p8 | sed ':a;N;$!ba;s/\n/\\n/g')"
```

Source: App Store Connect → Users and Access → Keys → In-App Purchase.
Download the `.p8` file once (can't re-download). Save the Key ID and
Issuer ID from that page.

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

### 11. Background run tracking

Current geolocation is browser-level — stops when the phone locks.
Need native background location permission + Capacitor Geolocation
plugin with `watchPosition` configured for background mode.

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

### 15. Sign in with Apple — native flow

Web popup-based Apple sign-in works but is fragile on iOS
standalone PWA/Capacitor. Swap to `@capacitor-community/apple-sign-in`
or similar for native surfaces.

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

Apple Guideline 1.2 territory — landed pre-launch. Operator
follow-up: set `ADMIN_UIDS` on the Cloud Function config and
`VITE_ADMIN_UIDS` on the GitHub Pages deploy env (matching set)
so the moderation page + callables actually have a registered
moderator.

### 20. README replacement

Currently still the Vite template. Should cover:
- App overview
- Setup steps
- Environment variables (long list now — VITE_FIREBASE_*,
  VITE_RECAPTCHA_V3_SITE_KEY, VITE_APP_CHECK_DEBUG_TOKEN,
  VITE_FIREBASE_STORAGE_BUCKET)
- Firebase setup
- Capacitor iOS build steps (`npm run build:ios`)
- TestFlight release steps
- Subscription setup (Apple Server API key)
- App Store review notes
- Known limitations

### 21. Legal pages review

`src/pages/PrivacyPolicy.tsx` and `src/pages/TermsOfService.tsx`
should explicitly cover:
- AI food analysis is an estimate, not medical advice
- GPS routes, privacy zones, public feed defaults
- Progress photo encryption (client-side AES-GCM)
- Subscription auto-renew / cancellation
- Social content moderation + reporting
- Data export / deletion rights

### 22. App icon redesign

Current icon is placeholder-tier per the GPT review. Lean into
orbit / training-trajectory / stylised T / mountain-peak concept
with the purple-orange gradient.

### 23. Tests for the 4 launch-blocker commits

Haptics, Apple IAP verification, App Check init, deleteMyAccount
Cloud Function — none have tests yet. Real test value would be
especially high for:
- IAP verification (mock a fake JWS, ensure it's rejected)
- deleteMyAccount (mock Firestore, ensure auth delete is last)
- Haptics platform branching

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
- End-to-end IAP sandbox test: sandbox Apple ID on iPhone →
  subscribe → verify Firestore flips `subscriptionTier` → wait for
  sandbox renewal → confirm webhook fires → cancel → confirm
  `EXPIRED` flips to free
- TestFlight internal build → App Store review submission

No point grinding any of this in parallel from Windows — the native
side will surface its own set of surprises that only show up in Xcode.
