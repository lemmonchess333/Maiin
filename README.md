# Tropos / Maiin

An adaptive fitness tracker for hybrid athletes — combines food, lifting,
running, and progress tracking in one app. Ships as a React PWA (deployed
to GitHub Pages) and as native iOS / Android builds via Capacitor.

This file is the entry point for anyone touching the codebase. For
deep design context, see `CLAUDE.md` (project conventions + invariants).

---

## Quick start

```bash
nvm use         # if you use nvm; this repo targets Node 20 LTS
npm install
cp .env.example .env.local   # fill in the Firebase / Stripe / Vertex env vars
npm run dev
```

Hot-reload dev server runs on http://localhost:5173/Maiin/ (note the
`/Maiin/` base path — see the Vite config in `vite.config.ts`).

---

## Tech stack

- **Frontend:** React 19 + TypeScript 5.9 + Vite 7
- **Styling:** Tailwind CSS v4 via `@tailwindcss/vite`
- **Routing:** React Router v7
- **Backend:** Firebase 12 (Auth, Firestore, Cloud Functions, Storage)
- **AI:** Vertex AI / Gemini (food image + text parsing)
- **Charts:** Recharts 3
- **Maps:** MapLibre GL 5
- **Animation:** Framer Motion 12 (gated through `useReducedMotion`)
- **PWA:** vite-plugin-pwa + Workbox
- **Native:** Capacitor 7 (iOS + Android)
- **Payments:** Stripe Checkout (web/Android), Apple In-App Purchase (iOS)
- **Testing:** Vitest 4 + React Testing Library + jsdom (unit),
  Playwright (E2E), Firebase Local Emulator Suite (rules — planned)

Folder map and architectural notes live in `CLAUDE.md`.

---

## Environment variables

Copied to `.env.local` for dev, set via deploy environment for production.

### Firebase (web SDK)
```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

### App Check
```
VITE_RECAPTCHA_V3_SITE_KEY=           # from Firebase console → App Check
VITE_APP_CHECK_DEBUG_TOKEN=           # optional, local dev only
```

### Stripe (web + Android payments)
```
VITE_STRIPE_MONTHLY_PRICE_ID=         # client-side display + checkout
VITE_STRIPE_YEARLY_PRICE_ID=
VITE_STRIPE_CHECKOUT_URL=             # defaults to /api/create-checkout-session
```

### Vertex AI / Gemini (Cloud Functions only — set in functions config)
```
firebase functions:config:set vertex.location=us-central1
firebase functions:config:set vertex.project_id=$PROJECT_ID
```

### Apple IAP (Cloud Functions only)
```
firebase functions:config:set apple.key_id=$APPLE_KEY_ID
firebase functions:config:set apple.issuer_id=$APPLE_ISSUER_ID
firebase functions:config:set apple.private_key="$APPLE_PRIVATE_KEY"
```

The `BUNDLE_ID` constant in `functions/appleIAP.js:7` must match the
`appId` in `capacitor.config.ts` and the bundle ID in Apple's App
Store Connect. Drift breaks signature verification silently.

### Stripe (Cloud Functions only — server-side keys)
```
firebase functions:config:set stripe.secret_key=$STRIPE_SECRET_KEY
firebase functions:config:set stripe.webhook_secret=$STRIPE_WEBHOOK_SECRET

