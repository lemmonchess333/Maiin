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
npm run test:e2e:journeys # Journeys: one person through weeks of the app, against the emulator
npm run verify       # Everything CI's unit job blocks a merge on: run before pushing
```

## Tech Stack

- **Frontend:** React 19 + TypeScript 5.9 + Vite 8 (Rolldown)
- **Styling:** Tailwind CSS v4 (via @tailwindcss/vite plugin)
- **Routing:** React Router v7
- **Backend:** Firebase 12 (Auth, Firestore, Cloud Functions, Storage)
- **Charts:** Recharts 3
- **Maps:** MapLibre GL 6, with OpenFreeMap's tiles (`src/lib/basemap.ts`; the credit must stay on every map)
- **Animation:** Framer Motion 12
- **PWA:** a hand-written service worker, `public/sw.js`, registered by `src/lib/register-sw.ts` (Pages and the iPhone app; troposfit.com serves `scripts/website/retired-sw.js` at its address, which clears the caches and unregisters)
- **Native:** Capacitor (iOS; Android is planned, with no `android/` yet)
- **Payments:** RevenueCat for both: native IAP (`@revenuecat/purchases-capacitor`, ADR-0006) and the website's checkout, RevenueCat Billing on Tropos's own Stripe account through a hosted Web Purchase Link (App1, 13 Nov 2026; `docs/iap/revenuecat-setup.md` Part W). Since App1 Q52 troposfit.com serves no app to start that checkout from, so the website sells nothing until the owner chooses how (the backlog's Part W rows). The older Stripe Checkout functions are dormant until that has worked, then retired — the client loads no Stripe SDK
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
│   ├── circuit/        # Circuit mode: moves, built-in circuits, the ladder (Circ1)
│   ├── goalSpace/      # Goal Spaces / Circles
│   ├── league/         # Weekly leagues: the card, the page, the reveal (Soc15 call 3)
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
├── website/            # troposfit.com: the marketing site, a post's page, legal (App1 Q52, docs/website/)
└── App.tsx             # Router + error boundary + lazy loading
functions/              # Firebase Cloud Functions (plain JS, CommonJS)
e2e/                    # Playwright specs; screenshot capture specs in e2e/screenshots/
```

## Architecture Notes

- **All pages are lazy-loaded** via `lazyRetry()` wrapper in App.tsx (handles stale cache)
- **Pinned chunks** in vite.config.ts (Rolldown `codeSplitting` groups): firebase-auth, firebase-db, firebase-messaging, firebase-analytics, firebase-installations, charts, vendor, maplibre, motion, date-fns, barcode, body-highlighter. `check-dist-size` also holds which chunks `index.html` preloads, and no lazy one may join them
- **Path alias:** `@/` maps to `src/`
- **Base path:** `/Maiin/` (for GitHub Pages deployment)
- **Offline support:** `src/lib/offlineQueue.ts` queues writes when offline
- **Error boundaries:** `RouteErrorBoundary` (page-level) and `SectionErrorBoundary` (card-level)
- **Tab preloading:** `BottomNavigation` calls `preloadTab()` (`src/lib/preloadTab.ts`) to load a tab's page as the person reaches for it
- **Train's one engine:** `/program` is a layout route (`ProgramEngineRoute`) holding one `useProgram()` for Train and a session's own page (`/program/lift/:day`, `/program/run/:date`, TrainWk1 call 2), read through `useProgramEngine`. `Layout` keys the three alike (`layoutKey`, `src/lib/sessionPages.ts`), so the engine stays mounted between them and a change made on a session's page is the one Train shows
- **Auth routing:** Four route sets — unauthenticated (Login), onboarding incomplete (Onboarding), set up without the health-details agreement (`HealthConsentRoutes`: the agreement, Account for Delete account, and the legal and support pages; Priv1 call 1), authenticated (full app). Route on `profileLoad` (`auth.tsx`), not on `profile === null`: an account with no profile yet is `missing` and goes to Onboarding, while one whose profile could not be read is `failed` and gets `ProfileUnavailable` (Try again, Sign out), because finishing setup replaces the programme. The agreement's routes read the account once more before asking, so a copy on the device from before the person agreed elsewhere never flashes the question
- **App version:** Defined via `__APP_VERSION__`, read from `package.json` at build time

## Pages (src/pages/)

Every `path=` in `src/App.tsx` is named here, and every file named here
exists — pinned by `claudeMdFreshness.test.ts` in both directions
(`/dev/*` is the one allowlisted family). Add the row with the route.

