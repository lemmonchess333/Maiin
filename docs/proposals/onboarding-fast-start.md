# PRD — Onboarding fast-start (13 → ~8 steps)

**Status:** Draft / proposed
**Date:** 2026-06-04
**Area:** `src/pages/Onboarding.tsx`, `src/features/program/planBuilder.ts`, `src/lib/tdee.ts`, Home progressive-profiling (`ContextualTipBanner`)

> Origin: an ROI-improvements analysis proposed cutting onboarding to a 7-step
> fast-start by deferring **all** profile fields (incl. body metrics) to
> progressive profiling. This PRD scopes that idea down to the version that
> survives the codebase constraints — see _Decision_.

---

## Problem

Onboarding is **13 steps** (`TOTAL_STEPS = 13`). The week-preview step — the
strongest trust-building moment, rendering the `planBuilder`-derived schedule —
comes near the end, after a long run of data entry, before the user has done a
single workout, run, or food log. Every extra upfront step is a drop-off point
between install and first value.

## Goal

Get the user to a **credible plan preview in fewer steps** so more users finish
onboarding and take a first meaningful action, **without** degrading the two
things onboarding must get right: a feasible/safe training plan and a credible
calorie target.

## Decision (what this PRD locks)

**Defer the precision fields; keep a single minimal body-metrics step.**

The original proposal moved body metrics (sex/age/height/weight) to progressive
profiling. That breaks a core engine with no specified fallback:
`calculateTDEE(weightKg, heightCm, age, activityLevel, sex, …)` requires all of
them, and under the expenditure-inclusive Nutr1 model **the calorie target _is_
the TDEE output** (`finalTarget === baseTarget === profile.targetCalories`).
There is no metrics-less TDEE fallback today. A _wrong_ default calorie target
is worse than a slightly longer onboarding for a nutrition app.

Body metrics are **cheap** (one screen; age is already a band, not exact) and
**load-bearing**. So we keep them and defer the genuinely high-friction /
low-Day-1-value fields instead. Net: **13 → ~8 steps**, preview at step ~7.

## Field disposition

| Field                                       | Disposition                                                                | Why                                                                                     |
| ------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Primary goal                                | **Keep** (Step 1)                                                          | drives `primaryGoal` + `nutritionPhase` + plan                                          |
| Days/week                                   | **Keep**                                                                   | `liftDays` / `daysPerWeek`                                                              |
| Equipment                                   | **Keep**                                                                   | safety/feasibility — `buildPlan` uses it materially                                     |
| Run intent                                  | **Keep**                                                                   | `runMode` / `weeklyRunDays` (freeform default)                                          |
| Injuries                                    | **Keep**                                                                   | safety — drives `buildPlan` substitutions                                               |
| Sex + age-band + height + weight + activity | **Keep (merged into ONE "about you" step)**                                | the TDEE inputs; without them there's no calorie/macro target                           |
| Experience                                  | **Default** `"intermediate"`                                               | `buildPlan` accepts it; refine after first workout                                      |
| Preferred split                             | **Drop the step** — already defaults to `"auto"`; engine derives the split | `generateProgram` ignores `preferredSplit` and calls `chooseSplit(liftDays)` internally |
| Nutrition phase                             | **Derived** from primary goal                                              | already mapped in onboarding                                                            |
| Weekly run days                             | **Derived** from run intent                                                | freeform → 3/1; race-prep → plan                                                        |
| Name                                        | **Defer**                                                                  | cosmetic; ask anytime                                                                   |
| Goal weight + weekly rate                   | **Defer** → progressive                                                    | precision calorie offset; default to maintain/recomp baseline                           |
| Detailed nutrition setup                    | **Defer** → after first food log                                           |                                                                                         |
| Race target date                            | **Defer** unless user picks race-prep                                      | Run9a freeform-default + opt-in overlay                                                 |

## Proposed flow (~8 steps)

1. **What are you here for?** — Build muscle / Lose fat / Get fitter / Hybrid → `primaryGoal`
2. **How many days can you train?** — 2 / 3 / 4 / 5+ → `daysPerWeek`
3. **Where do you train?** — Full gym / Dumbbells / Bodyweight → `equipment`
4. **Do you run?** — No / Sometimes / Weekly → `runMode` + `weeklyRunDays`
5. **Any areas to avoid?** — None / Shoulder / Back / Knee / Hip / Wrist-elbow → `injuries`
6. **About you** (one screen) — sex, age band, height, weight, activity level → TDEE inputs
7. **Your week at a glance** — the existing `planBuilder` preview (unchanged)
8. **Start my plan** — confirm

## What's reused vs new work

**Reused (no change):** `buildPlan` (its `PlanBuilderInput` needs none of the
deferred fields), `calculateTDEE` (fed by step 6), the week-preview renderer,
the Run9a freeform/race overlay model, the `ContextualTipBanner` progressive-
profiling surface.

**New work:**

