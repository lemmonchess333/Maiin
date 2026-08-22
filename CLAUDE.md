# Tropos — Adaptive Fitness App

## Quick Reference

```bash
npm run dev          # Start local dev server (Vite)
npm run build        # TypeScript check + Vite production build
npm run lint         # ESLint (TS/TSX only, functions/ ignored)
npm run test         # Vitest unit tests
npm run test:watch   # Vitest watch mode
npm run test:e2e     # Playwright E2E tests
npm run test:e2e:ui  # Playwright E2E tests (interactive UI)
```

## Tech Stack

- **Frontend:** React 19 + TypeScript 5.9 + Vite 7
- **Styling:** Tailwind CSS v4 (via @tailwindcss/vite plugin)
- **Routing:** React Router v7
- **Backend:** Firebase 12 (Auth, Firestore, Cloud Functions, Storage)
- **Charts:** Recharts 3
- **Maps:** MapLibre GL 5
- **Animation:** Framer Motion 12
- **PWA:** vite-plugin-pwa + Workbox
- **Native:** Capacitor (iOS/Android)
- **Payments:** Stripe (@stripe/stripe-js)
- **Drag & Drop:** @dnd-kit (sortable exercise lists)
- **Barcode:** @zxing/browser (food barcode scanning)
- **Utilities:** clsx + tailwind-merge, date-fns 4, html-to-image, canvas-confetti
- **Testing:** Vitest 4 + React Testing Library + jsdom (unit), Playwright (E2E)

## Project Structure

```
src/
├── components/         # Shared UI components
│   ├── analytics/      # Performance charts & stats
│   ├── home/           # Home screen cards & widgets
│   ├── nutrition/      # Nutrition UI (HealthScore, Water, Barcode, Serving)
│   ├── program/        # Workout program builder (ExercisePicker, CustomDayBuilder)
│   ├── progress/       # Progress tracking charts (TrendWeight, Energy, CalorieBalance)
│   ├── run/            # Running feature components
│   ├── settings/       # Settings sections
│   └── social/         # Social feed, activity cards
├── features/           # Feature modules (see "Feature Modules" below)
│   ├── challenges/     # Challenge system
│   ├── goalSpace/      # Goal Spaces / Circles
│   ├── partnerStreak/  # Partner bonds + shared-day streaks
│   ├── program/        # Workout program engine (engine, templates, scheduler)
│   ├── run/            # Run-surface feature modules
│   ├── spaces/         # Space definitions (incl. race spaces)
│   └── streaks/        # Streaks & badges
├── hooks/              # Custom React hooks
│   └── __tests__/      # Unit tests for hooks/
├── lib/                # Pure business logic & utilities
│   └── __tests__/      # Unit tests for lib/
├── pages/              # Route-level page components
├── styles/             # CSS tokens, component styles, animations
├── utils/              # Helpers (calorie balance, formatters, weight trend)
│   └── __tests__/      # Unit tests for utils/
└── App.tsx             # Router + error boundary + lazy loading
functions/              # Firebase Cloud Functions (plain JS, Node 20)
e2e/                    # Playwright E2E tests (smoke, navigation, a11y, PWA)
```

## Architecture Notes

- **All pages are lazy-loaded** via `lazyRetry()` wrapper in App.tsx (handles stale cache)
- **Manual chunks** in vite.config.ts: firebase-auth, firebase-db, charts, vendor, maplibre, motion, date-fns, barcode, body-highlighter, stripe
- **Path alias:** `@/` maps to `src/`
- **Base path:** `/Maiin/` (for GitHub Pages deployment)
- **Offline support:** `src/lib/offlineQueue.ts` queues writes when offline
- **Error boundaries:** `RouteErrorBoundary` (page-level) and `SectionErrorBoundary` (card-level)
- **Route prefetching:** `PREFETCH_MAP` in App.tsx preloads adjacent pages via `requestIdleCallback`
- **Auth routing:** Three route sets — unauthenticated (Login), onboarding incomplete (Onboarding), authenticated (full app)
- **App version:** Defined via `__APP_VERSION__`, read from `package.json` at build time

## Pages (src/pages/)

| Page                 | Route          | Description                                                                |
| -------------------- | -------------- | -------------------------------------------------------------------------- |
| `Home.tsx`           | `/`            | Main dashboard — WeekStrip, hero cards, energy, insights                   |
| `Food.tsx`           | `/food`        | Food/meal logging with camera, NL parsing, barcode (`/log` redirects here) |
| `History.tsx`        | `/history`     | Workout & run history with analytics charts                                |
| `Program.tsx`        | `/program`     | Workout program builder & scheduling                                       |
| `Run.tsx`            | `/run`         | Active GPS run tracking (full-screen, no nav)                              |
| `RunSummary.tsx`     | `/run-summary` | Post-run stats & map review                                                |
| `RunDetail.tsx`      | `/run/:runId`  | Historical run detail view                                                 |
| `Social.tsx`         | `/social`      | Social feed, Circles/Spaces, leaderboards                                  |
| `UserProfile.tsx`    | `/user/:uid`   | User profile viewing                                                       |
| `Settings.tsx`       | `/settings`    | User settings & preferences                                                |
| `Onboarding.tsx`     | `*` (fallback) | Multi-step setup flow (shown when onboarding incomplete)                   |
| `Login.tsx`          | `*` (fallback) | Authentication (Email, Google, Apple) (shown when unauthenticated)         |
| `PrivacyPolicy.tsx`  | `/privacy`     | Legal                                                                      |
| `TermsOfService.tsx` | `/terms`       | Legal                                                                      |

## Key Business Logic (src/lib/)

| File                      | Purpose                                                        |
| ------------------------- | -------------------------------------------------------------- |
| `performanceEngine.ts`    | Weekly performance index (0-100), load bands, deload detection |
| `tdee.ts`                 | Base TDEE calculation                                          |
| `phaseNutrition.ts`       | Day-type specific macro adjustments (lift/run/rest)            |
| `calculateDailyMacros.ts` | Daily macro target computation                                 |
| `gps.ts`                  | Haversine, pace, splits, elevation, Kalman filter, GPX export  |
| `paceTrends.ts`           | Running pace trend detection (PR/improving/consistent)         |
| `guidedRun.ts`            | Guided run logic & coaching                                    |
| `weather.ts`              | Weather API integration for runs                               |
| `privacyZones.ts`         | GPS privacy zone detection for runs                            |
| `prTracking.ts`           | Personal record tracking system                                |
| `scheduleUtils.ts`        | Weekly schedule generation (lift/run/rest)                     |
| `exercises.ts`            | Exercise database                                              |
| `workoutTemplates.ts`     | Workout template library                                       |
| `nlFoodParser.ts`         | Natural language food parsing                                  |
| `voiceFoodParser.ts`      | Voice-based food parsing                                       |
| `socialApi.ts`            | Firestore social operations (feed, kudos, follow)              |
| `shareCardGenerator.ts`   | Share card image generation (html-to-image)                    |
| `analytics.ts`            | Analytics computation                                          |
| `subscription.ts`         | Pro subscription handling                                      |
| `firebase.ts`             | Firebase app initialization & Firestore/Auth/Storage exports   |
| `auth.tsx`                | AuthProvider, useAuth hook, UserProfile interface              |
| `api.ts`                  | API client helpers                                             |
| `haptic.ts`               | Haptic feedback utility (Capacitor)                            |
| `offlineQueue.ts`         | Queues Firestore writes when offline, flushes on reconnect     |
| `errorReporting.ts`       | Error reporting utilities                                      |
| `logger.ts`               | Structured logging                                             |
| `notifications.ts`        | Push notification setup                                        |
| `types.ts`                | Shared TypeScript type definitions                             |
| `performanceTypes.ts`     | Performance engine type definitions                            |
| `macroConstants.ts`       | Macro/nutrition constants                                      |
| `export.ts`               | Data export utilities                                          |
| `exerciseDemo.ts`         | Exercise demo/animation data                                   |
| `firestoreGuards.ts`      | Firestore data validation guards                               |
| `funComparisons.ts`       | Fun stat comparison generators                                 |
| `purchaseProvider.ts`     | In-app purchase provider (Capacitor)                           |
| `register-sw.ts`          | Service worker registration                                    |
| `timeAgo.ts`              | Relative time formatting                                       |
| `theme.ts`                | THEME object for chart colours & design tokens                 |
| `utils.ts`                | General utility functions                                      |

## Feature Modules (src/features/)

### goalSpace/ · spaces/ · partnerStreak/ · run/

Four modules that shipped after this section was first written and were
never listed. `goalSpace/` owns Goal Spaces (Circles) — membership,
invites, weekly focus, check-ins. `spaces/` owns the space definitions,
including the race spaces a `raceGoal.eventSpaceId` binds to.
`partnerStreak/` owns partner bonds and shared-day streaks (the SERVER is
the sole writer of bond streak state — see the QA section). `run/` holds
run-surface feature modules.

### challenges/

- `useChallenges.ts` — Challenge data hook
- `ChallengeList.tsx` / `ChallengeCard.tsx` — Challenge UI components
- `__tests__/useChallenges.test.ts`

### streaks/

- `useStreaks.ts` — Streak calculation & management
- `badges.ts` — Badge earning logic
- `BadgeGrid.tsx` / `BadgeEarnedModal.tsx` — Badge display & celebration UI
- `__tests__/badges.test.ts`

### program/

- `programEngine.ts` — Periodized workout program generation
- `programTypes.ts` — TypeScript interfaces for program state
- `useProgram.ts` — Program state management hook
- `templates.ts` — Workout template library
- `variationBank.ts` — Exercise variation database
- `runScheduler.ts` — Goal-driven run scheduling engine (freeform, structured, race prep)
- `matchTemplate.ts` — Template matching logic

## Custom Hooks (src/hooks/)

**Data & State:**
`useFirestore`, `useMeals`, `useWorkouts`, `useWaterLog`, `useShoes`, `useFoodFavourites`

**Running & GPS:**
`useGPS`, `useRunTimer`, `useRunningStats`, `useSessionPlayer`, `usePrivacyZones`, `useAudioCues`, `useWakeLock`

**Social:**
`useSocialFeed`, `useDiscoverFeed`, `useUnreadCount`, `useBlockedUsers`

**Performance & Analytics:**
`usePerformance`

**Nutrition:**
`useFoodAnalysis`, `useMealReminders`

**UI & UX:**
`useCoachMarks`, `useCountUp`, `useReducedMotion`, `useFocusTrap`, `useOnlineStatus`

**Payments:**
`useStripeCheckout`

## Cloud Functions (functions/)

Runtime: **Node 20** | Language: **Plain JS (CommonJS)**

| Function                        | Trigger                     | Purpose                                                                                            |
| ------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------- |
| `completeOnboarding`            | HTTPS callable              | Onboarding profile + program setup via Admin SDK (bypasses security rules)                         |
| `analyzeFood`                   | HTTPS request               | Vertex AI image-based food analysis                                                                |
| `analyzeFoodText`               | HTTPS request               | Vertex AI text-based food analysis (Pro feature)                                                   |
| `computePerformanceWeek`        | HTTPS callable              | Manual performance rollup                                                                          |
| `weeklyPerformanceRollup`       | Scheduled (Sun 23:15 UTC)   | Automated weekly rollup for active users (30-day window)                                           |
| `dailyPerformanceRefresh`       | Scheduled (daily 02:10 UTC) | Daily performance refresh for recently active users (14-day window)                                |
| `onWorkoutCreated`              | Firestore trigger           | Post-workout: updates lastActiveAt, syncs challenge progress, recomputes performance               |
| `onRunCreated`                  | Firestore trigger           | Post-run: updates lastActiveAt, syncs km challenges, recomputes performance                        |
| `sendPasswordResetLinkCallable` | HTTPS callable (unauthed)   | Forgot-password: Admin-minted set-password link emailed via Resend (works for OAuth-only accounts) |
| `sendVerificationEmailCallable` | HTTPS callable (authed)     | Email verification: Admin-minted verify link for the caller's own email, emailed via Resend        |

Helper: `syncChallengeProgress()` — auto-updates challenge participant progress (workout_count, total_volume, total_km)

## Data Model

- **Firestore collections:** `users/{uid}`, `users/{uid}/meals`, `users/{uid}/workouts`, `users/{uid}/runs`, `users/{uid}/programState`, `users/{uid}/public/profile` (cross-user projection; incl. the opt-in `trainingForSpaceId` race identity), `activities` (public), `goalSpaces`, `challenges`, `challenges/{id}/participants`, `spaces/{id}/members`, `spaces/{id}/posts` (+ `posts/{id}/likes` and `posts/{id}/comments` — both SERVER-written via callables; clients read only)
- **Auth:** Firebase Auth (Email, Google, Apple Sign-In)
- **User profile:** Defined in `src/lib/auth.tsx` as `UserProfile` interface
- **Feed items:** Defined in `src/hooks/useSocialFeed.ts` as `FeedItem` / `ActivityData`

## Conventions

- **Components:** Default exports, PascalCase filenames
- **Hooks:** Named exports, `use` prefix, camelCase filenames
- **Lib functions:** Named exports, camelCase filenames
- **Tests:** Colocated in `__tests__/` directories, `*.test.ts` suffix
- **Styling:** Tailwind utility classes, `THEME` object from `src/lib/theme.ts` for chart colors
- **Icons:** lucide-react (import individual icons)
- **Toasts:** sonner (`toast.success()`, `toast.error()`)
- **UI patterns:** Drawer (vaul), bottom sheets, pressable cards
- **Class names:** `clsx()` + `twMerge()` for conditional/merged Tailwind classes
- **Drag & drop:** @dnd-kit for sortable exercise lists
- **Dates:** en-GB day-before-month ("22 Aug", "Saturday 23 August") via the
  `src/utils/formatters.ts` helpers. Locale-less `toLocaleDateString` follows
  the DEVICE (renders "Aug 22" on a US phone) and month-first date-fns
  patterns ("MMM d") are the same bug in disguise — both are banned by
  `src/utils/__tests__/dateTreatment.test.ts`. Chart-axis "22/8" numerals are
  their own compact register and exempt.
