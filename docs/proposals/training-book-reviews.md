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
