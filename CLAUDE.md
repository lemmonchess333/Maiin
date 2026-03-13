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
