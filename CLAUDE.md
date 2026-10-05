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
- **Maps:** MapLibre GL 6, with OpenFreeMap's tiles (`src/lib/basemap.ts`; the credit must stay on every map)
- **Animation:** Framer Motion 12
- **PWA:** a hand-written service worker, `public/sw.js`, registered by `src/lib/register-sw.ts`
- **Native:** Capacitor (iOS/Android)
- **Payments:** RevenueCat (`@revenuecat/purchases-capacitor`) for native IAP (ADR-0006); Stripe Checkout is server-side only and dormant (Sub4) — the client loads no Stripe SDK
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
functions/              # Firebase Cloud Functions (plain JS, CommonJS)
e2e/                    # Playwright specs; screenshot capture specs in e2e/screenshots/
```

## Architecture Notes

- **All pages are lazy-loaded** via `lazyRetry()` wrapper in App.tsx (handles stale cache)
- **Manual chunks** in vite.config.ts: firebase-auth, firebase-db, charts, vendor, maplibre, motion, date-fns, barcode, body-highlighter
- **Path alias:** `@/` maps to `src/`
- **Base path:** `/Maiin/` (for GitHub Pages deployment)
- **Offline support:** `src/lib/offlineQueue.ts` queues writes when offline
- **Error boundaries:** `RouteErrorBoundary` (page-level) and `SectionErrorBoundary` (card-level)
- **Tab preloading:** `BottomNavigation` calls `preloadTab()` (`src/lib/preloadTab.ts`) to load a tab's page as the person reaches for it
- **Auth routing:** Three route sets — unauthenticated (Login), onboarding incomplete (Onboarding), authenticated (full app)
- **App version:** Defined via `__APP_VERSION__`, read from `package.json` at build time

## Pages (src/pages/)

Every `path=` in `src/App.tsx` is named here, and every file named here
exists — pinned by `claudeMdFreshness.test.ts` in both directions
(`/dev/*` is the one allowlisted family). Add the row with the route.

| Page                                   | Route                              | Description                                                                    |
| -------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------ |
| `Home.tsx`                             | `/`                                | Main dashboard — WeekStrip, hero cards, energy, insights                       |
| `Food.tsx`                             | `/food`                            | Food/meal logging with camera, NL parsing, barcode (`/log` redirects here)     |
| `History.tsx`                          | `/history`                         | Analytics: an overview, with Lifting / Running / Body / Food pages (`?view=`)  |
| `ExerciseHistory.tsx`                  | `/history/exercise/:name`          | Per-exercise progression chart + rep-bucket PR strip                           |
| `Program.tsx`                          | `/program`                         | Workout program builder & scheduling                                           |
| `Routine.tsx`                          | `/routine/:routineId`              | Saved-routine workout runner (reuses `WorkoutSession`)                         |
| `WorkoutDetail.tsx`                    | `/workout/:workoutId`              | Saved lift session detail; the delete action lives here (ADR-0012)             |
| `Run.tsx`                              | `/run`                             | Active GPS run tracking (full-screen, no nav)                                  |
| `RunSummary.tsx`                       | `/run-summary`                     | Post-run stats & map review                                                    |
| `RunDetail.tsx`                        | `/run/:runId`                      | Historical run detail view                                                     |
| `WeeklyReview.tsx`                     | `/review`                          | Sunday recap — passive narration of the week (Rev1)                            |
| `Social.tsx`                           | `/social`                          | Social feed, Circles/Spaces, leaderboards                                      |
| `Space.tsx`                            | `/space/:spaceId`                  | Community Space — hero, join/leave, post list + composer                       |
| `UserProfile.tsx`                      | `/user/:uid`                       | A person's profile: this week's shared sessions, badges, their posts           |
| `Upgrade.tsx`                          | `/upgrade`                         | Pro pricing + purchase page                                                    |
| `SettingsIndex.tsx`                    | `/settings`                        | Settings section list — iOS nested-page IA (`/settings/legacy` redirects here) |
| `settings/SettingsProfile.tsx`         | `/settings/profile`                | Profile — photo, name, body metrics in the chosen units                        |
| `settings/SettingsAccount.tsx`         | `/settings/account`                | Account — email, password, sign-out, account deletion                          |
| `settings/SettingsTraining.tsx`        | `/settings/training`               | Programme — the setup, where each part is set, reset (Pgm4)                    |
| `settings/SettingsLiftPlan.tsx`        | `/settings/lift-plan`              | Dedicated lift-plan editor                                                     |
| `settings/SettingsRunPlan.tsx`         | `/settings/run-plan`               | Dedicated run-plan editor (the Programme Run surface deep-links here)          |
| `settings/SettingsWorkoutPrefs.tsx`    | `/settings/workout-prefs`          | Workout preferences                                                            |
| `settings/SettingsNutrition.tsx`       | `/settings/nutrition`              | Nutrition section — targets, adaptive TDEE                                     |
| `settings/SettingsData.tsx`            | `/settings/data`                   | Your data — exports, and the way into recently deleted meals                   |
| `settings/SettingsRecentlyDeleted.tsx` | `/settings/recently-deleted-meals` | Soft-deleted meals archive (24 h window, F5c)                                  |
| `settings/SettingsHealth.tsx`          | `/settings/health`                 | HealthKit steps — discovery and reconnection (ADR-0007)                        |
| `settings/SettingsShoes.tsx`           | `/settings/shoes`                  | Running shoes                                                                  |
| `settings/SettingsNotifications.tsx`   | `/settings/notifications`          | Reminders, push, and a switch per activity notification (S3)                   |
| `settings/SettingsPrivacy.tsx`         | `/settings/privacy`                | Privacy — visibility, blocked users, privacy zones                             |
| `settings/SettingsUnitsAppearance.tsx` | `/settings/units-appearance`       | Units and theme                                                                |
| `settings/SettingsSubscription.tsx`    | `/settings/subscription`           | Subscription status and management                                             |
| `settings/SettingsSupportLegal.tsx`    | `/settings/support-legal`          | Support, legal links, app version                                              |
| `AdminModeration.tsx`                  | `/admin/moderation`                | Admin report queue — client gate `VITE_ADMIN_UIDS`, the callable re-checks     |
| `Diagnostics.tsx`                      | `/diagnostics`                     | Operator diagnostics (push, SW update, App Check state) — hidden, unlinked     |
| `dev/*.tsx`                            | `/dev/*`                           | Developer labs (brand bake-off, form-motion lab) — not product surfaces        |
| `Onboarding.tsx`                       | `*` (fallback)                     | Multi-step setup flow (shown when onboarding incomplete)                       |
| `Login.tsx`                            | `*` (fallback)                     | Welcome screen on first visit, then sign-up or sign-in (Email, Google, Apple)  |
| `PrivacyPolicy.tsx`                    | `/privacy`                         | Legal — reachable signed-out                                                   |
| `TermsOfService.tsx`                   | `/terms`                           | Legal — reachable signed-out                                                   |
| `Support.tsx`                          | `/support`                         | Public support page (App Store Support URL) — reachable signed-out             |

## Key Business Logic (src/lib/)

| File                    | Purpose                                                        |
| ----------------------- | -------------------------------------------------------------- |
| `performanceEngine.ts`  | Weekly performance index (0-100), load bands, deload detection |
| `tdee.ts`               | Base TDEE calculation                                          |
| `phaseNutrition.ts`     | Day-type specific macro adjustments (lift/run/rest)            |
| `savedRuns.ts`          | The one saved-run reader: query, parse, Lift3 day, queued runs |
| `savedWorkouts.ts`      | The one saved-workout reader: query, parse, day, queued ones   |
| `gps.ts`                | Haversine, pace, splits, elevation, Kalman filter, GPX export  |
| `paceTrends.ts`         | Running pace trend detection (PR/improving/consistent)         |
| `guidedRun.ts`          | Guided run logic & coaching                                    |
| `weather.ts`            | Weather API integration for runs                               |
| `privacyZones.ts`       | GPS privacy zone detection for runs                            |
| `prTracking.ts`         | Personal record tracking system                                |
| `liftRecordsStore.ts`   | Best-lift map: load or rebuild, checked commit, invalidation   |
| `scheduleUtils.ts`      | Weekly schedule generation (lift/run/rest)                     |
| `exercises.ts`          | Exercise database                                              |
| `workoutTemplates.ts`   | Workout template library                                       |
| `nlFoodParser.ts`       | Natural language food parsing                                  |
| `socialApi.ts`          | Firestore social operations (feed, kudos, follow)              |
| `shareCardGenerator.ts` | Share card image generation (html-to-image)                    |
| `analytics.ts`          | Analytics computation                                          |
| `historyFigures.ts`     | Analytics range figures: window, range before, join-day clamp  |
| `trainingWeek.ts`       | The week done and planned, which every week count reads        |
| `todaySession.ts`       | Home's session card: which card a day gets, tomorrow's name    |
| `liftCompletion.ts`     | Finishing a lift: the saved workout, the save and its receipt  |
| `liftPost.ts`           | A lift's feed post, built from what was done, and its reader   |
| `runCompletion.ts`      | Finishing a run: the saved run, the save resumed by id, a post |
| `subscription.ts`       | Pro subscription handling                                      |
| `firebase.ts`           | Firebase app initialization & Firestore/Auth/Storage exports   |
| `auth.tsx`              | AuthProvider, useAuth hook, UserProfile interface              |
| `api.ts`                | API client helpers                                             |
| `haptic.ts`             | Haptic feedback utility (Capacitor)                            |
| `offlineQueue.ts`       | Queues Firestore writes when offline, flushes on reconnect     |
| `errorReporting.ts`     | Error reporting utilities                                      |
| `logger.ts`             | Structured logging                                             |
| `notifications.ts`      | Push notification setup                                        |
| `types.ts`              | Shared TypeScript type definitions                             |
| `performanceTypes.ts`   | Performance engine type definitions                            |
| `macroConstants.ts`     | Macro/nutrition constants                                      |
| `export.ts`             | Data export utilities                                          |
| `exerciseDemo.ts`       | Exercise demo/animation data                                   |
| `firestoreGuards.ts`    | Firestore data validation guards                               |
| `funComparisons.ts`     | Fun stat comparison generators                                 |
| `purchaseProvider.ts`   | In-app purchase provider (Capacitor)                           |
| `register-sw.ts`        | Service worker registration                                    |
| `timeAgo.ts`            | Relative time formatting                                       |
| `theme.ts`              | THEME object for chart colours & design tokens                 |
| `utils.ts`              | General utility functions                                      |

## Feature Modules (src/features/)

### goalSpace/ · spaces/ · partnerStreak/ · run/

`goalSpace/` owns Goal Spaces (Circles) — membership,
invites, weekly focus, check-ins. `spaces/` owns the space definitions,
including the race spaces a `raceGoal.eventSpaceId` binds to.
`partnerStreak/` owns partner bonds and shared-day streaks (the SERVER is
the sole writer of bond streak state — see `docs/qa/pre-launch-backlog.md`). `run/` holds
run-surface feature modules.

### challenges/

- `useChallenges.ts` — Challenge data hook
- `ChallengeList.tsx` / `ChallengeCard.tsx` — Challenge UI components
- `__tests__/useChallenges.test.ts`

### streaks/

- `useStreaks.tsx` — Streak calculation & management
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
`useGPS`, `useRunTimer`, `useRunningStats`, `useSavedRuns` (runs on `useSavedSessions`, the one live engine for saved runs and workouts; `savedSessionsReaderGuard.test.ts` keeps their readers the only ones), `useSessionPlayer`, `usePrivacyZones`, `useAudioCues`, `useWakeLock`

**Social:**
`useSocialFeed`, `useDiscoverFeed`, `useUnreadCount`, `useBlockedUsers`, `useFollowState` (one follow record shared by every Follow control), `useUserProfileData`

**Performance & Analytics:**
`usePerformance`

**Nutrition:**
`useFoodAnalysis`, `useMealReminders`

**UI & UX:**
`useGuideHint`, `useCountUp`, `useReducedMotion`, `useFocusTrap`, `useOnlineStatus`

**Payments:**
`useProCheckout`

## Cloud Functions (functions/)

Runtime: **Node 22** | Language: **Plain JS (CommonJS)**

The table below is a SELECTION, not the inventory — it names 10 of the
functions `functions/index.js` exports. The Pages table above claims
completeness and is pinned both ways; this one does not and is not, so do
not read a function's absence here as evidence it does not exist. The
authoritative list is `grep -oE "^exports\.[A-Za-z0-9_]+" functions/index.js`.
What IS pinned: the runtime above matches `firebase.json`, and every
function named below still exists (`claudeMdFreshness.test.ts`).

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
- **Email sign-ups verify after the plan, not before it** (owner, 2026-10-01, reversing the 2026-09-15 wall). Sign-up sends the link (`signUp` in `auth.tsx`) and goes straight to onboarding, and `completeOnboarding` no longer asks for the claim. Home asks (`VerifyEmailBanner`, with Resend and a way to change a wrong address) until the app sees the address verified. The App-level gate rechecks on every return to the app, reloading Auth and refreshing the token, so tapping the link in Mail is enough. The social gate below is unchanged.
- **Public writes need a verified email.** The `email_verified` token claim gates `activities` and `spaces/{id}/posts` creates in `firestore.rules` (`isEmailVerified()`) and comments in the two comment callables (`assertCallerEmailVerified`). Private logging under `users/{uid}/*` and every non-content interaction stay open to unverified accounts; OAuth accounts carry the claim already. The e2e rig marks its signup-form accounts verified through the Auth emulator REST API (seed scripts create users verified).
- **Activity notifications follow the recipient's switches.** `notificationPreferences` on `users/{uid}` (S3: props, comments, circles and spaces on; new followers off) is read by `createNotification`, the one writer of `notifications/{uid}/items`, which writes nothing for a kind that is off. The client's copy (`src/lib/notificationPreferences.ts`) and the rules' value gate are pinned to the server's (`functions/lib/notificationPreferences.js`) by `notificationPreferences.cross.test.ts`. A new notification type has to be given a switch, or none on purpose, in that file.
- **User profile:** Defined in `src/lib/auth.tsx` as `UserProfile` interface
- **Feed items:** Defined in `src/hooks/useSocialFeed.ts` as `FeedItem` / `ActivityData`

## Conventions

- **Components:** Default exports, PascalCase filenames
- **Hooks:** Named exports, `use` prefix, camelCase filenames
- **Lib functions:** Named exports, camelCase filenames
- **Tests:** Colocated in `__tests__/` directories, `*.test.ts` suffix
- **Styling:** Tailwind utility classes, `THEME` object from `src/lib/theme.ts` for chart colors
- **Icons:** lucide-react (import individual icons). The drawn exceptions live in `src/components/icons/`: the tab bar's own set (`TabIcons.tsx`, an outline and a filled form each) and the avocado macro icon; the brand mark is `ui/BrandMark.tsx`
- **Toasts:** sonner (`toast.success()`, `toast.error()`)
- **UI patterns:** Drawer (vaul), bottom sheets, pressable cards
- **Class names:** `clsx()` + `twMerge()` for conditional/merged Tailwind classes
- **Drag & drop:** @dnd-kit for sortable exercise lists
- **Firestore writes:** `addDocGuarded` / `setDocGuarded` /
  `updateDocGuarded` / `deleteDocGuarded` from `src/lib/firestoreWrite.ts`,
  never the raw SDK — `firestoreWriteGuard.test.ts` bans the raw calls.
- **Dates:** en-GB day-before-month ("22 Aug", "Saturday 23 August") via the
  `src/utils/formatters.ts` helpers. Locale-less `toLocaleDateString` follows
  the DEVICE (renders "Aug 22" on a US phone) and month-first date-fns
  patterns ("MMM d") are the same bug in disguise — both are banned by
  `src/utils/__tests__/dateTreatment.test.ts`. Chart-axis "22/8" numerals are
  their own compact register and exempt.
- **Times:** 24-hour "HH:mm" ("07:10", "13:13") via `formatTimeOfDay` in
  `src/utils/formatters.ts`. A clock pattern written at the site (date-fns
  "h:mm a", even "HH:mm"), an Intl time (`toLocaleTimeString`, an `hour`
  option) and AM/PM in copy are banned by
  `src/utils/__tests__/timeTreatment.test.ts`. Durations and paces ("23:41",
  "5:18 /km") are not times of day.
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
  Seed documents with the fields the app really writes: the fake leaves out
  a document that lacks a field the query is ordered by, as Firestore does.
  It used to return them, and the runs query ordered by `createdAt`, which no
  saved run has, read nothing in production from May to October 2026 with
  its tests green.
- Deliberately NOT counted here. Every file count this document used to carry
  had drifted by 3–7× (87 components → 319, 31 hooks → 75, 46 lib modules →
  198). A number nothing checks is a claim that rots; prefer describing the
  shape, or add a test that pins the number.
- Run: `npm run test` (single run) or `npm run test:watch` (watch mode)

**CI runs the same suite five ways, and knowing that changes what you
write.** Each is a full run in `ci.yml`, and each exists because the
single-condition run had been hiding a real defect:

| job             | condition                                         | what it caught                                                                                                                                                             |
| --------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unit`          | the ordinary run                                  | —                                                                                                                                                                          |
| `unit-timezone` | Kiritimati, Midway, **Auckland**, both suites     | a DST transition inside a 21-day span cost a race chip a whole week. Auckland is there for the transition, not the offset — neither extreme observes DST, and nor does UTC |
| `unit-locale`   | de-DE, fr-FR                                      | 26 assertions spelling a comma, and a real defect: a `toLocaleDateString(undefined, …)` rendering every saved workout's date in the DEVICE's order                         |
| `unit-future`   | clock +90 days, client AND server suites          | two fixtures dated against a 3-month range pill that would have gone red on a calendar morning                                                                             |
| `unit-shuffle`  | `--sequence.shuffle`, seeds 23 and 5, both suites | three files that passed only from where they sat. Two seeds because neither found all three: 23 catches the first two, 5 catches the third                                 |

Practical consequences: do not spell a thousands separator in an
assertion (`src/test/localeGrouping.ts` builds it), do not pin a fixture
to a date literal that some window has to contain (derive it from the
clock), and expect `unit-future` to go red a quarter BEFORE something
expires rather than on the day.

Locally: `TROPOS_CLOCK_OFFSET_DAYS=90 npm run test` for the future run,
`TROPOS_CLOCK_AT=2026-10-18 npm run test` to pin the day something
breaks, `TZ=Pacific/Auckland` and `LC_ALL=de_DE.UTF-8` for the others.

**Test ORDER is gated, and the shape of what it caught is the useful
part.** All three survivors were global mutable state, and none was
visible in written order: `WorkoutSessionCompletion.test.tsx` and
`Coachmark.test.tsx` (deleted with the component in FV2, 2026-10-04)
each left a fake-timer group holding jsdom's
animation-frame counter AND motion-dom's batcher shut, so later
`toBeVisible()` assertions in the same file read `opacity: 0`; and
`useHomeProgram.test.tsx` asserted a `vi.mock` factory counter that a
module registry runs once per FILE, so its 0-then-1 was true only when
it ran first. A suite that fakes timers must settle framer's frame loop
while the fake clock is still installed — `src/test/setup.ts` cannot do
it for you, and its header says why.

The seeds are FIXED, which pins the ORDER and nothing else. **The job
is not deterministic.** Seed 23 went red
on one head and green on the next — same test, same seed, one
branch-update apart — and six local repetitions never reproduced it.
vitest's `seed` seeds the ordering RNG; the worker pool is separate, so
which files are in flight together and how long each takes come from the
machine. Read results accordingly: a GREEN `unit-shuffle` says those two
orders held once on that runner, NOT that they are clean; a RED one is
worth chasing but may not reproduce, and the order replays exactly while
the timing does not — so a failure that will not come back is evidence
about the defect's shape (a race), not evidence the run lied. The seeds
stay fixed because a rotating one would catch more and would also redden
an unrelated PR on a Tuesday — the same trade `check-race-dates.ts`
already made for this repo.

### E2E Tests (Playwright)

- Config: `playwright.config.ts`
- Specs in `e2e/`: `*.spec.ts` run signed out on the `chromium` and `mobile` projects; `*.auth.spec.ts` and `*.capture.spec.ts` run on `auth-emulator` against the emulator rig
- Run: `npm run test:e2e` or `npm run test:e2e:ui` (interactive)

## CI/CD

- **deploy-production.yml ("Deploy production") is the one entry point for the web and backend deploys.** It runs on every push to `main` and on a manual `workflow_dispatch`, one release at a time (the `production-release` concurrency group queues a new release behind the running one rather than cancelling it). The five workflows below are `workflow_call` only, so none of them can be run on its own — to redeploy anything, re-run Deploy production. Its `changes` job diffs against the last SUCCESSFUL release, not the previous push, and runs the backend chain only when something under `functions/`, `firestore.rules`, `firestore.indexes.json`, `storage.rules`, `firebase.json`, `scripts/verify-*`, `scripts/verify_*`, `scripts/write-functions-env.mjs` or `.github/workflows/deploy*` changed; a manual dispatch always runs it. Order: Firestore → Storage → Functions, then Hosting and Pages once all three succeed (or straight away when the backend was skipped).
- **deploy-firestore.yml:** Firestore rules (read back after deploying), then indexes.
- **deploy-storage.yml:** Storage rules, gated behind the `STORAGE_XSERVICE_APPROVED` repo variable (set since 2026-09-15). Before releasing rules that read Firestore it confirms the Storage service agent holds the role they need (`scripts/verify_storage_rules_iam.py`), and fails the release if the role is missing or unreadable — firebase-tools grants it only interactively, never from CI. The packet-11 row in `docs/qa/pre-launch-backlog.md` has the one-time grant.
- **deploy-functions.yml:** Cloud Functions — injects the per-commit bundle marker, runs `firebase deploy --only functions --force` (so a removed export is deleted, not refused), then reads the deployed source back (`scripts/verify-deployed-functions-source.py`). A failure files or updates one rolling "deploy-functions failing on main" issue.
- **deploy.yml:** Builds and deploys to GitHub Pages.
- **deploy-hosting.yml:** Builds with `base: "/"` and deploys to Firebase Hosting. The web build's security headers (HSTS, `nosniff`, Referrer-Policy, `X-Frame-Options`, a `frame-ancestors 'none'` CSP header, Permissions-Policy) live in `firebase.json` and ship ONLY via Hosting — GitHub Pages cannot set response headers, accepted because Pages is the preview surface, not the product. `frame-ancestors` is ignored in a `<meta>` CSP, which is why it is a header. Pinned by `hostingSecurityHeaders.test.ts`.
- **deploy-ios.yml:** Separate and manual-only (`workflow_dispatch`): builds the web bundle into the iOS project and uploads to TestFlight. Its header marks it an unverified scaffold. Without the `IOS_DIST_CERT_*` secrets it makes each run's certificate and profile from the App Store Connect API key (`scripts/ios/asc-signing.mjs`, revoking the previous run's), so the owner needs no Mac (`docs/ios-release.md`).
- **Firebase project:** `adaptive-fitness-af8bb`

### Cloud Functions deploy — known gotchas

These lessons cost a full day to find. Read before changing the deploy pipeline.

- **firebase-tools deduplicates uploads against the deployed bundle hash.** If a `functions/**` PR doesn't change any `.js` files (e.g. a docs-only PR like a CHANGELOG, README, or new markdown), the workflow triggers but `firebase deploy --only functions` will skip the actual upload and report success. Production stays on the previous bundle — but CI is green and nothing surfaces the drift. **deploy-functions.yml has a `Force unique bundle hash` step** that prepends a per-commit comment marker to `functions/index.js` before deploy, defeating the dedup. Do not remove that step; if you must, add a different mechanism that guarantees a fresh bundle hash per workflow run.
- **A cascade of failed deploys followed by one docs-only success is the worst case.** If billing or auth issues cause N consecutive deploys to fail at the deploy step, then the next PR happens to be docs-only and the dedup logic kicks in, the workflow reports success but production has been stranded for the entire N-day window. The build-marker step prevents this scenario, but the **`workflow_dispatch` trigger on Deploy production** is the escape hatch — re-run it from the Actions UI without pushing a new commit. A dispatch always runs the whole backend chain, and so does the next push after a failed backend release, because `changes` compares against the last successful one.
- **Blaze plan is required for any Cloud Functions deploy.** Scheduled functions (Pub/Sub), Apple/Stripe webhook secrets, and the build-step machinery all live behind Blaze. If billing is detached (card expiry, manual unlink, etc.), every functions/-touching PR fails with `Extensions require the Blaze plan` — which is misleading; Tropos has no extensions, the error is firebase-tools' generic guard for any Blaze-only feature.
- **`maxInstances` is mandatory on every HTTP and Firestore-trigger function.** Cloud Functions v1 has NO default cap; a runaway client / DDoS / accidental call-in-render loop can spin up thousands of containers and rack up hundreds of pounds in hours. `functions/index.js` declares three tiers (`DEFAULT_HTTP_CAP = 100`, `ADMIN_HTTP_CAP = 10`, `TRIGGER_CAP = 50`) and uses `functions.runWith({...})` on each export. Don't add a new HTTP/trigger function without one of those caps.
- **Production deploy verification:** the only conclusive proof a function deployed is to view the deployed source in Firebase Console (https://console.cloud.google.com/functions/details/us-central1/<name>/source). CI green is a _necessary but not sufficient_ signal — see the dedup gotcha above. `deploy-functions.yml` now reads back the deployed source of the functions `scripts/verify-deployed-functions-source.py` lists and fails if any differs from the bundle it uploaded; for a function it does not list, spot-check that the deployed source matches main by searching for a recent string (e.g. a new comment from the PR).
- **1st-gen API lives under `firebase-functions/v1`; `functions.config()` is gone.** As of firebase-functions v7, the bare `require("firebase-functions")` resolves to the **2nd-gen** API, and every export here is **1st-gen** (`runWith().https.onCall/onRequest`, `.pubsub.schedule`, `.firestore.document().onCreate`, `https.HttpsError`, `logger`). They import from `firebase-functions/v1` — keep new 1st-gen functions on that import or they silently become `undefined` triggers. `functions.config()` **throws** in v7 (the Cloud Runtime Config API was shut down 2025-12-31); secrets now come from Secret Manager via `firebase-functions/params` `defineSecret(...)`, listed in each function's `runWith({ secrets: [...] })`, and read at runtime as `process.env.<NAME>`. Provision before deploy with `firebase functions:secrets:set <NAME>` — **a deploy referencing an unprovisioned bound secret fails**, which is the safety gate. Current bound secrets: `STRIPE_SECRET_KEY` (deleteMyAccount, createCheckoutSession, stripeWebhook, all 3 Apple callables), `STRIPE_WEBHOOK_SECRET` (stripeWebhook), `APPLE_KEY_ID/ISSUER_ID/PRIVATE_KEY` + `BILLING_HMAC_SECRET` (+ `BILLING_PREVIOUS_HMAC_SECRET` during rotation only) on `restoreApplePurchases`, `RESEND_API_KEY` (sendPasswordResetLinkCallable and sendVerificationEmailCallable — account emails; createReport — the report alert), `REVENUECAT_WEBHOOK_AUTH` + `REVENUECAT_REST_KEY` (revenueCatWebhook; the REST key also on syncRevenueCatEntitlement). Non-secret config (`ADMIN_UIDS`, `RESEND_FROM`, `MODERATION_ALERT_EMAIL`, `REVENUECAT_SANDBOX_UIDS`, …) stays a plain env var — no binding needed — and is set as a GitHub repository variable of the same name: `deploy-functions.yml` writes them into `functions/.env` (`scripts/write-functions-env.mjs`, whose list `write-functions-env.test.ts` holds to every plain variable `functions/` reads). A deploy with that file replaces each function's plain variables, so a new one goes on the list, not on someone's machine. `npm run secrets:check` (in `functions/`) prints the authoritative provision list from the source.
- **A functions deploy needs the whole GCP readiness chain, not just Blaze + a fresh bundle.** The Secret Manager API must be **enabled** AND **propagated** before deploy. Enabling it (`gcloud services enable secretmanager.googleapis.com`) returns _before_ the data plane actually answers, so a deploy that races straight ahead still 403s — the CI fix was two steps: enable the API (`1a529ec`), then **wait for propagation** before `firebase deploy` (`b953eac`). If a functions deploy 403s on secrets right after an org/billing/API change, suspect propagation lag, not config.
- **A NEW bound secret needs its accessor grant before the first CI deploy that binds it.** firebase-tools reads the secret's own IAM policy and, when the runtime account (`adaptive-fitness-af8bb@appspot.gserviceaccount.com`) is not already a Secret Manager Secret Accessor on it, calls `setIamPolicy`, which the CI deploy account may not do. The whole functions deploy then fails with `Permission 'secretmanager.secrets.setIamPolicy' denied … (or it may not exist)`, and nothing is updated. A project-level role does not satisfy the check, because it reads the secret's own list. Grant it per secret before merging (the steps are in `docs/iap/revenuecat-setup.md` Part C), then re-run Deploy production. Hit on 2026-09-29 by the two RevenueCat secrets (run 36642140725). Older secrets never showed it, having been granted when they were first set up. The log's `✔ secretmanager: Granted roles/secretmanager.secretAccessor …` line prints whether or not anything was granted (firebase-tools 15.32.0 logs it after the check, grant or no grant), so it is not evidence that CI granted anything. The second attempt (run 36648725929) printed it for `REVENUECAT_REST_KEY`, which the owner had already granted, and then failed on `REVENUECAT_WEBHOOK_AUTH`.

### Account-deletion safety rails

The deletion executor (`functions/accountDeletion.js`) is irreversible by design. Several rails exist; understand them before changing this code:

- **Kill-switch:** `system/config.deletionExecutorEnabled = false` in Firestore halts all new deletions before any side effect. The executor reads this on every invocation and throws `executor-disabled` if explicitly false. Missing field / missing doc / read failure all default to ENABLED (lock-out defence). To pause deletions in an incident, write that field as a **boolean** (Firebase Console renders `"false"` as a string by default — the malformed-type case logs `deleteAccount.kill_switch_malformed` and fails open).
- **Step ordering invariant:** Firestore + Storage first, Auth user LAST. The pre-W1f client-side deletion ran `auth.deleteUser` first, then orphaned Firestore writes ran as anon and either hit permission-denied or partially succeeded — leaving "ghost user with orphan data". The current executor preserves the inverse: any throw before step 7 leaves the user with valid credentials so they can retry.
- **Client-side recovery paths:** `AccountSection.tsx` handles disabled execution, recent-auth confirmation, durable pending cleanup, and confirmed completion separately. A missing Auth user or a network failure alone is not proof of deletion. The callable or a server-read completed ledger must confirm it before success/sign-out cleanup. New `resumeVersion: 2` requests are retried by the server; older requests are not automatically enrolled. See `docs/qa/iphone-account-readiness-2026-09-15.md`.

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
- **Before ending a session that wrote a lock, make sure it reaches main.** It must be pushed with an open PR. Once that PR merges, check the row itself: `git fetch origin main && git show origin/main:.claude/plans/programme-run-followups.md | grep -cE '^\| *<ID> *\|'` prints 1. Don't test the lock commit's ancestry: main squash-merges, so `git merge-base --is-ancestor <lock-sha> origin/main` fails for every merged lock.
- **Locks are append-only.** Once a row is in the plan file, don't rewrite the body in place — add a `STATUS YYYY-MM-DD` line at the row tail (the pattern Run7 / Soc5 / Home2 / Hist5 / PI5 use). Inline edits destroy the record of what was originally decided vs what got iterated later, and they make the row impossible to diff against historical context.
- **If you discover an orphaned lock (a row missing from main's plan file, not a commit missing from main's history), recover it before doing other work in the affected arc.** Auditing or grilling against the orphan-implied state is wasted effort — the lock that was actually written is the truth, and re-deciding from scratch produces drift even when you arrive at the same conclusion. Search with `git log --all --oneline -- .claude/plans/programme-run-followups.md | head -30` before assuming a decision was never made.

## Recurring-mistake rules (mined from git history, 2026-06-02)

These are distilled from the project's own rework history — classes of mistake that got fixed **more than once** across different PRs/arcs. Each is a standing rule, not a one-off. Cited shas are the corrections that prove the pattern recurred. (This repo's PRs are self-merged via Claude Code with no GitHub review dialogue, so the rework commits — not review comments — are where recurring corrections live.)

- **The tested copy does not prove the running copy.** When the same business rule lives in two places — client `src/lib/*` vs `functions/*` (e.g. `performanceEngine.ts` ↔ `performanceEngine.js`), or any value re-derived in a second module instead of read from where it's already computed — treat the non-canonical copy as the prime drift suspect. Consolidate to one source of truth, or add a test that pins the copy that actually runs; never assume green client tests prove the server's behaviour. (`62a9cfa` server engine diverged from the tested client engine and inflated new-user PI; `a169336` deleted a `useHomeData` re-derivation; `e1b0296` nutrition-phase regression; Run9 3b server mirror of `resolveRecoveryExit`.)
- **Persist every mirrored and derived field in the same write.** A persisted field usually has consumers that read it from a _different_ location, or derive other fields from it. Enumerate them before you write. A write to `programState` must mirror into `profile.program.*` (consumers read the profile copy); writing `raceGoal` must materialize `runMode`; changing goal/rate must materialize the nutrition phase. Don't leave a parallel store stale for "something else" to reconcile later. (`5caad06` equipment/injuries/split not persisted to profile; `e1b0296` editor wrote `programState.goal` but macros read `profile.program.goal`; `3087ac5` `raceGoal` written without derived `runMode`; `4db6cb7` goal-weight didn't drive the phase.)
- **Never call raw `setDoc`/`addDoc`/`updateDoc`/`deleteDoc`.** Always route through the guarded wrappers in `src/lib/firestoreWrite.ts` — they strip `undefined` (which Firestore rejects outright) and survive offline-queue replay (a raw write that fails online fails forever on every flush). Any **new persisted profile field** must also be added to the `functions/profileSanitizer.js` allow-list, or the Cloud-Function write silently drops it. (`5061046` migrated ~25 raw call sites + fixed safeSave/safeMerge re-failing on every offline flush.)
- **Treat every Firestore trigger as at-least-once and concurrent.** `onCreate`/`onWrite` handlers re-fire on retry and can run in parallel. Any read-modify-write inside one must run in a `runTransaction` AND guard re-delivery with a per-source idempotency marker — MIN/MAX-style updates are the only naturally-safe exception. `syncChallengeProgress` had to be fixed twice: once for a lost-update race (`23369ef`), once for double-counting on retry (`dc3e4a6`).
- **Never mix local-date and UTC operations in one calculation.** Use the existing `localWeekKey()` / local-midnight helpers consistently for any day/week bucketing, and pin scheduled functions to explicit **UTC** — a Europe/London schedule anchor silently shifts an hour under BST. (`5ad5794` bucketed weekly run-stats into the wrong week near midnight in non-UTC zones; PR #815 BST shifted the rollup/refresh schedules; `8b856fa` captures `profile.timezone` on boot.)
- **A negative assertion under `waitFor` proves nothing unless something anchors it.** `await waitFor(() => expect(x).toBeNull())` is satisfied on its FIRST poll by the initial state and returns before the awaited work has landed — so it passes at t=0, and a value that becomes wrong _asynchronously_ is invisible to it. Anchor on a positive first (wait for `loading` to flip, or for the other account's value to appear), or hold the read with `deferReads()` / `releaseRead()` and assert after releasing. Two instances so far, both pinning documented security properties that nothing was actually holding: `usePushSettings` uid-safety passed with EVERY uid guard deleted, and 5 of `useLastRunType`'s 7 tests passed while the hook offered a repeat row to every user including signed-out ones. Both were found by mutating the hook to go wrong AFTER the read — the mutation shape a synchronous probe misses.

- **An absence assertion that is the ONLY assertion in a test stops
  testing anything the moment its mechanism stops being the one in use.**
  The sibling of the `waitFor` row above, and the failure is quieter: the
  test keeps passing, so nothing ever points at it. Six instances, all in
  `useProgramWriters.test.ts`, all
  `expect(setDocCalls().length).toBe(0)` on writers that had moved behind
  the ADR-0011 command boundary and no longer write documents on ANY
  path — so the assertion was true whatever the guard did. **Deleting the
  guard outright left every one of them green**, including the two that
  stop a user erasing a scheduled race by swapping it to an easy run.
  Fixed by asserting the absence of the COMMAND KIND in `sentCommands`
  (#2424: `overrideRunDay`, `markManualComplete`; #2425:
  `restoreWorkoutDay`, `restoreRunDay`, `setNextWorkout` x2) — the
  pattern the three `moveRunDay` refusal tests in the same file already
  used, having been repaired when THAT writer moved and nothing swept the
  rest.
  The discriminator is not "don't assert on writes". Seven other no-write
  sites in the repo are sound, and not because their writers still write
  documents (`workoutCompletionQueue` writes through a `runTransaction`).
  They are sound because in each, the empty log is a SECOND assertion:
  `workoutCorrection` anchors on two `rejects.toThrow(...)`,
  `workoutCompletionQueue` on the flush return plus both queue lengths,
  `WeightLogSheetRecovery` on a visible control and an alert's text, and
  `firestoreFake`'s two are testing `deferWrites` itself, where the empty
  log IS the behaviour. Anchor an absence on something positive and the
  write check can stay as corroboration.
  Only mutation settles it: remove the guard and re-run. If the test
  still passes it was never testing the guard, and reading the test
  cannot tell you that.

- **Scope a mutation run across BOTH sides of a mirror, or it will lie to
  you — in the direction that invents work.** The standing rule is that a
  green client suite does not prove the server; the inverse is just as
  true and less obvious. Mutating a `functions/` constant and running only
  `functions/__tests__/` reports "unpinned" for anything whose pin lives
  in a `src/` cross-test. Hit twice in one sitting on 2026-09-14:
  `RECENT_AUTH_MAX_AGE_SECONDS` (the 5-minute re-auth freshness gate on
  account deletion) and `MAX_FOCUS_SUPPORTERS` both read as unheld
  server-side and are in fact pinned — the first by
  `src/lib/__tests__/accountDeletionAuth.test.ts` with a literal plus
  both boundary seconds, the second by
  `src/features/goalSpace/__tests__/weeklyFocus.cross.test.ts`. Both were
  a sentence away from being written up as security findings. Run the
  mutation against `npm run test` from the repo root as well as the
  `functions/` suite before concluding anything is unpinned, and grep the
  constant's NAME across `src/` — the cross-tests are named for the
  feature, not the constant, so a suite-name scan misses them.

- **A precondition signature must be computed from data BOTH sides can see.** The programme command boundary signs a workout day as `dayName|instanceId|…` on both sides, but the client normalised a loaded row that lacked an `instanceId` by inventing a random UUID, while the server signed the stored `undefined`. Until the client's write-back landed — and on every cache-first paint and refetch before it did — no command on that day could ever pass, and eleven writers collapsed the server's precise reason into "Couldn't X. Refreshing." (owner: "some things don't work", 2026-09-02). Two rules: any value that feeds a client↔server agreement check must be derived deterministically from the same stored bytes on both sides (`legacyInstanceId`, mirrored and pinned by `programCommands.cross.test.ts`); and a rejection's server message is diagnostic data — surface the user-fit part (`describeRejection`) and capture the rest, never flatten it to a generic toast.
- **`onAuthStateChanged` fires several times per sign-in.** Debounce one-time / side-effecting work (maintenance backfills, etc.) behind a settle timer — a bare `firedRef` guard has a race window during the sign-in settle. Scope any queued or cached writes (offline queue, share queue) by `uid` so they can't leak across an account switch on a shared device. (`9ae1247` debounced the maintenance backfill; PR #820 uid-scoped the offline + share queues.)
- **Deleting a test file is a documentation change too — grep for prose that cites it.** A header saying "this is exhaustively covered by X" keeps steering people away from writing tests long after X is gone, and it reads as authoritative because it names a file and a test count. `useClaimMap.test.ts` claimed the completion predicate was "exhaustively covered by" `functions/__tests__/scheduledRunCompletion.test.js` (29 tests) + a cross-test; **both were deleted in #1733** and nothing replaced them. So nobody wrote rejection cases, and the locked 70% distance gate ran for months comparing **metres to kilometres** — a marathon slot completable by a 29.5-metre run — with a fully green suite (`b525af6f` fixed the unit, `051e7765` the header). Same shape as PR #1775's `templateId === "race"`: on both, the accept path was fiction and nothing asserted a rejection. When you delete or rename a spec, `rg` its filename across the repo; when you inherit a "covered elsewhere" claim, open the file it names before trusting it.
- **A centrality or cohesion score is a question, not a defect.** Graph metrics (graphify communities, "god nodes") cannot distinguish a deployment manifest or a shared vocabulary from tangled logic. `functions/index.js` scores the worst cohesion in the codebase (0.023) purely because every deployed function must be exported from one entrypoint — the split has now been re-derived and declined **four** times; the standing hold + its reasoning live in `functions/__tests__/triggerMetadata.test.js`. `RUN_TEMPLATES` bridges seven run communities because a shared run vocabulary is exactly what it should be. ADR-0001 already bars the size argument; treat these scores as prompts to go **read**, and expect the answer to often be "correct as-is". (The 2026-08-02 graph run's value was entirely in what reading turned up while chasing its questions — both of its own headline verdicts were "change nothing".)
- **A label must name what the number under it actually IS — and when it
  does not, the right word is usually already on the same screen.** Four
  corrections in one arc, all on History/Analytics, all the same shape:
  copy asserting something the data does not support. "Fastest 5K" over a
  bare `M:SS` that was a per-kilometre pace, not a 5K result (#2335).
  "Fastest 1K" / "Fastest 5K" over `avgPace` — a WHOLE run's average from
  a pool filtered by a distance floor, so a 10 km runner held a record
  for a distance they had never covered alone, and both rows printed the
  same figure and date whenever one pool contained the other (#2346).
  "Rep-range PRs" over buckets matched EXACTLY, so 2/4/6/7/8/9/11/12 reps
  produced nothing at all (#2349). A bodyweight metric pill rendering its
  internal `Metric` key, "1RM", over a chart of total reps (#2353).
  The tell that makes these quick: in THREE of the four the correct
  wording already sat a few lines away — "Max reps" in the header stat
  beside the 1RM pill, "Personal bests by reps" on the bodyweight side of
  the very ternary that said "Rep-range PRs", `"Seconds"` in the
  `isTimed` branch of the pill that said "1RM". Find the sibling that got
  it right before inventing wording. Two guards hold parts of this —
  `prRowUnits.test.ts` (a row's value carries its unit; a label may not
  name a race distance for a whole-run average) and
  `bodyweightMetricLabel.test.ts` (the pill says Reps, the union keeps
  its key) — and the rest is judgement, deliberately: a guard that looked
  like it covered the class would be worse than none. An internal key, a
  storage field name or a metric id is not copy, and a label that reads
  as a claim will be read as one.
- **Verify the three design-system invariants that keep drifting back, per-PR — not in periodic sweeps.** Before committing any UI: every numeric display uses `font-mono` + `tabular-nums`; every colour is a `THEME`/token (no hex literals); every interactive element clears 44px via the `Button`/`IconButton`/`Toggle` primitives (44 CSS px is a Tropos product target, NOT the WCAG AA floor — SC 2.5.8 is 24x24 and 44x44 is the AAA criterion; clearing the size is also not by itself an accessibility pass. DESIGN_GUIDE.md §10 carries the three units and their exceptions). These three regress constantly and keep getting swept up after the fact. (`2dec467` + `97a783d` mono/font audits; `9ef01a1` + `82b5266` tokenized stray hex; `f89d34b` whole-app consistency pass; touch-target policy shipped in 5 parts.)

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
- **Nothing goes to Gemini without permission.** A meal photo or a Pro
  account's typed meal is sent only once the person has said yes, held
  in `profile.aiAnalysisEnabled` (undefined = not asked, true = allowed,
  false = off; `src/lib/aiConsent.ts`). The first request asks
  (`AiConsentSheet`), the Settings switch shows on only for true, and
  `analyzeFood` / `analyzeFoodText` refuse an explicit false
  (`functions/lib/aiConsent.js`, pinned by `aiConsent.cross.test.ts`).
  App Review Guideline 5.1.2(i) requires the question.
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
  nothing, and CI is the only thing that will say so. `tsc -b` also
  covers `scripts/` and `e2e/` through `tsconfig.scripts.json`: a seed script
  importing a deleted `src/` export is a build error, not a capture-run
  surprise.
- **`npm run lint`'s LAST line is not its verdict.** eslint ends with
  "0 errors and N warnings potentially fixable with the `--fix` option" —
  a count of what `--fix` could repair, which is `0 errors` even when the
  run failed. The verdict is the `✖ N problems (E errors, W warnings)`
  line above it, and the exit code. Read one of those two. Misreading the
  fixable line shipped a `no-irregular-whitespace` error to CI (a
  zero-width space used to stop a glob closing a block comment) on a
  branch whose lint had just been "checked". Same shape as the `tsc -p`
  row above and as `echo $?` after a pipe: a number that looks like the
  answer to the question you asked.
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
- Which card Home's session stack shows, and what it says, is decided in `src/lib/todaySession.ts` from one day key; `StackedCTACards.tsx` only draws the answer, so change the rules there and test them without rendering Home
- `WaterWave.tsx` + `WaterBubbles.tsx` have complex SVG animations — treat carefully when modifying

## gstack

gstack is a git submodule (`.claude/skills/gstack`), so its skills exist only
where it has been checked out and set up. Cloud sessions don't check it out:
there the folder is empty and none of its skills exist.

- **When gstack is installed,** use its `/browse` skill for web browsing. It
  also adds `/plan-ceo-review`, `/plan-eng-review`, `/plan-design-review`,
  `/review`, `/ship`, `/qa`, `/qa-only`, `/qa-design-review`,
  `/setup-browser-cookies`, `/retro` and `/document-release`.
- **When it isn't,** drive the pre-installed Chromium with Playwright. The
  capture rig under "Design-review capture channel" is the worked example.
- Never use `mcp__claude-in-chrome__*` tools.

## House voice — how Tropos talks (app-wide, 2026-08-22)

The rubric has lived in `src/lib/performanceInsights.ts`'s header since it
was written; the 2026-08-22 copy sweep found the rest of the app was never
held to it, so it is now the APP-WIDE standard, not an insights-file local:

- **Observational, not judgmental.** "Load is high" ✓ · "You're crushing
  it!" ✗. State what the data shows; pair it with what to consider next.
- **No exclamation-mark cheer in UI chrome.** Confirmations, toasts,
  banners, summaries: "Saved", "Meal logged", never "Saved!". The
  checkmark carries the success.
- **No AI-tells.** "Your plan knows…" (anthropomorphised app), "unlock /
  elevate / seamless / your journey", motivational-poster tails glued
  onto clean sentences ("…that's what drives progress"), a literal "+"
  in prose, and the every-sentence-ends-in-an-epigram cadence (one strong
  line is a coach; ten out of ten is a language model — the coachPrompts
  trim was exactly this).
- **No system-speak.** Users search for a food, not "accurate data"; a
  planned run is not a "scheduled slot"; nothing "occurred unexpectedly".
- **Genre exceptions are real and stay.** Spoken mid-run audio cues are
  NRC-register coach speech ("Last one — leave nothing!" is correct
  THERE); kudos quick-chips are the USER'S voice to a friend ("Nice
  run!" stays); badge names are Fitbit-era vernacular ("Week Warrior"
  stays); share-card fun facts are playful by design. Do not flatten
  these into the calm-chrome register.
- **Buttons are sentence case** ("Start workout", "Add exercise") — the
  Title Case strays kept reading unpolished next to the majority.
- Reference register when unsure: Strava (data-forward, terse), Hevy
  (minimal utility), MyFitnessPal (plain), MacroFactor (never shames a
  high day), Happy Scale (a stall reads as "expected", not failure).

## Tropos Design System

### Visual Identity

- **Aesthetic:** Dark is the DEFAULT theme — a deep, cool neutral: page #0E0E11, cards #17171B, raised #212127, text #F4F4F6 (DS3, 2026-09-27; it was #121214 / #1A1A1F under DS2). It is what new users and the signed-out/Login state see. There is no ambient glow: DS3 retired the brand-purple wash that sat at the top of every signed-in page (`AmbientGlow`), so colour belongs to content.
- **DS3 redesign (owner-approved 2026-09-27, lock row DS3 in the plan file):** one colour per job, one big thing per screen, drawings where they help. It ships screen by screen — foundations, Home, Train and the workout, Running, Analytics, moments and polish — and the Food page had its own pass. The owner kept Food's layout and its one timeline (Food8) on 2026-09-28, and chose two changes from the mockups: a week strip above the calorie card (`FoodWeekStrip`, Home's strip with each day a ring of calories eaten against that day's target), and the calorie ring in the food orange instead of purple. On 2026-09-29 Home's food card took the Food page's own ring and macro tiles, smaller and side by side (`size="compact"` on `CalorieRing` and `MacroColumn`), with the one left/logged switch shared: the two screens draw the same object, so change it in one place. The same day the ring went quiet: its number is the text colour, "kcal left" / "kcal logged" is plain grey text under it (no tag, no swap arrow), and the arc is one solid orange on a grey groove with no gradient, track shadow or pulsing glow; Home's macros sit on the card with no box of their own. The second view says "logged", not "eaten": the number counts what is in the diary, not what the person ate. The stored mode key is still `"eaten"`. Read the DS3 row before re-deciding any of it.
- **Light mode:** The opt-in alternate (selectable in Settings → writes `profile.darkMode = false`). It's a clean, warm, iOS-inspired look (#F2F2F7 grouped background, cards on white — minimal and calm with subtle depth, NOT a dark-glass app rendered light). Default-dark is applied pre-React in `public/init.js` (dark unless an explicit `"false"` is stored) and mirrored by the `profile.darkMode` defaults in `src/lib/auth.tsx`.
- **Brand colour:** Purple #7B72E9 — used sparingly for accents, active tab indicators, CTAs, progress bars. Never as a full background: its only fills are the primary button and the auth logo, and no button carries a gradient (the paywall's purple-to-teal ones went in the plain-text cleanup).
- **Sport-coding:** Lifting = purple (#7B72E9), Running = coral (#D4637A). These two colours appear in calendar dots, section headings, icon tints, and contextual cards.
- **Logo:** a hexagon with rounded corners and an upward chevron cut out of it, white on a purple field that lightens toward the top on the app icon, and brand purple in the app. The owner chose this refinement of the bake-off mark on 2026-10-01 (`docs/visual-audit/bakeoff/DECISION.md`, decision 4). It is the app icon (with dark and tinted versions for iOS's home-screen modes), the sign-in screen's logo (the icon itself), and the launch image (the hexagon alone). Home no longer carries the "TROPOS" wordmark: DS3 titles it with the date and "Today", and the user's initials open Settings. The mark itself signs Home, small, before the date (`BrandMark`), so "Today" keeps the left edge the cards below it start on. The geometry lives in `src/lib/brandMark.ts` and `src/assets/brand/app-icon.svg`, held together by `BrandMark.test.tsx`; after changing it, run `node scripts/art/gen-app-icon.mjs` (every app and web icon) and `node scripts/art/gen-splash.mjs` (the launch image).
- **Launch animation:** `LaunchSplash` takes over from the launch image (index.html paints the same hexagon, `#boot-splash`, until the bundle runs). The chevron rises into the hexagon, cut out so it shows whatever is behind it; once the app is ready (on Home, once Home's header mark has drawn) the mark shrinks into Home's header mark as the page shows, or the overlay fades anywhere but Home. Reduce Motion gets the whole mark and a fade. Its ground is the launch colour in both themes (`--launch`, the dark page), as the launch image is, so a light-mode user's page turns light only as it is revealed, never under the logo. It never shows under automation (`navigator.webdriver`), so specs and captures see the app as before. The four copies of the first frame (launch PNG, index.html, the overlay's CSS size, `brandMark.ts`) are pinned together by `launchSplash.test.ts`.

### Colour System (src/styles/tokens.css + src/lib/theme.ts)

- Purple brand: #7B72E9 (primary), #9590E0 (light), #6560C8 (dark)
- Running coral: #D4637A
- Nutrition orange: #D9884E / #e87316
- Hydration teal: #52A3BD
- Success green: #4DB872 / #22b558
- Icon backgrounds: rgba(123, 114, 233, 0.10) — subtle purple tint
- Card backgrounds: white (light) / #17171B (dark)
- Page background: `240 6% 93%` ≈ #ECECEE (light) / #0E0E11 (dark). The dark page is also the cold-start colour (splash, manifest, theme-color, and the launch overlay's `--launch` in both themes), derived from the token and pinned by `coldStartChrome.test.ts`: move the token, re-run `node scripts/art/gen-splash.mjs`, and update the three hex copies and the `--launch` token it names
- Raised surface (`--muted`: chips, tracks, tiles inside a card): #212127 (dark)
- New bests: gold, the `--achievement` family (`text-achievement-strong` for small text). Gold means a personal best and nothing else
- Text muted: the theme-aware `--muted-foreground` token (light `240 3.8% 43%`, dark `240 5% 65%` ≈ #A1A1AA) — tuned to clear 4.5:1 on card, muted AND page background in both themes. The old fixed #8E8E93 was deleted in the DS2 consolidation (2026-08-22, owner-decided): one grey serving both themes measured 2.53–3.26:1 across the light surfaces it rendered on. No fractional `text-muted-foreground/<n>` anywhere — de-emphasis is the type scale's job (banned + pinned in `tokenContrast.test.ts`). In JS/style contexts use `"hsl(var(--muted-foreground))"`.

### Typography (Plus Jakarta Sans + Archivo)

- **Display font:** Plus Jakarta Sans (all UI text)
- **Numeral font:** Archivo (stat numbers — calories, weight, reps, volume). Proportional, not monospace; tabular figures forced on `.font-mono`. Replaced JetBrains Mono (brand bake-off — `docs/visual-audit/bakeoff/DECISION.md`). The `font-mono` utility / `--font-mono` token still means "numbers"; the name is historical.
- **Scale (1.25 modular):**
  - Display: 3rem/48px — hero stat numbers (health score)
  - H1: ~31px — page titles ("Program", "Social", "Analytics")
  - H2: 25px
  - H3: 20px — page section headings (`SectionHeading`, "This week", "Running") and hero card titles
  - Body: 16px — standard text
  - Small: 14px — secondary descriptions
  - Micro: 12px — labels and captions, in sentence case
- **Weight rules:** 800 (extrabold) for hero numbers and page titles. 700 (bold) for section headings and card titles. 600 (semibold) for pill text and button labels. Never mix 700 and 800 in the same visual tier.
- **Numeric displays:** Always use font-mono + tabular-nums for alignment
- **Medium (500, `font-medium`) IS a tier — the small-text emphasis
  weight.** Use it at `text-sm` and `text-xs` for secondary labels, meta
  rows and pill text; hierarchy at `text-lg` and above is carried by
  600 / 700 / 800. It was previously held under a count ratchet on the
  theory that it was off-scale drift. Counting where it actually lands
  settled that: of 269 sized uses, 113 are `text-sm`, 105 are `text-xs`,
  and **zero** are `text-lg` or above. A convention that consistent
  across ~96 components is the scale, not drift. The count ratchet is
  gone; `designSystemInvariants.test.ts` now pins the boundary that
  matters — font-medium never appears at heading scale.

### Card Patterns

- **Cards render through the `Card` primitive** (`src/components/ui/Card.tsx`;
  pressable cards take the same look from `cardClasses` in its `.ts`
  sibling). Two sizes, decided once: **hero** = rounded-2xl + p-4,
  **compact** = rounded-xl + p-3. The radius curve is DS2's (`--radius`
  10px), so rounded-2xl is 22px and rounded-xl 16px, not Tailwind's
  defaults. The old "standard card, padding
  3-4" was the drift — 45 `bg-card` surfaces sat on some third pairing.
  `designSystemInvariants.test.ts` ratchets hand-rolled off-pairing
  `bg-card` surfaces down and bans the `shadow-card` class outright: it is
  a Tailwind shadow COLOUR, not a shadow, and cards that used it were flat.
  The elevation utility is `card-shadow`.
- **Hero card (Health Score, Water):** `Card` (hero), larger icon (48px container), icon in purple-tinted bg square
- **Compact tile (Weight, Steps):** the compact pairing on the card surface (`bg-card card-shadow`), 2-col grid. It sat one step darker than the page (`tone="muted"`) until DS3 deepened the dark surfaces, where a muted tile read as a hole beside the cards around it.
- **Today card (`LiftCTACard` / `RunCTACard`, DS3):** the hero radius with the sport's 12% wash (`bg-lifting/12`, `bg-running/12`), the session as a 25px title, its dose ("5 exercises · about 50 min", "5 km · about 30 min") and a full-width Start (`primary` for a lift, `sport` for a run). Start begins the session (`/program?day=N&start=1`, `/run?template=…`); the rest of the card is a sibling button that opens the day in Train to look it over, because a button cannot sit inside a button. A lift shows the cut-out drawing of its first exercise that has one (`formArtCutouts`). A finished or skipped day shows its status instead of Start. No rationale and no plan position ("Base · week 3 of 16") on Home: owner direction 2026-09-09, pinned in `SessionPurpose.test.tsx`. `RestDayCard` is a plain hero card naming tomorrow's session.
- **Quick actions:** there is no pill row. Today's actions are the Start
  buttons on the Today cards, and food logging is the "Log food" button in
  `TodayEnergy`'s header.
- **Inline banners:** the `Banner` primitive (`src/components/ui/Banner.tsx`), three variants — `info` (coral, running context), `warning` (amber), `neutral` (muted, no domain colour) — on the compact-card pairing, `rounded-xl p-3`. The sustained-offline notices render through `neutral` and render NOTHING while idle: the permanent live-region wrapper they used to keep was an empty first child in the page rhythm, pushing Food's and Train's headers down a step. Pinned in `designSystemInvariants.test.ts`. The global online/offline strip in `Layout` (`ds-status-banner`) is app-shell chrome, not an inline banner.
- **Section headings:** a group of cards or rows opens with `SectionHeading` (`src/components/ui/SectionHeading.tsx`) — a real heading in sentence case: `page` size (20px bold, the H3 step) on a page or tab, `compact` (16px bold) inside a sheet, a card or a dense settings form, with an optional `action` on the same row. DS3 retired the 12px capital-letter group label. `SectionLabel`'s `tier="section"` now marks a small group inside a Food sheet or list only (the Details sheet, the food suggestions): 12px bold, sentence case since the Food pass. Its surfaces are pinned by `designSystemInvariants.test.ts`.
- **Labels inside a card:** `SectionLabel`'s caption tier — 12px semibold muted, **sentence case**, no letter-spacing. Write the text the way it is said ("Total volume"); it renders as written. Capitals are kept for table column headers. No hand-rolled label classes (ratcheted in `designSystemInvariants.test.ts`)

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
- **`SessionCommandCard`** — the "what's next" command surface. Eyebrow +
  title (the card's one big line, H2) + one quiet meta line + a single
  primary action (its own control, NOT the whole card) + an overflow that
  opens the day sheet. Temporal eyebrow ("Up next" / "Due today" /
  "Tomorrow" / "Pending") — never "Next · Pending". DS3: a lift day's
  eyebrow leads with its category and its title is the focus ("Pull · Up
  next" over "Lat focus", as on Home); its picture sits at the right, as
  on Home's cards: a lift day's muscles (`figure`), or a run's type in a
  tile (`icon`, from `runTemplateIcon`); the halo went with the app's
  other glows. A free runner's Run tab leads with the same card ("Start a
  run" over "Pick your pace today"). Train's day list below it draws each
  exercise through `ExerciseRowSummary` (`ExerciseThumb`: the cut-out
  drawing, else the category's muscles, else a dumbbell), and Train shows
  one advice notice at a time (`programNotices`).
- **`ProgrammeWeekSelector`** — the one day-navigation primitive per tab
  (`2b4e07b8`, "competing navigators" unification): circular sport-coloured
  day cells (purple lift / coral run) in the Home WeekStrip visual language
  (a done day is filled with its sport at 30% with a check, as Home fills a
  logged day; it was the success green until DS3),
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
- **Stack rhythm (vertical):** three steps and nothing between them. space-y-2 (8px) within a group — the cards under one section heading, rows inside a card; space-y-3 (12px) for a break inside a card; space-y-4 (16px) between page sections, which `PageShell` owns. No half steps (`space-y-2.5` was Home's group rhythm beside `space-y-8` on Analytics — the same role at 10px and 32px), and a section heading carries no margin of its own: its group's stack places it. Ratcheted in `designSystemInvariants.test.ts`; the five route pages and the shell are pinned to the scale outright.
- **Grid gap:** gap-2 (8px) for compact grids
- **Icon container:** w-9 h-9 (36px) for standard, w-12 h-12 (48px) for hero
- **Icon inside container:** w-4 h-4 (16px) standard, w-5 h-5 (20px) hero

### Interactive Patterns

- **Tap feedback:** scale(0.97) on active, 150ms cubic-bezier transition
- **Haptic:** Called on all button/card taps via haptic() utility
- **Count-up animation:** the moments' numbers count up as they appear: Home's streak and performance score (`useCountUp`, once a session), the Food ring and macros (on Food and on Home's food card, which draws the same ring and tiles), the workout finish screen's three figures and the weekly recap's first card (`AnimatedNumber`, which is plain text from the first paint under Reduce Motion)
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
- **Framer Motion is gated globally only for POSITION; CSS animations
  are not gated at all.** `MotionConfig reducedMotion="user"` in
  `App.tsx` settles positional values (x, y, scale, rotate, width,
  height) and nothing else: opacity, a stroke offset, `pathLength` and a
  motion-value count-up all still animate under Reduce Motion. A non-positional animation
  asks `useReducedMotion` in its own component (`ProgressRing`,
  `CalorieRing`, `EmptyState`, `AnimatedNumber` are the patterns). A
  Tailwind `animate-*` class runs under Reduce Motion unless it carries
  the `motion-safe:` variant. Every skeleton pulse and ping does;
  `animate-spin` spinners are progress feedback and stay unprefixed
  (`UNGUARDED_ANIMATION_BASELINE = 8` in `designSystemInvariants.test.ts`
  is exactly the spinner set).
- **Empty states go through the `EmptyState` primitive**
  (`src/components/ui/EmptyState.tsx`; `compact` for in-card use) — no
  hand-rolled centered-icon-tile blocks. The primitive owns the brand
  hexagon, accent tinting, and reduced-motion handling.

### Design-review capture channel (screenshots without a local rig)

**The capture specs are a PR gate as well as a screenshot source.** The
`capture-specs` job in `emulator-tests.yml` runs every
`e2e/screenshots/*.capture.spec.ts` on pull requests and on main, blocking,
with the same build and the same seed chain `app-screenshots.yml` uses
(the two lists must stay identical, pinned by `captureSeedChain.test.ts`;
a seed added to only one leaves its spec failing on login in the gate, or
its frame reading as `removed` in the diff report).
Before that job existed these specs ran ONLY on a push to
`claude/screenshot-app`, so their ~98 assertions could not fail a PR:
#2187 removed an `aria-label` a spec located by, the locator matched zero
elements for two merges, and nothing went red. If you change a
user-visible string, an aria-label, or a reading order, that job is what
tells you which spec you broke — so read its failure before assuming the
rig is at fault. Frames written there are thrown away with the runner;
committing them to the `app-screenshots` branch is still the workflow
below.

**The agent sandbox can run the whole capture rig, in minutes — no need
to send a capture loop to CI.** The chain is exactly
`emulator-tests.yml`'s: build with the emulator env
(`VITE_USE_EMULATORS=true … npm run build:e2e`), then
`firebase emulators:exec --only auth,firestore --project demo-tropos`
around the seed chain and `npm run test:e2e -- capture.spec.ts
--project=auth-emulator`. The ONE thing to know is the browser: the
pre-installed Chromium is a different build from the one Playwright asks
for, so pass `PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome`
— the capture specs' `test.use` already reads it as `executablePath`.
Full suite locally: 64 passed in 6.8 minutes.

Two caveats worth carrying. **Seed the FULL chain or you will measure the
wrong thing** — `food-suggest-typed` frames at 430px under `seed:e2e`
alone and at 142px under the whole chain, because the extra diary content
is what pushes the composer down; a light seed hides exactly the class of
bug the rig exists to catch. And **`home.screens.capture`'s "audit
surfaces" test times out locally** (90s on a fullPage shot of the heaviest
surface) while passing in CI — verified by running it on clean main, so
treat that one as environmental rather than a regression.

CI is still the authority. Push any branch's code to
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
  seeded user earns "Early Bird" only when the run executes before 07:00
  (the badge is "Log before 07:00 for 5 days"), so a pre-07:00-UTC capture
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
- **A raw DOM scroll inside a capture spec races the app's own smooth
  scrolling.** `index.css` sets `html { scroll-behavior: smooth }`, so
  `el.scrollIntoView({ block: "start" })` ANIMATES, and a spec that then
  measures inside a fixed `waitForTimeout` can land mid-flight.
  `food-suggest-typed` did: its height guard refused a frame that was
  fine, going 1-failed / 2-passed over five full-seed runs while CI
  stayed green — a coin flip that usually lands right is not a gate.
  Pass `behavior: "instant"` (an explicit behavior beats the computed
  property by spec) or use Playwright's `scrollIntoViewIfNeeded()`,
  which waits for stability itself. The shape to look for is a raw
  `scrollIntoView` / `window.scrollTo` followed by a measurement rather
  than by a settle.
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
- **A `removed` row usually means the run did not finish, not that a
  surface was deleted.** The diff and commit steps are `if: always()`,
  so a job killed by `timeout-minutes` still force-pushes the frames it
  managed to take — as the new BASELINE — and every frame whose spec
  never ran reads as "removed". Hit on 2026-09-04: a full pass was
  taking ~14 minutes against a 15-minute budget, and adding ONE exercise
  to the form-demo list tipped it over; 15 frames across the solo-feed,
  run-HUD, tooltip and home specs vanished at once. Nothing was wrong
  with any of them. The budget is now 30 minutes, and an unsuccessful
  capture step stamps an INCOMPLETE CAPTURE banner at the top of the
  report — but check the run's conclusion before believing a cluster of
  removals, and re-run rather than diffing against a truncated baseline.

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

**Exceptions, owner calls:** three Food-page buttons are `nutrition`. Brand
purple stays for Pro there ("Try Pro free"). Other Food CTAs follow the rule
above until the owner says otherwise.

- **2026-09-22 — the "Your usual" row's Log.** Every other food control on
  that page is orange, and a purple Log sat directly above the orange meal
  pills.
- **2026-09-23 — the camera button beside the composer's text box.** It
  replaced the coral camera icon inside the field (itself the June Wave 2
  shrink of a full-width scan CTA): photo scanning is one of the page's main
  actions, and a 20px grey icon read as decoration. It is a filled square,
  camera only: it carried the word "Scan" for a day, and the owner found a
  camera beside "Scan" read as two different actions. Its accessible name is
  "Scan a meal". Coral (`THEME.food.scan`) now stays inside the scanner.
  Every account gets the same button; a free account's opens the scanner on
  Barcode, which is always free (F2b), with the photo tabs holding the Pro
  offer. The scanner opens by growing out of it (`ScanGrow`).
- **2026-09-23 — the scan result sheet's Log** ("Log to Breakfast"). It
  matches the usual row's Log: logging food is the page's one action, and
  the sheet opens over the orange camera button that started it.

Scope note: this is for **buttons** — visual CTA/action controls. It is NOT a
mandate to wrap every `<button>` element: pressable cards, list/table rows,
day-cells, chips, and icon taps are legitimately their own controls (use
`IconButton` for icon taps; `SegmentedControl` for single-select pill groups).
Unlike the hex guardrail, "use `Button`" can't be lint-enforced (a linter can't
tell a CTA from a pressable card), so this is a per-PR convention: when adding
or touching a CTA button, route it through `Button` with the variant above.

### Component Architecture

- **Pages:** src/pages/ — route-level, lazy-loaded
- **Home screen built from:** WeekStrip → DayPeekCard → StackedCTACards
  (LiftCTACard / RunCTACard / RestDayCard — Start on the card, no pills) →
  FirstWeekCard (a new account's first seven days) → NewBadgeRow (a
  waiting badge, opened on tap; badges never open over Home by
  themselves) → VerifyEmailBanner (until the address is verified) →
  TodayEnergy → WaterCard → WeightStepsTiles → the "This week" card:
  WeeklyReviewEntry (a link on its heading while a review waits) →
  WeekSummary → PerformanceHeroCard (a row since DS3, 2026-09-27).
  Performance sits LAST by owner decision: the first thing on the scroll
  should be something to do today, not a verdict on the week just gone.
  `claudeMdFreshness.test.ts` fails when a name here stops rendering or
  falls out of order; nothing notices a section missing from the line, so
  re-read it against `src/pages/Home.tsx` when you add one to Home.
- **First-visit guide (FV1, owner 2026-10-04):** setup's "Continue with
  Free" lands on Home, where a new account's first visit gets a
  three-stop walk (`GuideWalk`: today's session, the first-week card,
  Food), once, in its first seven days, as the visit's one coordinator
  surface. The Tropos mark is the guide (no character; the house voice
  holds). Settings → Support & legal → Show me around replays it; a
  first-week row opens its step; `GuideHint` turns up once in each place
  after that (Train's order, the first set, Food's composer, the first
  run). Rules and words are in `firstGuide.ts`. It never shows under
  automation unless a capture spec sets `tropos-guide-under-automation`
  to `on` in localStorage, so specs that don't ask for it never meet it.
- **Icons:** lucide-react (individual imports only), except the drawn set in `src/components/icons/` (the tab bar's icons, the avocado) and `ui/BrandMark.tsx`
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

- The water card has a complex animated fill effect (WaterWave + WaterBubbles) — treat carefully when modifying
- Group headings are sentence-case `SectionHeading`s and in-card labels are sentence-case captions (DS3). Nothing sits below the 12px micro floor except `text-caption` numerals and units
- New-best and PR badges are gold (`--achievement`), never the food orange

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

Manual checks deferred from shipped work — device checks, deploy
verification, operator console steps — live in
`docs/qa/pre-launch-backlog.md`. Read its rows for an area before you
ship, deploy or verify there; tick a row when a run proves it; and add a
row when you ship something only a device or a console can confirm.

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

### Vendored skills

Most of `.claude/skills/` is copied from other repos. Where each skill came
from, its version and the local changes to carry into the next update are in
`docs/agents/vendored-skills.md`.

### Reusable prompts

Two paste-ready session prompts live in `docs/agents/`, each carrying the
measured baseline and the pre-decided calls its last run earned:
`visual-pass-prompt.md` for the pixels-only visual pass, and
`app-improvement-prompt.md` for the whole-app pass (security, guards,
de-slop, front-end, design). Re-verify their cited lines before acting; the
citations are starting points, not a to-do list.
`app-improvement-pass-2026-09-05.md` is that prompt's first run: what
shipped, what was declined and why, the operator checklist, the open owner
calls with both options measured, and the ratchet baselines it left.

### Domain docs

Single-context. `CONTEXT.md` at repo root (seed; fill with domain
vocabulary as it crystallises); ADRs in `docs/adr/`. See
`docs/agents/domain.md`. The domain skills call the glossary
`GLOSSARY.md`: here it is `CONTEXT.md`'s "Domain glossary" section. Update
that, and don't create a `GLOSSARY.md`.

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
  `/effort high`. Only on models that support `xhigh`.
- The word **`workflow`** anywhere in a prompt — runs that one task as a
  workflow without changing session effort (`alt+w` to un-trigger).
- `/deep-research <question>` — the bundled cross-checked research
  workflow. `/workflows` watches/manages runs; press `s` there to save a
  run's script to `.claude/workflows/` (shared) or `~/.claude/workflows/`.

Runtime limits: up to 16 concurrent agents, 1,000 per run, no mid-run user
input (run each sign-off stage as its own workflow), subagents always run
in `acceptEdits` and inherit your tool allowlist. Cost: many agents = many
more tokens than a conversational pass — counts toward plan limits.

**Suggest a workflow (the user opts in with the word `workflow` or
`/effort ultracode`) for a Tropos task when:**

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
