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

---

## 3. Juggernaut Bench Manual — Team Juggernaut (reviewed 2026-07-27)

Fourteen articles; Brandon Lilly, Dan Green, Eric Lilliebridge, Chad Wesley
Smith, Blaine Sumner, Greg Panora, Corey Hayes, Ryan Brown, Mike Jenkins,
Matt Vincent. The most useful of the three manuals for Tropos's actual
audience, for two reasons: the bench is the lift beginners care most about,
and two of its ideas **unblock proposals that sections 1 and 2 had to leave
half-solved** — how to prescribe intelligently without a 1RM, and how to make
progression feel like progress on an ordinary session.

### Third convergence on rotating weekly emphasis

Lilly's "My Best Bench Ever" cycle is **Week 1 REPS / Week 2 SPEED / Week 3
MAX**, repeating through week 10. That is the same rotation as his squat
manual (rep/explosion/heavy) and his deadlift manual (max/reps/speed) — the
same author-independent shape now in **all three manuals**, with percentage
bands attached: reps weeks 70–80%, speed weeks 55–70%, max weeks 87.5–105%.
Section 1's P2 should be considered settled in principle; what remains is a
design pass on the Tropos-appropriate expression of it.

### New findings

**B1 — The three-axis PR definition, and the missing axis.** Green's account
of adding 25 lb to his bench is built on one idea, quoted directly:

> "compare what I was hitting to what I'd done in the past and either **beat
> the reps at a given weight, lift a heavier weight for the same rep count, or
> even just match the weight and reps but do it for more sets!** If I just did
> any of these, I knew objectively I'd hit a PR and was steadily progressing."

Tropos implements the first two axes and not the third. `checkSetPR`
(`prTracking.ts:62-77`) fires on `weight > current.weight ||
(weight === current.weight && reps > current.reps)` — there is no sets or
volume-at-load axis anywhere in the module. Adding it would mean almost every
honest session can register objective progress, which is exactly the
retention problem the app's cold-start and consistency work keeps circling.
It also costs little: the PR celebration surface, the `PRMap` shape and the
Firestore persistence all already exist.

Two related observations from reading the module:

- **Bucket boundaries partly defeat axis 1.** Records are kept per rep bucket
  (`getRepBucket`: ≤1, ≤3, ≤5, ≤8, else 10rm), so "beat the reps at a given
  weight" only registers while the extra rep stays inside the bucket. 100 kg×5
  → 100 kg×6 crosses from `5rm` to `8rm` and is compared against a different
  record entirely.
- **The rebuild path is lossy** (low priority, but real). The live path is
  correct: `checkSetPR` fires and `WorkoutSession.tsx:~750` writes the new
  reps into the map, which is persisted at `:964-971`. But the fallback
  `buildPRMap` (`prTracking.ts:42-60`, used at `WorkoutSession.tsx:435` when
  the persisted doc is missing or has no `sessionCounts`) keeps only
  `set.weightKg > current.weight` and drops the reps tiebreak. So a
  same-weight-more-reps record silently degrades to the lower rep count
  whenever the map is rebuilt from history, and the user can re-earn a PR they
  already hit.

**B2 — RIR-prescribed loading: the answer to what section 1 rejected.**
Section 1 declined %-of-1RM/training-max loading because Tropos users have no
meet maxes. Sumner's 8-week rack-lockout cycle shows the alternative — it
prescribes **no load at all**, only sets, reps and effort:

| Week | Reps left in the tank | Reps |
| --- | --- | --- |
| 1 | 3 | 8, 8, 8 |
| 2 | 3 | 6, 6, 6 |
| 3 | 3 | 8, 6, 4 |
| 4 | 5 (deload) | 5, 5, 5 |
| 5 | 2 | 5, 5, 5 |
| 6 | 2 | 5, 3, 1 |
| 7 | 1 | 1, 1, 1 |
| 8 | 0 | 1 |

Reps in reserve is the same scale Tropos already collects, inverted (RPE 8 ≈
2 RIR). Today RPE is captured per set (`RPE_OPTIONS` at
`WorkoutSession.tsx:140`, stored on `SetLog.rpe`) but sits **behind a
`showRPE` toggle** (`:259`), is consumed by exactly one rule — the ≥ 9.5
hold at `programEngine.ts:75, 1061` — and is deliberately omitted from the
server command path. Prescribing effort would turn a mostly-inert field into
the loading mechanism, give the wave (P2) a way to express "heavier week"
without a training max, and structurally discourage grinding — the thing
every author in all three manuals warns about. This is the single
highest-leverage idea across the three manuals and it needs a design pass:
the honest counter-argument is that novices rate RIR badly, which is a real
finding in the literature and the reason Fitbod and Hevy keep RPE optional.

