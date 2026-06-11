# Adaptive Paces — High-Level Design

**Status:** design / not yet built · **Drafted:** 2026-06-11 (grounded in a 4-domain codebase audit)
**Goal:** give Tropos the thing runners love most about Runna — _"every pace is made for me, and it adapts as I improve"_ — without reworking the run system, and as a clean parallel to the already-shipped **Adaptive TDEE** nutrition engine.

> One-line: a single per-user **fitness benchmark** derives **personalized paces** for every run type, those paces **prescribe** every run, the run's **achieved** pace is measured against them, and the system **suggests** a recalibration the user **approves** — exactly the `measure → model → suggest → user-approves` loop we already built for calories.

This doc is the contract for the build. The phased plan in §8 is each-phase-independently-shippable; nothing breaks if a later phase never ships (it falls back to today's behaviour).

---

## 0. Principles (non-negotiable)

1. **Persist inputs, derive outputs.** Store the _benchmark_; compute the paces table with a pure function everywhere. Never persist derived paces (that's the "tested copy ≠ running copy" drift class).
2. **Suggest, never silently change.** Recalibration is always a user-approved prompt. This _is_ Runna's trust mechanic — and ours (matches Adaptive TDEE's manual-override precedence).
3. **Fallback-first, so cold-start never breaks.** No benchmark yet → use today's hardcoded template paces. Personalization is strictly additive.
4. **One pure, mirror-ready math module.** Keep all pace math free of React/DOM/clock so a future `functions/` mirror is a copy + parity test, not a rewrite (the locked discipline: `performanceEngine.ts↔.js`, `runModeResolution.ts↔.js`).
5. **Honour every persistence allow-list** (the `adaptiveCapState` bug below is the cautionary tale).

---

## 1. The core model (pure)

**Benchmark → fitness score → paces table.**

- **Benchmark** = a recent representative effort: `{ distanceM, timeS }` from a race or time-trial (Runna anchors on a ~10K-equivalent as "the most balanced reflection of endurance + speed"). Sources, in precedence: a logged **race** result → a user-entered **recent race/PR** → an **onboarding self-estimate** → **derived** from the best recent `isVolumeEligible` run.
- **Fitness score** = a VDOT-equivalent (Jack Daniels) — the standard model Runna effectively uses. `vdotFromRace(distanceM, timeS)`. (Riegel handles distance-normalisation when the benchmark distance ≠ a table distance.)
- **Paces table** = sec/km **ranges** (not point values, like Runna) for each training intensity, derived from the VDOT:
  - `easy` (aerobic base), `marathon`, `threshold`/tempo (~Z3–4), `interval` (VO₂max, ~Z4–5), `repetition` (speed), and per-distance `race` paces (5k/10k/half/marathon).

**Pure functions (the engine, one home — `src/lib/runPaces.ts`):**

```
vdotFromRace(distanceM, timeS): number
pacesFromVdot(vdot): PaceTable           // { easy:[lo,hi], threshold:[lo,hi], interval:[...], ... } sec/km
resolveSessionPaces(intensity, paceTable | null, fallbackPace?): { target, range } // null table → fallback
```

All sec/km (matches the audited `RunConfig` contract — zero unit translation needed).

---

## 2. The seam that breaks nothing — _intensity tags + one resolver_

**Today (audited):** `RUN_TEMPLATES` hardcode paces (`tempo_20.config.targetPace = 270` for _everyone_; intervals carry no pace → `PaceZoneBar` falls back to `300`). `ScheduledRunDay` carries only a `templateId`. The single place a template becomes a runnable config is **`templateToPrefill()` (`runPlanMetadata.ts:636`)**.

**The refactor:**

1. Each run template additionally declares an **`intensity`** tag (`easy|marathon|threshold|interval|repetition|race`) — _what system it trains_ — and **keeps `config.targetPace`/`targetDistance` as the fallback** for the no-benchmark state. (Non-breaking: existing fields stay.)
2. A single resolver `resolveSessionPaces(intensity, paceTable, fallback)`:
   - benchmark ready → personalized pace from the VDOT table;
   - no benchmark → today's hardcoded pace (current behaviour, untouched).
3. **Inject the resolver at the one chokepoint — `templateToPrefill`.** Every prescribed run then carries `RunConfig.target.value` = _your_ pace. Downstream consumers already read `runConfig.target` / `intervals.workPace` (audited: `PaceZoneBar`, `useAudioCues.checkPaceAlert`, the active-run pace-zone block) so they personalize **for free, no change**. Intervals: populate the currently-always-undefined `workPace` from the resolver.

This decouples _the workout shape_ (template) from _the effort_ (your fitness) — the core architectural move, and it's one resolver + one injection point.

---

## 3. Data model & persistence (every invariant accounted for)

**New profile field** (`UserProfileRunning` in `auth.tsx`):

```ts
runFitness?: {
  benchmark: { distanceM: number; timeS: number } | null;  // the INPUT
  vdot: number | null;            // cached convenience; derivable from benchmark
  source: "race" | "manual" | "estimate" | "derived";
  updatedAt: string;              // ISO
} | null;
```

Profile-level (not `programState`) because paces apply to **freeform runs too**, not just race-prep (audited: scheduler/runPlan have no fitness field today).

**The exact persistence chain to change (audited — miss one and the write is silently dropped):**
| File | Change |
|---|---|
| `src/lib/auth.tsx` | add `runFitness` to `UserProfileRunning` + a `hydrateProfile()` fallback |
| `firestore.rules` | add `'runFitness'` to `allowedUserFields()` |
| `functions/profileSanitizer.js` | add a `runFitness` validator (`cleanObject` w/ numeric+enum subfields) |
| writes | route through `updateProfile()` → `setDocGuarded` (already guarded; survives offline replay) |

**Companion bug fix (do in the same arc):** `adaptiveCapState` — shipped in Adaptive TDEE, written at `useAdaptiveTdee.ts:182`, present in the interface — is **missing from BOTH `allowedUserFields()` and `profileSanitizer.js`**, so the update rule (`affectedKeys().hasOnly(...)`) is **silently rejecting every cap-state write** (the engine's weekly-cap smoothing never persists). Fix it alongside `runFitness`; it's the live proof of why this chain matters.

**Optional run-doc snapshot:** at save, stamp the active `{ vdot, source }` onto the run doc (like `routeQuality`) so History/analytics can show "prescribed vs achieved" against the benchmark that was _actually active_, without reconstructing history later.

---

## 4. The adaptive loop — "Pace Insights" (client-only v1)

Mirror Adaptive TDEE's shape (`adaptiveTdee.ts` estimator → `adaptiveTarget.ts` engine → `useAdaptiveTdee.ts` thin hook):

- **Inputs (reuse, don't duplicate):** eligible quality runs via `isVolumeEligible` (50m/30s, `!isInvalid`, `!savedAnyway`); achieved work-pace from `gps.ts` splits/`paceAsNumber` (sec/km); the trailing window from `useRunningStats`. **Extend `paceTrends.ts`** (already does achieved-vs-comparable trend, PR/improving/consistent) to also do **achieved-vs-prescribed**.
- **Logic:** over recent quality sessions, compare achieved vs prescribed; when a consistent trend emerges (e.g. N sessions averaging X% off), raise a **suggestion**: _"Your threshold runs have been ~8s/km faster for 3 sessions — update your fitness?"_ → **Accept** recomputes the benchmark/VDOT; **Reject** dismisses for a cooldown. Status mirrors Runna's "Pace on Point" / "Let's review your pace."
- **Guardrails (copy from Adaptive TDEE):** a **warmup gate** (not enough quality runs yet → "calibrating"), a **cap** on per-recalibration swing (no wild jumps), **user-in-control** (suggest+approve), and the **Pro gate** decision (see §10).
- **Surfaces:** post-run on `RunSummary` (which today shows _no_ prescribed-vs-achieved — audited), plus a persistent card in `ProgrammeRunSection` / `/settings/training`.
- **Slice 3 — PR-triggered recalibration:** a new best eligible effort proposes a benchmark bump (running PRs aren't persisted today — `prTracking.ts` is lifting-only — so "best pace" comes from the eligible-run stream).

---

## 5. Integration map — every element, impact, handling

| Element                                                     | Impact                                                                                 | Handling                                                          | Break risk         |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------ |
| `templateToPrefill` (`runPlanMetadata.ts:636`)              | **primary seam**                                                                       | inject resolver → personalized `target`/`workPace`                | low (fallback)     |
| `RUN_TEMPLATES`                                             | add `intensity` tag, keep paces as fallback                                            | additive field                                                    | none               |
| `RunSetupModal` target/preset inputs                        | show personalized default instead of `330`/`300`                                       | read resolver                                                     | low                |
| `PaceZoneBar`, `useAudioCues`                               | live pacing                                                                            | **no change** — already read `runConfig.target`                   | none               |
| `useIntervalWorkout`/`IntervalDisplay`                      | `workPace` currently undefined                                                         | populate from resolver (display only; state machine ignores pace) | none               |
| `useGuidedRun`/`GuidedRunOverlay`                           | segments are type-only, no pace                                                        | optional: add `targetPace?` per segment from resolver             | none               |
| `TreadmillMode`                                             | no GPS pace                                                                            | **excluded** from prescription + Pace Insights                    | none               |
| `RunSummary`/`RunDetail`                                    | no prescribed-vs-achieved today                                                        | add the comparison + the Insights prompt                          | additive           |
| `useRunningStats`                                           | window/aggregates                                                                      | reuse as Insights input                                           | none               |
| `paceTrends.ts`                                             | trend engine                                                                           | **extend** (achieved-vs-prescribed)                               | none               |
| `performanceEngine.ts`                                      | `runLoadScore` = volume + quality bonus only; has `runPaceAdjustmentPct=0` placeholder | **no change v1**; future hook for pace-aware PI                   | none               |
| `runScheduler`                                              | volume not fitness-scaled                                                              | **v1: paces only**; fitness-scaled volume = future (§10)          | none               |
| `ProgrammeRunSection`/`SessionCommandCard`/`DayActionSheet` | pace not shown today                                                                   | optional: show target pace on the day card                        | additive           |
| `Onboarding`                                                | no fitness capture today                                                               | optional step: recent race / self-estimate (§10)                  | additive           |
| `ProgrammeSettings` (`/settings/training`)                  | run-plan editor                                                                        | add "Your fitness / benchmark" control                            | additive           |
| Nutrition / day-type                                        | independent                                                                            | **no entanglement v1** (avoid double-count)                       | none               |
| `firestore.rules` / `profileSanitizer.js`                   | new field gating                                                                       | add `runFitness` (+ fix `adaptiveCapState`)                       | **high if missed** |
| offline queue                                               | guarded writes                                                                         | already replay-safe via `setDocGuarded`                           | none               |
| `functions/` (server)                                       | no `targetPace` anywhere; `runQualityCount` + coarse `paceBucketFor` only              | **no mirror v1** (§7)                                             | none               |

---

## 6. Cold-start & edge cases (design-for-the-user-base)

- **No benchmark (every new user):** resolver returns the template fallback → app works exactly as today; show a calm "personalize your paces" nudge. This is a recurring state across the user base — designed, not gated.
- **Seeding:** offer an onboarding question (recent 5K/10K time, or self-rated level → conservative VDOT) _and_ allow silent derivation from the first eligible runs; converge via Pace Insights. (Mirror Adaptive TDEE's warmup.)
- **Treadmill/manual:** no GPS pace → excluded from Insights; prescribed pace can still display as guidance.
- **Terrain/heat skew:** v1 compares raw pace; **GAP (grade-adjusted pace)** is a flagged future (we already capture elevation).
- **Short/invalid runs:** excluded by the eligibility predicates.
- **Beginner↔elite:** VDOT spans it; clamp to sane bounds.
- **Unit safety:** sec/km + metres throughout (matches the audited contract); pin with a unit test.

---

## 7. Server-mirror boundary (explicit decision)

**v1 is client-only** — justified by the audit: the server has **no** `targetPace` concept, and `runLoadScore` ignores pace. So paces derive client-side and Pace Insights runs client-side (like `paceTrends.ts` + the client Adaptive TDEE).

**Add a `functions/lib/runPaces.js` mirror + cross-copy parity test ONLY when** one of these lands: (a) Performance Index starts factoring pace (the `runPaceAdjustmentPct` placeholder), (b) we want server-driven recalibration/notifications, or (c) cross-device authority. Because the math lives in one pure module (Principle 4), that mirror is a copy, not a rewrite.

---

## 8. Phased rollout (each independently shippable, non-breaking)

- **Phase 0 — plumbing & bug:** fix `adaptiveCapState` allow-lists; add `runFitness` through the full persistence chain. No behaviour yet.
- **Phase 1 — personalized paces:** the pure `runPaces.ts` engine + `intensity` tags + fallback; inject at `templateToPrefill`; surface "your paces" in setup/settings. _Now every prescribed run is yours._ (No adaptivity yet.)
- **Phase 2 — Pace Insights loop:** suggest→approve recalibration (extend `paceTrends`, reuse eligibility); warmup + swing-cap + control; prompt on RunSummary.
- **Phase 3 — extensions:** PR-triggered recalibration; onboarding capture; _(optional)_ fitness-scaled volume in the scheduler; _(optional)_ GAP; _(optional)_ server mirror if PI goes pace-aware.

---

## 9. Risks / what NOT to do

- ❌ Don't persist derived paces — persist the benchmark, derive everywhere.
- ❌ Don't silently change paces — always suggest+approve (the trust mechanic).
- ❌ Don't entangle with nutrition/PI in v1 — leave `runPaceAdjustmentPct` for a deliberate later arc (double-count risk).
- ❌ Don't forget the allow-lists — `adaptiveCapState` proves the failure mode.
- ❌ Don't remove the template fallback paces — they're the cold-start safety net.
- ❌ Don't build the server mirror prematurely — but keep the math mirror-ready from day one.

---

## 10. Open product decisions (need the owner — they shape Phase 1/2 specifics)

1. **Free vs Pro.** Adaptive TDEE is Pro-gated. Is _personalized paces_ free (drive adoption / the "made for me" hook on first run) with _Pace Insights adaptivity_ as Pro? Or all-Pro? Or all-free?
2. **Benchmark capture.** Ask a recent race in onboarding, derive silently from early runs, or both?
3. **Volume personalization.** v1 personalizes _pace_ only; should the scheduler also scale _distances_ by fitness (Runna does) — now or later?
4. **GAP (grade-adjusted pace).** Worth it for hilly-area accuracy now, or defer?

---

## Audit references (grounding)

- Pace units + consumers: `RunConfig.target` (sec/km, metres) `RunSetupModal.tsx:95`; `PaceZoneBar.tsx`; `useAudioCues.ts:111`; `gps.ts:102-204` (calculatePace/paceAsNumber/calculateSplits).
- Seam: `runPlanMetadata.ts:636` (`templateToPrefill`); `workoutTemplates.ts:1-129` (hardcoded paces, no intensity); `programTypes.ts:266` (`ScheduledRunDay` = templateId only).
- Signals to reuse: `paceTrends.ts:39-102`; `runStatsEligibility.ts:66-104` (`isVolumeEligible`); `useRunningStats.ts`; `performanceEngine.ts:92-102` (no pace dep, `runPaceAdjustmentPct` placeholder).
- Persistence: `auth.tsx:208/224` (UserProfile); `firestore.rules` `allowedUserFields()`; `functions/profileSanitizer.js`; `firestoreWrite.ts` (`setDocGuarded`).
- Reference engine: `adaptiveTdee.ts`, `adaptiveTarget.ts`, `useAdaptiveTdee.ts`.
- Confirmed bug: `adaptiveCapState` absent from `firestore.rules` + `profileSanitizer.js` (writes rejected).