| Page                                   | Route                              | Description                                                                     |
| -------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------- |
| `Home.tsx`                             | `/`                                | Main dashboard — WeekStrip, hero cards, energy, insights                        |
| `Food.tsx`                             | `/food`                            | Food/meal logging with camera, NL parsing, barcode                              |
| `History.tsx`                          | `/history`                         | Progress: an overview, with Lifting / Running / Body / Food pages (`?view=`)    |
| `TrainingHistory.tsx`                  | `/history/sessions`                | Saved lifts and runs, with period, sport and name filters                       |
| `ExerciseHistory.tsx`                  | `/history/exercise/:name`          | Per-exercise progression chart + rep-bucket PR strip                            |
| `Program.tsx`                          | `/program`                         | Train; it and the session pages share one engine (`ProgramEngineRoute`)         |
| `TrainingPlan.tsx`                     | `/program/plan`                    | Combined training week, rotation-based next lift and reviewed one-off run moves |
| `LiftSession.tsx`                      | `/program/lift/:day`               | A lift's own page: the Lift tab's session alone (TrainWk1 call 2)               |
| `RunSession.tsx`                       | `/program/run/:date`               | A run's own page: what the day sheet held for it, from the run card's ⋯         |
| `Routine.tsx`                          | `/routine/:routineId`              | Saved-routine workout runner (reuses `WorkoutSession`)                          |
| `EmptyWorkout.tsx`                     | `/empty-workout`                   | A lift with no plan day, built with Add exercise (Mob1); saves, moves no plan   |
| `WorkoutDetail.tsx`                    | `/workout/:workoutId`              | Saved lift session detail; the delete action lives here (ADR-0012)              |
| `Run.tsx`                              | `/run`                             | Active GPS run tracking (full-screen, no nav)                                   |
| `Circuit.tsx`                          | `/circuit`                         | Circuit mode (Circ1): pick a built-in circuit, run it on the clock, save it     |
| `RunSummary.tsx`                       | `/run-summary`                     | Post-run stats & map review                                                     |
| `RunDetail.tsx`                        | `/run/:runId`                      | Historical run detail view                                                      |
| `WeeklyReview.tsx`                     | `/review`                          | Last week’s recap, ending where the week ahead is agreed (App1 Q36)             |
| `Social.tsx`                           | `/social`                          | Social feed, Circles/Spaces, leaderboards                                       |
| `Space.tsx`                            | `/space/:spaceId`                  | Community Space — hero, join/leave, post list + composer                        |
| `SpacePost.tsx`                        | `/space/:spaceId/post/:postId`     | One Space post with its props and comments (the tray's Space post rows)         |
| `UserProfile.tsx`                      | `/user/:uid`                       | A person's profile: the week's sessions, badges and medals (yours: all), posts  |
| `FollowList.tsx`                       | `/followers`, `/following`         | Your own followers and following, from your profile's counts; Remove follower   |
| `League.tsx`                           | `/league`                          | The weekly league: your group's standings, its zones, the countdown, Leave      |
| `Segment.tsx`                          | `/segment/:segmentId`              | A segment: its line, your best and your efforts, the board of who you follow    |
| `ActivityPost.tsx`                     | `/activity/:activityId`            | One shared session with its props and comments (the tray's props/comment rows)  |
| `Upgrade.tsx`                          | `/upgrade`                         | Pro pricing + purchase page                                                     |
| `SettingsIndex.tsx`                    | `/settings`                        | Settings section list — iOS nested-page IA                                      |
| `settings/SettingsProfile.tsx`         | `/settings/profile`                | Profile — photo, name, body metrics in the chosen units                         |
| `settings/SettingsAccount.tsx`         | `/settings/account`                | Account — plan, sign-in, exports, deleted meals, sign-out, account deletion     |
| `settings/SettingsLiftPlan.tsx`        | `/settings/lift-plan`              | Lift-plan editor, or Add lifting; Stop lifting and the reset at its foot        |
| `settings/SettingsRunPlan.tsx`         | `/settings/run-plan`               | Run-plan editor or Add running, voice cues (Train's Run tab deep-links here)    |
| `settings/SettingsNutrition.tsx`       | `/settings/nutrition`              | Nutrition section — targets, adaptive TDEE, the way into Your pantry            |
| `settings/SettingsPantry.tsx`          | `/settings/pantry`                 | Your pantry — edit or remove the saved foods Food offers again (F2d)            |
| `settings/SettingsRecentlyDeleted.tsx` | `/settings/recently-deleted-meals` | Soft-deleted meals archive (24 h window, F5c)                                   |
| `settings/SettingsHealth.tsx`          | `/settings/health`                 | HealthKit steps — discovery and reconnection (ADR-0007)                         |
| `settings/SettingsShoes.tsx`           | `/settings/shoes`                  | Running shoes                                                                   |
| `settings/SettingsNotifications.tsx`   | `/settings/notifications`          | One switch and time per reminder, badges, and a switch per activity (S3)        |
| `settings/SettingsPrivacy.tsx`         | `/settings/privacy`                | Privacy — visibility, blocked users, hidden posts, privacy zones                |
| `settings/SettingsHiddenPosts.tsx`     | `/settings/hidden-posts`           | Hidden posts — the posts hidden from your feed, each with Unhide (App1 Q38)     |
| `settings/SettingsUnitsAppearance.tsx` | `/settings/units-appearance`       | Units and theme                                                                 |
| `settings/SettingsSupportLegal.tsx`    | `/settings/support-legal`          | Support, legal links, app version                                               |
| `AdminModeration.tsx`                  | `/admin/moderation`                | Admin report queue — client gate `VITE_ADMIN_UIDS`, the callable re-checks      |
| `Diagnostics.tsx`                      | `/diagnostics`                     | Operator diagnostics (push, SW update, App Check state) — hidden, unlinked      |
| `dev/*.tsx`                            | `/dev/*`                           | Developer labs (brand bake-off, form-motion lab) — not product surfaces         |
| `Onboarding.tsx`                       | `*` (fallback)                     | Multi-step setup flow (shown when onboarding incomplete)                        |
| `Login.tsx`                            | `*` (fallback)                     | Welcome whenever signed out, then sign-up or sign-in (Email, Google, Apple)     |
| `PrivacyPolicy.tsx`                    | `/privacy`                         | Legal — reachable signed-out                                                    |
| `TermsOfService.tsx`                   | `/terms`                           | Legal — reachable signed-out                                                    |
| `Support.tsx`                          | `/support`                         | Public support page (App Store Support URL) — reachable signed-out              |
| `PublicPost.tsx`                       | `/activity/:activityId`            | Signed out, a public post's card, a run's map with its ends cut off (App1 Q51)  |

Four Settings routes are redirects, kept for links already saved (Trim1,
2026-11-11): `/settings/training` and `/settings/workout-prefs` open Lift
plan, and `/settings/subscription` and `/settings/data` open Account. The
Settings list has ten rows: Lift plan, Run plan, Nutrition, Shoes;
Notifications, Units & appearance, Social & privacy, Apple Health; Account,
Support & legal.

## Key Business Logic (src/lib/)

| File                    | Purpose                                                        |
| ----------------------- | -------------------------------------------------------------- |
| `performanceEngine.ts`  | Load bands, week keys; a mirror of the server index, for tests |
| `tdee.ts`               | Base TDEE calculation                                          |
| `phaseNutrition.ts`     | Day-type specific macro adjustments (lift/run/rest)            |
| `savedRuns.ts`          | The one saved-run reader: query, parse, Lift3 day, queued runs |
| `savedWorkouts.ts`      | The one saved-workout reader: query, parse, day, queued ones   |
| `gps.ts`                | Haversine, pace, splits, elevation, Kalman filter, GPX export  |
| `paceTrends.ts`         | Running pace trend detection (PR/improving/consistent)         |
| `guidedRun.ts`          | A run step's kinds and colours, and a stored guided workout    |
| `weather.ts`            | Weather API integration for runs                               |
| `privacyZones.ts`       | GPS privacy zone detection for runs                            |
| `prTracking.ts`         | Personal record tracking system                                |
| `liftRecordsStore.ts`   | Best-lift map: load or rebuild, checked commit, invalidation   |
| `liftLoad.ts`           | Lifting loads in the lifter's unit: stored kg, shown kg or lb  |
| `scheduleUtils.ts`      | Weekly schedule generation (lift/run/rest)                     |
| `exercises.ts`          | Exercise database                                              |
| `workoutTemplates.ts`   | Workout template library                                       |
| `nlFoodParser.ts`       | Natural language food parsing                                  |
| `socialApi.ts`          | Firestore social operations (feed, kudos, follow)              |
| `fillingUp.ts`          | Social at small numbers: a small room says it is filling up    |
| `shareCardGenerator.ts` | Share card image generation (html-to-image)                    |
| `analytics.ts`          | Analytics computation                                          |
| `historyFigures.ts`     | Analytics range figures: window, range before, join-day clamp  |
| `trainingWeek.ts`       | The week done and planned, which every week count reads        |
| `layOutWeek.ts`         | The week laid out, lifts that slide: Home's card, strip, peek  |
| `foodDay.ts`            | A food day: 800 kcal or more, the one rule every count reads   |
| `trainingKind.ts`       | Lifts, runs or both, read from the plan, not setup's answer    |
| `sportChange.ts`        | A sport added or removed: the plan's input and profile fields  |
| `todaySession.ts`       | Home's session card: which card a day gets, tomorrow's name    |
| `liftCompletion.ts`     | Finishing a lift: the saved workout, the save and its receipt  |
| `circuitCompletion.ts`  | Finishing a circuit: its workout, saved as a lift is (Circ1)   |
| `liftPost.ts`           | A lift's feed post, built from what was done, and its reader   |
| `circuitPost.ts`        | A circuit's feed post: rounds, interval, moves; and its reader |
| `postMoments.ts`        | A post's moments (Soc15): the pure rules and the stored shape  |
| `runCompletion.ts`      | Finishing a run: the saved run, the save resumed by id, a post |
| `subscription.ts`       | Pro subscription handling                                      |
| `healthConsent.ts`      | The health-details agreement: its words, version and reading   |
| `proReport.ts`          | What Pro did: the review's month card, the yearly recap        |
| `firebase.ts`           | Firebase app initialization & Firestore/Auth/Storage exports   |
| `auth.tsx`              | AuthProvider, useAuth hook, UserProfile interface              |
| `api.ts`                | API client helpers                                             |
| `haptic.ts`             | Haptic feedback utility (Capacitor)                            |
| `offlineQueue.ts`       | Queues Firestore writes when offline, flushes on reconnect     |
| `errorReporting.ts`     | Error reporting utilities                                      |
| `logger.ts`             | Structured logging                                             |
| `notifications.ts`      | Local reminders (meal, workout, streak), scheduled on device   |
| `pushNotifications.ts`  | Push: the device's token, web or native, and its binding       |
| `reminderChoices.ts`    | A reminder's one switch and time, and whether phone or push    |
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

### goalSpace/ · spaces/ · run/

`goalSpace/` owns Goal Spaces (Circles) — membership,
invites, weekly focus, check-ins. `spaces/` owns the space definitions,
including the race spaces a `raceGoal.eventSpaceId` binds to. Searching
Spaces by name runs on the device over those definitions (`spaceSearch.ts`),
and Share hands a Space's link (`publicSpaceUrl`) to the share sheet or
copies it (`shareSpace.ts`, Run27 call 11).
`run/` holds run-surface feature modules. Partner streaks (`partnerStreak/`,
a 1:1 bond and a shared-day streak) went on 12 November 2026 (Trim1 call
3(b)): two people who train together use a Circle, which keeps no streak.
Nothing writes or reads `partnerBonds/{bondId}`, the rules refuse it, and a
bond stored before then is deleted with either member's account and by
`functions/scripts/purgePartnerBondDocs.js`.

### league/

Weekly leagues (Soc15 call 3): `LeagueCard.tsx` (Social's Together tab),
`LeagueResultGate.tsx` / `LeagueResultReveal.tsx` (the Monday result,
once per device), `TierBadge.tsx` (the five drawn tiers), `useLeague.ts`
(the figure, the membership, the group's standings) and `leagueRules.ts`,
the client's copy of `functions/lib/leagueRules.js` (pinned by
`__tests__/leagueRules.cross.test.ts`). The page is `src/pages/League.tsx`.

### challenges/

- `useChallenges.ts` — Challenge data hook
- `ChallengeList.tsx` / `ChallengeCard.tsx` — Challenge UI components
- `__tests__/useChallenges.test.ts`

### streaks/

- `useStreaks.tsx` — Streak calculation & management; reads the earned badges, writes none
- `restDays.ts` — the plan's rest days, which keep the streak without a log (App1 Q32); a person with no plan has none
- `badges.ts` — The badge catalogue (names, tiers, art); `badgeProgress.ts` draws a ring from `badgeEarning.ts`, the client copy of the server's rules
- `BadgeGrid.tsx` / `BadgeEarnedModal.tsx` — Badge display & celebration UI
- `BadgeShelf.tsx` — a profile's badges, above its medals (`TrophyCase`): the newest few on anyone's, and on your own "See all" opens `BadgeGrid` in place (`?badges=all`, spelled by `src/lib/badgeShelfLink.ts`). It was a tab under Analytics until Trim1 call 3(c)
- `__tests__/badges.test.ts`

### program/

- `programEngine.ts` — Periodized workout program generation
- `programTypes.ts` — TypeScript interfaces for program state
- `useProgram.ts` — Program state management hook
- `variationBank.ts` — Exercise variation database
- `runScheduler.ts` — Goal-driven run scheduling engine (race prep, its recovery, the starter goal)
- `matchTemplate.ts` — Equipment and injury swaps on a plan (`injurySubstitutions.ts` lists what each injury option promises)

### circuit/

Circuit mode (Circ1): a way of lifting measured in work per minute, saved
as a workout with `format: "circuit"`, never a third sport (ADR-0002's two
kinds stand). Pure logic, no Firestore: `circuitTypes.ts` (the vocabulary),
`circuitMoves.ts` (the move pool: released art ∩ kit tier ∩ injuries, each
high or low impact), `builtInCircuits.ts` (six per kit tier: 10, 20 and 30
minutes, standard 40/20 and low impact 30/30, named from their own
seconds), `circuitSteps.ts` (the timer's steps as `useSessionPlayer`
segments, and what of them was really run), `circuitDose.ts` (the
Easy / Right / Hard ladder: more work, then harder moves, never a longer
circuit), `circuitRules.ts` (the 7-minute rule, the Compendium burn) and
`savedCircuit.ts` (the stored shape and its checked reader,
`workoutCircuit`). A circuit's moves live in `workout.circuit.moves` and
its `exercises` stay empty (Circ1 (B)). v1 runs timed intervals only.

## Custom Hooks (src/hooks/)

**Data & State:**
`useFirestore`, `useMeals`, `useWorkouts`, `useWaterLog`, `useShoes`, `useFoodFavourites`

**Running & GPS:**
`useGPS`, `useRunTimer`, `useRunningStats`, `useSavedRuns` (runs on `useSavedSessions`, the one live engine for saved runs and workouts; `savedSessionsReaderGuard.test.ts` keeps their readers the only ones), `useSessionPlayer`, `usePrivacyZones`, `useAudioCues`, `useWakeLock`

**Social:**
`useSocialFeed`, `useDiscoverFeed`, `useNotifications` (the tray, and the Social tab's dot: its unread, cleared when the tray is opened), `useBlockedUsers`, `useFollowState` (one follow record shared by every Follow control), `useUserProfileData`, `usePulse` (today's sessions across Tropos, live)

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

- **Firestore collections:** `users/{uid}`, `users/{uid}/meals`, `users/{uid}/workouts`, `users/{uid}/runs`, `users/{uid}/programState`, `users/{uid}/hiddenPosts` (the posts a person hid from their feed, owner-only, App1 Q38), `users/{uid}/public/profile` (cross-user projection; incl. the opt-in `trainingForSpaceId` race identity), `activities` (public), `goalSpaces`, `challenges`, `challenges/{id}/participants`, `spaces/{id}/members`, `spaces/{id}/posts` (+ `posts/{id}/likes` and `posts/{id}/comments` — both SERVER-written via callables; clients read only), `friendsBoard/{uid}` (retired with the friends board, Trim1 call 3(a), 12 November 2026: nothing writes or reads it, the rules refuse it, and a week stored before then is deleted with its account and by `functions/scripts/purgeFriendsBoardDocs.js`)
- **A circuit is a workout, saved as a lift is** (Circ1). `/circuit` saves to `users/{uid}/workouts` through `completeCircuit` (`src/lib/circuitCompletion.ts`, on the lift's own `saveFinishedWorkout`): `format: "circuit"`, the circuit as run under `circuit` (read only through `workoutCircuit`), `exercises: []`, `totalVolume: 0`, `source: "free"` and no programme completion, so it moves no plan; calories from the 2024 Compendium's circuit METs. Nothing is saved under 7 minutes of the session clock. Every reader that counts a workout counts it (the week, the streak, leagues, challenges); the performance index counts it for adherence only (`circuitSessions`, never lift load), on both copies, pinned to the running server by `circuitFormat.cross.test.ts`. Its feed post (`circuitPost`) has no exercise rows: its rounds, interval and moves (exercise ids, named from the catalogue as drawn) go under the post's `circuit`, which `firestore.rules` checks field by field and each move by its slot (`validCircuitMoves`); a move id a circuit has stored stays in `EXERCISES` (`circuitPost.test.ts`). A Space post's snapshot of one carries `circuit: true`, so its count reads as moves.
- **The community goal counts everyone** (Soc14). A `group-goal-*` challenge carries server-written `collectiveMeters` (whole metres) and `collectiveRunners`: every eligible run saved in its month adds to them, joined or not, and deleting the run takes exactly its credit back off (`functions/lib/communityGoal.js`; the per-run credits live in `users/{uid}/communityGoal`, server-only, swept with the account). The app reads that total, never a sum of the loaded board.
- **A medal is kept per challenge edition** (Soc15). `users/{uid}/medals/{challengeId}` (owner-read) and the public profile's `medalSummary` (the trophy case, newest 40) are written ONLY by `onChallengeParticipantWritten` (`functions/lib/medals.js`), derived from the participant document, never by the several writers of `tierAchieved`; the rules refuse a client write of either. A medal follows the participant until 48 hours after the challenge ends, then is frozen. A community goal awards none. Reveals are on Social only, once per medal and tier per device.
- **Every badge is awarded by the server** (App1 Q33). The rules are `functions/lib/badgeRules.js` and the award is `functions/lib/badgeAwards.js`, one transaction per award that names the session that earned it (`earnedBy`), run by the triggers that see the facts: `onWorkoutCreated` and `onRunCreated` (the session badges, the hybrid windows, early_bird's day), `onMealWritten`, `onWaterLogWritten`, `onDailyNutritionWritten` (the food and water badges), `onStreakWritten` (the streak badges, from `streaks/data`'s certificate) and `onProgramStateWritten` (programme_complete). Earned badges stay where they always were, `users/{uid}/streaks/data.badges` and the public profile's `badgeSummary`, and the rules refuse a client change to either, or to `streaks/data.earlyLogDays`. The app's rings are pinned to the server's rules by `badgeRules.cross.test.ts`. A badge with `earnedBy` and earned within 14 days is revealed once per device (`pendingBadgeReveals.ts`), from Home's new-badge row, never over Home by itself; one earned before the server awarded them has no `earnedBy` and stays as it was.
- **A league is opt-in and scored against your own plan** (Soc15 call 3). `users/{uid}.leagueOptIn` is set only by the `setLeagueSharing` callable, which a restricted account cannot use to join; leaving deletes the person's standing at once. `leagueMembers`, `leagueGroups` (+ `standings`), `users/{uid}/leagueResults`, `leagueWeeks` and `leagueStatus` are SERVER-written only: `weeklyLeagueTurn` (Monday 12:15 UTC) settles, forms groups of about 20 and writes the open/locked figure, and the session triggers recompute a standing from the sessions. Points are `round(100 × min(done, planned) / planned)`; the planned count is `functions/lib/leaguePlanned.js`, a server copy of `trainingWeek.ts` pinned by `leaguePlanned.cross.test.ts` (read on the member's own day, so race week leaves out the lifts the app rests, TrainWk1), and the rules are `functions/lib/leagueRules.js`.
- **Leagues, challenges and Spaces are shown from the first day, and a small one says it is filling up** (App1 Q6, owner 2026-11-18: "Show them, say filling up", reversing the 2026-11-13 reading that hid them below 10 people). Together's This week and Discover, the league card and page, the Spaces directory, the Feed's Spaces source and People's Browse spaces are drawn for everyone, however few people are on Tropos, and Join stays wherever it was. Each room says how many are in it only from its floor, from a count the server already keeps, and "Filling up" in the number's place under it (`src/lib/fillingUp.ts`): a challenge's `participantCount` from 3 ("12 joined", the weekly card under its name and a challenge's sheet), a Space's member count from 5 (`SPACE_MEMBER_COUNT_MIN_VISIBLE`, the directory's cards; race cards keep their date and city). The league is the one room that cannot run small, since the server makes no group under `GROUP_MIN` (10): until groups are made its card and page say "The league starts once 10 people have joined. 4 so far." (the count from `leagueStatus/current.joined`, only from 3, with a bar) and, once there are enough, "The league starts on Monday. 12 people have joined.", with Join for anyone who has not. A count still being read, or one that failed, says neither. Nothing is estimated and no activity is shown that did not happen. The community goal is still drawn once its total is above 0 (Soc14).
- **A plan group is a count, recounted** (Soc15). `raceCohorts/{spaceId}` = `{ count, updatedAt }`: how many race goals (`users/{uid}.raceGoal.eventSpaceId`) are bound to that race with their race day still ahead. SERVER-written only, from a count aggregation and never an increment (`functions/lib/raceCohorts.js`), by `onRaceGoalWritten` (any write to `users/{uid}` that sets, moves or clears a bound goal recounts the old race and the new one; it is a trigger because the goal has many writers, account deletion among them) and `dailyRaceCohortRecount` (04:30 UTC, every race ahead); any signed-in person reads it. It names no one, so it leaves no one out. Only someone whose own goal is bound to a race ahead sees it (`RaceHero`, Together's hero, and a line in the race space's hero), and under 3 neither shows a number.
- **Social's live pulse counts everyone's sessions** (Soc15). `pulse/{YYYY-MM-DD}` = `{ sessions, updatedAt, expiresAt }`, read by anyone signed in and written only by the session create and delete triggers (`functions/lib/pulse.js`), each session once through `users/{uid}/pulseCredits` (server-only, swept with the account); both expire by TTL eight days after the day starts. The Feed reads the viewer's local today and draws nothing below 10.
- **A Space shows its members' public sessions and its week, both written by the server** (Run27 call 11). `spaces/{spaceId}/sessions/{activityId}` = `{ activityId, authorId, createdAt }` routes a member's public post to each Space they are in, and names nothing of it. Only `functions/lib/spaceFeed.js` writes it, reading the facts again each time: `onActivitySpaceRows` (a post created public, made public, narrowed, flagged or deleted), `onSpaceMemberWritten` (a join brings in their public posts of the last 28 days, at most 20; a leave takes theirs out) and `onRestrictionWritten` (a restricted account reaches no one, and the app cannot see who is restricted). Anyone signed in reads the rows; the app (`useSpaceSessions`) reads each post on its own, where the rules check who may see it and a block either way, shows it only while it is public, and leaves out people blocked either way and posts the viewer hid. `spaces/{spaceId}/weeks/{weekKey}` = `{ members, sessions, meters }`, or `{ quiet: true }` while fewer than 5 members trained (the member count's own floor), is a count and two sums over the members' credits, never incremented; each credit, `users/{uid}/spaceWeeks/{spaceId}_{weekKey}`, is server-only and counted again from that member's saved sessions as the league counts them, by the session triggers, a join or a leave and a restriction (`functions/lib/spaceWeeks.js`). Anyone signed in reads the week, which the Space's hero says as "38 members trained this week: 127 sessions, 412 km". A restricted account adds nothing; the rows and credits go with the account (`spaceSessionRows`, `userSpaceWeeks`).
- **Segments are timed for you and the people you follow** (Run26 call 3). A runner makes one from a stretch of their own saved run through `createSegment` (at least 400 m, no gap, outside their privacy zones, a name the word filter passes; a verified email and an unrestricted account). `segments/{id}` (name, line, length, start cell; read one at a time by anyone signed in, naming nobody) and `segmentOwners/{id}` (its maker reads it alone) are written only by the segment callables. `onRunCreated` times every saved GPS run that counts against the segments starting in a cell it passes, from its trace as saved (`functions/lib/segmentMatch.js`: start and end within 25 m in order, the route within 35 to 75 m, each lap its own effort, elapsed time), into `users/{uid}/segmentEfforts` (owner-read, server-written). `segments/{id}/board/{uid}` is each runner's fastest effort from a run shared with followers or everyone, neither end in their privacy zones; it is server-only and reaches the app only through `getSegmentBoard`, which shows it to the runner's accepted followers alone, across no block either way, never a restricted account's, checking the post and the zones again. No board of everyone and no crowns. A run deleted takes its efforts (`onRunDeleted`), a run shared or unshared and a zone drawn recompute the runner's entries (`onRunUpdated`, `onPrivacyZoneWritten`), and deleting a segment or an account takes its efforts out of everyone's tree (`functions/lib/segments.js`). Anyone but its maker can report a segment (Report segment, in the menu beside its name; the report target `segment`, resolved to its maker through `segmentOwners`); the moderation page's Remove segment deletes it as its maker's Delete does, and Restrict user restricts the maker.
- **A block hides each person from the other** (S4, Polish3 call 1). `blocks/{blocker}/users/{blocked}` is the blocker's own list; `blockedBy/{blocked}/users/{blocker}` is its copy for the person blocked, SERVER-written by `onBlockWritten` (`functions/lib/blockMirror.js`) and read only by them. `useBlockedUsers().blocked` merges the two, and every social surface filters on it; `youBlocked` and `blockedYou` are for the profile's Unblock and its not-available state alone (`blockedBothWays.test.tsx`). The rules refuse a single read of a blocker's public profile, and of a post across a block either way; queries (Explore, search, a profile's posts) are filtered in the app.
- **Auth:** Firebase Auth (Email, Google, Apple Sign-In)
- **Health details are stored on the person's agreement** (Priv1 call 1, owner 2026-11-21; UK GDPR Art 9 explicit consent). `users/{uid}.healthDataConsent` = `{ at, version }`: setup asks on its own step before the first body question (About you opens on it, the limitations after it), and `completeOnboarding` refuses a plan sent without it and stamps the server's time; an account set up before the question meets the same screen once, before the app, and its I agree is the one client write firestore.rules allow, exactly `{ at: request.time, version: 1 }`. The words and the version are `src/lib/healthConsent.ts`, the server's reading `functions/lib/healthConsent.js` (pinned by `healthConsent.cross.test.ts`, which also holds the rules' version). Withdrawing is deleting the account, which the screen and Settings › Social & privacy say. Analytics hears only that setup's step was reached.
- **Email sign-ups verify after the plan, not before it** (owner, 2026-10-01, reversing the 2026-09-15 wall). Sign-up sends the link (`signUp` in `auth.tsx`) and goes straight to onboarding, and `completeOnboarding` no longer asks for the claim. Home asks (`VerifyEmailBanner`, with Resend and a way to change a wrong address) until the app sees the address verified. The App-level gate rechecks on every return to the app, reloading Auth and refreshing the token, so tapping the link in Mail is enough. The social gate below is unchanged.
- **Public writes need a verified email.** The `email_verified` token claim gates `activities` and `spaces/{id}/posts` creates in `firestore.rules` (`isEmailVerified()`) and comments in the two comment callables (`assertCallerEmailVerified`). Private logging under `users/{uid}/*` and every non-content interaction stay open to unverified accounts; OAuth accounts carry the claim already. The e2e rig marks its signup-form accounts verified through the Auth emulator REST API (seed scripts create users verified).
- **A restricted account reaches no one** (S4e, 2026-10-06). `globalRestrictedUids/{uid}`, written by the moderation page's Restrict user (`resolveReport`) and removed by its Lift (`liftRestriction`), makes `isRestricted()` in `firestore.rules` refuse posts (a private one excepted), follows, Space and challenge joins and Circle events, and `functions/lib/restriction.js` refuse props, comments, likes, reactions and the Circle callables; the toggles refuse only adding. Logging, the person's own profile, blocking, reporting, unfollowing, leaving and deleting their own things stay open. The app says so before the server refuses: `RestrictedNotice` where an action would be, `showRestrictedToast()` for a refused tap (`src/lib/accountRestriction.ts`). Deleting a restricted account keeps a keyed hash of its email (only once verified, so a borrowed address restricts no one) and its Google and Apple sign-in ids in `restrictedIdentities/{hash}` for 13 months (`functions/lib/restrictedIdentities.js`, STATUS 2026-10-20): `onAuthUserCreated` restricts a new account carrying one, and `liftRestriction` forgets them.
- **A follower is someone you accepted** (Polish2, 2026-10-20). `users/{uid}.approveFollowers` (Settings → Social & privacy; absent means on) makes `firestore.rules` refuse a direct follow, and the app writes `followRequests/{target}/users/{asker}` instead, seen only by the two. Only the person asked writes the two follow edges, on accepting (`acceptFollowRequest`). Requests have their own collection so every reader of `followers/`/`following/` still sees only accepted follows. One exception (Soc15 call 4, 2026-11-04; narrowed by its STATUS of 2026-11-05): a new account that joins from someone's invite link or code is followed by them at once, written only by the `redeemInvite` callable (`functions/lib/inviteCodes.js`; edges carry `fromInvite`), since using their link counts as the new person accepting them. The new person follows the inviter at once only when the inviter has Approve followers off; otherwise `redeemInvite` writes their follow request, marked `fromInvite`, which the inviter accepts in one tap, so a code posted publicly reaches no followers-only post. A code is renewed (Soc15 STATUS 2026-11-10) by its owner at any time (`renewInviteCode`, People's New code) and by a block of someone who joined from it (`onBlockWritten` reads the `invitedBy` that `redeemInvite` stamps), and the old code stops working at once, so a person blocked cannot make a new account and join from it again.
- **A follow count is the server's, recounted.** `followCounts/{uid}` = `{ followers, followersAt, following, followingAt }`: how many accounts follow one and how many it follows. SERVER-written only, by `onFollowerEdgeWritten` and `onFollowingEdgeWritten` (`functions/lib/followCounts.js`), each from a count aggregation over the list whose edge was made or removed and never an increment, and never for an account being deleted. A profile reads someone else's numbers from it (`getFollowCounts` in `socialApi.ts`), so no screen reads another person's lists; your own profile counts your own lists, which are right the moment you follow someone. Anyone signed in reads one, except someone its owner blocked, and nobody lists them. A side the server has not counted is absent: the app counts the list for it while the rules allow that, and reads it as 0 once they keep a list to its owner (Polish4 call 1; `functions/scripts/backfill-follow-counts.js` counts every account first, and stays as the repair).
- **Activity notifications follow the recipient's switches.** `notificationPreferences` on `users/{uid}` (S3: props, comments, circles and spaces on; new followers off; Polish2: follow requests on) is read by `createNotification`, the one writer of `notifications/{uid}/items`, which writes nothing for a kind that is off. The client's copy (`src/lib/notificationPreferences.ts`) and the rules' value gate are pinned to the server's (`functions/lib/notificationPreferences.js`) by `notificationPreferences.cross.test.ts`. A new notification type has to be given a switch, or none on purpose, in that file. **Some rows also push** (App1 Q18): `onNotificationItemWritten` sends a push for a new comment, Space comment, follow request (both ways), invite joined, league result or meet-up reminder (Run27 call 10), under the same switch, once the account takes push, never across a block, from a restricted sender or for one's own act, and quietly (no sound) in the recipient's 22:00 to 08:00; props are gathered on `users/{uid}/settings/propsBundle` and `hourlyPropsBundle` sends one push a day at 19:00 local (`functions/lib/socialPush.js`). These are outside the budget below.
- **A push not from a person has a budget** (App1 Q60): at most 1 a day and 5 in any 7 local days per account, claimed in a transaction on `users/{uid}/settings/pushBudget` (`functions/lib/pushBudget.js`). Every server push except the test push passes it; when two compete for a day the order is the evening streak reminder, Monday's review, a closing challenge, new challenges, a badge, and a push due earlier gives way while a higher one is still armed for later that day. **A reminder ignored three times running goes quiet** (App1 Q62): answered means the app was opened after it the same day, it was tapped, or what it asked was done; the server counts the streak and review pushes (`functions/lib/reminderAttention.js`), the phone counts the reminders it schedules (`src/lib/reminderFires.ts`), and both turn the reminder's one switch off and set `{kind}QuietAt` on `settings/reminders`, which `RemindersQuietCard` says once on Home. The rule and its fields are pinned by `reminderAttention.cross.test.ts`.
- **A reminder has one switch and one time; the app picks how it goes** (App1 Q26). Training days and meals (`settings/workoutReminders`, `settings/mealReminders`) always go from the phone. The evening streak and the Monday review (`settings/reminders`: `streakEnabled`, `streakTime` as a whole hour 08:00 to 21:00, `reviewEnabled`) go by push when the account takes push (`settings/push.enabled`) and from the phone otherwise, never both: `reminderDelivery` in `src/lib/reminderChoices.ts` and its server copy (pinned by `reminderChoices.cross.test.ts`) give one answer, and `hourlyStreakNudge` sends at the chosen hour (the recap at 09:00). The old switches (`settings/streakReminder`, `settings/reviewReminder`, `push.streak`, `push.recap`) are read until the new fields are written, never written. Settings has no push switch: turning one of those two on where the device can take push sets push up (`pushTurnedOn`), with the push-only kinds (badges, monthly challenges) left off unless asked for.
- **A Circle's meet-ups are its members' plans, written by the server** (Run26 call 4). `goalSpaces/{spaceId}/meetups/{meetupId}` = `{ organiserUid, sport, title, place, note, startsAt, timeZone, going, createdAt }`: a run or a lift with the instant it starts, the organiser's zone and a typed place, never coordinates, training numbers or a copied name (GsPb1). Members read them; the `circleMeetup` callable (`functions/lib/circleMeetups.js`) is the one writer, holding the word filter, restriction (planning and saying you're in are refused; can't make it and calling off stay open) and the block check that backing a check-in uses. The app shows each in the viewer's own time and hides one three hours after its start. A meet-up goes when it is called off (those who were in are told), when its organiser leaves or is removed, when the Circle ends, and with the organiser's account, whose uid also comes off every `going` (`goalSpaceCleanup.js`, `accountDeletionSocial.js`); past ones are pruned when the next is planned. **A meet-up reminds, repeats and carries pace groups** (Run27 call 10): a run's `paceGroups` are typed words on one line (80 characters, the word filter), never a number anyone ran; `repeat: "weekly"` has `hourlyMeetupSweep` (half past each hour) plan the next one once this one is over, at the same time of day in the organiser's zone a week on, with only the organiser in, and the series ends when it is called off, the organiser leaves, is restricted or is deleting, the Circle ends, it is full, or its words meet a filter that now refuses them; and about 24 hours before a start planned more than 30 hours ahead the same sweep sends `circle_meetup_reminder` once to each member still in, under the Circles switch, from the meet-up (`tropos-meetups`), naming nobody and carrying none of the organiser's words, never across a block with the organiser, never after the start, and never for one called off. `remindAt` and `repeatAt` are the sweep's due markers, present only while the work waits, each read through a collection-group index, and cleared when it is done. **A Circle's owner renames it** (Run27 call 11) through `renameGoalSpace`, under the rule a new Circle's name meets (the word filter, with the display name's sentence), refused to anyone else and to a restricted account; the name lives on `goalSpaces/{id}`, which every row and sheet reads through `circleTitle`, and its one copy, each member's `users/{uid}/journeys/{spaceId}.title`, changes in the same transaction. No notification carries a Circle's name.
- **A copied name and photo follow the profile.** Posts, comments, Space and Circle memberships and challenge places copy the author's name and photo when written, and a notification its sender's name (`fromName`, and the sentence that starts with it); `onPublicProfileIdentityChanged` carries a new public name or photo to the last 90 days of them (`functions/lib/identityResync.js` has the bounds), never a name the word filter refuses, a restricted account's new name or photo, or into an account being deleted. A new copy of a name goes on its list.
- **The five launch numbers are one event each, once per account** (App1 Q17). `onboarding_completed` is sent as setup saves. The other four are decided by the server and sent by the app: the session triggers keep `users/{uid}.launchMilestones` (the first counted session and the first on days 21 to 27, `functions/lib/launchMilestones.js`, stamped empty at the first setup so an older account gets none), the billing record keeps `activationBillingFirsts` (the first verified trial and paid period, App Store and website alike), and `src/lib/launchEvents.ts` claims each in `users/{uid}/settings/launchEvents` before sending `first_session_saved`, `week_4_returned`, `trial_started` or `subscription_started`, so a sale the app never saw finish still counts, once.
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
- **Units:** spaced — "60 kg", "5.2 km", "400 m", "2,633 kcal", and a pace "5:34 /km"
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
write.** `unit` runs the whole suite on every pull request. On a pull
request each variant below runs the tests its changes reach (`vitest
related` on the changed files, plus every test whose text names one:
`scripts/ci/variant-suite.mjs`), the whole suite when a change can reach
any test without an import (dependencies, test config and setup,
`__mocks__`, `scripts/ci`, `ci.yml`), and does not run when only
root-level markdown, `docs/`, plan files or `ios/` changed
(`scripts/ci/classify-changes.mjs`). Twice a
day every variant runs the whole suite on main, and a red scheduled run
opens or updates one `ready-for-agent` issue naming the commits since the
last green one. Each variant exists because the single-condition run had
been hiding a real defect:

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
expires rather than on the day. A variant failure in a test your change
does not reach turns up in the scheduled run, not on your pull request.

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
it for you, and its header says why. Restore the clock with
`restoreRealTimers()` from `src/test/fakeTimers.ts`, which does both.

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
- Journeys (`e2e/journeys/*.auth.spec.ts`, the `journeys` project, CI's `journeys` job): one new account through weeks of the app, its day moved with the app open (`e2e/helpers/journey.ts`), the callables answered by their real handlers (`realCallables.ts`), and a trigger's step a journey needs run in its process (`serverSteps.ts`; the rig runs no Functions). Run them with `npm run test:e2e:journeys` against the emulators, in UTC. The names they find on screen live in `src/test/journeyScreens.ts`, pinned against the components by unit tests: rename a button there, not in a spec
- Capture specs, the emulator rig and screenshot diffs: `docs/agents/capture-rig.md`
- `e2e/screenshots/largeText.capture.spec.ts` opens the main screens, every Settings section, a workout, a run, the detail pages, the Weekly review, sign-up, setup and Pro at 393 and 320 px with 1.35× and 2× text, and fails on anything past the screen or wider than its box. When it fails, fix the layout (wrap, give way, px for controls and margins), not the list: its `ACCEPTED` entries each carry a reason

## CI/CD

- **deploy-production.yml ("Deploy production") is the one entry point for the web and backend deploys.** It runs on every push to `main` and on a manual `workflow_dispatch`, one release at a time (the `production-release` concurrency group queues a new release behind the running one rather than cancelling it). The five workflows below are `workflow_call` only, so none of them can be run on its own — to redeploy anything, re-run Deploy production. Its `changes` job diffs against the last SUCCESSFUL release, not the previous push, and runs the backend chain only when something under `functions/`, `firestore.rules`, `firestore.indexes.json`, `storage.rules`, `firebase.json`, `scripts/verify-*`, `scripts/verify_*`, `scripts/write-functions-env.mjs` or `.github/workflows/deploy*` changed; a manual dispatch always runs it. Order: Firestore → Storage → Functions, then Hosting and Pages once all three succeed (or straight away when the backend was skipped).
- **deploy-firestore.yml:** Firestore rules (read back after deploying), then indexes.
- **deploy-storage.yml:** Storage rules, gated behind the `STORAGE_XSERVICE_APPROVED` repo variable (set since 2026-09-15). Before releasing rules that read Firestore it confirms the Storage service agent holds the role they need (`scripts/verify_storage_rules_iam.py`), and fails the release if the role is missing or unreadable — firebase-tools grants it only interactively, never from CI. The packet-11 row in `docs/qa/pre-launch-backlog.md` has the one-time grant.
- **deploy-functions.yml:** Cloud Functions — injects the per-commit bundle marker, runs `firebase deploy --only functions --force` (so a removed export is deleted, not refused), then reads the deployed source back (`scripts/verify-deployed-functions-source.py`). A failure files or updates one rolling "deploy-functions failing on main" issue.
- **deploy.yml:** Builds the whole app and deploys it to GitHub Pages (`/Maiin/`), the development and preview surface.
- **deploy-hosting.yml:** Builds troposfit.com with `base: "/"` and deploys to Firebase Hosting. Since App1 Q52 (owner, 15 Nov 2026) that is the website, not the app: `npm run build:hosting` builds `website.html` (`src/website/`) alone and writes it out as `index.html` (`scripts/website/websiteEntry.ts`). It is the marketing site (Home, Lifting, Running, Food, Social, Pro, About, Press kit; `docs/website/design.md`), each page drawn into its own HTML after the build (`scripts/website/prerender.ts`) and served without a trailing slash, a shared post's page (`publicPostPage` fetches this `index.html`, which is Home), the legal and support pages and a real 404; firebase.json sends only the app's own addresses (`APP_ADDRESS_PREFIXES`) to Home, and every address already handed out keeps answering (`src/website/__tests__/websiteAddresses.test.tsx` follows each through firebase.json). It ships only `public/icons`, `public/legal` and the few drawings its pages use (`WEBSITE_PUBLIC_ART`) of the app's public folder, the worker that retires the app's at `sw.js` and `firebase-messaging-sw.js`, and the universal-links file, without whose `IOS_APP_ID_PREFIX` the build fails. The browser app is on Pages only. The web build's security headers (HSTS, `nosniff`, Referrer-Policy, `X-Frame-Options`, a `frame-ancestors 'none'` CSP header, Permissions-Policy) live in `firebase.json` and ship ONLY via Hosting — GitHub Pages cannot set response headers, accepted because Pages is the preview surface, not the product. `frame-ancestors` is ignored in a `<meta>` CSP, which is why it is a header. Pinned by `hostingSecurityHeaders.test.ts`.
- **deploy-ios.yml:** Separate and manual-only (`workflow_dispatch`): builds the web bundle into the iOS project and uploads to TestFlight. Its header marks it an unverified scaffold. Without the `IOS_DIST_CERT_*` secrets it makes each run's certificate and profile from the App Store Connect API key (`scripts/ios/asc-signing.mjs`, revoking the previous run's), so the owner needs no Mac (`docs/ios-release.md`).
- **Required checks:** `unit` (the repository ruleset) and `emulator-tests` (main's branch protection). A check skipped by a job-level `if:` reports as passed, so `unit` never depends on what changed, and every job that does reads ci.yml's `changes` output through one fail-open condition. `ios-native-compile.yml` runs on a pull request only when a file the native compile reads changed, and daily on main. `ciChangeGating.test.ts` holds these shapes.
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

Tropos ships as a native Capacitor iOS app (Android is planned) — that is the primary distribution channel, not the GitHub Pages web build. Every feature, integration, and infrastructure decision must work on the native app where it's technically possible, not just in the browser. A capability that only functions on the web — when the real users are on iOS — is wasted work, not a shipped feature.

- **Parity runs BOTH ways — the web build is the active development & preview surface.** Tropos is currently built and previewed on the web app, so every feature must render and be exercisable on web _and_ be wired to work on native iOS. Don't ship web-only (invisible to the real iOS users); equally, don't ship native-only (invisible in the web preview loop the developer is actually using). When a capability can only fully execute on-device (a Capacitor plugin, a native SDK), still leave a **web-visible path** — a fallback, a stub, or the same UI with the native call no-op'd — so the feature can be seen and reviewed on web _before_ it's pushed to iOS. "It only shows up once it's on a device" is a broken preview loop.

- **Default to platform parity.** When wiring a third-party SDK, browser API, or build-time integration, check up front whether it works inside the native WKWebView / Capacitor shell. If the web SDK won't run natively (e.g. Firebase Analytics web SDK, reCAPTCHA, anything depending on browser-only APIs), find the native equivalent (a Capacitor plugin, the native Firebase SDK via `GoogleService-Info.plist` / `google-services.json`, etc.) **as part of the same task** — don't ship the web half and call it done.
- **If native parity is genuinely deferred, say so loudly and leave the seam.** It's acceptable to land the web path first when the native path needs a plugin/native-project change that can't be done in the current environment — but only if (a) the limitation is stated explicitly to the user at decision time, not discovered later, and (b) the code leaves a native injection point (the `appCheck.ts` web/native split + `setNativeAppCheckProvider` seam is the reference pattern). A silent web-only implementation that reads as "done" is the failure mode to avoid.
- **Don't spend effort on web-exclusive polish for an iOS-first product.** Weigh the value of any web-only work against the fact that the audience is on the native app. "It works on the web build" is not the bar; "it works where the users are" is.
- **The analytics layer is the reference example of this rule done right.** The provider in `analyticsProvider.ts` delivers on BOTH platforms behind one seam: web via the `firebase/analytics` SDK, native via the `@capacitor-firebase/analytics` plugin → native Firebase SDK. Each loads in its own dynamic-import chunk so neither platform ships the other's code. Native reads its config from `GoogleService-Info.plist`, which `deploy-ios.yml` writes from a secret into every build (`docs/ios-release.md`); the web env var (`VITE_FIREBASE_MEASUREMENT_ID`) drives web, the plist drives native.

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
photo field is persisted to Firestore. No meal photo is kept on a
server either: the app neither writes nor reads one (`parseMealDoc`
drops a meal's `photoUrl`, so the diary draws only the device's photo),
`storage.rules` closes `food-photos/` to every client, and the photos
builds before Food9 uploaded there are deleted, with the `photoUrl` and
`photoPath` they left on meals, by
`functions/scripts/purgeLegacyFoodPhotos.js` (owner, 2026-11-21). Run in
production on: not yet (the operator puts the date here, from its row in
`docs/qa/pre-launch-backlog.md`).

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
- **Gate a push on the checks in the same command with `&&`, never `;`.**
  `vitest … | grep …; git push` pushes whatever the tests said: a pipe's
  status is its last stage's, and `;` ignores it anyway. It pushed 28
  failing Home tests on 2026-11-09.
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
- **Never resolve a promise with a Capacitor plugin.** A plugin is a Proxy
  that answers EVERY property with a native call, `then` included, so
  `return mod.Purchases` from an async function, or
  `.then((m) => m.Health)`, asks it for `then`, calls a native method that
  does not exist (`"Purchases.then()" is not implemented on ios`) and never
  settles. The first TestFlight builds hung on exactly this: RevenueCat was
  never set up, App Check never answered, and checkout sat on "Starting
  checkout…". Hand back a holder (`{ plugin }`) as `haptic.ts`,
  `systemChrome.ts` and `revenuecat.ts` do, and mock the plugin in tests
  with `src/test/capacitorPlugin.ts`, which answers `then` as the bridge
  does, so the old shape hangs the test instead of passing.
- `react-body-highlighter` exports `Muscle` type — cast `mapMuscles()` return to `Muscle[]`
- Recharts v3 Tooltip props: let TypeScript infer `labelFormatter`/`formatter` parameter types
- `useRef` in strict mode requires an explicit initial value argument
- `functions/` is plain JS (CommonJS) — excluded from ESLint TS config
- Firestore `d.data()` returns `DocumentData` — always assert types at boundaries
- Run tracking pages (`/run`, `/run-summary`) render full-screen without the Layout nav wrapper
- Which card Home's session stack shows, and what it says, is decided in `src/lib/todaySession.ts` from one day key; `StackedCTACards.tsx` only draws the answer, so change the rules there and test them without rendering Home
- `WaterWave.tsx` + `WaterBubbles.tsx` move on the compositor: each wave is drawn once, two tiles wide, and slid by `Element.animate`, and each bubble is an `Element.animate` of transform and opacity. Do not put back an animation-frame loop, a rewrite of a path's `d`, or a framer `y`: the old loop cost about a fifth of the main thread on an idle Home. The tests stub `Element.animate` (jsdom has none)

## gstack

gstack (`.claude/skills/gstack`, a git submodule) is checked out only in local sessions; when it is installed, use its `/browse` for web browsing. In cloud sessions, drive the pre-installed Chromium with Playwright, as the capture rig (`docs/agents/capture-rig.md`) does. Never use `mcp__claude-in-chrome__*` tools.

## Tropos Design System

Read `DESIGN_GUIDE.md` before UI work: §0 is the non-negotiables, §10 the accessibility floors, and §14 the owner's dated design decisions, the training-plan primitives and the button-variant mapping. Since DS4 (2026-11-07) its rules are measured from the apps people come back to (§14m, evidence in `docs/design-rules-2026-11/`): one hero per screen holding its largest text, colour on the person's data within a budget, our own art as the pictures, full-screen rewards for firsts, bests, streaks and finished plans, and a full day 1. CODING_STANDARDS' house voice carries the measured words rules. §14n (DS5, 2026-11-10) adds eleven rules for what a flow does, counted from 168 screens of 51 apps (`rules-engagement.md`): the streak's page, missed days, asking for notifications, setup, logging, the week and the paywall; Tropos met nine of them already, so most are floors not to go below. §14o (DS6, 2026-11-10) is where a surface's definition comes from: dark cards, tiles, chips and pills take a lit edge through the shadow tokens, glass is allowed on what floats over scrolling content (tab bar, sheets, toasts, the workout's docked cards) and never on a card of the person's data, a hero may stand in one soft light of its session's colour, and neon stays out. §14p (DS8, 2026-11-11) is the signed-out screens: the welcome stands on full-screen photographs of athletes that fade from one to the next (owner, 2026-11-12; `src/assets/welcome/`), sign-in and sign-up open on a drawn lifter who faces you, and the lockup is the mark beside "Tropos". §14q (Wid2, 2026-11-12) is what shows outside the app: a Live Activity's card and expanded island open on the session's own drawing, which changes pose as the card updates, the island's small sizes show the live figure, and the widgets follow in the same language (`src/lib/liveActivityArt.ts` names the drawings the widget extension holds). A visual change starts as a mockup with before-and-after captures; a pass that only removes things has not done the job. Screenshot capture and the emulator rig are in `docs/agents/capture-rig.md`.

