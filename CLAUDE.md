# Tropos — Adaptive Fitness App

## Quick Reference

```bash
npm run dev        # Start local dev server (Vite)
npm run build      # TypeScript check + Vite production build
npm run lint       # ESLint (TS/TSX only, functions/ ignored)
npm run test       # Vitest unit tests
npm run test:watch # Vitest watch mode
```

## Tech Stack

- **Frontend:** React 19 + TypeScript + Vite 7
- **Styling:** Tailwind CSS v4 (via @tailwindcss/vite plugin)
- **Routing:** React Router v7
- **Backend:** Firebase (Auth, Firestore, Cloud Functions, Storage)
- **Charts:** Recharts
- **Maps:** MapLibre GL
- **Animation:** Framer Motion
- **PWA:** vite-plugin-pwa + Workbox
- **Native:** Capacitor (iOS/Android)
- **Payments:** Stripe
- **Testing:** Vitest + React Testing Library + jsdom

## Project Structure

```
src/
├── components/         # Shared UI components
│   ├── analytics/      # Performance charts
│   ├── calendar/       # Training calendar
│   ├── nutrition/      # Nutrition-related UI
│   ├── program/        # Workout program builder
│   ├── progress/       # Progress tracking UI
│   ├── run/            # Running feature components
│   ├── settings/       # Settings UI
│   └── social/         # Social feed, activity cards
├── features/           # Feature modules (challenges, streaks)
├── hooks/              # Custom React hooks
├── lib/                # Pure business logic & utilities
│   └── __tests__/      # Unit tests for lib/
├── pages/              # Route-level page components
├── utils/              # Helpers (progressCalculator)
│   └── __tests__/      # Unit tests for utils/
└── App.tsx             # Router + error boundary + lazy loading
functions/              # Firebase Cloud Functions (plain JS)
```

## Architecture Notes

- **All pages are lazy-loaded** via `lazyRetry()` wrapper in App.tsx (handles stale cache)
- **Manual chunks** in vite.config.ts: firebase, charts, vendor, maplibre, motion, date-fns
- **Path alias:** `@/` maps to `src/`
- **Base path:** `/Maiin/` (for GitHub Pages deployment)
- **Offline support:** `src/lib/offlineQueue.ts` queues writes when offline

## Key Business Logic (src/lib/)

| File | Purpose |
|------|---------|
| `performanceEngine.ts` | Weekly performance index (0-100), load bands, deload detection |
| `adaptiveTDEE.ts` | Adaptive TDEE calculation from weight trends |
| `plateauDetection.ts` | Detect stalling/regressing and adjust macros |
| `phaseNutrition.ts` | Day-type specific macro adjustments (lift/run/rest) |
| `calculateDailyMacros.ts` | Daily macro target computation |
| `healthScore.ts` | Composite health score |
| `gps.ts` | Haversine, pace, splits, elevation, Kalman filter, GPX export |
| `paceTrends.ts` | Running pace trend detection (PR/improving/consistent) |
| `scheduleUtils.ts` | Weekly schedule generation (lift/run/rest) |
| `rolloverCalories.ts` | Pro feature: unused calorie rollover |
| `socialApi.ts` | Firestore social operations (feed, kudos, follow, crews) |
| `gemini.ts` | AI food analysis via Gemini API |

## Data Model

- **Firestore collections:** `users/{uid}`, `users/{uid}/meals`, `users/{uid}/workouts`, `users/{uid}/runs`, `activities` (public), `crews`
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

## CI/CD

- **deploy.yml:** Builds and deploys to GitHub Pages on push to `main`
- **deploy-functions.yml:** Deploys Cloud Functions when `functions/**` changes
- **Firebase project:** `adaptive-fitness-af8bb`

## Common Gotchas

- `react-body-highlighter` exports `Muscle` type — cast `mapMuscles()` return to `Muscle[]`
- Recharts v3 Tooltip props: let TypeScript infer `labelFormatter`/`formatter` parameter types
- `useRef` in strict mode requires an explicit initial value argument
- `functions/` is plain JS (CommonJS) — excluded from ESLint TS config
- Firestore `d.data()` returns `DocumentData` — always assert types at boundaries

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
