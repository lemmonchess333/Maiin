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
