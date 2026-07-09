# Design backlog

Living status of the design/visual-audit findings. The historical report
in [`docs/visual-audit/REPORT.md`](./visual-audit/REPORT.md) is a snapshot;
this file tracks what is **actually open** on `main` today so future agents
don't re-implement already-fixed items. Verify against code before acting.

**Statuses:** `Open` · `Fixed` · `Fixed — verify with screenshot` ·
`Deferred` · `Needs fresh audit`

_Last reconciled: 2026-07-09 against `main`._

| ID  | Priority | Surface                       | Finding                                        | Status                               | Evidence / next action                                                                                                                                                                                 |
| --- | -------- | ----------------------------- | ---------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | P1       | Home                          | Dead "Connect Health" Steps tile on web        | **Fixed (this PR)**                  | `WeightStepsTiles.tsx` now gates the Steps tile on `isNativePlatform()`; web shows Weight full-width, native keeps the placeholder. Real HealthKit wiring still `Deferred` (POST_LAUNCH "Steps tile"). |
| D2  | P2       | Food                          | Add-entry redundancy / CTA sprawl              | Fixed — verify with screenshot       | `Food.tsx` treats `FoodComposerCard` as the ONE entry surface; scan is icon-only; no standing manual-log CTA; tests assert this. Capture a Food screenshot to close.                                   |
| D3  | P2       | RunDetail                     | Label/legend collision + toast placement       | Fixed — verify with screenshot       | `RunDetail.tsx` moves `PaceLegend` below the fixed map; `RunMap.tsx` centers the offline pill clear of the back button. Needs 393px regression coverage (D9).                                          |
| D4  | P2       | Treadmill                     | Horizontal overflow at 393px                   | Fixed — verify with screenshot       | `TreadmillMode.tsx` uses `w-full` + `min-w-0`; comments cite the audit. Needs 393px regression coverage (D9).                                                                                          |
| D5  | —        | Bottom nav                    | False Food highlight on `/upgrade`, `/run/:id` | **Fixed**                            | `activeTab.ts` returns `null` for non-tab routes; `activeTab.test.ts` pins `/upgrade` + `/run/abc123`. Do not re-open without a runtime contradiction.                                                 |
| D6  | —        | Home/History/Social           | Text-only empty states                         | **Fixed / swept**                    | `EmptyState` primitive adopted; `docs/cold-start-payoff-audit.md` records the sweep.                                                                                                                   |
| D7  | —        | Home                          | Stale Welcome checklist on rich accounts       | **Fixed**                            | `activationFraming.ts` `shouldShowWelcomeChecklist` is data-derived; tests cover rich-account suppression.                                                                                             |
| D8  | —        | Programme                     | Streak modal interrupts first visit            | **Fixed**                            | `StreakReminderPrimingModal.tsx` fires only on `tropos:workout-completed`; `surfaceCoordinator` gates blocking surfaces.                                                                               |
| D9  | P2       | RunDetail/Treadmill/Home/Food | Authenticated responsive regression coverage   | **Open**                             | `e2e/responsive.spec.ts` covers only unauthenticated `/` + `/privacy`. Add no-horizontal-overflow + in-viewport bbox checks on the fragile authed routes at ~393px.                                    |
| D10 | P3       | Modals/map overlays           | Hardcoded colour literals                      | **Needs fresh audit**                | `StreakReminderPrimingModal.tsx`, `RunDetail.tsx`, `RunMap.tsx` have hex literals. Classify: tokenizable (fix) vs legitimate map/canvas overlay (document). Low risk.                                  |
| D11 | P3       | Home (nutrition)              | `useEffectiveTargets` live burn subscriptions  | **Deferred**                         | `POST_LAUNCH.md` defers until real usage/cost data. If done: preserve the Nutr1 invariant (burn never moves `finalTarget`); prefer TTL/one-time reads over aggregate docs.                             |
| D12 | P3       | Home                          | Native Steps (HealthKit / Health Connect)      | **Deferred — needs plugin decision** | No `useSteps.ts` / health plugin installed. Gate on: which plugin, iOS-first vs Android-too, device permission verification.                                                                           |

## Notes

- **Truth + tooling companions** (shipped alongside D1): added a `verify`
  script (`lint && build && test`, per `AGENTS.md`) and corrected the README
  Capacitor version (7 → 8, matching `@capacitor/core ^8.4.0`).
- Items marked **Fixed** already have code + tests; the highest-value
  follow-up is **regression coverage (D9)**, not re-implementation.
