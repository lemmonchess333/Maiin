# Training-plan workspace implementation

Implemented locally on 29 October 2026 from the [reviewed specification](../../product/training-plan-workspace/SPEC.md).

## What changed

- Train → Your plan opens a combined current-week agenda with saved activity, planned lift day-types and a separate rotation-based next lift/Resume action near the top.
- Move a run opens a source/destination picker and review sheet, with seven date choices, specific unavailable reasons and explicit spacing-warning acknowledgement.
- One-off moves preserve run identity/prescription, lifting order and the recurring weekly layout. The usual-layout editor keeps its own entry and rebuild rules.
- Server-side review preconditions detect changed programme and completion evidence. Local active sessions, pending finishes, loading/error data, date rollover and queued replay have explicit handling.

## Actual app captures

| State                | Dark                                  | Light                                  |
| -------------------- | ------------------------------------- | -------------------------------------- |
| Workspace, 393px     | [Open](workspace-phone-dark.png)      | [Open](workspace-phone-light.png)      |
| Workspace, 320px     | [Open](workspace-small-dark.png)      | [Open](workspace-small-light.png)      |
| Workspace, 200% text | [Open](workspace-large-text-dark.png) | [Open](workspace-large-text-light.png) |
| Review sheet         | [Open](move-review-dark.png)          | [Open](move-review-light.png)          |

[Destination picker](move-picker-dark.png) · [Spacing warning](move-warning-dark.png) · [Discard confirmation](move-discard-dark.png) · [After confirmed move](workspace-after-move-light.png) · [Measured browser results](browser-metrics.json)

The captures use a temporary local-emulator account and a controlled week beginning 2 November 2026. Both browser and command-handler clocks use Wednesday 4 November; token verification uses the real clock. The account is deleted after the run. The captures are rendered from the implemented app. The 200% text captures set the root font size to 32px at a 393px viewport.

## Verification

- Focused component/read-model tests cover rotation/date truth, completed-run deduplication, review/cancel/confirm outcomes, stale dates, changed warnings and stable saving previews.
- Client command/cross tests and backend pure tests cover identity, source/date preconditions and the existing legacy move paths.
- Sixteen real local-Firestore transaction tests passed, including stale evidence, corrected records, replay deduplication and unchanged unrelated saved activity.
- The authenticated Chromium journey passed on 29 October 2026 (16.7 seconds; 21.4 seconds including runner startup). It calls the actual exported handler with local Auth/Firestore through the existing test bridge, rather than a simulated successful response. It verifies `tab=run` and a valid selected-run ISO date in the Train return link and resulting URL, the next-lift cursor, completed-run exclusion, warning acknowledgement, retained review choices, Cancel without a write, and a persisted Thursday-to-Saturday move with unchanged usual layout/lift order and saved activity counts.
- Native browser Back opens an accessible discard confirmation twice in succession; Keep editing preserves the selected destination and route each time. This check caught a confirmation rendered outside the drawer portal, where Vaul hid it from assistive technology. The confirmation now renders inside the portal, and the final browser regression passes.
- All twelve refreshed captures have no measured horizontal overflow, including the workspace at 320px and 200% text in both themes. No uncaught page errors occurred. The local preview still logs a missing `/Maiin/Maiin/init.js` request and refused requests for unrelated callable endpoints; these are not counted as uncaught page errors.
- WebKit is not installed in this environment. Safari and physical-device behavior were not verified; no browser was installed for this check. Full browser zoom, offline replay and cross-device active sessions are outside this browser journey.
- Final `npm run verify` exited **0** on 29 October 2026: lint, verifier tests, form art/drafts, dependency cycles, production build, bundle-size checks and unit tests all passed. The unit suite passed **1,335 files / 15,578 tests**, with 13 files / 484 tests skipped by the suite configuration. Final unit duration: 511.14 seconds.
- PR verification subsequently caught a UTC-only callback in the legacy-run cross-test. The fixture now uses the production IANA timezone formatter, checks the normalized row directly and keeps that row inside the evidence window. All **16 cross-tests passed in each of UTC, Pacific/Auckland, Pacific/Kiritimati and Pacific/Midway**, including timestamps around midnight. The production formatter already handled these dates correctly.
- French and German PR runs also caught two English-decimal assumptions in the exercise-chart tests from the earlier UX commits. The chart correctly uses the viewer's numeric locale. The tests now check the locale's fractional value and unit, including both accessible weight summaries. All **three chart tests passed in default, French and German locales**.

## Release notes

The new lazy TrainingPlan route has an explicit measured bundle baseline:
21,652 bytes before gzip (8.16 kB gzip in the first production build). This
adds the new feature to the existing size ratchet; the overall tolerance,
cold-start preload budget and existing chunk baselines remain unchanged.

The implementation includes both client and Functions changes. Use the existing production release pipeline so the updated command handler arrives before the web bundle. This work does not deploy the app.

Unsynced active sessions on another device cannot be inferred from server data. This device's active run is rechecked before invocation, and new saved/completion evidence is guarded within the server transaction.
