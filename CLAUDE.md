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
npm run test:e2e:auth # Signed-in E2E against the emulator, one test at a time (as CI)
npm run verify       # Everything CI's unit job blocks a merge on: run before pushing
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
- `variationBank.ts` — Exercise variation database
- `runScheduler.ts` — Goal-driven run scheduling engine (freeform, structured, race prep)
- `matchTemplate.ts` — Equipment and injury swaps on a plan (`injurySubstitutions.ts` lists what each injury option promises)

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
- **A restricted account reaches no one** (S4e, 2026-10-06). `globalRestrictedUids/{uid}`, written by the moderation page's Restrict user (`resolveReport`) and removed by its Lift (`liftRestriction`), makes `isRestricted()` in `firestore.rules` refuse posts (a private one excepted), follows, Space and challenge joins, Circle events and partner bonds, and `functions/lib/restriction.js` refuse props, comments, likes, reactions and the Circle callables; the toggles refuse only adding. Logging, the person's own profile, blocking, reporting, unfollowing, leaving and deleting their own things stay open. The app says so before the server refuses: `RestrictedNotice` where an action would be, `showRestrictedToast()` for a refused tap (`src/lib/accountRestriction.ts`).
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
- **Units:** spaced — "60 kg", "5.2 km", "400 m", "2,633 cal", and a pace "5:34 /km"
  (`src/utils/__tests__/unitTreatment.test.ts` bans unspaced kg/km and a pace glued to its unit, including
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
- Signed-in specs locally: `npm run test:e2e:auth`, which runs them one at a time as CI does; in parallel they share one seeded account and fail with nothing wrong in the app
- Capture specs, the emulator rig and screenshot diffs: `docs/agents/capture-rig.md`
- `e2e/screenshots/largeText.capture.spec.ts` opens the main screens, every Settings section, a workout, a run, the detail pages, the Weekly review, sign-up, setup and Pro at 393 and 320 px with 1.35× and 2× text, and fails on anything past the screen or wider than its box. When it fails, fix the layout (wrap, give way, px for controls and margins), not the list: its `ACCEPTED` entries each carry a reason

## CI/CD

- **deploy-production.yml ("Deploy production") is the one entry point for the web and backend deploys.** It runs on every push to `main` and on a manual `workflow_dispatch`, one release at a time (the `production-release` concurrency group queues a new release behind the running one rather than cancelling it). The five workflows below are `workflow_call` only, so none of them can be run on its own — to redeploy anything, re-run Deploy production. Its `changes` job diffs against the last SUCCESSFUL release, not the previous push, and runs the backend chain only when something under `functions/`, `firestore.rules`, `firestore.indexes.json`, `storage.rules`, `firebase.json`, `scripts/verify-*`, `scripts/verify_*`, `scripts/write-functions-env.mjs` or `.github/workflows/deploy*` changed; a manual dispatch always runs it. Order: Firestore → Storage → Functions, then Hosting and Pages once all three succeed (or straight away when the backend was skipped).
- **deploy-firestore.yml:** Firestore rules (read back after deploying), then indexes.
- **deploy-storage.yml:** Storage rules, gated behind the `STORAGE_XSERVICE_APPROVED` repo variable (set since 2026-09-15). Before releasing rules that read Firestore it confirms the Storage service agent holds the role they need (`scripts/verify_storage_rules_iam.py`), and fails the release if the role is missing or unreadable — firebase-tools grants it only interactively, never from CI. The packet-11 row in `docs/qa/pre-launch-backlog.md` has the one-time grant.
- **deploy-functions.yml:** Cloud Functions — injects the per-commit bundle marker, runs `firebase deploy --only functions --force` (so a removed export is deleted, not refused), then reads the deployed source back (`scripts/verify-deployed-functions-source.py`). A failure files or updates one rolling "deploy-functions failing on main" issue.
- **deploy.yml:** Builds and deploys to GitHub Pages.
- **deploy-hosting.yml:** Builds with `base: "/"` and deploys to Firebase Hosting. The web build's security headers (HSTS, `nosniff`, Referrer-Policy, `X-Frame-Options`, a `frame-ancestors 'none'` CSP header, Permissions-Policy) live in `firebase.json` and ship ONLY via Hosting — GitHub Pages cannot set response headers, accepted because Pages is the preview surface, not the product. `frame-ancestors` is ignored in a `<meta>` CSP, which is why it is a header. Pinned by `hostingSecurityHeaders.test.ts`.
- **deploy-ios.yml:** Separate and manual-only (`workflow_dispatch`): builds the web bundle into the iOS project and uploads to TestFlight. Its header marks it an unverified scaffold. Without the `IOS_DIST_CERT_*` secrets it makes each run's certificate and profile from the App Store Connect API key (`scripts/ios/asc-signing.mjs`, revoking the previous run's), so the owner needs no Mac (`docs/ios-release.md`).
- **Firebase project:** `adaptive-fitness-af8bb`

