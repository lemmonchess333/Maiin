# Tropos nutrition-pipeline handoff for Claude Code

> Prepared 2026-08-11 against `origin/main` `fd81838c`. Companion to the
> lifting and running handoffs indexed by
> `docs/training-programming-claude-handoff.md`. Ledger IDs are `NUTR-EV-xx`,
> deliberately distinct from the `NUTR-Lx` / `NUTR-Mx` vocabulary already used
> for older nutrition work in code comments — a bare grep must not conflate
> them.
>
> This documents a bug FAMILY found and fixed in one session. It exists so the
> next agent does not re-derive the pattern, and so the parts deliberately
> left undone are not mistaken for oversights.

## The family: a target moved and its derived values did not

Four separate bugs, one shape. A calorie target is chosen or changed, and
something computed FROM it is not recomputed — so two surfaces quote different
numbers for the same plan, and the server scores the user against the one they
were never shown.

This is CLAUDE.md's standing rule ("Persist every mirrored and derived field
in the same write") failing four times in one pipeline. Expect a fifth.

| ID | Where the target moved | What failed to follow | Fixed in |
| --- | --- | --- | --- |
| NUTR-EV-01 | rate-derived target on an aggressive cut | the stored split ignored the essential-fat floor and protein cap the DISPLAY splitter applies | #1960 |
| NUTR-EV-02 | manual `customCalorieTarget` | macros stayed the formula's; Settings displayed the formula target | #1961 |
| NUTR-EV-03 | adaptive-TDEE learned target | server adherence still scored `profile.targetCalories` | #1961 |
| NUTR-EV-04 | bodyweight (a weigh-in) | stored protein/fat, which are defined per kilogram | #1962 |

### Measured consequences, at their true size

Stated precisely because two of these are much smaller than the other two, and
a future reader deciding what to prioritise needs the difference.

- **NUTR-EV-01** — worst reachable body (110 kg, sedentary, "Fast"): stored
  242 g protein vs 168 g displayed; stored split summed 1283 kcal against a
  1267 kcal target. Reaches **0.83%** of a uniform body/age/activity grid.
- **NUTR-EV-02** — a 1400 kcal pin stored macros summing to **2209 kcal** (58%
  over), and Settings rendered **2209** as "Daily target" directly above the
  line reading "Manual target — you set this".
- **NUTR-EV-03** — the biggest scoring impact. Compliant Pro cutter, four
  cadence windows of drift: calorie adherence factor **45.5** instead of 100.
  A single 150 kcal step already clears the ±10% cut tolerance on a small
  target.
- **NUTR-EV-04** — the mildest. Stored protein 26 g high after a 12 kg cut,
  but the adherence rule is `ratio >= 0.9 -> 100`, so it only reaches 0.87
  (96 vs 100). The real defect is that Home's post-workout nudge and the Food
  page quoted targets **26 g apart** on the same day.

## The one architectural change

`splitMacrosForTarget(targetCalories, weightKg, proteinMultiplier)` in
`src/lib/tdee.ts` is now THE macro splitter. `calculateTDEE`, the goal-weight
persist recipe, and the weigh-in patch all route through it. Before, each
site inlined its own arithmetic, which is what let them drift.

`getAdjustedTargets` (`src/lib/phaseNutrition.ts`) remains the DISPLAY
splitter — it adds the day-intensity fat↔carb shift on top. On a rest day with
no tier shift the two must agree exactly; `storedVsDisplayedMacros.test.ts`
pins that equality rather than hand-computed grams, so they cannot drift apart
silently again.

## Deliberately NOT fixed — do not "finish" these without a decision

Each was considered and declined for a stated reason. Re-deciding them from
scratch is wasted effort; changing them is a product call, not a cleanup.

- **The PI's single-discipline ceiling.** A week with only one discipline caps
  the composite load score at 68 (recomp) / 58 (lean bulk). Renormalising onto
  the trained discipline would raise the score of every athlete who skips a
  discipline for a week — a training-policy change with no user signal behind
  it. The COPY was fixed instead (#1959); the reasoning is in a footer block
  in `src/lib/performanceLine.ts`.
  STATUS 2026-08-12 — owner-decided, and the middle path was taken. The SCORE
  still is not renormalised, for the reason above. What changed is the
  QUESTION: the deload trigger now reads `deloadIndex`, which takes the load
  half from the discipline actually trained when exactly one was, so a peak-
  block athlete can be offered a deload. The displayed PI, its saturation, and
  its "Steady" verb are all unchanged by design.
- **The sub-1200 manual override.** `floorTargetCalories` guards the
  rate-derived path only; the sanitizer bounds the override at 0..10000, so a
  target below 1200 is reachable by typing one. That is the user's own number.
  What IS now guaranteed is that the grams reconcile to it and a capped
  protein figure is reported rather than applied in silence.
- **The calorie target on a weigh-in.** Protein and fat follow bodyweight by
  arithmetic; the calorie target is a training decision — as you shrink, the
  same intake is a smaller deficit, which is the plateau the adaptive-TDEE
  layer exists to answer. A mirror function silently re-cutting calories on
  every weigh-in would make that decision by accident.
- **`targetProtein` under an adaptive target.** Still the stored bodyweight
  figure. It agrees with the adaptive split except when the learned target
  moves DOWN far enough to trigger the protein cap — narrower than the calorie
  gap, and not worth half-mirroring the macro splitter into `functions/`.

## Method notes that paid off

Recorded because they generalise beyond nutrition.

- **Check reachability against the CONTROL, not the schema.** The weekly-pace
  picker offers 0.25 / 0.5 / 0.75 kg/wk; the sanitizer accepts ±2.0. A sweep
  that used the schema bound put 70% of its "affected users" at a rate nobody
  can select, and because the effect worsens with deficit depth, that slice
  was also the worst-affected — inflating every headline. One grep of the
  control settles it. (`fuelTierReachability.test.ts` carries the corrected
  figures and a note recording the error.)
- **Pin the WIRING separately from the logic.** Three times in this arc a
  fix's logic was well covered while its call site was not, so mutating the
  call site left every test green. Source-level pins are an acceptable trade
  when the caller is a closure inside a page component that would need the
  whole dashboard mounted to reach.
- **`npm run build` catches what vitest does not.** Two type errors this
  session, including an inline prop shape that had silently omitted every
  field added to `TDEEResult` since it was written. `tsc -b` is the gate;
  `npx tsc --noEmit` is not equivalent.
- **A comment claiming an invariant is not the invariant.** NUTR-M3 left a
  comment in `tdee.ts` asserting the stored split reconciled to
  `targetCalories`. It did not, in exactly the case it was written about.
  When prose names a guarantee, assert it in a test or delete the prose.

## Open verification (operator, not agent)

#1961 touched `functions/`. The deploy ran and its log names
`weeklyPerformanceRollup` and `dailyPerformanceRefresh` as updated, but per
the standing dedup gotcha the conclusive proof is the deployed source. The
row in `CLAUDE.md` ("Adherence scored against the learned calorie target")
carries the Console spot-check and the two production checks.