**B3 — Rest is a programmed variable, not a global default.** Smith's
12-week dead-bench progression periodizes rest explicitly alongside load:
60% ×8 singles at 30 s rest → 65% ×9 at 45 s → 70% ×7 at 60 s → 75% ×5 at
75 s → heavy singles at 90 s → 120 s → 150 s, deloading at weeks 4, 8 and 12.
Hayes and Vincent both prescribe rest too (60–90 s to keep speed work
fast-twitch). Tropos authors `restSeconds` per exercise in `templates.ts`,
then **drops it at the template boundary** (`Onboarding.tsx:125-151`) in
favour of a single global `profile.defaultRestSeconds`
(`WorkoutSession.tsx:506-514`). Section 1's P1 listed that as one of four
fields lost in a lossy conversion; this manual reframes it as discarding a
training variable, not a preference.

**B4 — Accessory volume should sometimes come DOWN.** Green: the high-rep
incline and overhead work that builds the base "do little for immediately
improving a max… in the last few weeks before a meet they tend to create
more fatigue than value. **They should be dropped 3–4 weeks out**", while
main-lift frequency goes up (his 12-week shape is 8 weeks of 1 bench + 1 OHP
day, then 3 weeks of 2 heavy bench days, then a rest week). Tropos's
`balanceWeeklyVolume` only ever **adds** sets to under-MEV accessories and
never trims above MRV — deliberate, per its own comment at
`volumeModel.ts:250-253`. That's defensible for a steady-state trainee, but
it means the app has no way to express a phase where accessory volume should
fall. Pairs naturally with the P2 wave and the existing deload transform.

**B5 — Stability before mobility, and a named injury mechanism.** Brown's
scapula chapter is the bench analogue of the deadlift warm-up chapter, with a
sharper thesis: "before you start looking at where you need more mobility,
you need to focus on making sure that the things that shouldn't be moving
aren't", and "too much mobility, or mobility in the wrong place is a force
bleed". He names the mechanism — the most common bench injury cause is lack
of shoulder internal rotation, traced to scapular position — and gives a
four-step pre-bench routine (breathe → soft tissue → motor pattern →
activation, explicitly "not to fatigue the muscle"). Tropos's injury handling
is purely reactive: `injurySubstitutions.ts` swaps an exercise once the user
reports an injury. There is no preventive content. The cheap version is
copy in the existing "Watch out" panel of `ExerciseFormContent.tsx`, not a
new feature.

**B6 — Exercise roles, beyond the binary accessory flag.** Three authors
independently categorize by role rather than muscle: Hayes splits "exercises
that teach me how to lift" from brute-strength exercises; Jenkins frames
non-competition lifts as "tools in the arsenal"; Green assigns each bench
variant an explicit job (paused = technique + strength, speed = volume,
paused wide grip = bottom-range, slingshot = lockout, incline/OHP = size and
base). Tropos has one boolean, `ProgramExercise.isAccessory`. A role field
(main / technique / weak-point / size) is what would make the P4 plateau
breaker pick a *purposeful* substitute instead of the current
`Math.random()` sibling — the two proposals share this dependency.

**B7 — Bench form content and a concrete warm-up ramp.** Lilly's "Bench 101"
is the densest form chapter in any of the three manuals — foot position with
knee below hip, shoulder blades squeezed and high on the traps, grip
experimentation, breath held, elbows slightly tucked with lats flared, "meet
the bar", driving the head back off the bench, elbows not rotating outward
past the midpoint, squeezing and "pulling the bar apart" when it stalls.
Straight into the P6 content backfill. Separately, Smith's 225-test chapter
gives an actual warm-up ramp to model P5 on — bar ×50 across five grips,
95×10, 135×2×5 (one at normal tempo, one explosive), 185×3, 225×1, then one
over-warmup single capped at 75% of max — which is a working template for
generating a ramp from a working weight.

### Changes to earlier rankings

- **P3 (AMRAP PR set) — supersede with B1 + B2.** Green gets the same signal
  from "beat one of three axes, never fail a rep" without asking a general
  audience to take a set to the edge. The three-axis PR plus RIR prescription
  is the better-fitting version of the same idea for this user base.
- **P4 (weak-point plateau breaker) — now depends on B6.** Give exercises a
  role before wiring the plateau breaker; otherwise the substitution logic has
  nothing principled to select on.
- **P1 (rep ranges + template boundary) — rest gets promoted within it.**
  Per B3, treat `restSeconds` as a training variable being discarded, not a
  dropped preference.

### Deliberately NOT adopting

- **Boards, slingshots, reverse bands, chains, dead bench off pins, rack
  lockouts.** Equipment-dependent powerlifting overload tools. The *concepts*
  they encode (partial-range work for a named weak point) survive via B6/P4.
