# Invariant guards — what CI pins, and where

A map of the **executable guards** that enforce the project's recurring-mistake
rules (CLAUDE.md) so they can't silently regress. Each row is a test that fails
CI when its invariant is broken. When you add a new cross-copy mirror, persisted
field, scheduled function, or design primitive, check whether a guard here
already covers it — and extend the guard rather than relying on review.

> Most of these were written **verification-first**: the audit usually confirmed
> the rule already held, and the guard is regression defence, not a fix. The
> notable live bug found this way was `hideWeightNumber` (a client toggle whose
> write was rejected by the rules allow-list).

## Drift between two copies (client `src/*` ↔ server `functions/*`)

The standing hazard: a business rule lives in two physical copies that can
disagree (`62a9cfa` — server engine diverged from the tested client engine and
inflated new-user PI).

| Guard                                   | Pins                                                                                                                                               |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `performanceEngineParity.cross.test.ts` | client/server performance engine produce identical scores                                                                                          |
| `runModeResolution.cross.test.ts`       | client/server run-mode / race-goal / recovery resolvers agree                                                                                      |
| `runEligibility.cross.test.ts`          | run-eligibility predicate identical across copies                                                                                                  |
| `validatePlanPayload.cross.test.ts`     | plan-payload validation identical                                                                                                                  |
| `challengeTiers.cross.test.ts`          | challenge-tier resolution identical                                                                                                                |
| `aiScanQuota.parity.cross.test.ts`      | AI scan-quota accounting identical                                                                                                                 |
| `scheduledRunCompletion.cross.test.ts`  | scheduled-run completion identical                                                                                                                 |
| `mirrorCrossTestGate.test.ts`           | **meta-guard:** every `functions/*.js` that declares a mirror is either pinned by a cross-test or consciously classified as not-an-equality-mirror |

## Persisted-field integrity

A persisted field has consumers that read it from a different location; a write
must carry every mirrored/derived companion.

| Guard                                  | Pins                                                                                                                                               |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `profileFieldParity.cross.test.ts`     | `firestore.rules allowedUserFields()` ↔ `profileSanitizer.js` allow-list parity (a miss = silent data-loss / `hideWeightNumber`-class bug)         |
| `effectiveTargetsSingleSource.test.ts` | the day-type macro splitter is imported only by `useEffectiveTargets` — no component re-derives macros                                             |
| `nutritionPhase.test.ts`               | the single `getNutritionPhase` accessor + footgun guard (no calorie/macro module reads `programState.goal`)                                        |
| `firestoreWriteGuard.test.ts`          | no raw `setDoc`/`addDoc`/`updateDoc` outside `firestoreWrite.ts` + `offlineQueue.ts` (guarded wrappers strip `undefined` + survive offline replay) |

## Cloud Functions deploy safety

| Guard                                | Pins                                                                                                                  |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `functionsMaxInstancesGuard.test.ts` | every inline HTTP/trigger function declares a `runWith({ maxInstances })` cap (uncapped = £100s/hr runaway risk)      |
| `functionsScheduleUtcGuard.test.ts`  | every `.pubsub.schedule(...)` anchors to UTC (a Europe/London anchor drifts an hour under BST — shipped bug, PR #815) |
| `functionsV1ApiGuard.test.ts`        | `index.js` uses the 1st-gen `firebase-functions/v1` API; no live `functions.config()` (throws under v7)               |

## State-machine correctness

| Guard                              | Pins                                                                                                                                                                    |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `runStateTransitionMatrix.test.ts` | the full race-prep (state × event) → next-state truth table, cross-pinned to the server copy; phase progression Base→Build→Taper→Race; timing-classification boundaries |
| `streakWindowing.test.ts`          | `totalActiveDays` windowing is documented + no UI labels it "total"/"lifetime"                                                                                          |

## Design system

The three invariants CLAUDE.md flags as "regress constantly":

| Guard                                       | Pins                                                                                                                                                                                           |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `eslint.config.js` (`no-restricted-syntax`) | **hex** — no hardcoded hex / `bg-white` / `text-black` / bare `text-muted` (lint-enforced)                                                                                                     |
| `designSystemInvariants.test.ts`            | **mono-numerals** (`tabular-nums` className units carry `font-mono`, ratcheted) + **44px floor** (no hand-rolled `role="switch"`; `Toggle`/`Button`/`IconButton` keep their default 44px size) |

## Adding a new guard

- Make it **revert-tested**: prove a deliberately-broken case fails, then restore
  green — a tautological guard is worse than none.
- Prefer **source-scan or cross-equality** guards (robust) over semantic
  heuristics (false-positive-prone — a flaky guard erodes trust in the suite).
- For a ratchet (heuristic with grandfathered debt), pin a **baseline that only
  decreases** and lower it as the surface is cleaned.
