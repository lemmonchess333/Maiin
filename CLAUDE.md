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
├── components/         # Shared UI components (87 files total)
│   ├── analytics/      # Performance charts & stats (12 components)
│   ├── home/           # Home screen cards & widgets (10 components)
│   ├── nutrition/      # Nutrition UI (HealthScore, Water, Barcode, Serving)
│   ├── program/        # Workout program builder (ExercisePicker, CustomDayBuilder)
│   ├── progress/       # Progress tracking charts (TrendWeight, Energy, CalorieBalance)
│   ├── run/            # Running feature components (12 components)
│   ├── settings/       # Settings sections (10 components)
│   └── social/         # Social feed, activity cards (7 components)
├── features/           # Feature modules
│   ├── challenges/     # Challenge system (list, card, hook, tests)
│   ├── streaks/        # Streaks & badges (hook, grid, modal, tests)
│   └── program/        # Workout program engine (engine, templates, scheduler)
├── hooks/              # Custom React hooks (31 hooks)
│   └── __tests__/      # Unit tests for hooks/ (2 test files)
├── lib/                # Pure business logic & utilities (46 modules)
│   └── __tests__/      # Unit tests for lib/ (31 test files)
├── pages/              # Route-level page components (15 pages)
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
- **App version:** Defined via `__APP_VERSION__` (from package.json, currently 1.1.0)

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
| `Social.tsx`         | `/social`      | Social feed, crews, leaderboards                                           |
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
| `nutritionInsights.ts`    | Nutrition insight generation                                   |
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
| `gemini.ts`               | AI food analysis via Gemini API                                |
| `socialApi.ts`            | Firestore social operations (feed, kudos, follow, crews)       |
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
| `colorUtils.ts`           | Colour manipulation helpers                                    |
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
`useFirestore`, `useMeals`, `useWorkouts`, `useWaterLog`, `useShoes`, `useFoodFavourites`, `useBodyweightTrend`

**Running & GPS:**
`useGPS`, `useRunTimer`, `useRunningStats`, `useGuidedRun`, `useIntervalWorkout`, `usePrivacyZones`, `useAudioCues`, `useWakeLock`

**Social:**
`useSocialFeed`, `useDiscoverFeed`, `useCrews`, `useUnreadCount`, `useBlockedUsers`

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

| Function                  | Trigger                     | Purpose                                                                              |
| ------------------------- | --------------------------- | ------------------------------------------------------------------------------------ |
| `completeOnboarding`      | HTTPS callable              | Onboarding profile + program setup via Admin SDK (bypasses security rules)           |
| `analyzeFood`             | HTTPS request               | Vertex AI image-based food analysis                                                  |
| `analyzeFoodText`         | HTTPS request               | Vertex AI text-based food analysis (Pro feature)                                     |
| `computePerformanceWeek`  | HTTPS callable              | Manual performance rollup                                                            |
| `weeklyPerformanceRollup` | Scheduled (Sun 23:15 UTC)   | Automated weekly rollup for active users (30-day window)                             |
| `dailyPerformanceRefresh` | Scheduled (daily 02:10 UTC) | Daily performance refresh for recently active users (14-day window)                  |
| `onWorkoutCreated`        | Firestore trigger           | Post-workout: updates lastActiveAt, syncs challenge progress, recomputes performance |
| `onRunCreated`            | Firestore trigger           | Post-run: updates lastActiveAt, syncs km challenges, recomputes performance          |

Helper: `syncChallengeProgress()` — auto-updates challenge participant progress (workout_count, total_volume, total_km)

## Data Model

- **Firestore collections:** `users/{uid}`, `users/{uid}/meals`, `users/{uid}/workouts`, `users/{uid}/runs`, `users/{uid}/programState`, `activities` (public), `crews`, `challenges`, `challenges/{id}/participants`
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

## Testing

### Unit Tests (Vitest)