- **The 225 rep test programme, cluster/mini-set rep strategy, rest-pause and
  mechanical drop sets.** NFL combine prep. Rest-pause and mechanical drop
  sets are legitimate general hypertrophy techniques and could return later as
  an advanced set type, but nothing in the app models intra-set structure
  today.
- **Accessory work taken to failure and drop sets** (Lilliebridge's top-5
  accessories). Directly contradicts the never-grind principle the same
  manuals argue for elsewhere; not a default we should ship.
- **Full shoulder assessment protocol** (Y/T range tests needing a second
  person). Keep the injury-mechanism copy from B5, not the assessment.

---

## 4. The Brutality of Mountain Dog Training — John Meadows with Scott Stevenson, PhD (reviewed 2026-07-27)

A different lineage from sections 1–3: **bodybuilding/hypertrophy, not
powerlifting**, with an exercise-science co-author and 234 cited references,
so most claims are traceable. That matters for Tropos — `hypertrophy` and
`general` are two of the five `GOAL_PROFILES` and between them cover most
likely users, and both map to `mainProgression: "double"`. Where the
Juggernaut manuals optimize a one-rep max, this one optimizes muscle growth,
so it contributes mostly **new** material rather than convergent material.

**Scope caveat, stated up front.** Meadows is explicit that this is for
people who "train like an uncaged animal" and that "most people don't need
periodization… I don't believe that most people train hard enough to even
need it". Tropos's user base sits nearer the gym-goer he's dismissing than
the IFBB pros he coaches. The *structural* ideas below transfer; the
volumes, frequencies and failure-seeking intensity do not, and adopting the
latter would violate the design-for-the-user-base rule.

### New findings

**M1 — A four-phase intra-session template that inverts Tropos's exercise
order.** Every "Base" workout runs four phases with explicit roles:

| Phase | Objective | Example |
| --- | --- | --- |
| 1. Pre-Pump activation | Beyond a warm-up; joint-friendly, easy to feel, 8–12 reps. Explicitly **not** pre-exhaustion | Prone ham curl |
| 2. Explosive | The heavy compound — "meat and potatoes", load progression | Low incline bench |
| 3. Supra-maximal pump | Intensification techniques, metabolic stress | Leg press, knee extension |
| 4. Loaded stretching | Full ROM under load while pumped | Stiff-legged deadlift |

The heavy compound goes **second**, after a joint-friendly activation lift.
His rationale is injury prevention over a training lifetime — working up to a
top set cold, first thing, is how people "pop something" — and he pre-empts
the obvious objection (you'll be weaker for 2–3 weeks, then you exceed the
old numbers). There's a specific case too: train hamstrings before squats or
compound thigh work to improve performance and reduce knee/hip pain.

Tropos does the opposite everywhere. Every day builder emits main compounds
first via `makeExercise`, then assistance via `makeAccessory`
(`programEngine.ts:251, 279`, applied across `buildFullBody` `:300-449`,
`buildUpperLower` `:451-609`, `buildPPL` `:611-779`). This is **not** a
recommendation to flip that default — the powerlifting manuals argue the
opposite order for strength goals, and they're right for their goal. It's an
argument that **order should follow the goal profile**, which the engine
currently has no way to express. It is also the second independent source
(after bench B6) saying exercises carry *roles*; Meadows's roles are
positions in a session, which is strictly more information than
`isAccessory`.

**M2 — Volume, not load, as the progression axis — and the missing
mechanism for Tropos's dead field.** The macrocycle is three microcycles over
~3 months:

- **Preparation (2–3 wk)** — deliberately *low* volume, high intensity.
- **Destroyer (5–8 wk)** — volume climbs until overreaching appears.
- **Taper (2–3 wk)** — volume drops hard, **intensity stays high**. This is
  when PRs and visible gains show up.

And the key sentence: "In my programs, **progression is primarily the volume
of the training load itself.**" Tropos progresses load per exercise (+2.5 kg
on a rep overshoot) and has no volume-progression concept at all — while
`generateWeekPrescription` computes a `volumeModifier` that **no consumer
ever reads** (section 1, P2). This manual supplies exactly the mechanism that
field was presumably meant to drive, and a shape for it that is
goal-appropriate for hypertrophy users in a way a load ramp is not.

**M3 — "Get the most out of the least."** The reason Preparation starts
light: "If you go into a training cycle right out of the gate with guns
blazing… how can the training stimulus be increased?" Start at the smallest
dose that works so there is somewhere to progress *to*. Tropos computes a
fixed weekly volume from `goalProfile.volumeMultiplier` × nutrition-phase
multiplier, tops up under-MEV muscles, and then holds there indefinitely —
there is no notion of deliberately starting below target to leave room. The
science box cites a study where a 3-week preparation microcycle eliminated
soreness and damage versus starting at high volume, **with equivalent size
and strength gains** — which makes this a cold-start argument as much as a
periodization one.

**M4 — A direct conflict with how Tropos deloads.** Meadows's deload:

| Parameter | Change |
| --- | --- |
| Weekly frequency | Reduce to 3–4 days |
| Intensity / effort | Cut sets short of failure by 2–3 reps |
| Session volume | Reduce sets by 20% |
| Intensification techniques | Eliminate |

Note what is absent: **he does not reduce the load.** The taper science
concurs — maintaining training intensity while cutting volume is repeatedly
found to be the most effective taper for strength, and volume can fall by up
to two-thirds via frequency while muscle size is retained. Tropos's deload
does the reverse on the load axis: `applyDeload` (`programEngine.ts:1180-1192`)
cuts sets by 1 and multiplies **weight by 0.85**. Both philosophies are
defensible and the difference is a real design question, not an obvious bug —
but it's worth deciding deliberately rather than by inheritance, especially
since the "cut sets short of failure by 2–3 reps" line is RIR prescription
again (bench B2), now arriving from a third direction.

**M5 — An overreaching/overtraining symptom checklist Tropos could partly
observe.** The manual distinguishes overreaching (normal, recovers in a
couple of weeks) from overtraining, with signs for each:

- *Overreaching*: loss of "pop" — clean reps now grind; difficulty elevating
  heart rate; tightness/stiffness and tendon discomfort on the first
  eccentrics; DOMS even after light sessions; **appetite change and
  bodyweight decrease**; mental fuzziness.
- *Overtraining*: the above plus loss of motivation, sleep disturbance,
  irritability, persistent fatigue, loss of libido.

Tropos's `computeRecoveryScore` (`performanceEngine.ts:104-157`) currently
proxies recovery from bodyweight stability, meal logging and session counts,
with no HRV or sleep. Two items on that overreaching list — appetite change
and bodyweight decrease — are things the app **already logs**, and "loss of
pop" is what the RPE field would capture if it were prescribed rather than
optional. This is a concrete, literature-backed way to sharpen an existing
score rather than a new feature.

**M6 — Split adjacency logic, from a second independent direction.** The
split notes are explicit about ordering days to protect a structure rather
than a muscle: "Legs and back are separated to keep lower back from getting
too beat up"; "during back pumping workout you should go easy on your lower
back as you will be doing heavy legs the next day"; "arms are after torso so
they won't potentially limit chest and back training". That is the same
interference concern section 2 (D1) raised from the deadlift side — now with
a bodybuilder arriving at it independently. Tropos derives its split purely
from weekly lift-day count (`programEngine.ts:138-155`) with no adjacency or
interference rule at all.

**M7 — Not every muscle group takes the same programming.** Arms, calves
and abs are explicit exceptions: arms **skip Phase 2 entirely** (going heavy
on curls and skullcrushers invites tendonitis — lighter loads, strict form,
shorter rest); calves respond to very high frequency (4–7×/week) and should
include tibialis work; abs need one pelvis-to-torso movement plus one
torso-to-pelvis movement, 4 sets each, 2–3×/week. Tropos's day builders treat
every movement category identically apart from set/rep counts. The
transferable piece is small and safe: a per-category rule that arm work
shouldn't inherit heavy main-lift progression.

**M8 — Peri-workout nutrition, where Tropos owns both sides and uses one.**
The manual prescribes a pre-workout meal finished 30–60 min before, intra-
workout carbs/EAAs, and a post-workout meal 45–60 min after — and ties
recovery capacity (and therefore trainable frequency) directly to getting it
right. Tropos is unusual in owning both the training log and the food log,
and it already has the seam: `postWorkoutNudge` surfaces remaining protein
after a lift (`useHomeData.ts:291`, rendered in `TodayEnergy.tsx:318-327`).
There is no pre-workout counterpart, and `phaseNutrition.ts` adjusts macros
by **day type** (lift/run/rest), not by time relative to the session. A
pre-session fuelling nudge would be a small, symmetric addition to a
component that already exists. Deliberately excluding the supplement stack —
see below.

### Convergences with earlier sections

- **RIR, third appearance.** The deload spec is written as "cut sets short of
  failure by 2–3 reps." Bench B2 proposed RIR prescription; this is the same
  currency used for regulating a whole week.
- **Autoregulation over templates.** "Periodization should be more about
  instincts… if you feel decimated after 4 weeks, it's ok to back off." The
  science box cites Mann et al. (2010): autoregulated progression produced
  **superior** gains to linear periodization in college athletes. That is the
  strongest single citation across all four manuals for the direction B2
  points in.
- **Injury prevention as a programming rationale**, not an afterthought —
  compare bench B5.

### Changes to earlier rankings

- **P2 (weekly wave) — split it in two.** Sections 1–3 settled *rotating
  emphasis* for strength-goal users. M2 shows hypertrophy/general users want a
  different axis entirely: **volume ramp → taper**. One wave shape will not
  serve both; the goal profile should pick.