### Cloud Functions deploys and account deletion

Before changing anything under `functions/`, a deploy workflow, or account deletion, read `docs/agents/functions-deploy.md`: the deploy gotchas that cost a day to find (bundle-hash dedup, mandatory `maxInstances`, 1st-gen imports, bound secrets and their accessor grants) and the deletion executor's safety rails.

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

## Coding standards

`CODING_STANDARDS.md` holds what a change is held to at review: the recurring-mistake rules mined from the repo's rework history, and the house voice for every word the app shows. Read the section for the area you are changing before you change it; `code-review-matt` reviews against the whole file.

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

gstack (`.claude/skills/gstack`, a git submodule) is checked out only in local sessions; when it is installed, use its `/browse` for web browsing. In cloud sessions, drive the pre-installed Chromium with Playwright, as the capture rig (`docs/agents/capture-rig.md`) does. Never use `mcp__claude-in-chrome__*` tools.

## Tropos Design System

Read `DESIGN_GUIDE.md` before UI work: §0 is the non-negotiables, §10 the accessibility floors, and §14 the owner's dated design decisions, the training-plan primitives and the button-variant mapping. Screenshot capture and the emulator rig are in `docs/agents/capture-rig.md`.

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

## Reference apps — for /grill-me and /grill-with-docs sessions

**Scope:** this rule activates ONLY during `/grill-me` or `/grill-with-docs` sessions. Don't apply it on regular feature work, code reviews, or bug fixes unless the user explicitly asks "what do competitors do here?"

**The rule (when grilling):** before locking a decision that introduces user-visible abstractions, multi-step flows, or new state machines in our domain, consult what the dominant apps do for the same pattern. Surfacing concepts those apps hide is a sign we're overcomplicating; inventing concepts those apps don't have is fine when there's a Tropos-specific reason, but the bar is "explicitly justified," not "it sounded right."

**Reference apps by domain** (audit summaries live in `GLOSSARY.md`):

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
- When deviating, write the reason into `GLOSSARY.md` so future grills can revisit it.

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

Three paste-ready session prompts live in `docs/agents/`, each carrying its
measured baseline: `visual-pass-prompt.md` for the pixels-only visual pass,
`app-improvement-prompt.md` for the whole-app pass (security, guards,
de-slop, front-end, design), and `training-engine-prompt.md` for lifting and
running (a simulator on the real engine, end-to-end journeys, owner
decisions; its inputs, checked against their sources on 2026-10-07, are in
`docs/training-engine-2026-10/`). The first two
also carry the calls their last run earned. Re-verify their cited lines
before acting; the citations are starting points, not a to-do list.
`app-improvement-pass-2026-09-05.md` is that prompt's first run: what
shipped, what was declined and why, the operator checklist, the open owner
calls with both options measured, and the ratchet baselines it left.

### Domain docs

Single-context. `GLOSSARY.md` at repo root holds the domain terms (its
"Domain glossary" section) and the reference-app research; ADRs are in
`docs/adr/`. See `docs/agents/domain.md`. It was `CONTEXT.md` until
2026-10-04, and plan-file rows and ADRs from before then still call it that.
Don't create a `GLOSSARY-MAP.md`: this repo has one context.

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

A workflow runs many subagents from a script; the user opts in with the word `workflow` or `/effort ultracode`. Suggest one for a Tropos task when:

- the change touches the correctness-critical engines: `performanceEngine`, `runScheduler` (race-prep, taper and recovery), `adaptiveTDEE`, `plateauDetection` or `phaseNutrition`;
- it is a cross-cutting sweep: a codebase-wide audit, a many-file migration, a security pass over the Firestore rules or callables, or a perf audit;
- it is a hard plan worth drafting from several angles, the `/grill-me` kind;
- it touches `functions/`: plan against `docs/agents/functions-deploy.md` first and verify the deployed source after.

Routine single-file edits, copy tweaks and product decisions stay conversational. Workflows resume only within the same session, and cloud containers are reclaimed when idle, so commit and push before a long run.

## graphify

`/graphify` can build a knowledge graph at `graphify-out/`. This repo has none unless `graphify-out/graph.json` exists, and building one is a deliberate act: `graphify update .` on a graph-less tree silently builds one, so run it only to refresh a graph that already exists. When a graph exists, its hook's "MANDATORY: run graphify first" nudge is a hint. Mirror-parity questions, `functions/` correctness and verification passes read the source files themselves.