- Config: `vitest.config.ts`, setup: `src/test/setup.ts`
- 31 test files in `src/lib/__tests__/`, 4 in `src/utils/__tests__/`, 2 in `src/hooks/__tests__/` (useOnlineStatus, useRunTimer), plus feature module tests (challenges, streaks)
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
- **1st-gen API lives under `firebase-functions/v1`; `functions.config()` is gone.** As of firebase-functions v7, the bare `require("firebase-functions")` resolves to the **2nd-gen** API, and every export here is **1st-gen** (`runWith().https.onCall/onRequest`, `.pubsub.schedule`, `.firestore.document().onCreate`, `https.HttpsError`, `logger`). They import from `firebase-functions/v1` — keep new 1st-gen functions on that import or they silently become `undefined` triggers. `functions.config()` **throws** in v7 (the Cloud Runtime Config API was shut down 2025-12-31); secrets now come from Secret Manager via `firebase-functions/params` `defineSecret(...)`, listed in each function's `runWith({ secrets: [...] })`, and read at runtime as `process.env.<NAME>`. Provision before deploy with `firebase functions:secrets:set <NAME>` — **a deploy referencing an unprovisioned bound secret fails**, which is the safety gate. Current bound secrets: `STRIPE_SECRET_KEY` (deleteMyAccount, createCheckoutSession, stripeWebhook, all 3 Apple callables), `STRIPE_WEBHOOK_SECRET` (stripeWebhook), `APPLE_KEY_ID/ISSUER_ID/PRIVATE_KEY` + `BILLING_HMAC_SECRET` (+ `BILLING_PREVIOUS_HMAC_SECRET` during rotation only) on `restoreApplePurchases`. Non-secret config (`ADMIN_UIDS`) stays a plain env var — no binding needed.
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
- **`onAuthStateChanged` fires several times per sign-in.** Debounce one-time / side-effecting work (maintenance backfills, etc.) behind a settle timer — a bare `firedRef` guard has a race window during the sign-in settle. Scope any queued or cached writes (offline queue, share queue) by `uid` so they can't leak across an account switch on a shared device. (`9ae1247` debounced the maintenance backfill; PR #820 uid-scoped the offline + share queues.)
- **Verify the three design-system invariants that keep drifting back, per-PR — not in periodic sweeps.** Before committing any UI: every numeric display uses `font-mono` + `tabular-nums`; every colour is a `THEME`/token (no hex literals); every interactive element clears 44px via the `Button`/`IconButton`/`Toggle` primitives. These three regress constantly and keep getting swept up after the fact. (`2dec467` + `97a783d` mono/font audits; `9ef01a1` + `82b5266` tokenized stray hex; `f89d34b` whole-app consistency pass; touch-target policy shipped in 5 parts.)

## Common Gotchas

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