- **B6 (exercise roles) — promote; it now has two independent sources** and a
  richer definition (position in session, not just category).
- **New candidate — deload philosophy review.** M4 puts Tropos's load×0.85
  deload in question against a literature-backed alternative. Worth an
  explicit decision before any wave work builds on top of it.

### Deliberately NOT adopting

- **The peri-workout supplement protocol** (intra-workout EAA/hydrolysate
  shakes, creatine, the NSAID discussion). Supplement prescription is well
  outside what Tropos should do, and the NSAID/muscle-damage material is
  frankly medical. The *meal-timing* half (M8) is the transferable part.
- **Occlusion / BFR training, bands and chains.** Equipment-dependent, and
  BFR carries real risk when self-applied — Meadows himself hedges on it and
  warns against chronic use.
- **Forced reps, iso-holds, challenge sets.** All require a training partner
  (some are impossible without one); challenge sets are explicitly a
  once-every-2–3-weeks shock for advanced lifters. *Drop sets and partials
  need no partner and are mainstream* — they'd belong to the same
  intra-set-structure work the bench manual's rest-pause note deferred, if
  that's ever picked up.
- **Destroyer-microcycle volumes and 6–7×/week frequency.** Aimed at
  competitive bodybuilders with tuned peri-workout nutrition; the manual
  itself gates these behind two completed 12-week cycles.
- **"Train to and beyond failure" as a default.** Contradicts the never-grind
  principle sections 1–3 established, and Meadows applies it only in Phase 3
  under supervision.
- **Per-workout volume landmarks** (legs 8–20 sets/session etc.). Not
  comparable to Tropos's landmarks, which are **weekly** per muscle
  (`volumeModel.ts:208-223`). Useful only as a loose sanity reference.

---

## 5. Jeff Nippard — Chest & Back Hypertrophy Programs (reviewed 2026-07-27)

