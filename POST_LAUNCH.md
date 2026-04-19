# Post-Launch Work

Items parked for evaluation after launch. Intentional tech-debt parking, not forgotten bugs.

## Optimisations

### Home page Firestore subscriptions via `useEffectiveTargets`

**Status:** Deferred. Revisit when real-user data justifies the work.

**Context:** After migrating Home's header from `useDailyTargets` to `useEffectiveTargets`, Home opens two additional Firestore `onSnapshot` subscriptions on mount:

- `users/{uid}/workouts` — 30-day window, 60-doc limit
- `users/{uid}/runs` — same window and limit

These subscriptions are necessary for Home's header total to reflect the MAX rule (planned vs actual burn). The cost is modest per user but scales linearly with active Home sessions.

**Why deferred:**

- Pre-launch, single active user — cost is effectively zero.
- Firestore free tier covers current volume and far more.
- Optimising without real usage data risks picking the wrong fix.

**When to revisit:**

- Firestore read costs in the Google Cloud billing dashboard become visibly non-negligible.
- User count crosses a threshold where Home mounts dominate read traffic (observable post-launch via analytics).
- Users report sluggish Home loads that trace back to snapshot hydration.

**Possible fixes (evaluate against real data before picking):**

1. Daily aggregate document — maintain `users/{uid}/dailyTotals/{yyyy-MM-dd}` with pre-summed workout and run calories. Home reads one doc instead of subscribing to two collections. Write paths update the aggregate whenever a workout or run is written.
2. In-memory cache with TTL — keep `useEffectiveTargets` as-is but memoise results keyed by date, so repeat mounts within a short window reuse prior results without re-subscribing.
3. One-time read on mount instead of live subscription — downgrade from `onSnapshot` to `getDocs` on Home. Loses live updates but Home is a dashboard surface, not a live-editing one.

**Reference:** commit `124f7a6` migrated Home from `useDailyTargets` to `useEffectiveTargets`. Relevant files: `src/hooks/useEffectiveTargets.ts`, `src/pages/Home.tsx`.

## Features

### Steps tile → HealthKit / Health Connect wiring

**Status:** Deferred until native iOS / Android builds ship.

**Context:** The Home page renders a Steps tile (`src/components/home/WeightStepsTiles.tsx:29-40`) that currently shows a static "Connect Health →" affordance with an empty `onClick`. Web browsers have no access to step data — the tile is a deliberate placeholder for the post-iOS / post-Android release.

**Plan at native ship:**

1. **iOS** — add `@capacitor-community/health` (or Capacitor's recommended HealthKit bridge), request `HKQuantityTypeIdentifierStepCount` read permission, query daily step totals via `HKStatisticsQuery` with a day-aligned anchor.
2. **Android** — Health Connect (`androidx.health.connect.client`) via the matching Capacitor plugin. Same shape: request read permission, query today's step aggregate.
3. Wire the result into the Steps tile: replace the static "Connect Health →" with `<steps> / <target>` and a small "↑ step-count" subtext. Keep the permission-priming pattern we built for notification reminders — a one-time modal on first foreground after native install, not nagging.
4. Persist the permission-shown flag to `users/{uid}/settings/healthKit` so the priming doesn't re-fire across devices.
5. Add a denied-permission inline banner mirroring the one on `NotificationsSection.tsx` — same UI vocabulary.

**Until then:** the static tile is a design placeholder. Treat any "why doesn't it do anything" feedback as expected pre-iOS behaviour. If a web-only beta runs longer than a week, consider hiding the tile on web via `Capacitor.isNativePlatform()` to avoid the dead-button perception.

**Files to touch at activation time:**

- `src/components/home/WeightStepsTiles.tsx` — render real step count + target.
- `src/hooks/useSteps.ts` — new, reads from the plugin.
- `src/lib/healthKit.ts` — new, platform-specific bridge.
- `POST_LAUNCH.md` — delete this section when shipped.
