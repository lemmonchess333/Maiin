# Training-book reviews → Tropos improvement backlog

One section per book/manual reviewed. Each section records: what the source
actually teaches, what Tropos already does that it validates, ranked adoptable
improvements (with the code seams they touch), and what we deliberately do NOT
adopt (with reasons — mostly audience fit). Proposals here are candidates, not
locked decisions; anything that graduates goes through the normal lock flow.

---

## 1. Juggernaut Squat Manual — Team Juggernaut (reviewed 2026-07-27)

13 articles by elite powerlifters/coaches (Chad Wesley Smith, Brandon Lilly,
Dan Green, Blaine Sumner, Jacob Tsypkin, Eric Lilliebridge, Corey Hayes, Greg
Panora). Squat-focused, but the programming patterns generalize to all main
lifts. Recurring methodology across authors:

- **Block/wave periodization** everywhere: Sumner's 16-week hypertrophy → 5×5
  strength → 3×3 power → peak; Hayes' volume-loading → volume → transition →
  peak; Smith's Juggernaut Method waves (10s → 8s → 5s → 3s); Lilly's 3-week
  rep/explosion/heavy rotation.
- **Deload every 4th week** in virtually every author's cycle.
- **Double progression** (Lilly): fixed weight, push reps up within a range
  week over week, add weight only when you top the range; stay shy of failure
  until the block's final week.
- **Autoregulation by demotion** (Tsypkin): when 3×5 stops completing, move to
  4×4, then 5×3 — cut reps-per-set before cutting load; only move from 5RM to
  3RM PR attempts after failing two straight weeks.
- **Conservative training max** (Lilly): "map backwards, never forwards" —
  base cycle numbers on a weight you could hit any day (~97% of recent best),
  not the all-time PR.
- **Rep-max PRs as the progression currency** (Lilliebridge): 5RM/3RM max-rep
  sets are the signal, not just 1RM singles.
- **Assistance by movement + weak point, not muscle** (Sumner): miss in the
  hole → pause/dead squats; torso collapses → front squat/SSB/good morning;
  match the assistance style to the lifter's squat style.
- **Form doctrine**: full depth every rep, film from the side, technique from
  the empty bar up, get tight before the descent, bar speed intent on every
  rep, mobility/foam-rolling as standing habits.

### What Tropos already does that the manual validates

| Manual pattern | Tropos implementation |
| --- | --- |
| Deload every 4th week | `programEngine.ts` `generateWeekPrescription` (`week % 4 === 0` → sets −1, load ×0.85) + manual `applyDeloadWeekCommand` with undo |
| Double progression | `GOAL_PROFILES` `mainProgression: "double"` for hypertrophy/general |
| Rep-max PRs | `prTracking.ts` rep buckets (1/3/5/8/10RM), raw bests |
| Back off after failure | 3 consecutive misses → −5% (double) / −1 kg (linear) |
| Variation rotation on stall | `plateauCount >= 3` → rotate main within movement category |

### Ranked adoptable improvements

**P1 — Make rep ranges first-class and fix the template→program boundary.**
The manual's progression model is "work a 6–10 range, add reps, then add
weight". Tropos authors ranges in `templates.ts` (`"8-12"`) but
`Onboarding.tsx:125-151` collapses them to the bottom number via `parseInt`,
drops `restSeconds`, hardcodes `progressionType: "linear"` (ignoring the
goal profile), and never sets `isAccessory` (so volume balancing treats
template accessories as compounds). Give `ProgramExercise` a real
`repRangeMax`, progress reps within the range before adding load, and carry
the four lost fields across the boundary. This is simultaneously the
manual's core progression pattern and a latent-bug fix.

