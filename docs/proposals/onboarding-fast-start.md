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

| Field                                       | Disposition                                               | Why                                                           |
| ------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------- |
| Primary goal                                | **Keep** (Step 1)                                         | drives `primaryGoal` + `nutritionPhase` + plan                |
| Days/week                                   | **Keep**                                                  | `liftDays` / `daysPerWeek`                                    |
| Equipment                                   | **Keep**                                                  | safety/feasibility — `buildPlan` uses it materially           |
| Run intent                                  | **Keep**                                                  | `runMode` / `weeklyRunDays` (freeform default)                |
| Injuries                                    | **Keep**                                                  | safety — drives `buildPlan` substitutions                     |
| Sex + age-band + height + weight + activity | **Keep (merged into ONE "about you" step)**               | the TDEE inputs; without them there's no calorie/macro target |
| Experience                                  | **Default** `"intermediate"`                              | `buildPlan` accepts it; refine after first workout            |
| Preferred split                             | **Default** `"auto"` → resolved to a concrete `SplitType` | see _New work_                                                |
| Nutrition phase                             | **Derived** from primary goal                             | already mapped in onboarding                                  |
| Weekly run days                             | **Derived** from run intent                               | freeform → 3/1; race-prep → plan                              |
| Name                                        | **Defer**                                                 | cosmetic; ask anytime                                         |
| Goal weight + weekly rate                   | **Defer** → progressive                                   | precision calorie offset; default to maintain/recomp baseline |
| Detailed nutrition setup                    | **Defer** → after first food log                          |                                                               |
| Race target date                            | **Defer** unless user picks race-prep                     | Run9a freeform-default + opt-in overlay                       |

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

1. **Split auto-selector.** `PlanBuilderInput.preferredSplit` is a closed
   `SplitType` enum (`full_body | upper_lower | ppl | ppl_ul | ppl_x2 |
ppl_x2_fb`) — `"auto"` is not valid. Add a pure
   `selectSplit(liftDays, primaryGoal) → SplitType` resolved _before_
   `buildPlan` (e.g. 2-3 days → full_body/upper_lower, 4 → upper_lower/ppl_ul,
   5+ → ppl/ppl_x2). Table-test it.
2. **Onboarding step machine** rewrite to the ~8-step flow, merging
   gender+age+body-metrics into one screen and removing the deferred steps.
   Keep the step-count progress UI honest.
3. **Defaults wiring** — `experience: "intermediate"`, derived `nutritionPhase`
   / `weeklyRunDays`, split via the selector. Ensure `completeOnboarding`'s
   required-field gate + `profileSanitizer` allow-list still receive the body
   metrics they assert on.
4. **Progressive-profiling nudges** (Home, via existing banner):
   - after first workout → "Add training experience to tune volume."
   - after first food log → "Add goal weight for a precise calorie target."
   - after first run → "Training for a race? Add a target date." (Run9a overlay)

## Risks & mitigations

- **Default plan quality.** Defaulted experience/split must produce a sane plan.
  _Mitigation:_ table-test `selectSplit`; the preview lets the user see + edit
  before commit.
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

## Open decisions for the owner

1. **Body-metrics step granularity** — keep all five inputs on one screen, or
   drop `activityLevel` to a default (`"moderate"`) too? (Activity multiplier
   meaningfully moves TDEE; recommend keeping it.)
2. **Split-selector mapping** — sign off on the `liftDays × primaryGoal → SplitType`
   table before implementation.