Two companion programs from the same system, reviewed together. A third
lineage: **evidence-based consumer hypertrophy** — cited literature (RP's
volume landmarks, Schoenfeld's frequency and dose-response meta-analyses),
but packaged as a product for ordinary gym-goers rather than a manual for
elite competitors.

**This is the closest reference point yet to what Tropos actually
generates**, and that makes it the most directly usable of the five. The
Juggernaut manuals optimize a competition total; Meadows writes for people
who "train like an uncaged animal". Nippard's reader is a normal person with
a gym membership — i.e. Tropos's user. When his choices differ from Tropos's,
the audience-fit excuse that retires most powerlifting material does not
apply.

### New findings

**N1 — The volume ramp, rendered as a concrete week-by-week table.** This is
what Meadows's M2 ("progression is primarily volume") looks like as a
shippable artifact. Weekly working sets:

| | W1 | W2 | W3 | W4 | W5 | W6 | W7 | W8 | W9 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Chest** (weekly sets) | 21 | 22 | 21 | 22 | 23 | 24 | 24 | 22 | — |
| **Back** (actualized) | 23 | 23 | 23.5 | 23.5 | 25 | 25 | 25 | 25 | **14** |

The ramp is **modest** — roughly one set per week, undulating rather than
monotonic — and individual exercises gain sets on a schedule (chest static
holds 2→3 at W5; dips 2→3 at W5; cable flyes 3→4 at W7). That is a directly
implementable shape for the `volumeModifier` that `generateWeekPrescription`
computes and nothing reads. It is also a useful corrective to a naive
reading of Meadows: the ramp does not need to be dramatic to be the
progression.

**N2 — Progression scheme belongs to the exercise, not the goal.** The chest
program runs **four different schemes simultaneously**, chosen per exercise
type:

| Exercise type | Scheme |
| --- | --- |
| Bench press (main barbell) | % of 1RM given as a *range*, semi-autoregulated — "on days you feel strong, use the mid-to-high end" |
| Rep-range exercises (incline DB, banded pushup, cable flye) | Double progression — add reps at fixed load until the top of the range is hit **on all sets**, then add load and reset to the bottom |
| Flat DB static hold | Add **time** in 5-second increments; when time stalls, add 5–10 lb and reset the clock |
| Bodyweight dips | Add a rep weekly; when reps stall, improve rep quality and cadence (slower negatives) |

Tropos assigns exactly two schemes (`"linear"` / `"double"`) from the
**goal profile**, applying one to every exercise in the program
(`GOAL_PROFILES`, `programEngine.ts:34-67`). Two concrete gaps follow:

- **Time-based progression does not exist in Tropos at all.** `templates.ts`
  authors duration prescriptions as strings (`"30-45s"`), and
  `templateExToProgEx` runs `parseInt(te.reps, 10) || 8` over them
  (`Onboarding.tsx:126`) — so a 30–45 second hold becomes "30 reps". Section 1
  called this lossy; Nippard shows time-under-tension at constant load is a
  *progression axis in its own right*, so what's discarded is a dimension,
  not a preference.
- **The bodyweight ceiling has no graceful exit.** Tropos caps bodyweight
  progression at `MAX_BODYWEIGHT_REPS = 20` and then emits an "add load" note
  (`programEngine.ts:77`). Nippard's answer is cadence and control; for
  pull-ups he also uses *assistance* as the progressed variable ("progressively
  lower the assistance… aim toward 0 lb"), which Tropos has no concept of and
  which is the more common real-world case for new lifters.

**N3 — RPE prescribed per exercise, for a general audience.** Every exercise
row carries an RPE target (chest: bench 8, incline DB 9, banded pushup 9,
dips 10), with a plain-language key: "RPE 10 = failure, 9 = leave one rep in
the tank, 8 = leave two." Plus two tracking columns worth stealing:

- **LSRPE** ("Last Set RPE") — the user reflects after the final set and
  records how many more reps they had. A reflection field, not a prescription.
- **LSTF / FSTF** ("Last Set To Failure") — a per-exercise **Y/N flag** saying
  whether the final set goes to failure. Bench and close-grip bench are N;
  isolation work is Y.

That Y/N flag is a much cheaper primitive than full RPE prescription and
encodes exactly the knowledge Tropos lacks: *which exercises are safe to push
and which aren't*. It could ride on the existing exercise data without
touching the loading model.

**This also weakens a caveat I attached to bench B2.** I noted there that
novices rate RIR poorly and that Fitbod and Hevy therefore keep RPE optional.
Nippard's audience is precisely that population and he makes RPE the
**primary** intensity mechanism, with a translation table and a
"drop the weight 5–10% if you'll hit failure early" fallback. The counter-
argument stands as a design risk but is weaker than I stated — the mainstream
consumer precedent runs the other way.

**N4 — Tempo prescribed as a first-class column, which Tropos parses but
uses for the wrong thing.** The back program gives every exercise a tempo in
`eccentric:pause:concentric:pause` notation (most commonly `2:0:1:0`, with
`2:1:1:1` on rack pulls). Tropos already has the type (`Exercise.tempo`) and
a parser (`exerciseTempo.ts` `parseTempo`) — but tempo is authored on **3 of
151 exercises** and drives only **demo-animation timing**, never a set
prescription. The infrastructure for N4 is largely built and pointed at the
wrong consumer.

**N5 — Exercise stability is itself the progression mechanism (and the
experts disagree).** Both programs answer the same FAQ: *"Why don't the
exercises change from week to week?"* → "Changing exercises from week to week
is more likely to flatten out the progression curve. This is to ensure
progression by adding volume incrementally to these specific movements."

That is the direct opposite of Meadows, who rotates exercises for novelty and
to blunt the repeated-bout effect. The reconciliation is in Nippard's own
structure: **stability within a block, novelty between blocks** — his Block 2
(weeks 5–8) introduces new movements and loading patterns while keeping the
bulk of selection intact. That maps cleanly onto Tropos's 4-week mesocycle,
and it retroactively justifies the existing design: `rotateUntrainedAccessories`
fires at `week % 4 === 1` and only rotates accessories with **zero logged
history**, leaving trained movements alone. Tropos is already on the right
side of this disagreement. What it does *not* justify is `pickExercise`'s
`Math.random()` swap of a plateaued main — a third argument for making that
rotation purposeful (P4 / B6).

**N6 — Volume landmarks directly comparable to Tropos's, and Tropos's
ceiling looks low.** Nippard cites 15–25 weekly sets for pecs and 14–25 for
back (sourced to RP and Schoenfeld's 2017 dose-response meta-analysis) — the
**same unit** as Tropos's `volumeLandmark`, unlike Meadows's per-session
numbers. Tropos's hypertrophy band is `{low: 12, high: 20}`
(`volumeModel.ts:208-223`); Nippard's programmes actually run 21–25 sets. So
Tropos's upper bound sits below where a dedicated hypertrophy program lives.
Not a bug — `balanceWeeklyVolume` deliberately never trims above MRV — but a
calibration data point if the hypertrophy profile is ever revisited. He also
repeats Meadows's M3 advice for beginners: "start with one less set per
movement for the first week or two", then add.

**N7 — A warm-up spec that is finally practical to implement.** Third
warm-up specification across the five sources, and the most implementable:
pyramid up before the **first heavy exercise per body part only** (not every
exercise), scaled to the working weight — e.g. bar×15, 50%×8, 60%×4, 70%×3,
75%×2 before an 80% working set; or 135×10, 225×6, 315×4, 405×3, 455×1 before
500×2. The scoping rule ("only required for the first heavy exercise") is the
detail the other two sources lacked and the thing that makes P5 shippable
without bloating every session.

**N8 — Named set structures Tropos cannot express.** Supersets via paired
row labels (`B1`/`B2` with `0.0` rest between and the real rest after `B2`),
cluster sets (8×3 at 0.5 min rest), reverse pyramid (10/15/20 reps with
descending load), myoreps, and extended sets. Tropos has no concept of paired
or structured sets at all. Combined with the rest-pause and mechanical drop
sets deferred in section 3, this is now a recurring gap across three sources
— worth naming as one candidate ("intra-session set structures") rather than
re-deriving it per book. Note Nippard scopes all of these to Block 2, i.e.
after four weeks of adaptation.

### Corrections to earlier sections

- **M4 (deload philosophy) — it's a three-way spread, not a conflict, and
  Tropos is not the outlier.** Nippard's week-9 deload cuts back volume from
  25 sets to 14 (~44%) **and** lowers intensity — siding closer to Tropos's
  `applyDeload` (sets −1, load ×0.85) than to Meadows's keep-the-load
  approach. Three sources, three positions. The design question stands but
  the case for changing Tropos's deload is weaker than section 4 implied.
- **B2 (RIR prescription) — the audience objection is weaker than stated.**
  See N3.

### Existing Tropos behaviour this validates

Worth recording so the doc isn't read as a pure gap list:

- **Push/pull balancing.** "It is important to balance out the amount of
  pushing volume… with at least an equal amount of pulling volume… imperative
  to preventing a rolled-forward posture." Tropos's `balancePushPull`
  (`volumeModel.ts:347-372`) grows pull accessories until pull ≥ push.
- **Fractional volume attribution.** Nippard hand-computes an "actualized"
  back volume by excluding non-pulling patterns and counting cluster sets at
  ¼. Tropos's `weeklyVolumeByMuscle` already does this systematically
  (primary 1.0 / secondary 0.5) — a more principled version of the same idea.
- **2×/week frequency and its source.** He cites Schoenfeld's 2016 frequency
  meta-analysis; `programEngine.ts:138-155` already cites the same paper for
  routing 3 lift days to full-body. Same literature, same conclusion.
- **Exercise stability across a mesocycle** — see N5.

### Deliberately NOT adopting

- **The specific exercise selections and EMG-optimised variants** (Bayesian
  cable flyes, moto rows, omni-grip pulldowns, rack pulls). Program content,
  not engine behaviour, and much of it is cable/machine-dependent.
- **Myoreps, cluster sets, extended/cheat reps as defaults.** Advanced, and
  gated behind a block of adaptation even in his own programming. They belong
  to the deferred "intra-session set structures" candidate (N8), not to
  generated beginner programs.
- **Percentage-of-1RM loading for the main lift.** Consistent with section 1:
  it needs a tested max Tropos users don't have. Note Nippard supplies an
  AMRAP-test-plus-calculator on-ramp for exactly this problem — a viable path
  if a lift-goal feature (deadlift D4) is ever built, but not a reason to
  adopt %-loading now.
- **Taking the last set to failure by default.** The Y/N flag from N3 is the
  transferable part; a blanket "isolation goes to failure" default contradicts
  the never-grind principle sections 1–3 established.

### 5b. Shoulder Hypertrophy + Neck and Trap Guide (same system, reviewed 2026-07-27)

Two more programs from the same author, reviewed against sections 5's
findings rather than re-deriving them — the system-level material (RPE
columns, LSRPE, tempo, exercise stability, block structure, volume ramp) is
identical and already recorded above. Six things are genuinely new.

**N9 — Each DAY carries a rep-range role. This is the cheapest possible
version of the weekly wave.** The neck/trap guide labels its three days
outright:

| Day | Label | Reps | RPE |
| --- | --- | --- | --- |
| 1 | **STRENGTH FOCUS** | 6–8 (rack pulls) | 7.5 |
| 2 | **HYPERTROPHY FOCUS** | 10–12 / 12–15 | 8–9 |
| 3 | **METABOLIC FOCUS** | 15–20 | 8–9 |

The back program does the same (Day 1 strength focus, Day 2 hypertrophy
focus). This is daily undulating periodization, and it matters for Tropos
because **it needs no week-to-week state**. Sections 1–4 kept arriving at
"vary the stimulus", but every version so far (Juggernaut's rotating
emphasis, Meadows's volume ramp) required the generated week to differ from
the last one — which is precisely what Tropos doesn't do, and what makes P2
expensive. Assigning each day a rep-range role is a change *inside* the day
builders: Tropos already names days by muscle focus ("Full Body — Squat
Focus", "Push — Chest Focus"), but every day draws the same
`profile.mainReps` / `profile.accessoryReps` from the goal profile, so there
is currently **no rep variation anywhere in a Tropos week**. Giving day 1 the
low end and day 3 the high end of a range is a small, stateless change that
delivers most of the benefit. This should probably lead P2 rather than the
week-to-week wave.

**N10 — Delt heads are tracked separately, and Tropos's model can't.** The
shoulder program totals each head at the foot of every week: *"WEEKLY FRONT
DELT VOLUME = 7, SIDE DELT = 16, REAR DELT = 18, TOTAL DELT VOLUME = 41."*
The asymmetry is the whole point — front delts get heavy carryover from
pressing, so they need little direct work, while side and rear are the
commonly under-trained heads.

Tropos maps `front delts`, `side delts`, `rear delts` **and** `rotator cuff`
all onto one canonical `"Shoulders"` bucket (`volumeModel.ts:68-74`). The
codebase already knows this is lossy — the push/pull balancer deliberately
works at the movement level *because* of it:

> "the canonical "Shoulders" group lumps the push-y front delt with the
> pull-y rear delt, so a muscle-level ratio would be misleading"
> — `volumeModel.ts:302-305`

That comment documents the workaround for push/pull balance. What it doesn't
say is the second cost: `balanceWeeklyVolume` targets a single `Shoulders`
landmark, so it cannot detect the most common real-world shoulder imbalance —
a presser whose front delts are saturated while side and rear are starved.
Splitting the canonical muscle is a schema-level change with real reach
(`CANONICAL_MUSCLE_ORDER`, the body diagram, recovery windows), so this is a
finding to record rather than a quick fix — but it is now evidenced rather
than theoretical.

**N11 — Warm-up sets are program rows, not a separate concept.** The shoulder
program lists them inline with their own targets: `OHP (WARM UP) 1×8-10 @ 50%,
RPE 5 — "rehearse technique"`, then `OHP (WARM UP) 2×4-6 @ 60-70%, RPE 7 —
"get used to heavier loading"`, then the working sets. That's the
implementation answer for P5/N7: emit warm-up sets as ordinary prescription
rows with a flag, rather than inventing a parallel warm-up structure.
`WorkoutSession` already has a `"warmup"` `SetType` — currently only a user
tag on a logged set — so the display side largely exists.

**N12 — The program calibrates itself in session one.** Week 1 Day 1 of the
shoulder program *is* the AMRAP test: work up, do one AMRAP set at 90%,
derive the 1RM, and every subsequent week's percentages key off it. Tropos
instead seeds untrained mains from bodyweight multiples × experience level
(`startingLoads.ts:30-44`) and then waits for the event-driven progression to
converge. A first-session calibration is more accurate and self-correcting,
and it's a cold-start idea as much as a loading one — worth noting alongside
the deadlift section's D4 (lift goals), which would need the same machinery.

**N13 — Specialization has a cost budget.** The FAQs reason explicitly about
combining programs: chest + shoulder concurrently is refused outright ("very
high volume of pressing… risk of overuse and injury would be high, even in
the most advanced"), and back + arms is allowed only with bicep work cut 50%
initially. The underlying concept — temporarily prioritize one muscle group
and *pay for it* by reducing others — doesn't exist in Tropos at all;
`balanceWeeklyVolume` only ever adds. This is the same shape as the bench
manual's B4 (accessory volume should sometimes come down) arriving from a
different direction, and it's the natural home for a future "bring up a weak
body part" feature.

**N14 — Cited per-exercise risk notes with a named substitute.** On upright
rows the guide quotes Schoenfeld (2011) on subacromial impingement, states
the mitigation (keep elbows below shoulder height), the contraindication
(pre-existing shoulder damage → avoid), and the fallback chain (barbell →
rope upright row → rope facepull). That is exactly the shape of
`TemplateExercise.contraindicated` + `alternatives` and `injurySubstitutions.ts`
— validation that Tropos's data model is right, plus a usable content source
for the `commonMistakes` / "Watch out" backfill (P6).

**On the men's/women's editions.** The shoulder program ships as two
editions, and the stated rationale is worth recording because it is *not*
essentialist: the women's edition adds front-delt isolation **because women
typically do less chest work, so they get less front-delt carryover**, and
carries more rep volume. Nippard is explicit that "the base core of the
programs are the same… the majority of basic musculo-skeletal and exercise
science training principles apply to both sexes." The transferable principle
is **adjust for what else is in the program, not for the category of person**
— which is a better rule than the vestigial `gender` field on
`ProgramTemplate` (whose scoring `matchTemplate` has already removed). Front-
delt volume should account for pressing carryover for *everyone*; N10 is what
blocks Tropos from doing that today.

### Updated ranking after 5b

- **P2 — lead with daily undulation (N9), not the weekly wave.** Stateless,
  contained inside the day builders, and it finally puts rep variation into a
  Tropos week. The week-to-week volume ramp (M2/N1) becomes the follow-on.
- **P5 (warm-up) — implementation pattern resolved** by N11: warm-up sets as
  flagged prescription rows.
