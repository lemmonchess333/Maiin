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

| Guard                                  | Pins                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `profileFieldParity.cross.test.ts`     | `firestore.rules allowedUserFields()` ↔ `profileSanitizer.js` allow-list parity (a miss = silent data-loss / `hideWeightNumber`-class bug)                                                                                                                                                                                                                                                                         |
| `effectiveTargetsSingleSource.test.ts` | the day-type macro splitter is imported only by `useEffectiveTargets` — no component re-derives macros                                                                                                                                                                                                                                                                                                             |
| `nutritionPhase.test.ts`               | the single `getNutritionPhase` accessor + footgun guard (no calorie/macro module reads `programState.goal`)                                                                                                                                                                                                                                                                                                        |
| `firestoreWriteGuard.test.ts`          | no raw `setDoc`/`addDoc`/`updateDoc`/`deleteDoc` outside `firestoreWrite.ts` + `offlineQueue.ts` (guarded wrappers strip `undefined` + survive offline replay)                                                                                                                                                                                                                                                     |
| `localStorageGuard.test.ts`            | no reference to the `localStorage` global outside `src/lib/localStore.ts` — one door handles absent storage, a throwing getter and per-call throws, and reports whether a write landed; `public/init.js` (pre-bundle theme read) is the structural exception and the allow-list is empty. Companion `localStorageUidScoping.test.ts` walks the door's call sites and requires every per-account key to carry a uid |

## Cloud Functions deploy safety

| Guard                                | Pins                                                                                                                  |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `functionsMaxInstancesGuard.test.ts` | every inline HTTP/trigger function declares a `runWith({ maxInstances })` cap (uncapped = £100s/hr runaway risk)      |
| `functionsScheduleUtcGuard.test.ts`  | every `.pubsub.schedule(...)` anchors to UTC (a Europe/London anchor drifts an hour under BST — shipped bug, PR #815) |
| `functionsV1ApiGuard.test.ts`        | `index.js` uses the 1st-gen `firebase-functions/v1` API; no live `functions.config()` (throws under v7)               |

## Supply chain

| Guard                              | Pins                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workflowSupplyChainGuard.test.ts` | every third-party GitHub Action in `.github/workflows` is pinned to a 40-hex commit sha with a `# vX` comment (Dependabot keeps pinned actions updated via that comment); `dependabot-auto-merge.yml` stays on `pull_request_target` with the dependabot-actor gate, no `actions/checkout`, and no `run:` step that executes repository code |

## State-machine correctness

| Guard                              | Pins                                                                                                                                                                    |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `runStateTransitionMatrix.test.ts` | the full race-prep (state × event) → next-state truth table, cross-pinned to the server copy; phase progression Base→Build→Taper→Race; timing-classification boundaries |
| `streakWindowing.test.ts`          | `totalActiveDays` windowing is documented + no UI labels it "total"/"lifetime"                                                                                          |

## Design system

The three invariants CLAUDE.md flags as "regress constantly":

| Guard                                       | Pins                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `eslint.config.js` (`no-restricted-syntax`) | **hex** — no hardcoded hex / `bg-white` / `text-black` / bare `text-muted` (lint-enforced); Tailwind arbitrary hex (`bg-[#…]`) is barred in className attributes, class maps (`Property` literals) AND template strings. `npm run lint` pins `--max-warnings 99` — the warnings are WARN on purpose (#1051); the pin stops the count growing |
| `designSystemInvariants.test.ts`            | **mono-numerals** (`tabular-nums` className units carry `font-mono`, ratcheted) + **44px floor** (no hand-rolled `role="switch"`; `Toggle`/`Button`/`IconButton` keep their default 44px size)                                                                                                                                               | + four **surface-drift ratchets** (raw `<button` 399, `font-medium` 305, `animate-*` without `motion-safe:` 38, off-scale `<h1` 13 — baselines only go down) |

## Hygiene ratchets

Debt that is grandfathered, pinned, and only allowed to shrink. Each test
prints the new floor when the count drops, so the next PR can lower it.

| Guard                              | Pins                                                                                                                                                                                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stylesUsage.test.ts`              | every class and keyframe declared in `src/styles/*.css` is referenced by src or another stylesheet; `KNOWN_DEAD` (20 classes + 1 keyframe) is delete-only                                                                             |
| `archaeologyMarkers.test.ts`       | PR citations + ISO dates + "used to" inside non-test comments across `src/` and `functions/` — baseline 790, never total comment share (a share ratchet rewards deleting the load-bearing comments)                                   |
| `scripts/check-dist-size.mjs` (CI) | per-chunk and total JS size against `scripts/dist-size.baseline.json`: >5% growth (or +2 kB on small chunks) fails, a new chunk ≥20 kB must be added deliberately; `--update` rewrites the baseline — in the same PR, with the reason |

## Hosting & CSP

| Guard                            | Pins                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `hostingSecurityHeaders.test.ts` | `firebase.json`'s `**` headers entry carries HSTS, `nosniff`, Referrer-Policy, `X-Frame-Options: DENY`, a `frame-ancestors 'none'` CSP header and a Permissions-Policy granting only camera + geolocation; `index.html`'s meta CSP declares `form-action 'self'` and never carries `frame-ancestors` (browsers ignore it in a meta policy) |

## Reachability & documentation freshness

Code nobody reaches and prose nobody checks are the same failure: a claim that
reads as live. These gates hold the inventory honest in both directions.

| Guard                                                                 | Pins                                                                                                                                                                                                                                               |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `symbolReachability.test.ts`                                          | every `export function` under `src/lib`, `src/features`, `src/hooks`, `src/utils`, `src/pages`, `functions/lib` has a caller outside its module; the pinned-orphan list is delete-only and must stay true                                          |
| `componentReachability.test.ts`                                       | every `.tsx` under `src/components` and `src/features` is rendered by something that is not a test; the allowlist is empty                                                                                                                         |
| `claudeMdFreshness.test.ts`                                           | CLAUDE.md names every `src/features` module and every ADR, describes no retired feature, carries no file counts; its Pages table names every `path=` in `src/App.tsx` and no other (`/dev/*` allowlisted), and every page/lib file it names exists |
| `unitTreatment.test.ts` + `functions/__tests__/unitTreatment.test.js` | one unit treatment ("60 kg", "5.2 km" — spaced) in rendered client code AND in server-composed copy (feed summaries, notifications, challenge names); the server exempt set is empty                                                               |

## Adding a new guard

- Make it **revert-tested**: prove a deliberately-broken case fails, then restore
  green — a tautological guard is worse than none.
- Prefer **source-scan or cross-equality** guards (robust) over semantic
  heuristics (false-positive-prone — a flaky guard erodes trust in the suite).
- For a ratchet (heuristic with grandfathered debt), pin a **baseline that only
  decreases** and lower it as the surface is cleaned.