# Server-side price allowlist (PR D — audit P0 #2). The CHECKOUT
# endpoint rejects any priceId not in this allowlist. Setting only
# the prices you actually sell here is the failsafe.
firebase functions:config:set stripe.price_id_monthly=price_xxxxx
firebase functions:config:set stripe.price_id_yearly=price_xxxxx
firebase functions:config:set stripe.price_id_lifetime=price_xxxxx   # optional
```

---

## Test commands

| Command | Scope |
|---|---|
| `npm run lint` | ESLint over TypeScript + TSX |
| `npx tsc --noEmit` | TypeScript type check (project + functions are separate) |
| `npm run test` | Vitest unit tests (`src/**`) |
| `npm run test:watch` | Vitest watch mode |
| `npm run test:e2e` | Playwright E2E (requires `npm run preview` server) |
| `npm run test:e2e:ui` | Playwright interactive UI |
| `npm run build` | Production Vite build (also runs `tsc -b`) |

Functions tests are excluded from the root Vitest run by
`vitest.config.ts:21`. Cloud Function unit tests are a separate
infrastructure ticket (audit P0 #1 follow-up).

---

## Firebase setup

### First-time configuration

1. Create the Firebase project (or use the existing
   `adaptive-fitness-af8bb`).
2. Enable Authentication providers: Email/Password, Google, Apple
   (the Apple provider needs the Services ID + Team ID registered
   in Apple Developer).
3. Create the Firestore database (production mode).
4. Enable Cloud Storage.
5. Deploy Firestore + Storage rules:
   ```bash
   firebase deploy --only firestore:rules,storage
   ```
6. Deploy Cloud Functions:
   ```bash
   cd functions && npm install && cd ..
   firebase deploy --only functions
   ```

### App Check setup

See `docs/app-check-rollout.md` for the full staged-rollout plan.
Today web uses reCAPTCHA v3; native attestation is unwired
(audit P0 #6 — code-side injection point shipped in PR F, plugin
install + enforcement flip are the remaining manual steps).

### Local emulator

Recommended for safe iteration on rules / Cloud Functions / payment
webhooks without touching production.

```bash
npm install -g firebase-tools
firebase emulators:start
```

Connects automatically from `src/lib/firebase.ts` when
`VITE_USE_FIREBASE_EMULATOR=true` is set in `.env.local`.

---

## Capacitor — iOS / Android builds

### iOS

Requires macOS + Xcode 15+.

```bash
npm run build            # produces dist/ for Capacitor to bundle
npx cap sync ios
npx cap open ios         # opens Xcode workspace
```

In Xcode:
- "Signing & Capabilities" → your team must be selected.
- App Attest capability must be added (App Check rollout).
- Push Notifications capability if you ever wire FCM (not currently
  enabled).
- Build → Archive → Distribute via TestFlight.

### Android

Requires Android Studio.

```bash
npm run build
npx cap sync android
npx cap open android
```

Generate a signed APK / AAB from Android Studio's Build menu.

### Native plugins currently used

- `@capacitor/local-notifications` — meal / workout / streak
  reminders.
- `@capacitor/core` — platform detection.
- `cordova-plugin-purchase` (or `@capacitor-community/in-app-purchases`)
  — wired by `functions/appleIAP.js`. Confirm the installed
  version matches the expected `IAPTransaction` shape.

### Native plugins planned

- `@capacitor-firebase/app-check` — native attestation
  (see `docs/app-check-rollout.md`).
- `@capacitor-community/background-geolocation` — durable run
  tracking (audit P1 #9 Option B).

---

## Release checklist

1. **Pre-flight:**
   - `npm run lint` clean
   - `npx tsc --noEmit` clean
   - `npm run test` all green
   - `npm run build` succeeds
   - `npm run test:e2e` against a clean `npm run preview` server
2. **Versioning:** bump `version` in `package.json` (drives
   `__APP_VERSION__` global).
3. **Web deploy:**
   - `npm run build`
   - `firebase deploy --only hosting` (or push to `main` to
     trigger GitHub Pages workflow at `.github/workflows/deploy.yml`)
4. **Functions deploy (if `functions/**` changed):**
   - `firebase deploy --only functions`
   - The `.github/workflows/deploy-functions.yml` workflow handles
     this automatically on push.
5. **Rules deploy (if `firestore.rules` or `storage.rules` changed):**
   - `firebase deploy --only firestore:rules,storage`
6. **Native release:**
   - iOS: archive + upload via Xcode → TestFlight → external
     testers (24h soak) → App Store submission.
   - Android: signed AAB → Play Console internal testing → closed
     testing → production.

---

## Incident runbook

### Symptom: cost spike on Vertex AI

Cause: AI quota bypass or kill switch failed to fire.

Action:
1. Open Firebase console → Remote Config (or `config/flags` doc).
2. Set `geminiEnabled = false`. The change propagates within ~60s
   and both `analyzeFood` / `analyzeFoodText` return 503 before
   touching Vertex.
3. Inspect Cloud Logging for `Quota check error` lines —
   PR C made `checkMonthlyQuota` fail-closed, so the only way to
   spike costs is a kill-switch failure or a deliberate override.
4. Confirm rollback by hitting the function from a test client;
   should return 503.

### Symptom: user reports lost Pro entitlement

1. Look up the user's uid in Firestore → `users/{uid}`.
2. Inspect `subscriptionTier`, `subscriptionUpdatedAt`,
   `stripeSubscriptionId` / `appleOriginalTransactionId`.
3. Cross-reference against the relevant webhook history:
   - Stripe → `stripeEvents/{event.id}` (PR D dedup records).
   - Apple → `appleNotifications/{notificationUUID}` (PR D).
4. If a stale `subscription.deleted` event downgraded an active
   user, manually flip `subscriptionTier: "pro"` on the user doc
   and write `subscriptionUpdatedAt: <now-as-unix-seconds>` so
   the next legitimate event isn't rejected as stale.
5. Open a support ticket with Stripe / Apple if the event ordering
   itself looks wrong.

### Symptom: notification permission won't grant on iOS

1. Settings → Notifications → Tropos → check granted.
2. If granted but reminders don't fire: in-app diagnostics
   (Settings → Notifications) → "Send test" button (PR I).
3. If test fires but real reminders don't: check the relevant
   reminder hook's `schedule.at` payload via
   `getPendingNotifications()` from `src/lib/notifications.ts`.
4. Common cause: iOS Focus / DND filter applied to Tropos. Ask
   the user to whitelist.

### Symptom: App Check rejection rate spikes after enforcement flip

1. Firebase console → App Check → Recent requests → filter by
   "rejected".
2. Identify the version cohort (web v1.x.x / iOS build YYY).
3. If a single old build is the offender: don't roll enforcement
   back; let them upgrade.
4. If across multiple builds: rollback per
   `docs/app-check-rollout.md` Phase 4.

### Symptom: rollback a native release

1. iOS: App Store Connect → versions → submit a new build with
   the previous version's commit OR mark the broken version as
   "removed from sale".
2. Android: Play Console → release dashboard → halt rollout +
   re-promote previous release.
3. Web: revert the merge commit on `main`; GitHub Pages workflow
   redeploys within ~3 minutes.

---

## Audit-driven follow-ups

`docs/audit-improvements.html` (PR A from the May 2026 audit cycle)
lists prioritised production-hardening work. PRs C through J of
that cycle have shipped at the time of writing; known deferred
items:

- Authenticated E2E coverage via seeded auth fixture (audit PR B
  follow-up).
- Functions-side test runner (audit P0 #1 / #2 / #3 emulator tests).
- Native App Check plugin install + enforcement flip (see
  `docs/app-check-rollout.md`).
- Native background GPS via
  `@capacitor-community/background-geolocation` (audit P1 #9
  Option B).
- Active-run draft recovery (audit P1 #8).
- Firestore rules tests + challenge write hardening (audit P1 #11).
- Repeating native notification schedules (audit P1 #10
  enhancement).
- Settings optimistic-revert wiring at every consumer (audit P1
  #7 follow-up — contract is in place, callsites untouched).
- Food AI text portion preservation (audit P1 #15).
- Operator diagnostics route (audit P2 #17).
- Design-system long-tail sweep (audit P2 #18).

Each is its own ticket. The audit doc is the source of truth for
priority / acceptance criteria.

---

## Branch + collaboration workflow

The repo uses a simple branch-per-task model. Two assistants
(Claude + Codex) plus a human owner contribute via PRs.

### Codespaces / fresh checkout

```bash
git checkout work
git remote add origin git@github.com:lemmonchess333/Maiin.git
git push -u origin work
```

### Day-to-day loop

```bash
git checkout -b claude/<task-shortname>   # or codex/, or your name
# ... make changes ...
git add .
git commit -m "your message"
git push -u origin claude/<task-shortname>
# open a PR from claude/<task-shortname> → main
```

### Resolving cross-branch conflicts

If two branches edit the same lines, Git raises a merge conflict
on the second one to merge. Convention: rebase the later branch
on `main` before merge, resolve in your editor, force-push with
`--force-with-lease`.

```bash
git checkout <your-branch>
git fetch origin
git rebase origin/main
git push --force-with-lease
```

---

## Project conventions

See `CLAUDE.md`. Key invariants enforced there:

- One Button / IconButton / Dialog / BottomSheet / Spinner /
  ErrorState / EmptyState primitive each — don't roll your own.
- `THEME` object in `src/lib/theme.ts` for chart colours.
- Numeric displays use `JetBrains Mono` + `tabular-nums`.
- Reduced-motion guarded via `useReducedMotion` hook.
- Path alias: `@/` → `src/`.
- Base path: `/Maiin/` (for GitHub Pages).

---

## License

Private. All rights reserved.