> **⚠️ SUPERSEDED IN PART (2026-06-04, PR #1078).** The split type-seam below
> (New-work #1 + Resolved-decision #2) was implemented ahead of this PRD by the
> `PreferredSplit` consolidation. **Do NOT re-touch the type seam.** The
> remaining new work for the fast-start build is the step-machine rewrite
> (#2), defaults wiring (#3), and progressive nudges (#4) — plus simply
> _removing the split step_ from the flow. See the revision note at the foot.

1. **Split: no new logic — make the type seam honest.** ✅ **DONE — superseded
   by PR #1078; do NOT re-touch this seam.** The engine ALREADY
   auto-derives the split: `generateProgram(nutritionPhase, liftDays, existing,
primaryGoal)` ignores `preferredSplit` and calls `chooseSplit(weeklyTarget)`
   (= lift-days) internally (`programEngine.ts`). Onboarding already defaults
   `preferredSplit` to `"auto"`. So **do NOT add a new selector** — that would
   duplicate `chooseSplit` (the drift class). The only real issue is a TYPE
   SEAM: the UI type `PreferredSplit` includes `"auto"` but
   `PlanBuilderInput.preferredSplit: SplitType` does not, so `"auto"` is cast
   past TypeScript and can persist to `profile.preferredSplit`. Fix the boundary
   once: resolve `"auto" → chooseSplit(liftDays)` before it reaches
   `buildPlan`/persistence, OR widen the builder to accept `"auto"` and resolve
   it internally via `chooseSplit`. (Today `matchTemplate` already treats
   `"auto"` as "no preference", so program shape is unaffected either way —
   this is correctness/coherence of the persisted value, not plan quality.)
2. **Onboarding step machine** rewrite to the ~8-step flow, merging
   gender+age+body-metrics into one screen and removing the deferred steps
   (the split step among them). Keep the step-count progress UI honest.
3. **Defaults wiring** — `experience: "intermediate"`, derived `nutritionPhase`
   / `weeklyRunDays`. Ensure `completeOnboarding`'s required-field gate +
   `profileSanitizer` allow-list still receive the body metrics they assert on.
4. **Progressive-profiling nudges** (Home, via existing banner):
   - after first workout → "Add training experience to tune volume."
   - after first food log → "Add goal weight for a precise calorie target."
   - after first run → "Training for a race? Add a target date." (Run9a overlay)

## Risks & mitigations

- **Default plan quality.** Defaulted experience must produce a sane plan (the
  split is already engine-derived via `chooseSplit`, so it's unaffected).
  _Mitigation:_ the preview lets the user see + edit before commit.
- **Deferred goal-weight ⇒ generic calorie offset.** Without goal weight, the
  TDEE offset defaults to maintain/recomp. _Mitigation:_ the kept body-metrics
  step still yields a real maintenance TDEE; the offset is a refinement, and the
  adaptive-TDEE engine learns the true number once the user logs.
- **Edit-rate guardrail.** If users immediately re-edit the plan, the defaults
  were wrong. Instrument it (below).

## Success metrics & instrumentation

**Pre-launch reality check:** Tropos has ~1 user — there is **no traffic to A/B
test**. This ships as the **new default** before launch; we _instrument_ for
post-launch judgement, not an experiment.

- Primary: onboarding completion rate, median time-to-preview, first
  workout/run/meal within 24h, D1/D7 retention.
- Guardrails: immediate settings/training edit rate, plan-reset rate,
  onboarding crash/error rate, abandonment at preview.
- Revisit the defaults if post-launch immediate-edit rate climbs > ~3pp.

## Out of scope

- A/B testing harness (premature pre-launch).
- Removing body metrics from onboarding (rejected — breaks the calorie target).
- Implementing `early_bird` or other unbuilt features.

## Resolved decisions (2026-06-04)

1. **Body-metrics step granularity — KEEP all five inputs** (sex, age-band,
   height, weight, activity level) on the one "about you" screen. The activity
   multiplier moves TDEE materially; defaulting it would degrade the Day-1
   calorie target the step exists to protect.
2. **Split type-seam — WIDEN the builder to accept `"auto"` (make it
   first-class).** ✅ **IMPLEMENTED in PR #1078 — but as the canonical
   `PreferredSplit` union (`full_body | upper_lower | ppl | bro_split | auto`),
   which is broader than the `SplitType | "auto"` proposed here, and which also
   consolidated the four hand-copied unions and dropped both onboarding casts.
   Treat this decision as DONE; the original description is retained below for
   history.** Change `PlanBuilderInput.preferredSplit` from `SplitType` to
   `SplitType | "auto"`, drop the onboarding cast. `"auto"` is already a
   legitimate, tolerated runtime value ("no preference → engine decides"):
   `matchTemplate` treats it as no-preference, `generateProgram` ignores it and
   derives the real split via `chooseSplit(liftDays)`, and `TrainingSection`
   defaults to it. So this is a **zero-runtime-change** type-honesty fix.
   Rejected the boundary-resolve alternative: persisting a concrete split for a
   user who expressed no preference would make `matchTemplate` wrongly _prefer_
   that split — `"auto"` is the more correct persisted value.

---

_Revision (2026-06-04): the split section was corrected after a cross-review
flagged that `chooseSplit(liftDays)` already exists and `generateProgram`
ignores `preferredSplit`. The original draft's proposed `selectSplit` would
have duplicated it — dropped in favour of reusing `chooseSplit` and fixing the
`PreferredSplit`/`SplitType` seam._

_Revision (2026-06-04b): the split type-seam (New-work #1 + Resolved-decision
#2) was implemented ahead of this PRD by **PR #1078** (PreferredSplit
consolidation): `PlanBuilderInput.preferredSplit` is now typed as the canonical
`PreferredSplit` union, both onboarding casts are gone, and the four duplicated
unions are deduped — broader and cleaner than this PRD's proposed `SplitType |
"auto"` widening. **Net effect: the split work is DONE.** The fast-start build
must only *remove the split STEP* from the onboarding flow (a step-machine
change), NOT touch the type seam. Remaining new work: step-machine rewrite,
defaults wiring, progressive-profiling nudges._
