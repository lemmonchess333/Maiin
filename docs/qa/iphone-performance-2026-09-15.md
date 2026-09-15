# iPhone performance pass — 2026-09-15

Baseline: `1ee8631321d903a2d348b89bd7dfbc0a35cfb19e`.

## Changes

- Replace automatic neighbouring-tab imports with destination loading on
  touch, mouse hover or keyboard focus. Home no longer imports Food and Train
  just because it mounted. Keep navigation available inside the existing
  layout while a page chunk loads.
- Load exercise guides only when their detail panel opens. Extract the
  released still-guide metadata from `bodyRig`, and load the legacy renderer
  only when an exercise needs it. Release gates, supplied frames, legacy demos
  and reference-photo fallback retain their existing behaviour.
- Give the elapsed display and rest row their own clock updates. A tick no
  longer rerenders the workout editor or saves a draft. Both clocks use wall
  time, pause display intervals while hidden and catch up immediately on
  foreground. Draft writes and completion read the current clock directly.
- Share the three training-fuel subscriptions across nutrition consumers,
  including their workout/run row projections. Entries are scoped by account
  and local day and released when their final consumer leaves. Existing
  30-day/60-document limits and run eligibility rules are preserved.

## Bundle measurement

Both builds use `CAPACITOR_BUILD=true vite build --manifest`, the same
dependencies and the same production configuration. Values are minified
JavaScript bytes before compression.

| Graph or chunk | Before | After |
| --- | ---: | ---: |
| Entry static graph | 716,633 | 712,532 |
| Home and mounted root features, static graph | 1,817,169 | 1,822,592 |
| Same graph plus automatically started tab imports | 2,484,455 | 1,822,592 |
| `ExerciseFormContent` chunk | 168,341 | 31,077 |

Automatic Home loading drops **661,863 bytes (26.6%)**, from 192 to 143 JS
files. The guide chunk is **81.5% smaller**; its old renderer is now a separate
134,938-byte `bodyRig` chunk plus a 5,256-byte legacy player, loaded on demand.

The graph measurement walks each manifest entry's `imports`, deduplicating
reachable files. Roots are `index.html`, `Home`, `Layout`, `useStreaks`,
`DailyLogsProvider`, `RemindersProvider`, `useDailyNutritionSnapshot`,
`StreakReminderPrimingModal`, `ShareComposerSheet` and `OneTimeMaintenance`.
The before comparison also includes `Food` and `Program`, which the old Home
prefetch effect imported automatically.

This is a static loading inventory, **not a measured iPhone launch-time
improvement**. Capacitor bundles these assets locally. Deferring them reduces
unnecessary JavaScript loading/evaluation, not the installed app's size.
First visits to other tabs now depend on their local chunk loading; the tab
bar remains usable during that wait.

The size baseline deliberately recognises the new deferred `bodyRig` chunk
and the larger `Layout` chunk: the latter now contains destination preload
functions and Vite's dependency map. This adds about 5 KB to the Home static
graph while removing about 667 KB of automatic neighbouring-tab imports.

## Regression checks

Completed verification:

- `npm run verify` passed: lint, both form-art audits, TypeScript, production
  build and unit tests. Lint reports 95 warnings and no errors.
- A separate full JSON test report confirms 9,219 passed, 346 skipped and
  zero failed tests.
- The Capacitor web build, `npm run check:dist-size` and
  `npm run check:cycles` passed; no circular dependencies were found.

Coverage for this change:

- Timers advance without rerendering the editor or repeatedly writing drafts;
  hidden/foreground transitions, rest extensions, resumed drafts and saving
  retain their timing behaviour.
- Navigation waits for destination interaction before preloading and remains
  usable when a page import is pending.
- Import-graph tests prevent unopened guides from returning to Programme's
  static graph and the legacy renderer from returning to the still-guide path.
- Shared-data tests cover multiple consumers, live corrections, last-consumer
  cleanup, sign-out/account changes, daily rollover, query limits and invalid
  runs. Existing nutrition calculation tests remain in place.

Physical-device launch, frame-time and energy profiling remain the next
measurement step. The larger `useProgram` controller still runs on Home;
separating its read path requires preserving its migration and rollover work.