**P2 — Make the weekly wave real.** `generateWeekPrescription` computes
`intensityMultiplier` (+2.5%/wk) and `volumeModifier`, but no consumer ever
applies them — the generated week is identical for weeks 1–3. The manual is
unanimous that weeks within a block should differ (volume → medium → heavy →
deload). Cheapest honest version that fits the existing `week % 4` mesocycle
and event-driven kg progression: vary the set×rep scheme per week (e.g.
hypertrophy 3×10 → 4×8 → 4×6-heavier → deload) rather than multiplying
loads. Exact mechanics need a design pass (grill-me candidate) — the current
dead fields should either drive this or be deleted.

**P3 — AMRAP "PR set" on main lifts.** The Juggernaut Method's signature: the
last set of the main lift is max-reps (shy of failure), and that rep count
drives the next block's loading. Tropos progression currently only reacts if
the user *happens* to overshoot target reps by 2. An opt-in AMRAP final set
makes progression intentional, feeds the existing rep-bucket PR system (PR
celebration moment for free), and gives `applyProgression` a much stronger
signal than the passive overshoot rule. Client + server command mirror both
need the change (`functions/lib/programCommands.js`).

**P4 — Weak-point plateau breaker instead of random rotation.** Today
`pickExercise` rotates a plateaued main to a `Math.random()` sibling. The
manual's assistance doctrine (movements + weak points, not muscles) suggests:
on `plateauCount >= 3`, ask one question — "where does it fail?" (bottom /
midpoint / just feels heavy) — and rotate to the variation that targets it
(bottom → pause squat, torso collapse → front squat, general → current random
behaviour as fallback). Requires adding the manual's proven variations to
`exercises.ts` + `variationBank.ts`: pause squat, good morning, box squat
(front squat, goblet, Bulgarian split squat already exist). Tempo prescription
infrastructure is NOT needed — pause variants as distinct exercises are
cheaper and clearer.

**P5 — Warm-up ramp for main lifts.** The app prescribes zero lifting warm-up
(runs get warmup/cooldown; `SetType "warmup"` is only a user tag). Every
author warms into top sets; every reference lifting app (Hevy, Strong,
Fitbod) auto-computes warm-up sets. Generate a ramp from the working weight
(bar → ~40% → ~60% → ~80%, fewer reps each step) on main compounds, shown as
pre-checked warm-up rows in `WorkoutSession`.

**P6 — Squat-family form content backfill.** `commonMistakes` is authored on
3 of 151 exercises; the guide UI (`ExerciseFormContent.tsx`) already renders
it. The manual supplies authoritative material for the whole squat family:
depth ("film from the side"), butt wink, tightness/"sternum up, head into
traps", confident descent speed, bar-speed intent, knees-forward quad
loading on front squats, hip-flexor stretch benefit of split squats. Pure
content PR, zero engine risk.

**P7 — Wire deload detection to the deload command.** `performanceEngine.ts`
`shouldDeload` is advisory copy only, while `applyDeloadWeekCommand` (with
undo) already exists. The manual's "the plan bends to the lifter" theme
(Tsypkin's daily-max caveats, Lilly's map-backwards conservatism) supports a
one-tap "Make next week a deload" CTA when detection fires — connecting two
already-built halves.

### Deliberately NOT adopting (audience fit)

- **% of 1RM / training max as the core loading model.** Tropos users don't
  have meet maxes; event-driven kg progression from bodyweight-seeded loads
  is the right model for the user base. The *conservative-TM principle*
  survives in spirit via P3 (AMRAP-derived progression) without exposing a
  "training max" concept. Epley e1RM (`analytics.ts`) stays display-only.
- **Smolov Jr, daily maxing, the 9-day week, bands/chains, beltless
  specialization, deadlift hypers, SSB work.** Competitive-powerlifter tools;
  wrong audience, and several need equipment the exercise DB shouldn't
  assume.
- **Speed sets / jump prescriptions.** Powerlifting-specific RFD work. Noted
  as a possible future accessory option for the `running` goal (jumps aid
  RFD for runners), not backlog-worthy now.
- **Mobility/foam-rolling habit tracking.** Real theme in the manual, but it
  belongs to a habits/streaks surface discussion, not the program engine.