### Component Architecture

- **Pages:** src/pages/ — route-level, lazy-loaded
- **Home screen built from:** the header (the date as a kicker, with the
  plan's position or a first session beside it, then the streak chip and
  the avatar; "Today" is the h1 for screen readers only, DS4) →
  StackedCTACards, the hero (LiftCTACard / RunCTACard / RestDayCard drawn
  by SessionHero: the session's name, its focus and minutes, its picture,
  one line against last time, one neutral Start; a day's second session
  is a compact card under it; the words are `homeHero.ts`'s) → the week
  card: WeekSessions over WeekStrip's seven segments, then WeekSummary
  (what the count is made of, and the days with food logged) beside
  WeeklyReviewEntry (a link while a review waits) → DayPeekCard (the
  tapped day) →
  StarterDoneCard (the starter goal reached: Done, and what comes next
  offered once: Build to 5K, Keep fit or a 5K) →
  FirstWeekCard (a new account's first seven days from setup; one or two
  rows, the first workout and the first run) → NewBadgeRow (a
  waiting badge, opened on tap; badges never open over Home by
  themselves) → YearRecapRow (the week before a yearly Pro renewal, the
  year and what Pro did, opened on tap; App1 Q56) → VerifyEmailBanner (until the address is verified) →
  RemindersQuietCard (once, when a reminder went quiet after 3 went
  unopened, App1 Q62) → TodayEnergy → WaterCard → WeightTile. Home says the week once and
  carries no performance score (Trim1 call 1, 2026-11-11): the "This
  week" card that closed the page, with its Performance row, is gone,
  and the score is on Progress. Nor does it carry a steps count (App1
  Q31, 2026-11-13): steps feed the activity level offer under Food's
  wheel (`stepActivity.ts`, Pro, phone only), and Home asks to connect
  Health only where they can change the target.
  `claudeMdFreshness.test.ts` fails when a name here stops rendering or
  falls out of order; nothing notices a section missing from the line, so
  re-read it against `src/pages/Home.tsx` when you add one to Home.
- **First week and first-use guide (FV1, owner 2026-10-04; App1,
  2026-11-13):** every account takes one first-week journey, XB1's v2
  (App1, whole-app grill Q27, ended the comparison group and removed the
  older journey). Setup's About you chapter opens on the agreement to
  store health details (Priv1 call 1), before any body question, so a
  lifter's setup is goal, week, kit, the agreement, limitations, numbers
  and the review. Setup goes straight to Home, with no Pro offer between
  (whether one comes back is the open owner call Q72), and Home has no
  walk. Home leads with today's session, and the first-week card counts
  seven days from setup (`onboardingCompletedAt`) and has one or two
  rows, "Finish your first workout" when the plan has lifts and "Go for
  your first run" when the person runs (`firstWeek.ts`), each opening
  that session (`firstWeekAction.ts`). `completeOnboarding` still stamps
  `activationJourneyVersion: 2` on every new account, for the activation
  report and app builds from before App1, but the app reads no account's
  version (`oneFirstWeekJourney.test.ts`), so one stamped 1 or none gets
  the same Home. `GuideHint` turns up once in each place it is used
  (Train's order, the first set, Food's composer, the first run), with
  nothing to meet first. The Tropos mark is the guide (no character; the
  house voice holds). Rules and words are in `firstGuide.ts`. It never
  shows under automation unless a capture spec sets
  `tropos-guide-under-automation` to `on` in localStorage, so specs that
  don't ask for it never meet it.
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

When the owner says a screen feels off, use the `screen-critique` skill: it
scores the screen against §14m (`npm run score:screens` on the emulator
rig), sets it beside the reference apps, finds the cause in the code and
ends in fixes for the owner to call. Together's Soc16 critique is its model.

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
`whole-app-pass-2026-11-10.md` is a narrower pass by one session: what it
fixed, the open follow-list finding and its four-step plan, seven
architecture candidates and five owner calls.

### Domain docs

Single-context. `GLOSSARY.md` at repo root holds the domain terms (its
"Domain glossary" section) and the reference-app research; ADRs are in
`docs/adr/`. See `docs/agents/domain.md`. It was `CONTEXT.md` until
2026-10-04, and plan-file rows and ADRs from before then still call it that.
Don't create a `GLOSSARY-MAP.md`: this repo has one context.

`docs/state-machines.md` lists every flow with more than two states: which
have them written down as a type or a graph, and which are flags and refs,
with a combination each can hold that it should not. Read it before changing
one of those flows, and add a row with a new one;
`stateMachinesDoc.test.ts` keeps its file and type names true.

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
| 0013 | Weekly bands judge a plan and do not shape it; time sizes a day (Lift21)           |

## Dynamic workflows & `ultracode` (when to escalate)

A workflow runs many subagents from a script; the user opts in with the word `workflow` or `/effort ultracode`. Suggest one for a Tropos task when:

- the change touches the correctness-critical engines: `performanceEngine`, `runScheduler` (race-prep, taper and recovery), `adaptiveTDEE`, `plateauDetection` or `phaseNutrition`;
- it is a cross-cutting sweep: a codebase-wide audit, a many-file migration, a security pass over the Firestore rules or callables, or a perf audit;
- it is a hard plan worth drafting from several angles, the `/grill-me` kind;
- it touches `functions/`: plan against `docs/agents/functions-deploy.md` first and verify the deployed source after.

Routine single-file edits, copy tweaks and product decisions stay conversational. Workflows resume only within the same session, and cloud containers are reclaimed when idle, so commit and push before a long run.

## graphify

`/graphify` can build a knowledge graph at `graphify-out/`. This repo has none unless `graphify-out/graph.json` exists, and building one is a deliberate act: `graphify update .` on a graph-less tree silently builds one, so run it only to refresh a graph that already exists. When a graph exists, its hook's "MANDATORY: run graphify first" nudge is a hint. Mirror-parity questions, `functions/` correctness and verification passes read the source files themselves.