- **Units:** spaced — "60 kg", "5.2 km", "400 m", "2,633 cal"
  (`src/utils/__tests__/unitTreatment.test.ts` bans unspaced kg/km, including
  the `${x}kg` template form). Two named exceptions: grams on the food
  surface stay unspaced ("128g" — MacroColumn's documented house style), and
  `ShareCardRenderer`'s compact forms ("12.3km") are a deliberate
  space-constrained variant on the rasterised card.

## Testing

### Unit Tests (Vitest)

- Config: `vitest.config.ts`, setup: `src/test/setup.ts`
- Colocated in `__tests__/` beside the code: `src/lib/`, `src/hooks/`, `src/utils/`,
  and each `src/features/*` module. Hook tests drive Firestore through the one
  fake (ADR-0009) — `vi.mock("firebase/firestore")` bare, then `seedFirestore`.
- Deliberately NOT counted here. Every file count this document used to carry
  had drifted by 3–7× (87 components → 319, 31 hooks → 75, 46 lib modules →
  198). A number nothing checks is a claim that rots; prefer describing the
  shape, or add a test that pins the number.
- Run: `npm run test` (single run) or `npm run test:watch` (watch mode)

### E2E Tests (Playwright)

- Config: `playwright.config.ts`
- Test files in `e2e/`: `smoke.spec.ts`, `navigation.spec.ts`, `accessibility.spec.ts`, `pwa.spec.ts`
- Run: `npm run test:e2e` or `npm run test:e2e:ui` (interactive)

## CI/CD

- **deploy.yml:** Builds and deploys to GitHub Pages on push to `main`
- **deploy-functions.yml:** Deploys Cloud Functions when `functions/**` changes
- **deploy-firestore.yml:** Deploys Firestore security rules
- **Firebase project:** `adaptive-fitness-af8bb`

### Cloud Functions deploy — known gotchas

These lessons cost a full day to find. Read before changing the deploy pipeline.

- **firebase-tools deduplicates uploads against the deployed bundle hash.** If a `functions/**` PR doesn't change any `.js` files (e.g. a docs-only PR like a CHANGELOG, README, or new markdown), the workflow triggers but `firebase deploy --only functions` will skip the actual upload and report success. Production stays on the previous bundle — but CI is green and nothing surfaces the drift. **deploy-functions.yml has a `Force unique bundle hash` step** that prepends a per-commit comment marker to `functions/index.js` before deploy, defeating the dedup. Do not remove that step; if you must, add a different mechanism that guarantees a fresh bundle hash per workflow run.
- **A cascade of failed deploys followed by one docs-only success is the worst case.** If billing or auth issues cause N consecutive deploys to fail at the deploy step, then the next PR happens to be docs-only and the dedup logic kicks in, the workflow reports success but production has been stranded for the entire N-day window. The build-marker step prevents this scenario, but the **`workflow_dispatch` trigger** is the escape hatch — re-run the workflow manually from the Actions UI without pushing a new commit.
- **Blaze plan is required for any Cloud Functions deploy.** Scheduled functions (Pub/Sub), Apple/Stripe webhook secrets, and the build-step machinery all live behind Blaze. If billing is detached (card expiry, manual unlink, etc.), every functions/-touching PR fails with `Extensions require the Blaze plan` — which is misleading; Tropos has no extensions, the error is firebase-tools' generic guard for any Blaze-only feature.
- **`maxInstances` is mandatory on every HTTP and Firestore-trigger function.** Cloud Functions v1 has NO default cap; a runaway client / DDoS / accidental call-in-render loop can spin up thousands of containers and rack up hundreds of pounds in hours. `functions/index.js` declares three tiers (`DEFAULT_HTTP_CAP = 100`, `ADMIN_HTTP_CAP = 10`, `TRIGGER_CAP = 50`) and uses `functions.runWith({...})` on each export. Don't add a new HTTP/trigger function without one of those caps.
- **Production deploy verification:** the only conclusive proof a function deployed is to view the deployed source in Firebase Console (https://console.cloud.google.com/functions/details/us-central1/<name>/source). CI green is a _necessary but not sufficient_ signal — see the dedup gotcha above. After a deploy that touches `functions/`, spot-check that the deployed source matches main by searching for a recent string (e.g. a new comment from the PR).
- **1st-gen API lives under `firebase-functions/v1`; `functions.config()` is gone.** As of firebase-functions v7, the bare `require("firebase-functions")` resolves to the **2nd-gen** API, and every export here is **1st-gen** (`runWith().https.onCall/onRequest`, `.pubsub.schedule`, `.firestore.document().onCreate`, `https.HttpsError`, `logger`). They import from `firebase-functions/v1` — keep new 1st-gen functions on that import or they silently become `undefined` triggers. `functions.config()` **throws** in v7 (the Cloud Runtime Config API was shut down 2025-12-31); secrets now come from Secret Manager via `firebase-functions/params` `defineSecret(...)`, listed in each function's `runWith({ secrets: [...] })`, and read at runtime as `process.env.<NAME>`. Provision before deploy with `firebase functions:secrets:set <NAME>` — **a deploy referencing an unprovisioned bound secret fails**, which is the safety gate. Current bound secrets: `STRIPE_SECRET_KEY` (deleteMyAccount, createCheckoutSession, stripeWebhook, all 3 Apple callables), `STRIPE_WEBHOOK_SECRET` (stripeWebhook), `APPLE_KEY_ID/ISSUER_ID/PRIVATE_KEY` + `BILLING_HMAC_SECRET` (+ `BILLING_PREVIOUS_HMAC_SECRET` during rotation only) on `restoreApplePurchases`, `RESEND_API_KEY` (sendPasswordResetLinkCallable — password-reset email delivery). Non-secret config (`ADMIN_UIDS`, `RESEND_FROM`) stays a plain env var — no binding needed. `npm run secrets:check` (in `functions/`) prints the authoritative provision list from the source.
- **A functions deploy needs the whole GCP readiness chain, not just Blaze + a fresh bundle.** The Secret Manager API must be **enabled** AND **propagated** before deploy. Enabling it (`gcloud services enable secretmanager.googleapis.com`) returns _before_ the data plane actually answers, so a deploy that races straight ahead still 403s — the CI fix was two steps: enable the API (`1a529ec`), then **wait for propagation** before `firebase deploy` (`b953eac`). If a functions deploy 403s on secrets right after an org/billing/API change, suspect propagation lag, not config.

### Account-deletion safety rails

The deletion executor (`functions/accountDeletion.js`) is irreversible by design. Several rails exist; understand them before changing this code:

- **Kill-switch:** `system/config.deletionExecutorEnabled = false` in Firestore halts all new deletions before any side effect. The executor reads this on every invocation and throws `executor-disabled` if explicitly false. Missing field / missing doc / read failure all default to ENABLED (lock-out defence). To pause deletions in an incident, write that field as a **boolean** (Firebase Console renders `"false"` as a string by default — the malformed-type case logs `deleteAccount.kill_switch_malformed` and fails open).
- **Step ordering invariant:** Firestore + Storage first, Auth user LAST. The pre-W1f client-side deletion ran `auth.deleteUser` first, then orphaned Firestore writes ran as anon and either hit permission-denied or partially succeeded — leaving "ghost user with orphan data". The current executor preserves the inverse: any throw before step 7 leaves the user with valid credentials so they can retry.
- **Client-side recovery paths:** `AccountSection.tsx` handles four post-call states explicitly — `executor-disabled` (kill-switch active), `requires-recent-login` (with a one-tap Sign Out action in the toast), `auth/user-not-found` (already-deleted, auto-signs-out), and successful deletion (also auto-signs-out so client state matches server state). Do not collapse these into a single generic toast — each state has a different recovery action.

## Design for the user base, not the current state

Tropos is pre-launch with one user. That is a temporary condition. Every UX, engineering, and architecture decision must be made for the eventual user base (1000+ users), not for the convenience of the current single-user reality.

- **Cold-start states are recurring for the user base.** Every new user lives in the cold-start window. "It's only one transient window for one user" is a fallacious framing — across 1000 users, the cold-start state is one of the most-seen states in the app. Design it as carefully as the steady state.
- **Edge-case user segments are real.** 3-day strength programmes, light-trainers (2-3 days/week), lapsed-and-returning users, vacation gaps, illness gaps — each represents a real user segment, not a rare exception. A design that locks any of them out of a feature is a bug.
- **Never use "pre-launch" or "I'm the only user" as justification to defer or skip a design decision.** If a decision is hard, it's hard. Solve it now while the surface area is small, not later when migration cost rises.
- **"Ship simple, iterate from real data" is not "ship broken, hope users tolerate it".** Ship the simplest thing that works correctly for the user base, not the simplest thing for the developer. The simplest correct answer is almost always more work than the easiest answer — that work is the actual job.
- **Reject reasoning that appeals to single-user transience.** If a stress-test argument rests on "it's only me for now" or "it's just for a few days," that argument is invalid by construction.

## Build for the iOS app, not just the web

Tropos ships as a native Capacitor iOS (and Android) app — that is the primary distribution channel, not the GitHub Pages web build. Every feature, integration, and infrastructure decision must work on the native app where it's technically possible, not just in the browser. A capability that only functions on the web — when the real users are on iOS — is wasted work, not a shipped feature.

- **Parity runs BOTH ways — the web build is the active development & preview surface.** Tropos is currently built and previewed on the web app, so every feature must render and be exercisable on web _and_ be wired to work on native iOS. Don't ship web-only (invisible to the real iOS users); equally, don't ship native-only (invisible in the web preview loop the developer is actually using). When a capability can only fully execute on-device (a Capacitor plugin, a native SDK), still leave a **web-visible path** — a fallback, a stub, or the same UI with the native call no-op'd — so the feature can be seen and reviewed on web _before_ it's pushed to iOS. "It only shows up once it's on a device" is a broken preview loop.

- **Default to platform parity.** When wiring a third-party SDK, browser API, or build-time integration, check up front whether it works inside the native WKWebView / Capacitor shell. If the web SDK won't run natively (e.g. Firebase Analytics web SDK, reCAPTCHA, anything depending on browser-only APIs), find the native equivalent (a Capacitor plugin, the native Firebase SDK via `GoogleService-Info.plist` / `google-services.json`, etc.) **as part of the same task** — don't ship the web half and call it done.
- **If native parity is genuinely deferred, say so loudly and leave the seam.** It's acceptable to land the web path first when the native path needs a plugin/native-project change that can't be done in the current environment — but only if (a) the limitation is stated explicitly to the user at decision time, not discovered later, and (b) the code leaves a native injection point (the `appCheck.ts` web/native split + `setNativeAppCheckProvider` seam is the reference pattern). A silent web-only implementation that reads as "done" is the failure mode to avoid.
- **Don't spend effort on web-exclusive polish for an iOS-first product.** Weigh the value of any web-only work against the fact that the audience is on the native app. "It works on the web build" is not the bar; "it works where the users are" is.
- **The analytics layer is the reference example of this rule done right.** The provider in `analyticsProvider.ts` delivers on BOTH platforms behind one seam: web via the `firebase/analytics` SDK, native via the `@capacitor-firebase/analytics` plugin → native Firebase SDK. Each loads in its own dynamic-import chunk so neither platform ships the other's code. The only remaining native step is operator-only — add `GoogleService-Info.plist` to the Xcode project and `cap sync ios`; the web env var (`VITE_FIREBASE_MEASUREMENT_ID`) drives web, the plist drives native.

## Plan-file lock discipline

Locked decisions live in `.claude/plans/programme-run-followups.md`. Each row is the source of truth for one decision; future agents read it during audits, grills, and implementation work. **A lock that isn't on main is invisible to the next agent.**

Two-orphan investigation on 2026-05-24 surfaced this rule. Hist5 (`1aaa7bb`) and PI5 (`36fcf6e`) were both fully-articulated ~15KB lock rows — written, committed, and orphaned on ad-hoc branches that never merged. Their implementations shipped against those orphaned specs through PRs #590, #591, #638-#647. From main's perspective, the design tree appeared undocumented, and an audit had to re-derive the "what was decided?" question by reading code comments and reverse-engineering the design from PR titles. Recovery PR #720 cherry-picked both rows back to main with `STATUS 2026-05-24 — orphaned lock recovered` markers.

- **Lock commits go on their own branch and get pushed and PR'd immediately.** Not "after the next coding session," not "once I've thought it over more" — immediately, even if the PR is a single-commit. The branch name should be `claude/lock-<id>` (e.g. `claude/lock-hist5`) so the intent is identifiable from the branch listing, and the PR should be small enough that review is one read-through.
- **Never piggyback a plan-file lock on a branch named for an unrelated purpose.** Hist5 was orphaned on `claude/pr-k-taper-cap-and-label` — a branch about a taper/cap/label feature. The plan-file commit got smuggled into an unrelated branch and lost when the branch closed without merging. If you start a coding branch and realise mid-session you also want to lock a decision, switch to a fresh `claude/lock-<id>` branch for the lock; don't slip it into the coding PR.
- **Before ending a session that wrote a lock, verify it's in main's ancestry.** `git merge-base --is-ancestor <lock-sha> origin/main && echo IN || echo ORPHAN` resolves this in one line. If the lock commit isn't an ancestor of `origin/main`, the lock is effectively orphaned the moment the session ends.
- **Locks are append-only.** Once a row is in the plan file, don't rewrite the body in place — add a `STATUS YYYY-MM-DD` line at the row tail (the pattern Run7 / Soc5 / Home2 / Hist5 / PI5 use). Inline edits destroy the record of what was originally decided vs what got iterated later, and they make the row impossible to diff against historical context.
- **If you discover an orphaned lock, recover it before doing other work in the affected arc.** Auditing or grilling against the orphan-implied state is wasted effort — the lock that was actually written is the truth, and re-deciding from scratch produces drift even when you arrive at the same conclusion. Search with `git log --all --oneline -- .claude/plans/programme-run-followups.md | head -30` before assuming a decision was never made.

## Recurring-mistake rules (mined from git history, 2026-06-02)

These are distilled from the project's own rework history — classes of mistake that got fixed **more than once** across different PRs/arcs. Each is a standing rule, not a one-off. Cited shas are the corrections that prove the pattern recurred. (This repo's PRs are self-merged via Claude Code with no GitHub review dialogue, so the rework commits — not review comments — are where recurring corrections live.)

- **The tested copy does not prove the running copy.** When the same business rule lives in two places — client `src/lib/*` vs `functions/*` (e.g. `performanceEngine.ts` ↔ `performanceEngine.js`), or any value re-derived in a second module instead of read from where it's already computed — treat the non-canonical copy as the prime drift suspect. Consolidate to one source of truth, or add a test that pins the copy that actually runs; never assume green client tests prove the server's behaviour. (`62a9cfa` server engine diverged from the tested client engine and inflated new-user PI; `a169336` deleted a `useHomeData` re-derivation; `e1b0296` nutrition-phase regression; Run9 3b server mirror of `resolveRecoveryExit`.)
- **Persist every mirrored and derived field in the same write.** A persisted field usually has consumers that read it from a _different_ location, or derive other fields from it. Enumerate them before you write. A write to `programState` must mirror into `profile.program.*` (consumers read the profile copy); writing `raceGoal` must materialize `runMode`; changing goal/rate must materialize the nutrition phase. Don't leave a parallel store stale for "something else" to reconcile later. (`5caad06` equipment/injuries/split not persisted to profile; `e1b0296` editor wrote `programState.goal` but macros read `profile.program.goal`; `3087ac5` `raceGoal` written without derived `runMode`; `4db6cb7` goal-weight didn't drive the phase.)
- **Never call raw `setDoc`/`addDoc`/`updateDoc`.** Always route through the guarded wrappers in `src/lib/firestoreWrite.ts` — they strip `undefined` (which Firestore rejects outright) and survive offline-queue replay (a raw write that fails online fails forever on every flush). Any **new persisted profile field** must also be added to the `functions/profileSanitizer.js` allow-list, or the Cloud-Function write silently drops it. (`5061046` migrated ~25 raw call sites + fixed safeSave/safeMerge re-failing on every offline flush.)
- **Treat every Firestore trigger as at-least-once and concurrent.** `onCreate`/`onWrite` handlers re-fire on retry and can run in parallel. Any read-modify-write inside one must run in a `runTransaction` AND guard re-delivery with a per-source idempotency marker — MIN/MAX-style updates are the only naturally-safe exception. `syncChallengeProgress` had to be fixed twice: once for a lost-update race (`23369ef`), once for double-counting on retry (`dc3e4a6`).
- **Never mix local-date and UTC operations in one calculation.** Use the existing `localWeekKey()` / local-midnight helpers consistently for any day/week bucketing, and pin scheduled functions to explicit **UTC** — a Europe/London schedule anchor silently shifts an hour under BST. (`5ad5794` bucketed weekly run-stats into the wrong week near midnight in non-UTC zones; PR #815 BST shifted the rollup/refresh schedules; `8b856fa` captures `profile.timezone` on boot.)
- **A negative assertion under `waitFor` proves nothing unless something anchors it.** `await waitFor(() => expect(x).toBeNull())` is satisfied on its FIRST poll by the initial state and returns before the awaited work has landed — so it passes at t=0, and a value that becomes wrong _asynchronously_ is invisible to it. Anchor on a positive first (wait for `loading` to flip, or for the other account's value to appear), or hold the read with `deferReads()` / `releaseRead()` and assert after releasing. Two instances so far, both pinning documented security properties that nothing was actually holding: `usePushSettings` uid-safety passed with EVERY uid guard deleted, and 5 of `useLastRunType`'s 7 tests passed while the hook offered a repeat row to every user including signed-out ones. Both were found by mutating the hook to go wrong AFTER the read — the mutation shape a synchronous probe misses.

- **`onAuthStateChanged` fires several times per sign-in.** Debounce one-time / side-effecting work (maintenance backfills, etc.) behind a settle timer — a bare `firedRef` guard has a race window during the sign-in settle. Scope any queued or cached writes (offline queue, share queue) by `uid` so they can't leak across an account switch on a shared device. (`9ae1247` debounced the maintenance backfill; PR #820 uid-scoped the offline + share queues.)
- **Deleting a test file is a documentation change too — grep for prose that cites it.** A header saying "this is exhaustively covered by X" keeps steering people away from writing tests long after X is gone, and it reads as authoritative because it names a file and a test count. `useClaimMap.test.ts` claimed the completion predicate was "exhaustively covered by" `functions/__tests__/scheduledRunCompletion.test.js` (29 tests) + a cross-test; **both were deleted in #1733** and nothing replaced them. So nobody wrote rejection cases, and the locked 70% distance gate ran for months comparing **metres to kilometres** — a marathon slot completable by a 29.5-metre run — with a fully green suite (`b525af6f` fixed the unit, `051e7765` the header). Same shape as PR #1775's `templateId === "race"`: on both, the accept path was fiction and nothing asserted a rejection. When you delete or rename a spec, `rg` its filename across the repo; when you inherit a "covered elsewhere" claim, open the file it names before trusting it.
- **A centrality or cohesion score is a question, not a defect.** Graph metrics (graphify communities, "god nodes") cannot distinguish a deployment manifest or a shared vocabulary from tangled logic. `functions/index.js` scores the worst cohesion in the codebase (0.023) purely because every deployed function must be exported from one entrypoint — the split has now been re-derived and declined **four** times; the standing hold + its reasoning live in `functions/__tests__/triggerMetadata.test.js`. `RUN_TEMPLATES` bridges seven run communities because a shared run vocabulary is exactly what it should be. ADR-0001 already bars the size argument; treat these scores as prompts to go **read**, and expect the answer to often be "correct as-is". (The 2026-08-02 graph run's value was entirely in what reading turned up while chasing its questions — both of its own headline verdicts were "change nothing".)
- **Verify the three design-system invariants that keep drifting back, per-PR — not in periodic sweeps.** Before committing any UI: every numeric display uses `font-mono` + `tabular-nums`; every colour is a `THEME`/token (no hex literals); every interactive element clears 44px via the `Button`/`IconButton`/`Toggle` primitives. These three regress constantly and keep getting swept up after the fact. (`2dec467` + `97a783d` mono/font audits; `9ef01a1` + `82b5266` tokenized stray hex; `f89d34b` whole-app consistency pass; touch-target policy shipped in 5 parts.)

## Meal photos are device-local — a standing invariant, not a preference

Locked as Food9 (2026-08-18), reinstating F3d after Food8 reversed it
silently. **Tropos never stores a meal photo on a server.** The AI-scan
capture is written to the device via `src/lib/foodPhotoStore.ts`
(`food-photos/{uid}/{mealId}.jpg`, `Directory.LibraryNoCloud`) and NO
photo field is persisted to Firestore. `photoUrl` on a meal doc is
legacy-only — pre-Food9 documents keep rendering, nothing writes it.

- **"Device-local" is about RETENTION, not transmission.** The photo is
  still sent to Gemini to be analysed; there is no on-device model. Copy
  that implies the photo never leaves the phone is as false as the copy
  this replaced. Name Google as the processor and the device as the only
  store — `PrivacyPolicy.tsx` and `FoodCameraModal.tsx` both do.
- **Retention is 90 days because `Food.tsx`'s `FOOD_TAP_BACK_DAYS` is 90.**
  Not a product guess. The diary row is the only surface that renders a
  photo and the diary cannot navigate further back, so anything older is
  unreachable. Move one and you must move the other;
  `foodPhotoStore.test.ts` fails until you do.
- **Eviction acts on positive evidence only.** `useMeals` paginates, so
  "this meal is not in the loaded set" NEVER means "this meal is gone".
  Any eviction rule phrased that way deletes live photos for exactly the
  heavy users the feature exists for.
- Reversing this is a lock-level decision. Read the Food9 row first — an
  audit that re-derives it is wasted effort even when it lands in the
  same place, and the last reversal happened by accident precisely
  because nobody read F3d.

## Common Gotchas

- **Typecheck with `tsc -b`, never `tsc --noEmit -p tsconfig.json`.** The
  latter exits 0 on this repo no matter what: the root config is a solution
  file whose work lives in its project references, so `-p` on it checks
  nothing. `npm run build` and CI both use `tsc -b`. Measured against a real
  missing import in `UserProfile.tsx` — `-p` exit 0, `-b` exit 2 with
  `TS2304`. An agent that "verified types" with the `-p` form has verified
  nothing, and CI is the only thing that will say so.
- **Adding an import to a component breaks any suite that mocks that module
  wholesale.** `vi.mock("@/lib/auth", () => ({ useAuth: … }))` makes every
  OTHER export `undefined`, and the failure surfaces at the call site
  (`No "X" export is defined on the … mock`), not at import — so it is
  invisible to a partial local run. Either fix the mock, or make it partial
  with `importOriginal`. Prefer `importOriginal` when the newly-imported
  symbol is a pure helper whose real behaviour the suite asserts: stubbing it
  turns those assertions into claims about the stub. Run the FULL unit suite
  before pushing a change that adds a cross-module import — the touched
  subset will not show it.
- `react-body-highlighter` exports `Muscle` type — cast `mapMuscles()` return to `Muscle[]`
- Recharts v3 Tooltip props: let TypeScript infer `labelFormatter`/`formatter` parameter types
- `useRef` in strict mode requires an explicit initial value argument
- `functions/` is plain JS (CommonJS) — excluded from ESLint TS config
- Firestore `d.data()` returns `DocumentData` — always assert types at boundaries
- Run tracking pages (`/run`, `/run-summary`) render full-screen without the Layout nav wrapper
- `StackedCTACards.tsx` is large (~18KB) — it contains all home hero cards; modify individual sections carefully
- `WaterWave.tsx` + `WaterBubbles.tsx` have complex SVG animations — treat carefully when modifying

## gstack

Use the `/browse` skill from gstack for **all web browsing**. Never use `mcp__claude-in-chrome__*` tools.

### Available Skills

- `/plan-ceo-review` — CEO-level plan review
- `/plan-eng-review` — Engineering plan review
- `/plan-design-review` — Design plan review
- `/review` — Code review
- `/ship` — Ship changes
- `/browse` — Web browsing (use this instead of MCP browser tools)
- `/qa` — QA testing
- `/qa-only` — QA testing only
- `/qa-design-review` — QA design review
- `/setup-browser-cookies` — Set up browser cookies
- `/retro` — Retrospective
- `/document-release` — Document a release

## Tropos Design System

### Visual Identity

- **Aesthetic:** Dark is the DEFAULT theme — a true dark glass aesthetic (bg #121214, surfaces #1A1A1F). It is what new users and the signed-out/Login state see.
- **Light mode:** The opt-in alternate (selectable in Settings → writes `profile.darkMode = false`). It's a clean, warm, iOS-inspired look (#F2F2F7 grouped background, cards on white — minimal and calm with subtle depth, NOT a dark-glass app rendered light). Default-dark is applied pre-React in `public/init.js` (dark unless an explicit `"false"` is stored) and mirrored by the `profile.darkMode` defaults in `src/lib/auth.tsx`.
- **Brand colour:** Purple #7B72E9 — used sparingly for accents, active tab indicators, CTAs, progress bars. Never as full backgrounds except gradient CTA buttons.
- **Sport-coding:** Lifting = purple (#7B72E9), Running = coral (#D4637A). These two colours appear in calendar dots, section labels, icon tints, and contextual cards.
- **Logo:** Purple gradient hexagon with upward chevron cutout. Top-left of home screen with "TROPOS" wordmark.

### Colour System (src/styles/tokens.css + src/lib/theme.ts)

- Purple brand: #7B72E9 (primary), #9590E0 (light), #6560C8 (dark)
- Running coral: #D4637A
- Nutrition orange: #D9884E / #e87316
- Hydration teal: #52A3BD
- Success green: #4DB872 / #22b558
- Icon backgrounds: rgba(123, 114, 233, 0.10) — subtle purple tint
- Card backgrounds: white (light) / #1A1A1F (dark)
- Page background: hsl(240 5% 96%) = ~#F2F2F7 (light) / #121214 (dark)
- Text muted: the theme-aware `--muted-foreground` token (light `240 3.8% 43%`, dark `240 4% 64%`) — tuned to clear 4.5:1 on card, muted AND page background in both themes. The old fixed #8E8E93 was deleted in the DS2 consolidation (2026-08-22, owner-decided): one grey serving both themes measured 2.53–3.26:1 across the light surfaces it rendered on. No fractional `text-muted-foreground/<n>` anywhere — de-emphasis is the type scale's job (banned + pinned in `tokenContrast.test.ts`). In JS/style contexts use `"hsl(var(--muted-foreground))"`.

### Typography (Plus Jakarta Sans + Archivo)

- **Display font:** Plus Jakarta Sans (all UI text)
- **Numeral font:** Archivo (stat numbers — calories, weight, reps, volume). Proportional, not monospace; tabular figures forced on `.font-mono`. Replaced JetBrains Mono (brand bake-off — `docs/visual-audit/bakeoff/DECISION.md`). The `font-mono` utility / `--font-mono` token still means "numbers"; the name is historical.
- **Scale (1.25 modular):**
  - Display: 3rem/48px — hero stat numbers (health score)
  - H1: ~31px — page titles ("Program", "Social", "Analytics")
  - H2: 25px — section headers ("RUNNING", "LIFTING", "NUTRITION")
  - H3: 20px — card titles
  - Body: 16px — standard text
  - Small: 14px — secondary descriptions
  - Micro: 12px — labels, captions, uppercase tracking headers
- **Weight rules:** 800 (extrabold) for hero numbers and page titles. 700 (bold) for section headings and card titles. 600 (semibold) for pill text and button labels. Never mix 700 and 800 in the same visual tier.
- **Numeric displays:** Always use font-mono + tabular-nums for alignment

### Card Patterns

- **Standard card:** bg-card (white), rounded-xl (12px), padding 3-4, shadow-card (very subtle)
- **Hero card (Health Score, Water):** rounded-2xl (16px), padding 4, larger icon (48px container), icon in purple-tinted bg square
- **Compact tile (Weight, Steps):** rounded-xl, padding 3, bg-muted (slightly darker than white), 2-col grid
- **CTA card (Today's workout/run):** rounded-xl, sport-coloured tinted background (8% opacity), Play button pill right-aligned
- **Action pills (Quick Log, Start Run, Log Food):** rounded-xl, sport-coloured tinted bg (6% opacity), icon + 11px semibold label, flex row with equal widths, minimum 44px touch target
- **Section labels:** 10px uppercase with wider letter-spacing, muted colour

### Training plan primitives

The Programme Run section is a **hybrid training cockpit**, not a settings
list. It is built from named, reusable training-plan primitives. These are
NOT considered decorative one-off patterns — they are components, reused
consistently, and part of the design system.

Primitives (all in `src/components/program/`, fed by the pure view model in
`src/lib/runProgrammeViewModel.ts`):

- **`RaceCockpitCard`** — race-prep identity card: readable distance heading
  (Marathon / Half Marathon / 10K / 5K), target date, days-out countdown,
  week N of M, current phase, and a phase rail. The rail reflects the REAL
  engine phases (`getPhaseForWeek`): **Base · Build · Taper · Race** — no
  invented "Peak" segment, so the active highlight always maps to a phase
  the scheduler can emit. Renders ONLY in the race-goal overlay.
- **`SessionCommandCard`** — the "what's next" command surface. Title + meta
  pills + a single primary Start action (its own control, NOT the whole
  card) + an overflow that opens the day sheet. Temporal eyebrow ("Up next"
  / "Due today" / "Tomorrow" / "Pending") — never "Next · Pending".
- **`ProgrammeWeekSelector`** — the one day-navigation primitive per tab
  (`2b4e07b8`, "competing navigators" unification): circular sport-coloured
  day cells (purple lift / coral run) in the Home WeekStrip visual language,
  a real selected-key controller driving the content beneath it. Lift tab =
  split-ordered rotation cursor; Run tab = date-pinned 7-day selector
  (ADR-0002's dual ontology, per tab). Extras (logged runs that claimed no
  slot) surface as day-cell indicators here and in full in `DayActionSheet`
  via `unclaimedByDate`. Its predecessor **`HybridWeekRail`** (two-lane
  week-at-a-glance) was superseded by that unification and sat orphaned —
  rendered by nothing, tests green — until deleted on 2026-08-08; its
  `extras-pill-v1` coachmark went with it (the capture rigs' pre-dismissals
  of that key are now inert).
- **`DayActionSheet`** — per-day command sheet (run + lift blocks of equal
  visual weight). Race-day detection is by template **type** (`type ===
"race"`), never `templateId === "race"` (race ids are `5k_race` …
  `marathon_race`). Template swap is scoped per-day ("Changes this day
  only.").

Locked model (Run9a): the Run surface is **two states only** — freeform
substrate + optional race-goal overlay (`resolveRunPlanSurface`). There is
NO user-facing freeform/structured/race_prep toggle and no mode chips. Do
not reintroduce structured mode or structured-mode transitions.

Constraints these primitives must keep:

- Closed palette: **coral = running, purple = lifting**; existing semantic
  tokens for success/warning/destructive. No new colours unless added as
  tokens. No decorative gradients.
- 44px+ touch targets (use the `Button` / `IconButton` primitives).
- Light + dark mode; reduced-motion respected (`motion-safe:` prefixes).
- Active plan editing deep-links to `/settings/run-plan` — the focused
  run-plan editor (Set1.2 nested-settings IA; originally
  `/settings/training` per Run8 PR1a, destination superseded but the
  "deep-link out, don't edit inline" decision unchanged). The entry copy
  reads as "Edit run plan", not a generic settings jump.

### Spacing

- **Page horizontal padding:** px-4 (16px)
- **Card internal padding:** p-3 (12px) for compact, p-4 (16px) for hero cards
- **Card gap (vertical):** space-y-2 (8px) for dense stacks, space-y-3 (12px) for section breaks
- **Grid gap:** gap-2 (8px) for compact grids
- **Icon container:** w-9 h-9 (36px) for standard, w-12 h-12 (48px) for hero
- **Icon inside container:** w-4 h-4 (16px) standard, w-5 h-5 (20px) hero

### Interactive Patterns

- **Tap feedback:** scale(0.97) on active, 150ms cubic-bezier transition
- **Haptic:** Called on all button/card taps via haptic() utility
- **Count-up animation:** Hero numbers animate from 0 on first load (useCountUp hook)
- **Water card:** Fill-from-bottom gradient animation, wave SVG, bubble particles, ripple on add
- **Bottom sheet:** Vaul drawer for editing (exercises, weight logging)
- **Tab navigation:** Horizontal scrolling tabs with active pill indicator

### Glow & motion rules (WKWebView-safe — 2026-07 visual pass)

- **Glow recipe (non-negotiable):** a glow is a STATIC blurred layer whose
  **opacity/transform** animates — never animate blur radius or any filter
  value (filter animation stutters in WKWebView; opacity/transform composite
  on the GPU). Reference implementation: `src/components/BodyMapGlow.tsx`
  (blurred overlay `Model` behind the body diagrams — analytics heat map +
  exercise guide share it).
- **One ambient loop per surface, maximum.** On the muscle heat map, only
  the single most-trained muscle pulses; nothing else loops. `prefers-
reduced-motion` always gets the settled static state — no entrance, no
  loop.
- **Warning register:** warnings use `THEME.warning`, and since the D19
  split (2026-08-22, owner-delegated) that is the AMBER family —
  `#D97706`, one value with `THEME.amber`, matching the CSS ramp that was
  already amber (`--warning` light ≈ amber-700, dark = amber-500). Orange
  (`THEME.semantic.nutrition`, `#D9884E`) is the FOOD domain identity and
  is now visually distinct from warnings. Warning TEXT takes
  `hsl(var(--warning-strong))`, never the bare identity (amber-600 is
  ~3.1:1 on white — fill/icon only). When touching a `THEME.warning`
  call site, check the SEMANTIC first: the D19 sweep found half of them
  meant "food" and repointed those to `semantic.nutrition` — a new
  warning-token use on a food surface recreates the old collision in the
  other direction. `danger`/`semantic.vitals` and
  `success`/`semantic.positive` remain value-aliases (pixel-correct,
  name-only debt, pinned in `colorCanonical.test.ts` alongside the
  warning≠nutrition inequality that IS the D19 contract).
- **Empty states go through the `EmptyState` primitive**
  (`src/components/ui/EmptyState.tsx`; `compact` for in-card use) — no
  hand-rolled centered-icon-tile blocks. The primitive owns the brand
  hexagon, accent tinting, and reduced-motion handling.

### Design-review capture channel (screenshots without a local rig)

The agent sandbox can't run a browser; CI can. Push any branch's code to
`claude/screenshot-app` (scratch trigger branch — force-with-lease is fine)
and `app-screenshots.yml` builds it against the emulator, captures the key
surfaces light+dark (`e2e/screenshots/home.screens.capture.spec.ts`), and
commits PNGs to the `app-screenshots` branch for `git fetch` + view. Each
run also DIFFS against the previous capture (`scripts/diff-screenshots.mjs`,
pixelmatch): `screenshot-diff/DIFF_REPORT.md` + per-frame changed-pixel
highlights ride the same branch and mirror into the run's step summary —
a report, not a gate (intended change is normal here). Visual
PRs cite before/after from this channel (the D15 lesson: no visual churn
without screenshots). Concurrent runs no longer race the branch: the
workflow cancels a superseded run (D26), because the loser's frames are
overwritten by the newer force-push anyway and its diff report is exactly
the artifact the race corrupts — push, WAIT for the run, then push the
next capture. Gotchas: capture specs must be named
`*.capture.spec.ts` (auth-emulator project); the Progress/Form switch and
other SegmentedControls are `role="radio"`, not buttons; give best-effort
clicks short explicit timeouts so a missed locator costs seconds, not its
30s default. **Capture specs select by user-visible STRINGS, so renaming
copy or reshaping an aria-label requires `rg` over `e2e/` in the same
commit** — three selectors broke this way on 2026-08-22 alone (the
surfaces day-cell regex, its unpinned twin in day-peek whose count-guard
skipped the click SILENTLY, and the circles weekly-focus button). Where a
component renders standalone, pin the spec's literal against the real
render the way `weekStripCaptureSelector.test.tsx` does — it now reads
BOTH day-cell specs.

**Read the diff report with the flaky frames in mind.** Three classes
of frame change between runs with no code change, and chasing one costs
an hour:

- **Bottom-sheet frames** (`circle-create-compact`, `easier-chooser`,
  `sheet-trainingblock`) capture at whatever point the sheet's
  open/settle animation had reached, so consecutive runs can differ by
  8-57% — one frame showing the sheet open and the next showing the
  surface behind it. Verified 2026-08-22 across two runs whose only
  code delta was `index.css` range-input rules: none of the three
  surfaces imports anything that changed.
- **Map frames** (`run-detail`) vary with MapLibre tile-load timing.
  The tell is that every changed pixel sits inside the map's y-band.
- A frame moving by **0.1-0.7%** is usually antialiasing, not a change.
- **`badges-grid` resizes ±10px with the capture's WALL CLOCK.** The
  seeded user earns "Early Bird" only when the run executes before 7am
  (the badge is "log before 7am for 5 days"), so a pre-7am-UTC capture
  shows it earned (1-line date footer) and a later one shows it locked
  (2-line description) — the row grows ~10px and the whole page shifts.
  Diagnosed 2026-08-22 by cropping the insertion boundary (y≈900): the
  delta is fixture DATA, not layout. Same family as the useHomeData
  midnight flake — time-of-day-dependent seeds.
- **Frames whose height changes** are a different problem from frames
  whose pixels change, and the tempting fix does not work.
  `home-energy-default-after` measured 1191 → 1190 → 1458 → 1191 → 1358
  across five captures. Waiting for the document height to settle does
  NOT close it: Home renders its loading states as ordinary EMPTY states
  (`—` / "Tap to log") rather than skeletons, so they are height-stable
  for longer than any settle window, and the shot lands on a page that is
  stable but not final. Nothing generic separates a loading empty state
  from a real one — the frame needs an anchor on the DATA it exists to
  show. `e2e/helpers/settleHeight.ts` is still worth calling before a
  fullPage shot; it just is not that fix.
- **Raster art needs `img.decode()`** — `e2e/helpers/settleImages.ts`
  took `races-directory-light` from 10.88% to unchanged, and
  `badges-grid` from churning-in-every-report to unchanged in both
  themes. Diagnose by band before adopting: badges' mask was bands of
  exactly 62-64px against a `BadgeHex` rendered at `size={64}` — art and
  nothing else.
- **The capture that first carries a fix MEASURES that fix.** The diff
  report compares each capture to the previous one, so the run right
  after you adopt something is a fix-vs-pre-fix comparison, not a churn
  reading. `badges-grid-light` read 4.14% — its worst value ever — on
  the capture that introduced `settleImages`, and was written up here as
  "the helper made it worse". It had not: that was correctly-decoded art
  replacing partially-decoded art. The NEXT run, both sides post-fix,
  showed it unchanged. Judge a capture fix on the second diff after it,
  never the first — otherwise a working fix gets reverted for doing its
  job.
- **`home-energy-default-after` is the one that took a content anchor.**
  Five heights across five captures, unfixed by height-settling, because
  Home renders its loading states as empty states. Anchoring on the data
  (a non-zero calorie target) held it steady across two runs. The anchor
  is pinned against a real render in `energyCaptureAnchor.test.tsx`,
  including the runtime's number grouping — `formatCalories` is
  `toLocaleString()` with no locale, so a comma-only pattern is a bet on
  the CI runner's locale.

Localise before diagnosing: read the `diffs/` highlight and find the
y-band the changed pixels occupy. If it is the map, or a sheet, suspect
the rig before the diff. And do NOT assume a two-band highlight means
content shifted vertically — cross-correlate first; on the
2026-08-22 sheet frames the best vertical offset was 0 and the two
bands were two different STATES, not one state moved.

### Button variants (canonical CTA mapping)

Every **CTA / action button** uses the shared `Button` primitive
(`src/components/ui/Button.tsx`) — never a hand-rolled `<button>` with bespoke
Tailwind. The primitive already supplies the 44px floor, focus-visible ring,
0.97 press, loading state, and `type="button"` default, so reusing it is also
how the "every interactive element clears 44px" invariant is satisfied. Pick
the variant by the action's role:

| Action role                   | Variant                         |
| ----------------------------- | ------------------------------- |
| Main lifting / brand CTA      | `primary`                       |
| Main running CTA              | `sport` (coral)                 |
| Secondary action              | `secondary` or `outline`        |
| Low-emphasis action           | `ghost`                         |
| Destructive action            | `destructive`                   |
| Running non-critical action   | `sport-tinted` (coral 10%)      |
| Nutrition-primary CTA         | `nutrition` (orange)            |
| Nutrition low-emphasis action | `nutrition-tinted` (orange 10%) |

The `nutrition` / `nutrition-tinted` variants are the food-domain analogue of
`sport` / `sport-tinted`, resolving via the `--nutrition` / `--nutrition-strong`
tokens (warm orange #D9884E identity; #B45309 amber-700 AA white-text/text step).
They exist to close the design-system gap — nutrition was the only documented
domain/sport colour with no first-class token + variant, which is what kept
leaking one-off hex orange past the hex guardrail. **This is NOT a licence to
paint Food buttons orange.** Orange is a domain/data identity (section labels,
macro rings, calorie data), not a per-screen button colour: reserve the filled
`nutrition` variant for genuinely nutrition-PRIMARY, glanceable actions where
orange IS the meaning, and keep ordinary Food CTAs (Add, Save, Log) on `primary`.
The scan affordance stays its own special coral case (the camera icon in
`FoodComposerCard.tsx`), not this variant.

Scope note: this is for **buttons** — visual CTA/action controls. It is NOT a
mandate to wrap every `<button>` element: pressable cards, list/table rows,
day-cells, chips, and icon taps are legitimately their own controls (use
`IconButton` for icon taps; `SegmentedControl` for single-select pill groups).
Unlike the hex guardrail, "use `Button`" can't be lint-enforced (a linter can't
tell a CTA from a pressable card), so this is a per-PR convention: when adding
or touching a CTA button, route it through `Button` with the variant above.

### Component Architecture

- **Pages:** src/pages/ — route-level, lazy-loaded
- **Home screen built from:** WeekStrip → DayPeekCard → PerformanceHeroCard → StackedCTACards (action pills + health/water/weight/steps) → TodayEnergy → TodayGuidanceCard. This line named `HybridBalanceCard` until 2026-08-10; that component rendered NOWHERE, and had been superseded by `PerformanceHeroCard` / `TodayGuidanceCard` taking over the "how is my week going" role. Its only mention anywhere in the repo was this sentence — which is exactly why `componentReachability` strips comments before matching, and why a prose reference must never be what keeps a component looking alive.
- **Icons:** lucide-react (individual imports only)
- **Toasts:** sonner
- **Charts:** Recharts (bar charts, line charts in History)
- **Animations:** Framer Motion (AnimatePresence, motion.div, whileTap)
- **Body diagram:** react-body-highlighter (Muscle Groups Trained)

### Design Principles (for Claude Code when improving UI)

- **Keep the existing colour scheme** — the purple/coral/orange/teal semantic system is intentional and should not be changed
- **Calm over flashy** — subtle shadows, soft tinted backgrounds, no harsh contrasts
- **Breathing room over density** — generous padding, clear visual hierarchy
- **iOS conventions** — grouped background, card-based layout, safe area padding, 44px minimum touch targets
- **Consistent numeric treatment** — all numbers in Archivo (the numeral font) with tabular-nums
- **Sport-coding everywhere** — lift content uses purple tints, run content uses coral tints
- **Semantic colour consistency** — orange always = nutrition, teal always = hydration, coral always = vitals/running, purple always = brand/lifting
- **Progressive disclosure** — cards link to detail views, sheets for editing, don't overload screens
- **When polishing:** Focus on typography weight consistency, spacing regularity, shadow subtlety, and icon container sizing. Don't introduce new colours, gradients, or decorative elements.

### Current Known Design Considerations

- The Quick Log / Start Run / Log Food action pills were recently shrunk to make room for the hero cards (Health Score, Water). The visual weight difference between the large hero cards and small pills is intentional — the hero cards are glanceable data, the pills are secondary quick actions.
- The water card has a complex animated fill effect (WaterWave + WaterBubbles) — treat carefully when modifying
- Section headers use 10px uppercase with tracking — this is a deliberate typographic choice, not an error
- The "NEW" badge on PR items uses orange background — this is the nutrition/warm accent colour

## Reference apps — for /grill-me and /grill-with-docs sessions

**Scope:** this rule activates ONLY during `/grill-me` or `/grill-with-docs` sessions. Don't apply it on regular feature work, code reviews, or bug fixes unless the user explicitly asks "what do competitors do here?"

**The rule (when grilling):** before locking a decision that introduces user-visible abstractions, multi-step flows, or new state machines in our domain, consult what the dominant apps do for the same pattern. Surfacing concepts those apps hide is a sign we're overcomplicating; inventing concepts those apps don't have is fine when there's a Tropos-specific reason, but the bar is "explicitly justified," not "it sounded right."

**Reference apps by domain** (audit summaries live in `CONTEXT.md`):

- **Run tracking + training plans:** Strava, Nike Run Club, Garmin Connect, TrainingPeaks
- **Food logging:** MyFitnessPal, Cronometer, MacroFactor, Lose It!
- **Body / lifting tracking:** Hevy, Strong, Fitbod
- **Weight tracking:** Renpho, Withings, Happy Scale
- **Social fitness feeds:** Strava, Nike Run Club, Garmin Connect
- **Streaks + gamification:** Duolingo, Apple Activity rings

**Heuristics during grilling:**

- If 3+ reference apps do X invisibly — Tropos should surface X only when there's an explicit Tropos-specific reason.
- If 3+ reference apps do X with a one-tap confirmation — match that; don't gold-plate.
- If 3+ reference apps don't have X at all — strong signal the feature doesn't justify the build.
- When deviating, write the reason into `CONTEXT.md` so future grills can revisit it.

## Pre-launch QA backlog

Manual checks deferred from work that already shipped to a feature branch. Burn down before launch — automated tests + tsc + lint cover the basics, but these need eyes on a real device or production-like environment.

### The Privacy Policy's claim about Google's retention (F3d pin 2)

`PrivacyPolicy.tsx` section 7 tells users two things about the food-scan
photo once it reaches Google: that it is _"temporarily processed and not
permanently retained by Google"_, and that _"we do not use your food
photos for AI model training"_. Both are statements about someone else's
system. Nothing in this repo enforces or verifies either, and F3d pin 2
— "configure Vertex AI to disable retention, document in
`docs/privacy.md`, verify on every release" — was never ticked.
`docs/privacy.md` does not exist.

**Checked 2026-08-19, and the picture is better than that history
suggests.** The endpoint is the one thing that decides most of this, and
it was worth reading before assuming the worst:

```
functions/index.js:1236, :1444
  https://us-central1-aiplatform.googleapis.com/v1/projects/…
    /locations/us-central1/publishers/google/models/gemini-2.0-flash:generateContent
```

That is **Vertex AI** (`aiplatform.googleapis.com`), the GCP enterprise
endpoint — NOT the consumer Gemini Developer API
(`generativelanguage.googleapis.com`). The distinction is the whole
ballgame for the training half of the claim: the Developer API's free
tier may use submitted data to improve Google's products, whereas Vertex
AI customer data is contractually excluded from training Google's
foundation models under the Cloud terms. So _"we do not use your food
photos for AI model training"_ rests on a contract rather than on a
setting somebody forgot to flip.

Nothing in `functions/` enables request logging either — grepped for
prompt/response-logging configuration and there is none, which is the
default and the one we want.

What is genuinely left, and it is narrower than the row implied:

- [x] **Confirm the abuse-monitoring retention window — DONE 2026-08-22,
      with one caveat recorded in the doc.** Every Google-side route is
      temporary and bounded (≤24h serving cache by default; conditional
      abuse-flagged prompt logging for a bounded window, with invoiced
      accounts exempt by default), so the policy sentence stands as
      written — no rewording needed. Caveat: the sandbox egress proxy
      blocks the canonical doc host, so the facts were triangulated from
      two independent search syntheses (which disagreed 30-vs-90 days on
      the flagged-prompt window — immaterial to the sentence, but settle
      it from a browser). Full detail in `docs/privacy.md`.
- [ ] **Confirm no prompt logging is enabled at the project level**
      (Cloud console). Absent from the code is necessary, not
      sufficient — it can be switched on outside the repo.
- [x] **Write `docs/privacy.md` — DONE 2026-08-22.** It records what
      holds each policy sentence up (the Vertex endpoint as the
      load-bearing fact, Google's retention posture with dated caveats,
      the repo's own Food9 guarantees), the residual operator-only
      checks, and a per-release re-verification procedure with a dated
      pass ledger — so "verify on every release" finally has something
      to diff against.

Do this before an App Store reviewer or a data-subject request reads
section 7. The claim is probably true; "probably" is the problem.

### Meal photos moved to the device (Food9, 2026-08-18)

Affects: `src/lib/foodPhotoStore.ts` (new), `src/lib/foodPhotoUpload.ts`
(deleted), `src/hooks/useFoodPhotoUrls.ts` (new), `FoodAnalyzer.tsx`,
`FoodTimeline.tsx`, `FoodRow.tsx`, `useMeals.ts`, `AccountSection.tsx`,
`PrivacyPolicy.tsx`.

The retention policy is pure and fully pinned (`planEviction`, 29 tests,
three mutations checked). What follows is the half no suite in this repo
can reach — the same device-only residue the Storage implementation had,
plus two new ones the platform change introduces.

- [ ] **The ≤1280px downscale.** `toStorableJpeg` needs `<img>` + canvas;
      jsdom has neither. Scan a meal on a device and confirm the stored
      file is ≤1280px on its longest edge. (Inherited unchanged from the
      Storage implementation — it was never covered there either.)
- [ ] **`Directory.LibraryNoCloud` behaves as its docstring claims.**
      Two separate checks, both iOS: the photo must NOT appear in the
      Files app or in Photos, and it must NOT ride the device's iCloud
      backup. The Swift package that implements it (`IONFilesystemLib`)
      is fetched by SPM at build time and is not vendored, so nothing
      about this is confirmable off-device.
- [ ] **A photo survives an app restart** (native and web PWA). This is
      the whole point of choosing a filesystem over memory; on web it
      additionally proves the plugin's IndexedDB backend persists.
- [ ] **Multi-device is now a TEXT ROW, by design.** Scan on the phone,
      open the same day on the web build: macros present, no photo. Not
      a bug — confirm it reads as an ordinary log rather than as
      breakage, which is what `FoodRow`'s degrade is for.
- [ ] **Account deletion.** Delete a test account on device and confirm
      `food-photos/<uid>/` is gone from app storage. Known and accepted
      narrowing: a second device the user never reopens keeps its copies,
      because no server process can reach a device.

**Follow-up, NOT done in this change — legacy Storage blobs.** New
writes stopped; the blobs already under `food-photos/{uid}/` were left
in place so pre-Food9 diary rows keep rendering, and the `storage.rules`
block stays (editing it is blocked behind `STORAGE_XSERVICE_APPROVED`,
which `workflow_dispatch` does not bypass). Sweeping them is a separate
piece of work. Until it happens, "Tropos stores no meal photos" is true
of everything written from 2026-08-18 onward and NOT of what came
before — do not read the Food9 lock as meaning the bucket is empty.

### Scan failure beat + no-food prompt contract (2026-08-18, PR #2066)

Affects: `functions/index.js` (analyzeFood prompt), `src/components/FoodCameraModal.tsx`, `src/components/FoodAnalyzer.tsx`.

The analyzeFood prompt now instructs the model: no food visible → return
foodName "No food detected" with empty items. That exact name is a CONTRACT
with the client's `GENERIC_AI_NAMES` filter — pinned cross-repo by
`aiFoodIdentification.test.ts` (promptContract), so reword both ends together.
Client-side, every scan failure now resolves IN the modal (no-food / error /
offline beats with Retake + Type-it-instead) instead of silently closing;
pre-fix the parent's catch/toast was dead code because the hook returns null
rather than throwing.

- [x] **Deployed-source spot-check — CLOSED from the deploy log, 2026-08-18.**
      No console visit needed: run 32141732273 (merge commit `e41f4d9`) shows
      the whole chain rather than just a green tick — the build-marker step
      injected `// CI build: e41f4d96…` (so the bundle hash was unique and
      the dedup could not skip the upload), then `functions: functions source
uploaded successfully`, then explicitly
      `✔ functions[analyzeFood(us-central1)] Successful update operation.`
      That is what the standing gotcha asks the console to prove, proven
      upstream of it — same shape as the `askGeminiText` row, which was also
      closed from a deploy log rather than a console visit. Reach for the
      console only when a deploy log LACKS the per-function update line.
- [ ] **Real non-food photo on device.** Scan a bookshelf / a person: the
      modal must resolve to "No food detected" with Retake + Type it instead
      — no silent close, no result card with hallucinated macros.
- [ ] **A nutrition LABEL still scans.** The packaging exemption is the
      other half of the no-food sentence (the server never sees the tab, so
      without it a label photo — which contains no literal food — could
      answer "No food detected"). Scan a packet on the Food label tab and
      confirm macros come back.
- [ ] **Airplane mode.** Shutter → instant "You're offline" (no burned wait),
      with Type it instead as the PRIMARY action — and typing must work
      end-to-end offline (local NL parse + queued write). Same for the
      Barcode tab: honest copy, never a raw "Failed to fetch".
- [ ] **Slow-scan escape.** Start a scan on weak signal and tap the X during
      the sweep — it must close immediately (pre-fix the X sat under the
      overlay and iOS users were trapped until the request resolved), and
      the abandoned scan must NOT park a failure the next session opens onto.
- [ ] **Rate-limit copy.** Burn the 10-per-10-min limiter with repeated
      retakes: the beat must read the server's own "wait a moment", not the
      generic connection line (the copy existed but rendered nowhere).
- [ ] **A busy multi-item plate.** The output cap went 1024 → 2048 because a
      crowded plate could truncate mid-JSON and 500 while still charging
      quota. Scan something with 6+ components and confirm a full item list.
- [ ] **VoiceOver over the whole journey.** Shutter → "Analyzing food"
      announced (pre-fix the wait was SILENT), failure verdict announced,
      and the camera chrome under the overlay unreachable by swipe (it was
      focusable, and Enter on the invisible shutter fired a blind capture).

### Nutrition/TDEE sweep 2026-08-12 — one finding left, and the shape of the rest

Five defects shipped from one sweep of the calorie/macro path (#1994-#1998).
Four shared a single shape, worth naming because it is not the mirror-parity
rule and keeps being mistaken for it: **a number computed in one place and
DISPLAYED from another**. Not two copies of a formula drifting — one correct
value, and a reader pointed at a different, staler field.

Home's protein nudge quoted `profile.targetProtein` beneath rings
showing `useEffectiveTargets().protein` — 16-32 g
apart, on the same card.
History's target line quoted an onboarding-day snapshot nothing had
updated since.
Settings' "Adapting" printed the formula figure under a line saying the
number was adapted.
The PI scorer was handed `profile.goal`, a field nothing writes.

In every case the codebase had ALREADY solved it for the neighbouring field
and the fix was pointing the stray reader at the existing source.
HOME-TARGET-01 ("one target everywhere") did exactly this for calories and
missed protein; `calorieTargetResolution.js` did it server-side for the
scoring target. When you find one of these, check the siblings — the fix is
usually a one-line repoint, and the miss is usually a field that was added
after the sweep that fixed its neighbours.

**RESOLVED — `goalCalorieOffset` trusted the sign of `weeklyRateKg`.**
`useAdaptiveTdee` read the field raw; its sibling `goalReachedOffer` has
cross-checked the sign against `program.goal` since NUTR-M2, because
pre-NUTR-M2 profiles stored the rate UNSIGNED. A legacy cutter therefore got
a +550 kcal SURPLUS where -550 was intended, walked up 150/week by
`applyWeeklyCap` — slow enough to look like the engine working.

Shipped as `attestedWeeklyRateKg`, called by both consumers. The open
question ("do unsigned-rate profiles exist in production?") was NOT the
blocker it looked like: the check is a no-op for every correctly-signed
profile, so the cost of being wrong about their existence is zero one way
and a silent surplus the other. When a defence is free for the healthy case,
the prevalence question is not worth answering first.

**The stored/displayed protein split stays — and holds by ONE DECIMAL PLACE.**
Stored `targetProtein` splits by GOAL; the displayed daily target splits by
lift PHASE. Consolidating them needs either a server-side phase mirror or an
obligation to rewrite the profile on every phase change, both larger than
the gap they close. Declined.

That is only safe because the PI protein factor is `ratio >= 0.9 ? 100 :
ratio * 111` — so over-eating is never penalised — and across every
reachable (goal, phase) pair the shown/stored ratio bottoms out at EXACTLY
0.90. Zero margin. `PHASE_PROTEIN.race_prep` is 1.6 and would give 0.8, i.e.
88.8 points for eating exactly what the app asked; it is unreachable only
because `LiftPhase` has no such member.

Nothing was holding that. It is now pinned by
`proteinTargetDivergence.test.ts`, with the multiplier tables asserted as
literals. Before changing ANY protein multiplier, or adding a phase to
`LiftPhase`, read that file — the invariant is not local to either table.

**Deploy verification owed for the three `functions/` changes** (#1991 delete
triggers, #1993 cold-start badges, #1994 PI goal wiring). CI-green is
necessary-not-sufficient per the standing dedup gotcha; all three are `.js`
changes so dedup should not bite, but the Console spot-check is the only
proof. Neither #1993 nor #1994 repairs history: badges already dropped stay
dropped (the trigger is `onCreate`), and stored PIs are rewritten only for
the current week by the next rollup.

### Unwired seams — half-built features that read as shipped (2026-08-12)

Found while adjudicating the orphaned hook-return properties behind PRs
#1980/#1981. Recording them because both are the shape that stays invisible:
the code exists, so a reader assumes the feature does. Neither is dead code —
deleting either would destroy the half that IS built.

**A user cannot delete a mis-logged workout or run.** RESOLVED
2026-08-12 — built end to end, server first, per ADR-0012 and its two
amendments.

Server: `onWorkoutDeleted` / `onRunDeleted` reverse challenge progress and
lifetime totals. Client: `lib/sessionDelete` + `DeleteSessionAction`, wired
into `/workout/:id` and `/run/:runId`. `useWorkouts.deleteWorkout` is gone —
it was the unwired duplicate of a now-wired path, and keeping both is what
`hookSurfaceReachability` exists to catch.

Three things the original framing above got wrong, all of them the kind that
only surfaces once you write the code — the amendments carry the detail:

- The challenge marker DOES record its `incrementBy`. The plan to "re-derive
  from the deleted snapshot" was built on the premise that neither marker
  carries a delta; only the lifetime one doesn't.
- Re-derivation is not always correct even when it is available. Session ids
  are deterministic, so a resumed programme Finish re-`set`s the same workout
  doc — an overwrite that accrues nothing, leaving the counter and the
  document disagreeing. The lifetime marker now stamps `appliedValue`.
- `fastest_effort` cannot be reversed at all (MIN semantics, and its marker
  records the run's time rather than the best it displaced). It joins partner
  streaks — and milestone badges, which the ADR never mentioned — on the
  "history, not an accumulator" side.

- [ ] **Deploy verification.** Confirm `onWorkoutDeleted` / `onRunDeleted`
      appear in the Console function list and that `onWorkoutCreated`'s
      deployed source contains `appliedValue`. Then delete a real session on
      device and watch a joined challenge's `currentValue` drop by that
      session's contribution.
- [ ] **A shared run's feed post is unreachable from the run.** Workouts carry
      `sharedActivityId`, so deleting one removes its post; the run share path
      (`ShareComposerSheet` → `postActivity`) writes no marker back, so a
      shared run's post survives the run. The confirmation copy says so rather
      than pretending otherwise — closing it means writing the marker on the
      run side first. Related: nothing in the app deletes a feed post on its
      own, for any post.

**The food-favourite graduation coachmark was never built.** RESOLVED
2026-08-12 — `graduationToken` deleted. It was speculative state, not a
deliberate seam: no coachmark was ever specced (no design, no reserved key,
nothing in the plan file), and the rest of graduation ships and works without
it — the `food_pantry_graduated` event, the funnel splits by entry path, the
useCount>=2 filtering in `Food.tsx` all remain. The detection block that fed
it stays; only the state and its return entry went, so the analytics are
untouched. Deleted rather than annotated, per `mirrorCrossTestGate`'s rule
about code nobody calls and nobody intends to call.

**Gate gap that hid all of the above.** `mirrorCrossTestGate` sees a dead MODULE;
`symbolReachability` sees a dead EXPORT inside a live module. Neither sees a dead
PROPERTY on a live hook's return object. A scan of the 134 such properties across
70 hook files found the set; after #1980/#1981 five remain, and the three above are
judgement calls rather than deletions. Extending the gate is tractable and matches
the house pattern of each orphan instance producing a new gate — but it needs those
five classified first, and `useWorkouts.saveWorkout` is already a documented pinned
orphan, so the list is genuinely mixed.

- [x] RESOLVED 2026-08-12. The gate shipped as
      `src/lib/__tests__/hookSurfaceReachability.test.ts`, and the five
      classified out: `graduationToken` deleted as speculative state,
      `deleteWorkout` deleted once its real path landed, `saveWorkout` stays a
      documented pinned orphan, and `baseTarget` / `isRunDay` stay pinned as
      documented fields of an exported interface three components take as a
      prop type.

### Cost & margin operator setup (unit economics)

Modelled 2026-07-05. Apple's cut dwarfs all infra: at £3.99/mo, Apple takes £0.60 (15% — Small Business Program, accepted 2026-08-18; it was £1.20 at the standard 30%); combined Gemini + Firebase + storage + ORS run ~15–20p/Pro user/mo (Gemini Flash food scan ≈ ½p; only Pro users hit the AI gate). ORS routing is ~free at ~5k users (occasional route-plans, ~2–5 calls each, under the 2,500/day free tier); on quota-exceed it degrades to the existing straight-line planner (no lockout), and true scale = self-host ORS on a ~£25/mo VM (fixed, not per-request). `maxInstances` caps are already in every Cloud Function (runaway-cost guard).

- [x] **Apple Small Business Program — ACCEPTED 2026-08-18.** Apple's
      commission on Tropos is now **15%**, not 30%, for as long as the
      under-$1M/yr condition holds. Net per £3.99 subscription goes
      £2.79 → £3.39. Treat 15% as the live number in any margin
      arithmetic from here; the 30% figure above is historical. Worth
      ~£0.60/user/mo — still more than the entire infra bill (~15-20p),
      which is why this was the highest-leverage item on the list.
      Re-check enrolment annually: Apple requires it and drops you back
      to 30% if the renewal lapses or revenue crosses the threshold.
- [ ] **Set a Google Cloud budget alert** (GCP Console → Billing → Budgets & alerts): email at, e.g., >£50/mo. Single smoke-detector across Gemini/Vertex, Firebase, and the future ORS proxy. Optionally set a hard Vertex/Gemini quota ceiling.
- [ ] When Run11 (ORS) ships: wire per-user quota in the proxy (one user can't drain the daily 2,500), log quota-exceeded, and confirm the straight-line fallback fires on 429.

### App Store listing — public Terms/Privacy URLs (launch gate)

The app's real domain is **`troposfit.com`** (owned + Cloudflare-managed;
`tropos.app` is NOT owned — do not use it anywhere). The App Store listing
(Description footer + the Support URL field) must point at
`https://troposfit.com/terms`, `https://troposfit.com/privacy`, and
`https://troposfit.com/support`. Apple's reviewer clicks these from the public
web _outside_ the app, so in-app routes alone don't satisfy the check, and a
dead legal/Support URL is a common first-submission rejection.

**CORRECTED 2026-08-18 — this row was substantially wrong, and being wrong
made the remaining work look bigger than it is.** Three fixes:

1. **The pages all exist and are already deployed.** `PrivacyPolicy.tsx`,
   `TermsOfService.tsx` and `Support.tsx` are real routes, declared in ALL
   THREE of App.tsx's route sets including the signed-out one, so they open
   with no login. `Support.tsx` carries `support@troposfit.com`. This row
   claimed the Support page still needed building; it did not.
2. **`deploy-hosting.yml` already publishes them at a root path.** It builds
   with `HOSTING_TARGET=firebase` → `base: "/"` and deploys to the live
   Firebase Hosting channel on every push to main (last run: `99413966`,
   2026-08-18, success). So `/privacy`, `/terms` and `/support` resolve at
   the Hosting origin **today**.
3. **The suggested "point GitHub Pages at troposfit.com via CNAME" does not
   work** and would have produced exactly the dead links this row warns
   about. The Pages build uses `base: "/Maiin/"` (`vite.config.ts:57`), so a
   CNAME alone serves the app at `troposfit.com/Maiin/privacy` —
   `troposfit.com/privacy` would 404. **Use Firebase Hosting**, which is
   already root-based, already wired, and same-origin with the auth handler.

What is genuinely left is operator-only — there is no code change pending:

- [ ] **Add `troposfit.com` as a custom domain** in Firebase Console →
      Hosting → Add custom domain, for the `adaptive-fitness-af8bb` project.
- [ ] **Add the DNS records Firebase issues, in Cloudflare.** Set those
      records to **DNS-only (grey cloud), not proxied** — Cloudflare's proxy
      intercepts the ACME challenge and Firebase's certificate provisioning
      stalls. You can re-enable proxying after the cert is issued if wanted.
- [ ] **Confirm all three URLs load signed-out in a private window** before
      touching App Store Connect. `src/lib/__tests__/publicLegalRoutes.test.ts`
      pins that the ROUTES exist in the signed-out set; it cannot pin DNS.
- [ ] **Then update App Store Connect** to the real URLs: the two links in
      the **Description** footer and the **Support URL** field. Do NOT submit
      with placeholder links.

### Stripe stays DORMANT — web storefront steer at launch (Sub4, locked 2026-07-05)

Distribution decision: Tropos ships **App Store now + Google Play later; no web billing is sold**. The working Stripe backend (checkout → webhook → tier, hardened in #822) is **kept dormant, NOT torn out** — Apple takes 15–30% vs Stripe's ~3%, so web billing is the single biggest future margin lever and pre-launch is the wrong moment to foreclose it. Do NOT build `createStripeBillingPortal` (the web Manage button's never-defined callable — it never fires on iOS, where the native branch redirects to Apple's subscriptions page) and do NOT start the ~46-file teardown; revisit removal only if still App-Store-only well after real revenue. Two known costs of dormancy, accepted: functions deploys require `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` to stay provisioned (closing the Stripe account needs a code change first), and billing-adjacent PRs keep threading Stripe branches.

- [ ] **Launch gate:** add the web App-Store steer — signed-in web visitors on `/upgrade` (and the ProModal paywall) see "Get the iOS app" instead of Stripe checkout tiles. One component change, NOT a backend migration. Deliberately not built pre-launch: the web build is the active dev/preview surface and the operator still exercises the checkout/trial flows there.
- [ ] At that point also confirm no other web surface deep-links into Stripe checkout (`useProCheckout` call sites).

### Food photo persistence (`claude/ultrathink-improvement-fljctw`)

Affects: `src/lib/foodPhotoUpload.ts`, `src/components/FoodAnalyzer.tsx` (post-save background upload), `storage.rules` (`food-photos/{uid}/` block), `functions/accountDeletion.js` (prefix sweep).

**The agent sandbox DOES run the Storage emulator** — `npm run test:rules:storage` passes here (29 tests, firestore+storage emulators, Java 21 present). This row claimed the opposite until 2026-07-26, and that false constraint was doing real work: it justified leaving the whole path manual. What is actually unverifiable in-sandbox is narrower — `toUploadBlob`'s `<img>`+canvas downscale needs a real browser (jsdom has no `canvas`, and the module isn't reachable from the built preview bundle a Playwright spec loads), so the **≤1280px resize** is the only genuinely device-level claim. The rules half is already automated in `storage.rules.test.ts` ("food-photos/{uid} — owner-only").

- [ ] Real AI food scan on device: save the meal, confirm the photo card pops into the diary timeline within a few seconds (background upload + onSnapshot merge), and the Storage console shows `food-photos/<uid>/<ts>.jpg` at ≤1280px. (The ≤1280px downscale is the part no automated suite covers.)
- [ ] Offline scan: save while airplane-moded — meal must save as a text row with NO error surfaced; photo is silently skipped (never re-tried).
- [x] Signed-out and cross-uid reads of a food-photos path are denied — covered by `storage.rules.test.ts` against the emulator. Note the rules block itself IS deployed: the ungated `a990d4bb` run (2026-07-12) shipped it. Only the later account-deletion write freeze (`779ca7ba`) is held back by the packet-11 gate.
- [ ] Account deletion (test account): confirm the executor logs the `food-photos/<uid>/` prefix sweep alongside progress/profile photos.

### Tooltip + Coachmark primitive (`claude/tooltip-primitive`)

Affects: `src/components/ui/Tooltip.tsx`, `src/components/ui/Coachmark.tsx`, plus the LIVE wire-ups — as of 2026-08-08 these are: Performance Index tooltip in `PerformanceTab.tsx`, Trajectory delta chip in `social/TrajectoryCard.tsx`, and the `social-find-invite` Coachmark in `social/views/PeopleView.tsx`.

Wire-up history (rows below referenced surfaces that no longer exist): the Nutrition HealthScore wire-up was removed by PI2; the Programme running-icon coachmark's successor (`extras-pill-v1` in `HybridWeekRail`) was orphaned by the `2b4e07b8` navigation unification and deleted in #1882.

PR #606 added automated coverage for the earliest [x] items; #1882's `e2e/coachmark.auth.spec.ts` and the tooltip capture spec closed most of the rest against the real emulator rig.

- [x] Light + dark mode visibility — filmed for the Performance Index wire-up (`tooltip.screens.capture.spec.ts`, both themes, body + arrow registering). The TrajectoryCard delta chip stays a manual check — it needs trajectory data the shared seeds don't stage.
- [x] 375px viewport — body wraps at `max-w-[280px]`, never overflows the screen — PR #606 pins the class
- [x] Vaul-drawer occlusion (z-50 > z-40) — closed by architecture, not by test: tooltips dismiss on any outside interaction and no LIVE surface auto-opens a drawer while a tooltip/coachmark can be showing (the last pairing died with the extras coachmark, #1882). The #606 z-class pin remains the guard; revisit only if a new wire-up lands on a surface with auto-opening sheets.
- [x] VoiceOver: body content is announced when the anchor receives focus (via `aria-describedby`) — PR #606 pins the wiring (screen-reader announcement itself stays manual)
- [x] Keyboard flow: Tab to anchor → Enter opens → Escape closes → focus returns to anchor — PR #606
- [ ] iOS Safari + Capacitor build: rubber-band scroll doesn't drift the portal
- [x] `prefers-reduced-motion: reduce` set at OS level — the slide animation is suppressed; fade still plays — PR #606
- [x] First-use Coachmark dismissal matrix + reload persistence — automated end-to-end on the live wire-up by `e2e/coachmark.auth.spec.ts` (#1882): outside tap + reload persistence, Escape, 6s auto-timer, each asserting the persisted key, driven as a brand-new signup-form account. Anchor-tap stays manual (it triggers the share flow, which headless CI lacks).

### Bottom-sheet keyboard lift (#2040, #2044) — the one genuinely device-level claim

Affects: `src/components/ui/BottomSheet.tsx`, `src/hooks/useKeyboardInset.ts`.

A soft keyboard covered the sheet's CTA (surfaced from a device screenshot:
the Start-a-circle sheet's button stranded off-screen). The fix anchors the
sheet with `bottom: keyboardInset` rather than growing `paddingBottom`,
which on a `bottom-0` element pushed content upward — the wrong lever.

**Do not add a Chromium e2e test for this**, and don't re-derive why: the
reasoning is recorded at the tail of `useKeyboardInset.test.ts`, measured
rather than argued. Headless Chromium has no soft keyboard, so focusing an
input does not shrink the visual viewport under ANY device emulation — the
condition the hook responds to cannot be produced there at all. Such a test
could only synthesise the divergence itself, which is what the unit tests
already do, while reading as browser-verified.

What that probe DID earn is pinned: real Chromium reports a SUB-PIXEL gap
between `innerHeight` and `visualViewport.height` with no keyboard open
(0.487px on iPhone 13 emulation, 0.125px on Pixel 5). `Math.round` absorbs
it; `Math.ceil` would hand every Chrome-based device a permanent 1px inset.
Both mutations now fail.

- [ ] iOS Safari (and the Capacitor build): open the Start-a-circle sheet,
      focus the name field, confirm the CTA sits directly above the keyboard
      rather than off the top or behind it. Dismiss the keyboard and confirm
      the sheet settles back with no leftover gap. This is the half no
      automated suite in this repo can reach.
- [ ] Same flow on a real Android device — the resize-model side of the
      arithmetic, where a double-lift would show as the sheet jumping a
      keyboard height too far.

### PR-L server-side reconciliation Cloud Functions

Affects: `functions/index.js` — three new/extended functions shipped in #807-#811.

Needs a 24h + 1-week observation cycle in production to see each trigger fire at least once with real user data. Until that happens, the deploy is "code in place" but the behaviour is unverified.

- [ ] `dailyRaceReconciliationSweep` (Pub/Sub, 04:00 UTC daily) — confirm first natural firing in Cloud Functions logs: should log `starting` → `evaluating N users` → `done — noShow=X, recoveryCleared=Y`. No `fatal error:` lines. Spot-check one race-prep user whose race date passed >3 days ago with no logged race: their `runDay.status` should flip to `race_no_show` within 24h.
- [ ] `onRunCreated` recovery-entry extension — log a real race-templated saved run matching the user's `raceGoal.targetDate` at ≥95% planned distance. Confirm `onRunCreated` logs include `recovery-entry written for {uid}` and the user's `programState.runPlan.phase` flips to `"recovery"` with `completedRaces[]` containing the race-day runDay id.
- [ ] `weeklyFellBehindCheck` (Pub/Sub, Mondays 05:00 UTC) — confirm first natural firing (next Monday after deploy). Logs should read `evaluating week YYYY-MM-DD (Sun..Sat)` → `done — set=X, clear=Y`. Spot-check a user who ran <50% of their weekly target the prior week — their `programState.pendingFellBehindPrompt` should be present.
- [ ] L4 client UI — once any user has `pendingFellBehindPrompt` set, log in as them, confirm the `FellBehindSheet` auto-opens on Home with the correct copy ("X of N runs (Y%)") and that all three buttons (shift / compress / skip) write the expected programState change.

### Run9 3b — server recovery-exit materialization (PR #901)

Affects: `functions/index.js` (`dailyRaceReconciliationSweep` L3) + new `functions/lib/runModeResolution.js`. Merged + deployed 2026-05-29. Mirrors, server-side, the client's `resolveRecoveryExit` materialization invariant. Deploy was merged from a web session that **cannot** verify the deployed source — these checks are the conclusive proof CI-green can't give (the dedup/bundle-hash gotcha means a green workflow does not prove the new bundle actually uploaded).

- [ ] **Deployed-source spot-check (do this first).** In the Console (`console.cloud.google.com/functions/details/us-central1/dailyRaceReconciliationSweep/source`), confirm the deployed bundle contains `_recoveryEndDateForRace` and the `require("./lib/runModeResolution")`. If absent, the dedup logic skipped the upload — re-run `deploy-functions.yml` via `workflow_dispatch`.
- [ ] **First natural firing materializes.** At the next 04:00 UTC sweep, spot-check a race-prep user whose recovery ended >7 days ago (`runPlan.phase === "recovery"`, `today >= recoveryEndDate + 7d`) with **no** successor race: their profile should flip to `runMode: "freeform"` + `raceGoal: null`, and `programState.runPlan` should have `phase: null`, `recoveryEndDate: null`, `raceGoal: null`. Logs show `done — noShow=X, recoveryCleared=Y` with no `fatal error:`.
- [ ] **Newer-race case preserved.** A user who set a new FUTURE race during recovery (anchor mismatch) must stay `runMode: "race_prep"` with that raceGoal intact after the sweep — only `phase`/`recoveryEndDate` cleared. Confirm the sweep does NOT delete the successor race.

### `askGeminiText` retirement — DONE 2026-07-26, confirmed from the deploy log

**RESOLVED 2026-08-02.** The endpoint is gone from production. The deploy that
shipped the retirement (`da7c1ce`, run 30213576939) pruned it in the same run:

```
17:58:05  i functions: deleting Node.js 20 (1st Gen) function askGeminiText(us-central1)...
17:58:09  ✔ functions[askGeminiText(us-central1)] Successful delete operation.
```

**The risk this row warned about did not exist, and the reason is worth
keeping.** It said "Firebase usually prunes removed exports on deploy, but it
prompts for confirmation, and a non-interactive CI deploy can skip the prune."
`deploy-functions.yml` passes **`--force`**, which suppresses that prompt and
lets the prune run unattended. So a removed export IS reliably deleted by this
pipeline — no manual `functions:delete` is needed after retiring one.

Same shape as the `STORAGE_XSERVICE_APPROVED` correction below: a plausible
hazard written into the runbook, never checked against the pipeline that would
have to exhibit it, and left steering people wrong for a week. When a row
predicts a tool will misbehave, read the flags the workflow actually passes.

- [x] Deleted from the Cloud Functions list — proven by the delete lines above,
      and corroborated by later deploys (through `127ac38`) listing neither an
      update nor a delete for it.
- [x] No client change needed — there were zero call sites. `rateLimits/{uid}_askGemini`
      docs stop being written; existing ones are swept by the account-deletion
      range filter covered in `accountDeletionRateLimitsRange.test.ts`.

### Node runtime — bumped to 22 (2026-08-02); watch the first deploy

The `127ac38` deploy log warned that Node 20 "will be decommissioned on
2026-10-30, after which you will not be able to deploy without upgrading" —
a hard blocker on **every** future deploy, including an emergency fix.
Confirmed against firebase-tools' own runtime metadata rather than the warning
text alone: `nodejs20.decommissionDate = "2026-10-30"`.

**Bumped to `nodejs22`.** THREE places pin the runtime and they must agree —
missing one leaves the deploy resolving a version you did not choose:

| File                          | Field                                               |
| ----------------------------- | --------------------------------------------------- |
| `firebase.json`               | `functions.runtime` — the authoritative declaration |
| `functions/package.json`      | `engines.node`                                      |
| `functions/package-lock.json` | mirrors `engines` (regenerate, don't hand-edit)     |

`deploy-functions.yml`'s `node-version` was also moved 20 → 22. That one is the
CI RUNNER's node, not the functions runtime — unrelated to this deadline (its
own deprecation notice is about Actions) — but it should not trail the runtime
it deploys.

**Why 22 and not 24, given both are GA:** they share a decommission date
(2028-10-31), so 24 buys no extra deploy runway — only a later deprecation
_warning_ (2028-04-30 vs 2027-04-30). 22 is what the CI runners and the agent
sandbox actually run, so the test evidence is against the real target rather
than a version nothing here exercises.

Evidence before merge: full functions suite green on Node v22.22.2 with the
Firestore emulator up — 1156 tests, 76 files, none skipped.

- [ ] **Watch the first deploy after this merges.** The runtime switch
      redeploys every function at once, so a runtime-level incompatibility
      shows up everywhere simultaneously rather than in one endpoint. Expect
      the Node 20 deprecation warning to disappear from the log.
- [ ] Spot-check one callable and one Firestore trigger in the Console
      afterwards (the `// CI build: <sha>` marker at the top of the deployed
      source confirms which commit is live).
- [ ] Native/transitive deps are the residual risk the test run cannot cover —
      the suite exercises the code, not the deployed container image.

### `functions/` dependency advisories — the bump was TRIED and declined

`npm audit --omit=dev` in `functions/` reports 18 (1 low, 12 moderate, 4 high,
1 critical). The obvious move — bump `firebase-admin`, the only DIRECT
dependency implicated — was attempted on 2026-08-02, measured, and reverted.
Recorded here so nobody re-runs the investigation to reach the same answer.

**There is no in-range fix.** `13.10.0` is already the newest 13.x, so `^13`
cannot be updated into a clean tree. The only path is the 14.x major.

**14.2.0 helps, but not with the one that matters.** Measured, not assumed:

|          | before | after 14.2.0     |
| -------- | ------ | ---------------- |
| total    | 18     | 14               |
| critical | 1      | **1 — survives** |

It clears `firebase-admin` itself plus `@google-cloud/firestore`,
`@grpc/grpc-js` and `google-gax`. The four survivors are all transitive under
`firebase-admin@14.2.0`, the newest that exists, so they are upstream's to fix
and no bump here reaches them.

**The cost is a migration, not a version bump.** v14 removes the ENTIRE
namespaced API: `admin.firestore`, `admin.auth`, `admin.messaging`,
`admin.storage`, `admin.credential` and `admin.apps` are all `undefined`.
`index.js` + `lib/` use `admin.firestore` **115 times**, and 13 test files use
`admin.apps`. Shipped naively it throws at `index.js:27` — module load, every
function, backend down. The functions suite caught it on the first run.

**The critical advisory is not reachable.** `websocket-driver` hangs off
`@firebase/database` (Realtime Database) via `faye-websocket`. Nothing in
`functions/` uses RTDB — checked, no `admin.database()` / `getDatabase` call
sites. It is present in the dependency tree and absent from every execution
path.

**v14 requires `node >= 22`** (13.x wanted `>= 18`), so this only became
possible at all with the runtime bump above. Worth knowing if the order ever
matters again.

- [ ] Revisit when upstream clears the transitives, or if the
      namespaced → modular migration becomes wanted for its own reasons
      (`getFirestore()`, `Timestamp`, `FieldValue`, `getAuth()`,
      `getMessaging()`). It is largely mechanical and the 1156-test functions
      suite is a real safety net — but it is a single-purpose PR, not an
      advisory fix, and ~130 sites of churn to clear 4 of 18 is a bad trade on
      its own.

### Race-day completion predicate (PR #1775)

Affects: `functions/lib/raceDayCompletion.js`, new `functions/lib/raceTemplateIds.js` — both reached from `dailyRaceReconciliationSweep` and `onRunCreated`. Merged 2026-07-26 from a web session that cannot view the deployed source.

**This is the highest-value deploy check in the backlog**, because the bug it fixes was silent and total: `isStrictRaceRun` compared `savedRun.actualTemplateId` against the literal `"race"`, which no document ever carries (RunSummary writes the template id, and the race ids are `5k_race` … `marathon_race`). The predicate was therefore **always false** — every completed race read as a no-show, and the post-race recovery entry never fired for anyone. Its own golden fixtures hid it by using `"race"` on the accept path and real ids on the rejects, so the rejections were honest and the acceptance was fiction. Fixing the predicate broke 14 tests, all on the accept path — the proof the whole server race path had been verified against a value production never writes.

- [ ] **Deployed-source spot-check (do this first).** In the Console (`console.cloud.google.com/functions/details/us-central1/dailyRaceReconciliationSweep/source`, then `…/onRunCreated/source`), confirm the bundle contains `require("./raceTemplateIds")` and the string `marathon_race`. This is a `.js` change so the bundle-hash dedup should not bite, but green CI is still not proof — re-run `deploy-functions.yml` via `workflow_dispatch` if absent.
- [ ] **A completed race now clears the no-show.** Log a race-templated run on a race-prep user's race date at ≥95% of planned distance. `onRunCreated` logs should include `recovery-entry written for {uid}`, and `programState.runPlan.phase` should flip to `"recovery"` with the race-day runDay id appended to `completedRaces[]`. Pre-fix this never happened for any user.
- [ ] **Past races are not retroactively repaired — and there is a 14-day point of no return.** Verified mechanism, not a guess: `_needsRaceNoShowEvaluation` bails on `raceDayRunDay.status !== "planned"`, so once a slot is `race_no_show` the sweep never re-evaluates it. The predicate fix therefore does NOT self-heal past races. Two windows:
  - **Within 14 days of the race** the state is recoverable by the user: PR-D locked `race_no_show` as a soft-terminal status (`LEGAL_TRANSITIONS.race_no_show: ["planned"]`), surfaced as the **Restore** action on the locked day in `DayActionSheet`. Nothing automatic clears it — the lock deliberately made recovery a user action.
  - **Past 14 days** the sweep's L4 auto-exit (`NO_SHOW_EXIT_GRACE_DAYS = 14`) returns the user to `runMode: "freeform"` and nulls `raceGoal` on both the profile and the runPlan. Restoring the runDay after that does NOT bring the race goal back — the user has to re-declare the race. So any user whose race passed >14 days before the fix deployed has silently lost their race goal.

  Decide whether to backfill. With one pre-launch user this is likely a manual repair rather than a migration, but it is a real user-visible residue of the original bug, not a deploy failure — don't read a clean sweep log as "nobody was affected".

### Race started outside the plan — the second half of the same bug

Affects: `functions/lib/raceDayCompletion.js` (`isStrictRaceRun`), reached from `dailyRaceReconciliationSweep` and `onRunCreated`. Client counterpart shipped separately in `src/lib/scheduledRunCompletion.ts`.

PR #1775 (above) fixed `isStrictRaceRun` comparing `actualTemplateId` to the literal `"race"`. It did not fix the conjunct that comparison sat in: the predicate still required the tag AND the ≥95% distance. But `actualTemplateId` is only written when the run was launched from the scheduled slot — `freeformPlanMetadata` writes `null` — so **a user who taps Start Run on the start line saves their race untemplated**, which is ordinary race-morning behaviour rather than an edge case.

For those users the post-#1775 behaviour was the pre-#1775 behaviour: no recovery entry, a `race_no_show` written by the sweep, and at `NO_SHOW_EXIT_GRACE_DAYS = 14` the L4 auto-exit strips `raceGoal` entirely. The tag and the distance are two forms of the same evidence; requiring both meant requiring the one that is absent exactly when it matters. Distance now stands alone, and the tag still carries the zero-planned branch where there is nothing to measure.

- [ ] **Deployed-source spot-check (do this first).** Console → `dailyRaceReconciliationSweep/source` and `onRunCreated/source`: `isStrictRaceRun` should read `typeof savedRun.distance !== "number"` BEFORE any `isRaceTemplateId` call, and the `isRaceTemplateId` call should sit inside the `plannedDistanceMeters <= 0` branch. `.js` change so the bundle-hash dedup shouldn't bite — verify anyway.
- [ ] **An untemplated race clears the no-show.** On a race-prep test account, log a run on the race date at ≥95% of the planned distance WITHOUT starting it from the scheduled slot. `onRunCreated` logs should include `recovery-entry written for {uid}`; `programState.runPlan.phase` flips to `"recovery"`. Pre-fix this never happened for a freeform start.
- [ ] **The distance bar is still live.** Same account, a run at ~90% of planned on race date must NOT enter recovery and must still read as a no-show — the fix removed the tag gate, not the ≥95% one.
- [ ] **Same backfill question as #1775, now wider.** That row's 14-day point of no return applies to this population too, and it is the larger one: pre-fix, only races launched from the slot were ever recognised. Any user whose race passed >14 days before this deploys has silently lost their race goal and must re-declare it. A clean sweep log is not evidence nobody was affected.

### PR-L bugfix verification (PR #815)

Affects: `functions/index.js`, `src/pages/RunSummary.tsx`. Eight verified bugs in the PR-L arc fixed; the production-impact ones below need post-deploy spot-checks because the bugs were silently-broken-not-loud.

- [ ] Real race-templated saved run on race date has the new top-level `date: "YYYY-MM-DD"` field — confirm via Firestore console
- [ ] `dailyRaceReconciliationSweep` logs no longer report false `race_no_show` for users who completed their race
- [ ] `weeklyFellBehindCheck` Monday log line shows realistic `set=N` count (pre-fix it would have been every-active-user every Monday because the runs query returned 0 docs)
- [ ] Recovery-entry path writes `phase: 'recovery'` on the first race-templated save after race date — check `programState/current` doc for the affected user
- [ ] L3 clear writes `phase: null` and `recoveryEndDate: null` (not omitted) — the user actually exits recovery
- [ ] On a BST day, `weeklyPerformanceRollup` and `dailyPerformanceRefresh` log timestamps confirm the timezone fix landed (23:15 UTC and 02:10 UTC respectively — was 22:15 / 01:10 pre-fix due to Europe/London)
- [ ] On a real workout save, `onWorkoutCreated` logs include challenge-progress increments (pre-fix this silently TypeErrored on `participantSnap.exists()` and was swallowed)

### Public profile uid binding (PR #818) — AUTOMATED 2026-08-02

Affects: `firestore.rules` (the `users/{uid}/public/{doc}` block).

This was listed as a manual "from the client SDK, attempt…" check. It is a
rules test, and the Firestore emulator runs in the agent sandbox — so it is
now eight of them in `firestore.profile.rules.test.ts`, run by
`npm run test:rules`.

The gap was real, not theoretical: the rule carries a detailed comment about
the impersonation it prevents, and **nothing executed it**. The only tests
touching `public/profile` asserted that a badgeSummary write SUCCEEDS. A
security rule no test exercises is a comment.

Mutation-checked — deleting the uid identity gate from `firestore.rules`
fails the new test.

- [x] Body `uid` naming another user is refused; owner's own uid and
      field-absent both accepted (the paired positives keep the rejection
      from passing for the wrong reason).
- [x] Another user writing your public profile is refused outright.
- [x] The other two value gates on the same document, previously untested:
      `trainingForSpaceId` closed vocabulary, and `hasOnly` so the
      cross-user-readable projection cannot silently grow a field.

### Subscription expiresAt client-side guard (PR #818) — CLOSED 2026-08-02

The row asked for a real client roundtrip "because `Date.parse` of the stored
string is locale-sensitive". **It is not, for the only format ever written.**
`Date.parse` is implementation-defined for arbitrary strings, but ECMA-262
mandates deterministic parsing of ISO 8601 — and the sole writer of this field
is `functions/applePurchase.js`, which stores `expiresAt.toISOString()`. A
UTC-designated ISO string denotes one absolute instant regardless of the
reader's zone.

Two tests in `subscription.test.ts` now pin the contract instead: the format
the server writes, and the verdict's independence from the reader's timezone
(checked across a full day of offset either side of UTC). If a future writer
stores something non-ISO, the format test fails and the concern becomes real
again.

Third instance this session of a runbook hazard that did not survive contact
with the code — see the `askGeminiText` prune and the
`STORAGE_XSERVICE_APPROVED` dispatch note. The pattern is worth naming: a
plausible-sounding risk gets written into the backlog, nobody checks it
against the thing that would have to exhibit it, and it keeps work manual for
months.

### Offline + share queue uid scoping (PR #820)

Affects: `src/lib/offlineQueue.ts`, `src/lib/shareComposer.ts`.

- [x] Two-account device test — automated end-to-end by
      `e2e/offlineQueueIsolation.auth.spec.ts` against the real emulator rig:
      A logs while offline (queue entry tagged `uid: <A>`), signs out while
      still offline via the app's own Sign Out (queue survives), B signs in
      on the same context, B's flush pass leaves A's entry queued and
      `users/A/logs` empty, then A returns and the flush lands the exact
      queued docId with `_offlineCreatedAt` (flush-only provenance) and
      empties the queue. Two findings recorded in the spec header: (1) no
      WORKOUT surface routes through the offline queue — programme completion
      is a `writeBatch` (offline it rides the Firestore SDK's own
      pending-mutation queue + session draft) and `useWorkouts.saveWorkout`
      is a pinned orphan — so the vehicle is the Food page's daily-log write
      (`saveLog` → `safeMerge`), the one queue-routed UI journey; the
      uid-isolation contract is collection-agnostic. (2) "Offline" is driven
      by overriding `navigator.onLine` — the app's own gate on both enqueue
      and flush — because Playwright's `context.setOffline` permanently
      wedges the Firestore SDK's WebChannel WRITE stream in the emulator rig
      (Listen recovers, Write never re-establishes). Real airplane-mode
      remains a device check, but the queue contract itself is pinned here.
- [x] Same flow for the share composer queue (`tropos.share.queue`) —
      drain-side automated in the same spec: pending shares seeded for BOTH
      accounts (the exact `PendingShare` shape `enqueueShare` writes), B's
      drain posts B's share while keeping A's queued with zero A-authored
      `activities` docs, A's return posts A's share and empties the queue.
      The ENQUEUE half is driven for real too, via the run-save journey
      (RunSummary hydrates from router state — no GPS rig needed): still
      offline, A saves a synthetic run, shares it, and the pre-gated
      offline branch queues the post with the "Post queued" toast
      asserted. That path only became reachable with the #1887 fix (same
      PR): every `enqueueShare` site used to sit behind an awaited
      Firestore write that parks offline (never rejects) — the saves are
      now pre-gated on `navigator.onLine` and proceed on the durable
      IndexedDB commit, which also un-hangs offline run/workout saving
      itself. Residue: a real-device airplane-mode pass of the run-save
      journey, plus one behavior the spec deliberately tolerates — each
      offline remount of /food re-queues the same date-keyed daily-log
      merge write (duplicates converge on one doc; queue counts inflate
      until flush).
- [x] Legacy pre-deploy items dropped on first read — covered by
      `offlineQueue.test.ts` ("drops legacy items missing a uid field"), which
      seeds one untagged and one tagged entry and asserts the untagged one is
      filtered out of both the global and per-uid counts. This was never a
      device check; the migration is a pure filter in `getQueue`.
- [x] Release-note line — PAID. `CHANGELOG.md` `[Unreleased]` now carries
      "Offline changes queued by an older version are discarded when you
      update" with the sync-before-updating guidance; fold it into the next
      versioned entry (and the App Store "What's New") at release time. The
      behaviour itself is intended and pinned by `offlineQueue.test.ts`
      ("drops legacy items missing a uid field").

### Apple subscription uniqueness binding (PR #822)

Affects: `functions/applePurchase.js`, new `appleSubscriptions/{originalTransactionId}` collection.

- [ ] First real iOS purchase post-deploy — confirm a new `appleSubscriptions/<originalTransactionId>` doc is created with `uid` matching the purchaser, plus `productId` and `expiresAt`.
- [ ] Restore-purchase flow on the same Apple ID under the same Tropos account — confirm the lookup doc updates in-place (timestamp changes, uid stays).
- [ ] Negative test: attempt to call `restoreApplePurchases` from a second test account using the first user's `originalTransactionId` (intercept via debug). Expect the function to throw `"different account"` and no user-doc write to land.

### Stripe webhook transactional dedup (PR #822)

Affects: `functions/index.js` `stripeWebhook` handler, `stripeEvents/{event.id}` doc shape.

- [ ] Post-deploy, on the next real Stripe webhook delivery, confirm the `stripeEvents/<event.id>` doc has a `claimedAt` field (new) AND a `processedAt` field (existing). Pre-fix only `processedAt` was set.
- [ ] If a webhook handler crashes mid-process (force via stripe-cli test event), confirm the `stripeEvents/<event.id>` doc is DELETED so Stripe's retry can re-attempt. Pre-fix the partial claim would persist and the retry would silently skip.

### Blocking is now server-enforced (kudos + comments)

Affects: `functions/index.js` (`toggleKudosCallable`, `addCommentCallable`),
new `functions/lib/blockGuard.js`. Deploys via `deploy-functions.yml`.

Blocking was CLIENT-side suppression only — `blocks/{blocker}/users/{target}`
was written and read by the client and nothing in `functions/` or
`firestore.rules` consulted it. A blocked user could still kudos and comment;
the callable wrote the counter, sub-doc AND notification, and the recipient's
app then hid the feed row while the tray row and push had already landed. The
guard refuses in BOTH directions and fails CLOSED on a read error.

- [ ] **Deployed-source spot-check (do first).** Console →
      `toggleKudosCallable` and `addCommentCallable` source contains
      `require("./lib/blockGuard")`.
- [ ] **A blocked user is refused.** With two test accounts: A blocks B, then
      B kudos A's activity. Expect `permission-denied` client-side, NO kudos
      counter change, and NO tray row for A. Repeat for a comment.
- [ ] **Ordinary interaction is unaffected.** Two accounts with no block
      between them: kudos and comment still work. This is the regression to
      watch — a guard that refused everything would look identical in the logs
      to one that works.
- [ ] **Every other surface is covered by a backstop inside
      `createNotification`** — space post likes/comments, follows and circle
      events all pass through it, so a blocked notification is skipped
      wherever it originates. The underlying write (the like itself) still
      lands for those surfaces; only the notification is suppressed. Spot-check
      one: with A blocking B, have B like A's space post — the like counts, A
      gets NO tray row and NO push.

### Deload offered on discipline-specific load (single-discipline weeks)

Affects: `functions/lib/perfScoring.js`, `functions/performanceEngine.js`,
`src/lib/performanceEngine.ts`. Deploys via `deploy-functions.yml`. New
persisted field `performance/{date}.deloadIndex`.

A week with only ONE discipline capped the composite PI at 68 (recomp) / 58
(lean bulk), and every deload trigger gates at 80+ — so a marathon peak-block
athlete could never be offered a deload, by construction. The deload question
is now asked against `deloadIndex`, which takes the load half from the
discipline actually trained when exactly one was. The DISPLAYED PI is
deliberately unchanged.

- [ ] **Deployed-source spot-check (do first).** Console →
      `weeklyPerformanceRollup` source contains `deloadLoadScore` and
      `priorDeloadIndex`.
- [ ] **New docs carry the field.** After the next rollup, a perf doc has
      `deloadIndex`. For a both-disciplines week it must EQUAL
      `performanceIndex`; only a single-discipline week may differ.
- [ ] **No new nag.** The sustained trigger compares against the prior two
      weeks' `deloadIndex`, falling back to `performanceIndex` on legacy docs.
      Watch a single-discipline user for 2-3 weeks: a deload should be offered
      on the transition, NOT every week. (The #1955 nag-loop defect, on the
      other trigger, is the failure mode to watch for.)

### Adherence scored against the learned calorie target

Affects: `functions/performanceEngine.js`, new
`functions/lib/calorieTargetResolution.js`. Deploys via
`deploy-functions.yml`.

The adherence factor scored `profile.targetCalories`, which for a Pro user on
an engaged adaptive-TDEE target is not the number the app shows — the learned
value lives in `adaptiveCapState.lastApplied` and `targetCalories`
deliberately never moves (the estimator reads it as its own anchor). The step
cap is 150 kcal per 7-day window with no cumulative bound, so the two drift
apart indefinitely; a compliant Pro cutter four windows in scored 45.5 on the
calorie factor instead of 100. The server now resolves the target through the
same precedence the client uses.

- [ ] **Deployed-source spot-check (do first).** Console →
      `weeklyPerformanceRollup` and `dailyPerformanceRefresh` source contains
      `require("./lib/calorieTargetResolution")`. A `.js` change, so the
      bundle-hash dedup should not bite — verify anyway (CI-green is
      necessary-not-sufficient).
- [ ] **A Pro user on a learned target scores against it.** Spot-check a user
      whose `adaptiveCapState.lastAppliedAt` is real (not the epoch anchor)
      and whose `lastApplied` differs from `targetCalories` by >10%: after the
      next rollup their `adherenceScore` should reflect intake measured
      against `lastApplied`. Pre-fix, eating the displayed target read as a
      miss.
- [ ] **Free and manual-override users are unchanged.** The overwhelming
      majority. A free user (or one with `customCalorieTarget` set) must still
      score against `targetCalories` even when a stale `adaptiveCapState`
      survives on their profile from a lapsed Pro period.
- [ ] **Residue, not yet fixed:** `targetProtein` is still the stored
      bodyweight figure. It agrees with the adaptive split except when the
      learned target moves DOWN far enough to trigger the protein cap — a
      narrower case than the calorie gap, and left rather than half-mirroring
      the macro splitter into `functions/`.

### Partner-streak server persist (SOCIAL S3 Soc7, PR5a)

Affects: `functions/index.js` (`onWorkoutCreated` / `onRunCreated` now call `applyPartnerActivity`), new `functions/lib/partnerStreakEngine.js` + `functions/lib/partnerStreakPersist.js`. Deploys via `deploy-functions.yml`. The server is now the SOLE writer of `partnerBonds` streak state.

- [ ] **Deployed-source spot-check (do first).** In the Console (`console.cloud.google.com/functions/details/us-central1/onWorkoutCreated/source` and `…/onRunCreated/source`), confirm the deployed bundle contains `applyPartnerActivity` and the `require("./lib/partnerStreakPersist")`. CI-green is necessary-not-sufficient (the dedup/bundle-hash gotcha) — though this is a `.js` change so dedup shouldn't bite, verify anyway.
- [ ] **First real shared day counts.** With two test accounts that mutually follow + have a bond, log a workout (or run) as A, then as B on the same local day. Confirm the `partnerBonds/<id>` doc flips `streak: 0 → 1` and `lastSharedDay` to today, and `onWorkoutCreated`/`onRunCreated` logs show no `applyPartnerActivity: error`.
- [ ] **Same-day re-log is a no-op write.** Log a SECOND workout as A on the same day; confirm the bond doc's `updateTime` does NOT change (the engine's MAX-idempotency + the changed-guard skip the write).
- [ ] **Ineligible run doesn't count.** Save an `isInvalid` / `savedAnyway` / sub-threshold run; confirm the bond's `lastActive` does NOT update (gated on the same eligibility predicate as challenges).
- [x] **Freeze ledger uses Monday weeks** — covered, by composition rather
      than by one test, which is why it did not look covered. Three links,
      each pinned: `engineMirror.test.ts` asserts Monday-anchoring against a
      LITERAL (`weekKey("2026-06-14") === "2026-06-08"`, Sunday → prior
      Monday), so a Sunday regression is loud; `streakEngine.test.ts` asserts
      the consumed freeze stores `weekKey`'s output; and
      `partnerStreakPersist.js` never references a week function at all — it
      passes `next.freezeWeek` straight through, so there is no site at which
      the Sunday `getWeekKey` could substitute itself.
      Worth noting the near-miss: `streakEngine.test.ts` computes its expected
      value by calling `weekKey`, so on its own it pins nothing about Monday.
      The literal pin in the mirror test is what makes the chain real.

### Social context arc — coach prompts + space engagement (2026-07-26, PRs #1776-#1793)

Affects: `functions/lib/coachPrompts.js` + `weeklyCoachPrompts` (scheduled Mon 06:00 UTC), `functions/lib/spacePostEngagement.js` + three callables (`toggleSpacePostLikeCallable`, `addSpacePostCommentCallable`, `deleteSpacePostCommentCallable`), firestore.rules (space likes/comments read blocks, public-profile `trainingForSpaceId` value gate). Eighteen PRs shipped in one day from a design-panel roadmap (Runna's context-over-graph model); client behaviour is test-pinned, but the server half needs the standard deploy proofs.

- [ ] **Deployed-source spot-check (do first).** Console → `weeklyCoachPrompts` source contains `require("./lib/coachPrompts")`; `toggleSpacePostLikeCallable` source contains `spacePostEngagement`. All were `.js` changes so the bundle-hash dedup shouldn't bite, but CI-green ≠ uploaded (the standing gotcha).
- [ ] **First Monday firing (04:00-07:00 UTC window).** Logs show `weeklyCoachPrompts: starting` → `done — spaces=20, created=20, alreadyExisted=0`. Spot-check one interest space and one race space in the app: a "Tropos Coach" post (purple Coach badge, Sparkles tile) dated Monday, with "Share your take" opening the composer prefilled `Re: <title>`. Week 2: `created=20` again with DIFFERENT prompts (rotation), never duplicates (`alreadyExisted` counts a retried run, not a normal one).
- [ ] **Like round-trip on device.** Tap the flame on a space post → fills coral + count bumps instantly; kill the app, reopen → state persisted (server txn landed). Re-tap → count returns. A second account liking YOUR post lands a coral `space_post_like` tray row that deep-links to the space.
- [ ] **Comment round-trip on device.** Comment on another account's post → author gets the `space_post_comment` tray row → tapping it opens the space. Delete your own comment → count decrements. Confirm a comment on a COACH post produces NO notification (the coach isn't a notifiable user — check logs stay clean of `notification_failed`).
- [ ] **Race identity opt-in.** With a race goal set, the bound race space shows the "Show on your profile" toggle (and ONLY there — other race spaces must not). Toggle on → your profile shows "Training for {race} · N wks" in coral, linking to the space. Toggle off → chip gone. After race day passes, the chip must disappear ON ITS OWN (display gate) even if the toggle was left on.
- [ ] **Communities feed source.** Feed → source sheet → "My communities": joined-space posts newest-first under space-name eyebrows; empty states are the join prompt (no spaces) or the quiet-week line (spaces joined, nothing posted) — never a blank column. Pull-to-refresh refetches this stream while active.
- [ ] **Rules deploys landed.** Firebase Console → Firestore Rules contains `match /likes/{likeUid}`, `match /comments/{commentId}` (both read-only), and the `trainingForSpaceId` value gate on the public profile. Three rules deploys shipped today — verify the LAST one is live.

### Global hybrid challenge + hybrid_score sync (SOCIAL S4 Soc8, PR2)

Affects: `functions/lib/challengeDefs.js` (new `global-monthly-*` hybrid definition), `functions/index.js` (`onWorkoutCreated` / `onRunCreated` now sync `hybrid_score`). Deploys via `deploy-functions.yml`. The daily `rolloverChallenges` cron materialises the new challenge doc; the trigger sync feeds it.

- [ ] **Deployed-source spot-check (do first).** In the Console (`…/onRunCreated/source`), confirm the bundle contains `"hybrid_score"` in a `syncChallengeProgress` call. Per the dedup gotcha — `.js` change, dedup shouldn't bite, but verify.
- [ ] **Rollover materialises it.** After the next 00:05 UTC `rolloverChallenges`, confirm `challenges/global-monthly-<YYYY-MM-01>` exists with `metric: "hybrid_score"`, `participantCount: 0`.
- [ ] **Hybrid accrues from BOTH disciplines.** Join the global challenge, log a run (≥threshold) and a workout with volume; confirm the participant `currentValue` increases by ≈`km×100` (run) + `kg×0.1` (workout). Two separate sessions → two increments (different `applied/<sourceId>` markers).
- [ ] **Autumn Push revival (Sep–Nov only).** The seasonal `hybrid_score` challenge that previously never progressed should now accrue identically — spot-check during its window.

### Solo-first Social feed (SOCIAL S4 Soc8, PR3)

Affects: `src/pages/Social.tsx` (renders `SoloFirstFeed` for cold-start users), new `src/components/social/SoloFirstFeed.tsx` + `src/features/partnerStreak/PartnerStreakHero.tsx`. The state 100% of launch users see — must look DESIGNED, not gated.

- [x] **Light + dark capture of the solo state.** Re-read 2026-08-08 against the current surface and filmed (`solo-feed.screens.capture.spec.ts`, fresh signup-form account = 0 follows): the CURRENT stack is PartnerStreak hero → challenge slot → Spaces-for-you rail → Share-your-training → spaces empty-state hexagon (the original row's "Crews unlock…" row died with crews, #1700). Asserted before shooting: no "Your feed is empty" copy, and the cold-start Share card shows NO create button. Both frames eyeballed.
- [x] **Challenge slot before rollover.** Covered by the same capture, structurally: the rig's emulator has no challenge docs at all (no rollover cron runs there), and the slot collapses cleanly — no broken/empty card between the hero and the share card, both frames.
- [x] **Sub-tab default interaction.** Automated in the same spec's second test: switching the feed source to Following keeps the solo stack leading (the 0-follow gate outranks the source selection) and never shows "Your feed is empty".
- [x] **Share cold-start vs preloaded.** Both halves automated: the cold-start assertion above, and the preloaded half via a REST-seeded workout — after reload the card offers "Create a share card" and the composer opens preloaded (filmed: 3×8×60 kg renders as 1.4t total volume). The stat labels are invariant uppercase by design ("1 EXERCISES" is the stat-label convention, not a plural bug).

### Backlog audit 2026-08-02 — what a skeptical pass found

Ran the remaining rows against the code rather than re-reading them, on the
theory that produced three corrections earlier the same day (the
`askGeminiText` prune, the `STORAGE_XSERVICE_APPROVED` dispatch note, and
`Date.parse` locale sensitivity). Four outcomes worth recording, because two
of them are "the row was right" and that is the part a re-audit would
otherwise redo.

**Two rows were already satisfied and are now ticked** — the offline-queue
legacy drop and the partner-streak Monday freeze ledger, both above. Neither
was ever a device check. The Monday one is the more interesting: it is held by
a COMPOSITION of three tests, none of which says "Monday freeze ledger", so it
reads as uncovered until you follow the chain. A grep for the item's own words
finds nothing.

**One row survived the scepticism, which is worth stating explicitly.** The
storage deletion write-freeze (below) asks for verification on a non-production
project. `storage.rules.test.ts` DOES contain the whole matrix — active
statuses × four prefixes, tombstone, and the negative case — but those 12 tests
**self-skip in the agent sandbox**, because cross-service Firestore reads are
not available to the Storage emulator here. The suite reports "17 passed | 12
skipped" and exits 0, with a `console.warn` naming the reason. So the row is
correct as written, the coverage exists for the day the environment supports
it, and the skip is honest rather than silent. Do not "close" it by pointing at
the test file.

**A near-miss worth internalising.** `streakEngine.test.ts` asserts
`freezeWeek.alice === weekKey(...)` — computing the expectation with the same
function under test, so on its own it pins nothing about Monday. It is saved by
a separate literal pin in the mirror test. That is the same shape as the
`moveRunDay` refusal tests (which asserted only "no document write" after the
writer stopped writing documents) and PR #1775's accept-path fixture: an
assertion that looks like a check and is actually a tautology. When a test's
expected value is computed by the code path it is testing, it is pinning
consistency, not behaviour.

### Storage deletion write-freeze — cross-service approval + first deploy (packet 11, operator-in-loop)

Affects: `storage.rules` (the account-deletion write freeze), `.github/workflows/deploy-storage.yml`. Code is landed and tested; **it is deliberately NOT deployed yet** — the deploy job is gated so nothing reaches production until the operator does the two steps below.

Why gated: `storage.rules` now reads Firestore (`accountDeletionRequests` / `deletedAccounts`) to freeze photo uploads/deletes during and after an account deletion — the same freeze Firestore already enforces. That **cross-service** read requires a one-time interactive approval in the Firebase Console. If the rule deploys **before** that approval exists, the predicate errors → denies → **all photo uploads are blocked app-wide**. The `deploy-storage.yml` `deploy` job therefore stays skipped until the operator opts in.

Rollout sequence (operator, not agent) — do these in order, ideally after packet 10's Functions deploy:

- [ ] **Grant cross-service access.** Run `firebase deploy --only storage --project adaptive-fitness-af8bb` **from a project-owner machine** and approve the Firebase prompt that lets Storage Rules read Firestore. (This first deploy is intentionally a human action — do not try to route the approval through the CI service account.)
- [ ] **Verify the freeze on a NON-production project first:** seed an `accountDeletionRequests/<uid>` doc with `status: "running"` (or a `deletedAccounts/<uid>` tombstone) and confirm an owner upload/delete to `progress-photos/<uid>/…` is denied, while reads still succeed and a user with no deletion record can still upload.
- [ ] **(Optional) re-enable CI auto-deploy** for future storage.rules changes: set the repo variable `STORAGE_XSERVICE_APPROVED=true` (GitHub → Settings → Secrets and variables → Actions → Variables). Until then the ONLY way to ship a storage-rules change is the manual `firebase deploy` above — **`workflow_dispatch` does not work as an escape hatch here**, unlike `deploy-functions.yml`. The `deploy` job's `if: vars.STORAGE_XSERVICE_APPROVED == 'true'` is evaluated for dispatch runs too, so a manual re-run skips the deploy and still reports green. (This doc line claimed the opposite until 2026-07-26; an operator following it in an incident would have believed the rules shipped when nothing had.) The `report-not-deployed` job now fails on any gated run so the skip is legible instead of silent.
- [ ] Spot-check the deployed rule in the Firebase Console (Storage → Rules) contains `isDeletionWriteFrozen`.

### App Check enforcement rollout — operator-in-loop

Affects: every callable in `functions/`. NOT a code change — a Firebase Console + monitoring exercise.

Client-side App Check is already initialised via `src/lib/appCheck.ts` (reCAPTCHA v3 on web, no-op on native until the Capacitor plugin lands). Server-side enforcement is OFF. Flipping enforcement without first verifying token flow would lock out web users whose reCAPTCHA fetch fails and break all native traffic.

Rollout sequence (operator, not agent):

- [ ] Verify `VITE_RECAPTCHA_V3_SITE_KEY` is set in the Vite prod env AND the matching site key is registered in **Firebase Console → App Check → Apps**. Without this the web client never initialises App Check and the APIs tab shows 0% verified.
- [ ] Wait 24–48h post-deploy for telemetry to populate.
- [ ] Open **Firebase Console → App Check → APIs tab → Cloud Functions for Firebase**. Look for "Verified requests %". Target: ≥99% sustained for ≥7 days before any per-callable flip.
- [ ] If verified % is low and the cause isn't obvious, query Cloud Logging: `resource.type="cloud_function" jsonPayload.appCheck.status=("MISSING" OR "INVALID")` to see exactly which callables would reject and which uids are missing tokens. Usual culprits: ad-blockers killing reCAPTCHA (rare, swallowed) or native iOS (all `MISSING` until the Capacitor App Check plugin is wired).
- [ ] Flip enforcement per-callable in `functions/index.js` by adding `.runWith({ enforceAppCheck: true })`. Start with low-risk endpoints that the client **actually calls** — `sendTestPush`, `backfillMyActivityCategories`. (This line named `askGeminiText` until 2026-07-26; it had no client caller, so flipping it would have produced no telemetry and no rejection signal. It has since been retired. `docs/app-check-rollout.md` carries the full tier table and the traffic check.) Keep destructive ones (`deleteMyAccount`, `verifyApplePurchase`) until last. Don't bulk-flip.

## Agent skills

### Issue tracker

GitHub Issues on `lemmonchess333/Maiin`. Local sessions use `gh`; agent
harness sessions use the GitHub MCP tools (`mcp__github__*`). See
`docs/agents/issue-tracker.md`.

### Triage labels

Default canonical vocabulary — `needs-triage` / `needs-info` /
`ready-for-agent` / `ready-for-human` / `wontfix`. Labels are
auto-created on first `/triage` use if absent on GitHub. See
`docs/agents/triage-labels.md`.

### Domain docs

Single-context. `CONTEXT.md` at repo root (seed; fill with domain
vocabulary as it crystallises); ADRs in `docs/adr/`. See
`docs/agents/domain.md`.

Training-programming evidence handoffs (integrated 2026-08-09): start at
`docs/training-programming-claude-handoff.md`, which indexes the lifting
and running evidence syntheses, the nutrition-pipeline handoff
(`docs/nutrition-pipeline-claude-handoff.md`, `NUTR-EV-xx`, added
2026-08-11), and their open-issue ledgers
(`LIFT-EV-xx` / `RUN-EV-xx` — deliberately distinct from the plan file's
retention-audit `RUN-0x` and programme-audit `LIFT-0x` vocabularies).
Read the relevant handoff before any lift/run programming change; its
ledger rows without a dated STATUS note have not been re-verified since
2026-08-07.

Read the relevant ADR before re-deciding something it already settled —
an audit that re-derives a locked decision is wasted effort even when it
lands in the same place (the plan-file lock rule, applied to ADRs):

| ADR  | Decision                                                                           |
| ---- | ---------------------------------------------------------------------------------- |
| 0001 | Domain depth lives in `src/lib` helpers — file size is NOT a depth signal          |
| 0002 | Dual scheduling ontology: runs are date-pinned, lifts are split-ordered            |
| 0003 | UI primitives contract (`Button` / `IconButton` / `Toggle`)                        |
| 0004 | Surface coordinator                                                                |
| 0005 | Profile-sanitizer drift is an observability seam, not a consolidation              |
| 0006 | Adopt RevenueCat for IAP                                                           |
| 0007 | HealthKit reconciliation                                                           |
| 0008 | Mirror parity must pin the RUNNING copy — reachability over prose                  |
| 0009 | One Firestore test fake; injecting the `db` handle buys nothing                    |
| 0010 | Volume currency — 1:1 is correct; the flip waits on landmark-aware builders        |
| 0011 | Programme command boundary stops at the week engine — 8 sites stay document writes |
| 0012 | Deleting a logged session reverses accumulators, not history                       |

## Dynamic workflows & `ultracode` (when to escalate)

Claude Code's **dynamic workflows** (research preview, Claude Code
≥ 2.1.154, all paid plans) let Claude write a JavaScript script that
orchestrates many subagents in the background while the session stays
responsive. Intermediate results live in script variables, so only the
final answer hits Claude's context — and the script can run independent
agents that adversarially review each other before reporting. Three ways
to trigger:

- `/effort ultracode` — `xhigh` reasoning **plus** auto-workflow: Claude
  plans a workflow for every substantive task (often several in a row:
  understand → change → verify). Lasts the session; reset with
  `/effort high`. Only on models that support `xhigh` (Opus 4.8 does).
- The word **`workflow`** anywhere in a prompt — runs that one task as a
  workflow without changing session effort (`alt+w` to un-trigger).
- `/deep-research <question>` — the bundled cross-checked research
  workflow. `/workflows` watches/manages runs; press `s` there to save a
  run's script to `.claude/workflows/` (shared) or `~/.claude/workflows/`.

Runtime limits: up to 16 concurrent agents, 1,000 per run, no mid-run user
input (run each sign-off stage as its own workflow), subagents always run
in `acceptEdits` and inherit your tool allowlist. Cost: many agents = many
more tokens than a conversational pass — counts toward plan limits.

**Route a Tropos task into a workflow (or turn `ultracode` on) when:**

- The change touches the **correctness-critical engines** —
  `performanceEngine`, `runScheduler` (race-prep / taper / recovery state
  machine), `adaptiveTDEE` / `plateauDetection` / `phaseNutrition`. A
  plan→implement→verify workflow beats a one-shot edit on these.
- It's a **cross-cutting sweep**: a codebase-wide audit, a many-file
  migration (the 38-file toast-import migration was this shape), a
  security pass over the Firestore rules / callables, or a profiler-guided
  perf audit.
- It's a **hard plan worth drafting from several angles** before
  committing — exactly the `/grill-me`-class decisions, drafted in
  parallel and weighed.
- It touches **`functions/`** — have the workflow plan against the deploy
  gotchas documented above (dedup/bundle-hash, mandatory `maxInstances`,
  Blaze, the account-deletion rails) **before** editing, and verify the
  deployed source after.

**Don't** escalate routine single-file edits, copy tweaks, or anything
where the real blocker is a **product decision** (e.g. the Analytics-vs-
History naming call) — more effort doesn't substitute for asking the user.
Respect the **design-for-the-user-base** and **plan-file lock** rules
inside a workflow too: a sweep that re-derives a decision an orphaned lock
already made is wasted effort — search `git log --all` for the lock first.

**Web / agent-harness caveat:** workflows resume only _within_ the same
session. This repo's web sessions run in an ephemeral container that's
reclaimed on inactivity, and exiting Claude Code restarts an in-flight
workflow fresh — so commit/push before a long run, and prefer staging a
big job as several savable workflows over one monolith. In `claude -p` /
Agent SDK there's no launch prompt; runs start immediately under your
permission rules. To disable entirely: `/config` toggle,
`"disableWorkflows": true`, or `CLAUDE_CODE_DISABLE_WORKFLOWS=1`.

## graphify

`/graphify` builds an optional knowledge graph at `graphify-out/` (tree-sitter
AST, local, no vector store). **There is no graph in this repo unless someone
has deliberately built one** — check for `graphify-out/graph.json` before
assuming otherwise. Every rule below is conditional on that file existing.

The stock install wrote this section asserting a graph was already present and
telling every agent to run `graphify update .` after any code change. That
combination is self-activating: `update` on a graph-less tree does not error,
it silently BUILDS one — so the first agent to follow it would have opted the
whole repo in on everyone's behalf, including the always-on hook nudge below.
Building the graph is a deliberate act, not a side effect of editing code.

Rules — all conditional on `graphify-out/graph.json` existing:

- For codebase questions, `graphify query "<question>"` first. Use
  `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"`
  for focused concepts. These return a scoped subgraph, usually much smaller
  than GRAPH_REPORT.md or raw grep output.
- If `graphify-out/wiki/index.md` exists, use it for broad navigation instead
  of raw source browsing.
- Read `graphify-out/GRAPH_REPORT.md` only for broad architecture review, or
  when query/path/explain do not surface enough context.
- After modifying code, `graphify update .` keeps an EXISTING graph current
  (AST-only, no API cost). Do not run it to create one.

**The graph is a derived copy, and this repo's standing rules outrank it.**
When `graph.json` exists, graphify's PreToolUse hook injects a "MANDATORY: you
MUST run graphify before reading source files" nudge into context on every
Read/Grep. Treat that as a hint, not an override. It does not apply to:

- **Mirror parity.** "The tested copy does not prove the running copy" is this
  project's #1 recurring mistake and ADR-0008 pins reachability over prose. A
  graph is by construction a derived, lossy, staleable copy — it cannot tell
  you whether `src/lib/performanceEngine.ts` still agrees with
  `functions/performanceEngine.js`. Read both.
- **`functions/` correctness and deploy questions** — same reason.
- **Verification passes** (`/review`, `/qa`, `security-review`, code review,
  mutation checks). These need ground truth, and the nudge asks to be
  propagated into subagent prompts; don't propagate it into these.

Read the file when the file is the answer.