- **Aesthetic:** Clean, warm light mode (iOS-inspired #F2F2F7 grouped background). Cards on white. NOT a dark glass app in light mode — it's minimal and calm with subtle depth.
- **Dark mode:** True dark glass aesthetic (bg #121214, surfaces #1A1A1F) — used when toggled
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
- Text muted: #8E8E93 (iOS system grey)

### Typography (Plus Jakarta Sans + JetBrains Mono)

- **Display font:** Plus Jakarta Sans (all UI text)
- **Mono font:** JetBrains Mono (stat numbers — calories, weight, reps, volume)
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
- **`HybridWeekRail`** — week-at-a-glance with a coral RUN lane + a purple
  LIFT lane per day tile. A combined day shows both lanes natively. Compact
  lane labels (30m / 15K / 5×1K / Push); full names live in the day sheet.
  Preserves the Q5 extras pills + coachmark. Shown whenever the week has any
  content — including freeform lifters (lift week + logged-run extras).
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
- Active plan editing deep-links to `/settings/training` (Run8 PR1a — not
  reversed); the entry copy reads as "Edit run plan", not a generic
  settings jump.

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

### Component Architecture

- **Pages:** src/pages/ — route-level, lazy-loaded
- **Home screen built from:** WeekStrip → DayPeekCard → StackedCTACards (action pills + health/water/weight/steps) → TodayEnergy → HybridBalanceCard → InsightStrip
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
- **Consistent numeric treatment** — all numbers in JetBrains Mono with tabular-nums
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

### Tooltip + Coachmark primitive (`claude/tooltip-primitive`)

Affects: `src/components/ui/Tooltip.tsx`, `src/components/ui/Coachmark.tsx`, plus three wire-ups (Performance Index in `PerformanceTab.tsx`, Trajectory delta chip in `social/TrajectoryCard.tsx`, Running nav coachmark in `pages/Program.tsx`).

Note: the Nutrition HealthScore wire-up (`nutrition/HealthScoreCard.tsx`) was removed by PI2 (Performance arc consolidation) — that surface no longer exists.

PR #606 added automated coverage for the items marked [x] below; the [ ] items remain genuine manual / device-level checks.

- [ ] Light + dark mode visibility on all 3 wire-ups — tooltip body and arrow must register in both themes
- [x] 375px viewport — body wraps at `max-w-[280px]`, never overflows the screen — PR #606 pins the class
- [ ] Open a vaul drawer while a tooltip is showing — the drawer should occlude (z-50 > z-40). PR #606 pins the z-40 class but real occlusion needs the drawer mounted together with the tooltip in a real DOM.
- [x] VoiceOver: body content is announced when the anchor receives focus (via `aria-describedby`) — PR #606 pins the wiring (screen-reader announcement itself stays manual)
- [x] Keyboard flow: Tab to anchor → Enter opens → Escape closes → focus returns to anchor — PR #606
- [ ] iOS Safari + Capacitor build: rubber-band scroll doesn't drift the portal
- [x] `prefers-reduced-motion: reduce` set at OS level — the slide animation is suppressed; fade still plays — PR #606
- [ ] First-use Coachmark on the Programme page running icon dismisses correctly via all paths (anchor tap, outside tap, Escape, 6s timeout) and persists across reloads

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

### PR-L bugfix verification (PR #815)

Affects: `functions/index.js`, `src/pages/RunSummary.tsx`. Eight verified bugs in the PR-L arc fixed; the production-impact ones below need post-deploy spot-checks because the bugs were silently-broken-not-loud.

- [ ] Real race-templated saved run on race date has the new top-level `date: "YYYY-MM-DD"` field — confirm via Firestore console
- [ ] `dailyRaceReconciliationSweep` logs no longer report false `race_no_show` for users who completed their race
- [ ] `weeklyFellBehindCheck` Monday log line shows realistic `set=N` count (pre-fix it would have been every-active-user every Monday because the runs query returned 0 docs)
- [ ] Recovery-entry path writes `phase: 'recovery'` on the first race-templated save after race date — check `programState/current` doc for the affected user
- [ ] L3 clear writes `phase: null` and `recoveryEndDate: null` (not omitted) — the user actually exits recovery
- [ ] On a BST day, `weeklyPerformanceRollup` and `dailyPerformanceRefresh` log timestamps confirm the timezone fix landed (23:15 UTC and 02:10 UTC respectively — was 22:15 / 01:10 pre-fix due to Europe/London)
- [ ] On a real workout save, `onWorkoutCreated` logs include challenge-progress increments (pre-fix this silently TypeErrored on `participantSnap.exists()` and was swallowed)

### Public profile uid binding (PR #818)

Affects: `firestore.rules` lines ~200-215.

- [ ] From the client SDK, attempt `setDoc(doc(db, 'users/<me>/public/profile'), { uid: '<other-uid>', displayName: 'Victim' }, { merge: true })` — must be rejected with `permission-denied`. Same write WITHOUT the `uid` field (or with `uid: '<me>'`) should still succeed.

### Subscription expiresAt client-side guard (PR #818)

Affects: `src/lib/subscription.ts`.

- [ ] Manually set `subscriptionTier: "pro"` + `subscriptionExpiresAt: <past ISO>` on a test user's doc. Open the app — `useSubscription().isPro` should return `false`. Tests pin this but want a real client roundtrip too because `Date.parse` of the stored string is locale-sensitive.

### Offline + share queue uid scoping (PR #820)

Affects: `src/lib/offlineQueue.ts`, `src/lib/shareComposer.ts`.

- [ ] Two-account device test. Sign in as A, go offline, log a workout. Sign out, sign in as B (same device). Confirm A's queued workout does NOT appear under B's account, and that `localStorage['tropos_offline_queue']` still contains the entry tagged `uid: <A>`. Sign back in as A, return online — confirm the queue flushes under A's auth.
- [ ] Same flow for the share composer queue (`tropos.share.queue`) — queue an offline share as A, switch to B, confirm no posts appear in B's feed; return to A, confirm A's post finally lands.
- [ ] Confirm legacy pre-deploy items are dropped on first read (the migration is a one-time filter in `getQueue`). Users who upgraded with pending queued writes will lose those — intended, but worth a release-note line.

### Apple subscription uniqueness binding (PR #822)

Affects: `functions/applePurchase.js`, new `appleSubscriptions/{originalTransactionId}` collection.

- [ ] First real iOS purchase post-deploy — confirm a new `appleSubscriptions/<originalTransactionId>` doc is created with `uid` matching the purchaser, plus `productId` and `expiresAt`.
- [ ] Restore-purchase flow on the same Apple ID under the same Tropos account — confirm the lookup doc updates in-place (timestamp changes, uid stays).
- [ ] Negative test: attempt to call `restoreApplePurchases` from a second test account using the first user's `originalTransactionId` (intercept via debug). Expect the function to throw `"different account"` and no user-doc write to land.

### Stripe webhook transactional dedup (PR #822)

Affects: `functions/index.js` `stripeWebhook` handler, `stripeEvents/{event.id}` doc shape.

- [ ] Post-deploy, on the next real Stripe webhook delivery, confirm the `stripeEvents/<event.id>` doc has a `claimedAt` field (new) AND a `processedAt` field (existing). Pre-fix only `processedAt` was set.
- [ ] If a webhook handler crashes mid-process (force via stripe-cli test event), confirm the `stripeEvents/<event.id>` doc is DELETED so Stripe's retry can re-attempt. Pre-fix the partial claim would persist and the retry would silently skip.

### App Check enforcement rollout — operator-in-loop

Affects: every callable in `functions/`. NOT a code change — a Firebase Console + monitoring exercise.

Client-side App Check is already initialised via `src/lib/appCheck.ts` (reCAPTCHA v3 on web, no-op on native until the Capacitor plugin lands). Server-side enforcement is OFF. Flipping enforcement without first verifying token flow would lock out web users whose reCAPTCHA fetch fails and break all native traffic.

Rollout sequence (operator, not agent):

- [ ] Verify `VITE_RECAPTCHA_V3_SITE_KEY` is set in the Vite prod env AND the matching site key is registered in **Firebase Console → App Check → Apps**. Without this the web client never initialises App Check and the APIs tab shows 0% verified.
- [ ] Wait 24–48h post-deploy for telemetry to populate.
- [ ] Open **Firebase Console → App Check → APIs tab → Cloud Functions for Firebase**. Look for "Verified requests %". Target: ≥99% sustained for ≥7 days before any per-callable flip.
- [ ] If verified % is low and the cause isn't obvious, query Cloud Logging: `resource.type="cloud_function" jsonPayload.appCheck.status=("MISSING" OR "INVALID")` to see exactly which callables would reject and which uids are missing tokens. Usual culprits: ad-blockers killing reCAPTCHA (rare, swallowed) or native iOS (all `MISSING` until the Capacitor App Check plugin is wired).
- [ ] Flip enforcement per-callable in `functions/index.js` by adding `.runWith({ enforceAppCheck: true })`. Start with low-risk endpoints (e.g. `askGeminiText`). Keep destructive ones (`deleteMyAccount`, `verifyApplePurchase`) until last. Don't bulk-flip.

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