---

## 2. Juggernaut Deadlift Manual — Team Juggernaut (reviewed 2026-07-27)

Ten articles; contributors include Chad Wesley Smith, Brandon Lilly, Dan
Green, Eric Lilliebridge, Brad Little, Ryan Brown, Matt Vincent, Kalle Beck,
Courtney Gould and Jen Comas Keck. Narrower than the squat manual on
periodization, but much richer on two things Tropos is weakest at:
**warm-up** and **weak-point diagnosis**. It also surfaces one programming
idea the squat manual did not: the deadlift's recovery cost is
lift-specific, not muscle-specific.

### Convergence with the squat manual (two independent sources agreeing)

- **Rotating weekly emphasis.** Lilly's deadlift split is Week 1 max /
  Week 2 reps / Week 3 speed / repeat — structurally the same as his squat
  manual "rep week / explosion week / heavy week" rotation. Two manuals, same
  author-independent shape: *vary what the week asks for, not just the load*.
  This makes section 1's P2 concrete and much cheaper to build than a
  load-multiplier wave.
- **Map backwards, never forwards.** Lilliebridge back-tracks 7 weeks from a
  meet to a goal weight (PR + 10–20 lb) and fills in the required top single
  each week. Same principle as Lilly's "base the cycle on a weight you could
  hit any day".
- **Never grind in training.** Green: "failed reps reinforce bad technique and
  strain the body's ability to recover far more"; he refuses reps he isn't
  certain to complete. Direct support for Tropos's existing RPE ≥ 9.5 hold —
  and an argument against the current design where progression only fires when
  the user *overshoots target reps by 2*, which structurally rewards grinding.
- **Bar-speed intent on every rep.** Smith and Vincent both make it the primary
  driver ("from your warmup sets to your final accessory movement"). Coaching
  copy, not a prescription — see P6 in section 1.

### New findings

**D1 — The deadlift's recovery cost is lift-specific, and Tropos's model
can't express that.** The manual's strongest near-consensus, and it is
directly contradicted by what the engine generates today:

| Author | Practice |
| --- | --- |
| Lilliebridge | Alternates squat and pull by week — "squatting and deadlifting twice a month"; pulling for reps "burnt out my lower back" and left him unrecovered for squats |
| Little | "Pulling heavy isn't needed every week"; sometimes deadlifts only every other week when peaking |
| Beck | Actual deadlifts "only every 3–4 weeks" |
| Green | Dissenter — pulls weekly, "without needing to take breaks or deload" |

Against that, `programEngine.ts` puts a `hip_dominant` slot in **every**
leg/full-body day it builds — full-body days at `:343`, `:370`, `:413`;
upper/lower at `:525`, `:589` (+ a second `hip_dominant` accessory at `:597`);
PPL at `:710`, `:803` (+ `:819`). Because `pickExercise` holds the category's
primary until `plateauCount >= 3`, that slot resolves to the **barbell
deadlift** nearly every time. So a default 3-day full-body user is prescribed
the deadlift pattern three times a week, twice alongside a squat pattern in
the same session.

`muscleRecovery.ts` can't catch this: it is per-**muscle**, date-based, and
"volume-blind by design" (its own doc comment), so it models Hamstrings/Back
recovery but has no notion that a heavy pull is *systemically* expensive or
that it competes with squat recovery specifically. Options, cheapest first:
(a) let a day builder mark a slot's *emphasis* so the pattern can appear
weekly while only one session is heavy — which is what the rotating-emphasis
wave already needs; (b) an interference rule that avoids heavy pull adjacent
to heavy squat. Note Green's dissent: this should bias the default, not
hard-code a single frequency.

**D2 — Weak-point diagnosis has a canonical two-way split for the deadlift.**
Where the squat manual gave one axis (strength in the hole), the deadlift
chapter gives a clean diagnostic with named fixes on both sides:

| Fails | Prescribed by | Fix |
| --- | --- | --- |
| Off the floor | Green, Smith, Little | Deficit pulls (3–4"), reps 1–5 from floor, high-rep front/Olympic squats, direct ab work |
| At lockout | Green, Lilly, Little, Smith | Block pulls (4") for triples, pin pulls above knee 70–85%, snatch-grip block pulls 40–50% × 15–20, glute bridges, lunges, rows/upright rows, deadlift hyperextensions |

This is exactly the input section 1's P4 needs — a one-question plateau
breaker ("where does it fail?") now has a real mapping for the two biggest
lifts. Worth capturing that **the experts disagree**: Smith rejects rack pulls
outright ("unrealistic starting position") while others build lockouts with
block pulls. Tropos should present a variation as *a* fix, never *the* fix.

**D3 — Warm-up deserves promotion from P5, and it isn't only load ramping.**
The manual's first and longest chapter (9 of 48 pages) is a warm-up protocol:
monostructural work → foam roll → breathe → active → joint mobility →
dynamic → bar work → activation ("activation, not exhaustion") → plyo →
reactive, plus a per-region fault list (tripod foot and pronation, knees
caving from anterior pelvic tilt, neutral spine via breathing, chin tuck).
Tropos prescribes **no lifting warm-up at all** — while `RUN_TEMPLATES`
gives every run a 300 s warm-up and cool-down. That internal asymmetry is
hard to defend. The full ten steps are far too much for this audience; the
shippable subset is a generated load ramp on main compounds (section 1 P5)
plus one or two movement-prep items on the heaviest lift.

**D4 — Lifting has no goal-driven periodization, while running does.** A
structural gap this manual makes obvious: Lilliebridge's whole method is
date-anchored back-mapping to a target, and Tropos already has that machinery
for running — `raceGoal` with `targetDate`, phase progression, taper and
recovery exit. There is no lift analogue; a grep of `programTypes.ts` and
`types.ts` finds no lift target/goal concept at all. A "lift goal" (target
weight on a target date, back-mapped to weekly top sets) would mirror an
architecture the app has already built, debugged and shipped. This is the
largest idea in either manual so far and the least certain — it wants a
`/grill-me` pass against the reference apps (Hevy and Strong have no such
feature; that absence is itself evidence worth weighing) before it becomes
backlog.

**D5 — Deadlift form content, and the first-barbell-lift intimidation
barrier.** Rich per-lift material for the backfill in section 1 P6: sumo cues
(bar close to centre of gravity, knees over ankles, spread the knees, hips
through once the bar clears the knees), conventional setup, the head-up vs
chin-tuck debate, bracing via breath. Separately, Comas Keck's article names
something Tropos's cold-start design should care about — a first barbell pull
is *intimidating* for a beginner with nobody to teach them. That's an
onboarding/UX observation for the exercise guide's first-encounter state, not
an engine change.

### Changes to section 1's ranking

- **P2 (weekly wave) — mechanism resolved.** Build it as rotating weekly
  *emphasis* (heavy / reps / speed) rather than intensity multipliers. Two
  manuals converge on it, and it doubles as the cheapest lever for D1.
- **P4 (weak-point plateau breaker) — promote above P3.** It now has a real
  mapping for both squat and deadlift, and it is self-contained.
- **P5 (warm-up ramp) — promote.** Zero coverage today, run/lift asymmetry,
  and every reference lifting app already does it.

### Deliberately NOT adopting

- **The full ten-step warm-up, sled drags, plyo/reactive blocks, Olympic bar
  complexes.** Coach-supervised gym-floor protocol; wrong scope for the app.
- **Car deadlift / strongman work, clean and snatch deadlifts at 90–110% of
  the classic lift.** Different sports.
- **Rack/pin pulls as a default plateau fix.** Contested within the manual
  itself (see D2) — if added, it is one option among several, never automatic.
- **Grip training, belt positioning, suit/gear technique, baby powder.**
  Equipment and competition minutiae with no Tropos surface.
