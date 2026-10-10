# Decisions from the training-engine pass

Phase 6 of [`docs/agents/training-engine-prompt.md`](../agents/training-engine-prompt.md).
These are the questions the pass found, lifting and running, each with what is
locked today, the evidence, what the simulator measured, the options and the
answer. First written 2026-10-08; questions still being measured are updated
here as their numbers come in.

**How they are answered.** The owner delegated these on 2026-10-07
([`owner-answers.md`](owner-answers.md), "The questions the run finds", locked
as Pgm7 in lemmonchess333/Maiin#2604):

1. choose what the evidence and the simulation favour across the personas,
   cold-start, light trainers and returners included;
2. when two options land within the simulation's noise, keep what the app
   does;
3. never reverse an explicit owner decision (a lock row's "owner:" line, a
   Lift4 owner call, a decision pinned in a test); those go back to the owner;
4. lock each answer, marked "owner-delegated, 2026-10-07", before code relies
   on it;
5. every change ships as a draft PR, and the owner merges.

Money, privacy and medical or safety claims stay the owner's too.

**Status words.**

- **Built**: answered and built, in the PR named.
- **Answered**: answered by the rules; to be locked and built.
- **Kept**: the evidence and the simulation don't separate the options, so
  the app keeps what it does (rule 2).
- **Measuring**: the options need a simulated comparison before the answer;
  the comparison is described.
- **Owner**: the answer would reverse an owner decision, or touches money,
  privacy or safety. The evidence and a recommendation are here.

**What the simulator can and can't say.** The simulator
(lemmonchess333/Maiin#2613, #2617, #2619; [`simulator.md`](https://github.com/lemmonchess333/Maiin/blob/claude/sim-actions/docs/training-engine-2026-10/simulator.md)
on its branch) runs the app's own plan code under simulated people. Its body
models are hypotheses built from the evidence docs, so where a model was fitted
to a source, agreeing with that source is not new evidence. Three limits shape
several answers below:

- the virtual lifter has acute fatigue from recent sets but no fatigue that
  builds over weeks, so a lighter week costs it dose and buys nothing;
- it has no muscle-size model, so nothing about growth can be read from it;
- the runner's injury hazard is Frandsen 2025's, applied to single-run spikes,
  so a plan that avoids spikes avoids injuries by construction. Its taper
  gain is +0.5% against the 2.6% the evidence expects (a pinned calibration
  miss).

---

## Corrections already built

These restore a lock's text or fix a defect; they needed no decision. Each is
a draft PR with a red test first.

| What                                                                                | Finding                   | PR                                                           |
| ----------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------ |
| Dumbbell and kettlebell lifts start on a weight the rack has                        | F1                        | lemmonchess333/Maiin#2610                                    |
| A short session's two-set main lifts survive every load                             | F7                        | lemmonchess333/Maiin#2612                                    |
| "Last time" is the last session in the lift's own slot                              | F11                       | lemmonchess333/Maiin#2614                                    |
| Easier today's weights on the lift's own equipment, never under the bar             | F20                       | lemmonchess333/Maiin#2620                                    |
| The lighter-week banner only when a lighter week can be taken                       | F19                       | lemmonchess333/Maiin#2621                                    |
| A lighter week taken from Train restarts the calendar's count                       | Lift4 (9), A4             | lemmonchess333/Maiin#2622                                    |
| One set of goal names                                                               | Lift4 (4)                 | lemmonchess333/Maiin#2623                                    |
| Miss counts start again after any break                                             | Lift4 (7)                 | lemmonchess333/Maiin#2624                                    |
| A bodyweight lift on a fixed target climbs a rep when every set hits it             | Lift4 (6)                 | lemmonchess333/Maiin#2625                                    |
| No lifting suggestions on the Performance tab                                       | Lift4 (3)                 | lemmonchess333/Maiin#2626                                    |
| Each session keeps its heavier or lighter role as the order carries over            | Lift4 (12)(b)             | lemmonchess333/Maiin#2627                                    |
| A level change sets how the main lifts progress                                     | Lift4 (12)(a)             | lemmonchess333/Maiin#2629                                    |
| Replace and Add take their role's numbers                                           | Lift4 (5); Lift5          | lemmonchess333/Maiin#2630 (lock lemmonchess333/Maiin#2628)   |
| One definition of a long or hard run, the run plan's                                | A5                        | lemmonchess333/Maiin#2607                                    |
| A tempo is judged by its blocks, live and after; a goal-pace tempo against its pace | F22; audit §0 item 3      | lemmonchess333/Maiin#2633                                    |
| A quality day counts the run done as that session                                   | F13; PR-J-Q1              | lemmonchess333/Maiin#2635 (STATUS lemmonchess333/Maiin#2632) |
| A plan made mid-week plans no run before that day                                   | F16; Run19                | lemmonchess333/Maiin#2636 (lock lemmonchess333/Maiin#2634)   |
| Home shows a run on the date the plan holds it                                      | F14, F21; ADR-0002        | lemmonchess333/Maiin#2637                                    |
| A race plan needs at least two run days a week                                      | A7; audit §7 item 11      | lemmonchess333/Maiin#2638                                    |
| An easy run reaches the run screen timed by its length                              | RUN-EV-09; audit §2.3     | lemmonchess333/Maiin#2639                                    |
| The taper's session is placed like every quality run                                | R10; RUN-EV-10            | lemmonchess333/Maiin#2642                                    |
| The copy that was wrong today                                                       | R12                       | lemmonchess333/Maiin#2641                                    |
| The rest-day card and the usual-meal row fit at large text                          | #2612's capture run       | lemmonchess333/Maiin#2631                                    |
| Setup asks, optionally, for a recent 5K or 10K time                                 | R11; adaptive paces §10.2 | lemmonchess333/Maiin#2653                                    |
| The plan moves on with the day while the app stays open                             | Found by the journeys     | lemmonchess333/Maiin#2672                                    |
| Fonts are never inlined, so the CSP loads them                                      | Found wiring A11          | lemmonchess333/Maiin#2674                                    |

The seams the simulator needed are lemmonchess333/Maiin#2605, #2606, #2608,
#2609, #2615, #2616 and #2618.

### Answered, locked and built

| What                                                                   | Answer                            | PR                                                         |
| ---------------------------------------------------------------------- | --------------------------------- | ---------------------------------------------------------- |
| A tempo and intervals say how they feel until there's a pace to give   | R2; Run20 (1)                     | lemmonchess333/Maiin#2643                                  |
| A medium-long run of an hour or more isn't put beside a hard day       | R9; Run20 (3)                     | lemmonchess333/Maiin#2644                                  |
| The quality ladder starts at its first rung                            | R13; Run20 (4)                    | lemmonchess333/Maiin#2645                                  |
| After race day, the race plan waits for the race's own ending          | R22 (F6)                          | lemmonchess333/Maiin#2646                                  |
| A new plan's week runs on the weekend, and the long run goes there     | R4; Run20 (2)                     | lemmonchess333/Maiin#2647                                  |
| A new runner's first six weeks hold no tempo or intervals              | R14; Run20 (5), first half        | lemmonchess333/Maiin#2648                                  |
| A new runner's first six weeks run as run-walk, then build from 20 min | R14; Run20 (5), second half       | lemmonchess333/Maiin#2655                                  |
| The push/pull balance weighs presses against pulls                     | L8; Lift6                         | lemmonchess333/Maiin#2650 (lock lemmonchess333/Maiin#2649) |
| The Monday check grades a first week against what it planned           | R20 (F16b)                        | lemmonchess333/Maiin#2651                                  |
| "Why this run" says what it is, how it should feel and what to do      | E3; Run21 (3)                     | lemmonchess333/Maiin#2656                                  |
| The run summary speaks only when a run didn't match its type           | E9; Run21 (6)                     | lemmonchess333/Maiin#2657                                  |
| Tempo and intervals are the quality sessions; "hard" is an effort      | E4; Run21 (4)                     | lemmonchess333/Maiin#2658                                  |
| "Why this run" names the quality sessions only when the week holds one | E3 (a correction)                 | lemmonchess333/Maiin#2660                                  |
| A run states its own minutes: its time, or a long run's at its pace    | E6; Run21 (5)                     | lemmonchess333/Maiin#2659                                  |
| One effort language on the run screen, and in heart-rate zones         | E1; Run21 (1)                     | lemmonchess333/Maiin#2661                                  |
| Train's week selector names each run; "Easy 60" is "Medium-long 60"    | E2, E5; Run21 (2), first part     | lemmonchess333/Maiin#2663                                  |
| A long run that finishes at race pace says so                          | E2; Run21 (2), second part        | lemmonchess333/Maiin#2665                                  |
| A tempo at the goal race pace says so, with its own reasons            | E3 (a correction); Run21 (2), (3) | lemmonchess333/Maiin#2666                                  |
| The signed-out specs run in CI: three on every push, six nightly       | A11; Pgm7                         | lemmonchess333/Maiin#2675                                  |

Run20 is lemmonchess333/Maiin#2640. R22 and R20 needed no lock: R22
restores what the race lifecycle (PR-J) already decides, and R20 is the
correction Run19 recorded.

### Every ⚠ cell in running-engine-audit §2.3

| Cell                                                                 | Where it went                             |
| -------------------------------------------------------------------- | ----------------------------------------- |
| Easy: Home today "About 40 min"                                      | Built (lemmonchess333/Maiin#2659)         |
| Easy: week strip "40m"; strides invisible on the strip               | Built (lemmonchess333/Maiin#2663)         |
| Easy: the chooser's "Easy Run · Recovery pace" against Z2's "Easy"   | R12                                       |
| Easy and medium-long: nothing in the run, no time, no countdown      | Built (lemmonchess333/Maiin#2639)         |
| "Easy 60" against "Medium-long 75"                                   | Built (lemmonchess333/Maiin#2663)         |
| Tempo: "4:30 /km" with no benchmark                                  | R2                                        |
| Tempo: the run screen's "MODERATE"                                   | Built (lemmonchess333/Maiin#2661)         |
| Tempo: PaceZoneBar on the whole-run average; alerts in the warm-up   | Built (lemmonchess333/Maiin#2633)         |
| Tempo: "A touch outside the window" on a perfect run                 | Built (lemmonchess333/Maiin#2633)         |
| Intervals: "1 km hard"                                               | E4                                        |
| Intervals: no pace without a benchmark, "1K" in the run              | R2                                        |
| 8×400: the interval band, not repetition pace                        | R8                                        |
| Long: Home's "about 80 min" from nominal minutes                     | Built (lemmonchess333/Maiin#2659)         |
| Long: "Steady, controlled effort" while judged against the easy band | R12                                       |
| Long with a race-pace finish: the peek doesn't mention the block     | Built (lemmonchess333/Maiin#2665)         |
| Race: "All-out…", and race HR in Z4 for every distance               | R12; E1 built (lemmonchess333/Maiin#2661) |
| Phase chip "Build · week 9 of 52" with no definition                 | E3                                        |
| HR zone "Z2 · 111–129 bpm" with no name                              | Built (lemmonchess333/Maiin#2661)         |

### Phase 3: the journeys

lemmonchess333/Maiin#2676 holds the rig and the journeys as they pass:
Get stronger for 16 weeks, and a planned run done on a treadmill. Making
them work found two app defects (fixed in lemmonchess333/Maiin#2672: a
resumed app kept last week's plan; a rollover on a copy the server had
moved past carried last week's sessions into the new week) and one test
rig defect (the Firestore emulator keeps every stream a page opens, which
the journeys' clock jumps multiplied).

One observation is for the owner rather than a change: a planned long run
done on a treadmill is not credited until the person taps "Mark scheduled
run complete", because the run-type picker offers "Treadmill" as a type
beside Easy, Tempo and Long rather than as a place to run any of them.
In the reference apps indoors is a setting on the run rather than another
session (Nike Run Club's indoor switch; Garmin runs a planned workout under
its treadmill profile); Tropos's picker makes it a different session. Not
measured with the simulator, and not changed: it is the run screen's
design, so it goes to the owner with the final report.

---

## Part 1 — Lifting

### L1. Lighter weeks for someone who trains part of a 4-day plan

- **Locked today:** Lift4 (9), owner call (2): a lighter week every 4th
  trained week, "as today", for intermediates and up on 3 or more lift days.
- **Found:** lifting-engine-audit §6.3 item 11 (S5). In a 4-day plan the
  session order carries over (Lift4 (11)), and 4 weeks of any fixed number of
  sessions is a whole number of rounds, so every calendar lighter week starts
  at the same point of the order. Doing 2 of 4, sessions C and D are lighter
  every second time they come round and A and B never are; doing 3 of 4,
  B, C and D every lighter week and A never.
- **Evidence:** athletes deload every 5.6 ± 2.3 weeks (Rogerson 2024 [VF]);
  no source covers how a lighter week should fall when someone does part of
  their plan (lifting-evidence L22: WEAK overall). By the calendar, each lift
  that is lightened is lightened every 4 weeks, which is inside practice;
  the lifts never lightened come round every second week.
- **Simulation:** can't separate the options. The virtual lifter has no
  fatigue that builds over weeks, so it rewards any option with fewer lighter
  sessions, by construction.
- **Options:** (a) keep; (b) count lighter weeks per session (each session
  lighter every 4th time it comes round); (c) make the lighter week the next
  full round of sessions, however many calendar weeks it takes.
- **Answer: Kept** (rule 2). (b) and (c) also replace owner call (2)'s "every
  4th trained week, as today", so any change is the owner's.
- **Existing plans:** unchanged.

### L2. Get stronger trains squat and bench as main lifts once a week

- **Locked today:** Lift4 (5): every muscle at least twice a week. Nothing
  sets how often a main lift comes round.
- **Found:** lifting-engine-audit §6.3 item 1. On 4 days (P2, X3, X6) squat
  and bench are mains once a week, deadlift and overhead press twice. The
  upper/lower builder leads Upper B with the vertical push (its horizontal
  push is a dumbbell accessory) and gives Lower B a hack squat.
- **Evidence:** at equal weekly volume, more sessions helped strength in
  Pelland 2025 [VF] (0.73 of the twice-a-week gain at once a week, 1.14 at
  three), but Grgic 2018 found no clear effect, so the effect rests on one
  analysis (MODERATE at best). Strength coaching trains squat and bench
  2–3 times a week and the deadlift 1–2 (CONVENTION; lifting-evidence L5,
  "SHORT for strength athletes").
- **Simulation:** to run. The 4-day Get stronger plan as built against the
  same plan with bench leading both upper days and squat both lower days,
  for intermediate-man, powerbuilder-strength and advanced-man, 20 seeds of
  each variant. The lifter model's frequency term comes from Pelland, so the
  run shows the size of the effect the assumption implies, not new evidence.
- **Options:** (a) keep; (b) on Get stronger, bench and squat lead both of
  their days, with the deadlift once; (c) a frequency floor per main lift for
  every goal (the prompt's 4c strength track).
- **Answer: Measuring.** If the run shows a gain beyond the model's noise,
  (b) is answered for new Get stronger plans by rule 1; it reverses nothing
  locked. (c) waits for the 4c design.
- **Existing plans:** untouched (Pgm5); a plan picks it up when rebuilt.

### L3. Heavier and lighter days turn Get stronger's "4 × 5" into 4 × 3 and 4 × 7

- **Locked today:** Lift4 (5): "Get stronger fixed reps such as 4 × 5", and
  "the heavier and lighter days stay for intermediates, unlabelled" (±2 reps).
- **Found:** lifting-engine-audit §6.3 item 2. Every intermediate Get
  stronger main is 4 × 3 or 4 × 7; only a hinge on a lighter day stays at 5.
  Overhead press and pull-ups at 4 × 7 fixed; heavier-day isolations at 6–10.
- **Evidence:** undulating and periodized plans beat non-periodized ones for
  strength (Williams 2017 [VF]; Moesgaard 2022, MODERATE): lifting-evidence
  L9, SUP. Nothing compares ±2 reps on a fixed 5 against a fixed 5.
- **Options:** (a) keep; (b) undulate fixed targets by load at a fixed 5
  (heavier and lighter days by weight, not reps); (c) leave fixed-target
  mains out of the undulation.
- **Answer: Owner.** The ±2 reps on every intermediate main is the lock's own
  text. The evidence supports undulation, so nothing argues for a change;
  (b) is the shape a strength coach would expect, if the owner wants one.

### L4. The session-to-session sawtooth

- **Locked today:** Lift4 (6): a step whenever every set hits its target;
  Lift4 (7), owner call (1): two misses in a row, 10% lighter.
- **Found:** lifting-engine-audit §6.3 item 3 (S1: 24 ten-percent drops
  across 6 main lifts in 52 weeks; the press missed 16–20 of 52 sessions);
  F4 (simulator): novice presses miss or come down in 38–55 of every 100
  sessions, the light trainer's squat and press in a third, and the
  over-55's bench, deadlift and press.
- **Evidence:** intermediates progress weekly, not per session, in the
  coaching programmes (CONVENTION; lifting-evidence L15, DEF/SHORT for
  intermediate strength mains); the 10% drop is CONVENTION (L19), DEF for
  novices and SHORT for advanced lifters; day-to-day 1RM noise is 3–5.5%
  (Grgic 2020 [VF]), so one session says little.
- **Simulation:** to run, the prompt's five options against Lift4 as built,
  on the 15 lifting personas, 20 seeds of each variant: a weekly step; a
  step gated by effort (needs logged effort in the model, which it doesn't
  have yet); loads from an e1RM trend; Oreb's rotary and effort waves; and a
  drop scaled by level (5% for intermediates, 10% for novices). Reported:
  gains, misses and drops per 100 sessions, and the sessions each lift spends
  below its best.
- **Answer: Owner.** Every option changes Lift4 (6) or owner call (1). The
  simulation goes to the owner with them.

### L5. Short Build muscle sessions hold few working sets, and fitted sessions run over

- **Locked today:** Lift4 (5): the plan is built to fit the chosen length,
  priced with the app's own estimator; main lifts keep at least two sets.
- **Found:** lifting-engine-audit §6.3 item 4: 45 minutes × 4 days gives 38
  working sets a week (most muscles 5–11), 30 minutes × 4 gives 28, with about
  10 warm-up sets on Upper A. F8 (simulator): the fit prices warm-ups at the
  starting weight, but a light barbell lift gains warm-up sets as it grows,
  so fitted 60-minute sessions reach 61–63 minutes (`over-time`, 5 personas).
- **Evidence:** the estimator's own constants (45 s a set, 60 s a warm-up
  set, 90 s setup a lift) have never been checked against saved sessions.
  Calibrating them needs real saved durations, which this container can't
  read (production data), so the check is an operator task.
- **Options for F8:** (a) keep; (b) price each barbell lift's warm-ups at the
  ramp it will have at its expected weight after a block; (c) re-fit when a
  lift's ramp grows, at the next rollover.
- **Answer: Measuring** (F8: `over-time` count and sets per muscle under (b)
  and (c)). Supersets for 30- and 45-minute plans are a new structure the
  person would see: they wait for the 4c design.

### L6. Bodyweight main lifts with added load

- **Locked today:** Lift4 (1): the next session starts from the weight lifted,
  by any margin; Lift4 (6): fixed targets step when every set hits.
- **Found:** lifting-engine-audit §6.3 item 5: pull-ups at 4 × 7 never
  progressed (built: lemmonchess333/Maiin#2625 climbs a rep), and added load
  on a bodyweight lift is ignored.
- **Checked in the code:** the exclusion is deliberate and pinned. The
  change that built Lift4 (1) lists, among "what the change leaves alone",
  "a bodyweight movement with load added keeps its load and its old success
  test" (`progressionUserLoad.test.ts`): weighted dips planned at 10 kg and
  lifted at 20 stay at 10, and `sessionSets.ts` says a bodyweight lift's
  added load is one "the plan does not follow".
- **Answer: Owner** (rule 3: a decision pinned in a test). The
  recommendation: follow the added load the person logs, as Lift4 (1) does
  for every other weight, and keep the rep climb for a bodyweight lift done
  with none. Lift4 (1)'s own reason applies: a load that is too light or
  too heavy is put right by the first session rather than typed over in
  every session after it.

### L7. The beginner's deadlift

- **Found:** lifting-engine-audit §6.3 item 6: the beginner full body has the
  deadlift at 3 × 8 fixed twice a week; hamstrings reach 15 sets against the
  beginner ceiling of 13.
- **Evidence:** novice programmes pull 1 × 5 to 3 × 5 once or twice a week
  (CONVENTION). Lift4 (5) sets beginners' mains at 3 × 8 for Build muscle and
  General fitness, and the table is a ceiling.
- **Answer: Measuring.** The ceiling breach is a defect against Lift4 (5)
  (the reconciler can't cut a main); the sim compares the deadlift as a main
  once a week, with a hinge accessory on the other day, against as built, for
  the novice personas (misses and drops on the deadlift, hamstring sets).

### L8. Curls fill the push/pull balance

- **Found:** lifting-engine-audit §6.3 item 7: `balancePushPull` counts
  biceps as pull, so a beginner gets a 4-set barbell curl.
- **Evidence:** the balance exists for shoulder health (D-LIFT-3), which
  curls don't serve.
- **Answer: Built** (Lift6, lemmonchess333/Maiin#2649; lemmonchess333/Maiin#2650).
  The balance weighs pressing against rows and pull-downs; arm work counts on
  neither side, so curls stop filling it. It runs when a plan is made,
  rebuilt or re-fitted, so existing plans keep their sets until then. In the
  plan sweep the 4-set barbell curl is 2 sets, other curls drop a set, and
  two full-body plans' pull-ups gain one.

### L9. Ceilings exceeded where only main lifts feed a muscle

- **Found:** lifting-engine-audit §6.3 item 8: triceps 16 / 14 (Get
  stronger), 21 / 20 (5 days), 24 / 20 (6 days); biceps 23 and upper back 20
  over on 6 days. The reconciler can't cut mains, and 1:1 credit from every
  press lands on the triceps.
- **Locked today:** A1 (Pgm7): the plan keeps counting an indirect set as 1.0;
  a fix is per judged group, through an ADR-0010 addendum with the planSweep
  measurement, never a global flip.
- **Answer: Measuring**, by A1's procedure. The growth half of A1's check
  (does direct work for triceps, biceps, hamstrings and chest fall behind)
  needs a size model the simulator doesn't have yet.

### L10. The same lift in two slots drifts apart

- **Found:** lifting-engine-audit §6.3 item 9: the beginner 3-day bench, a
  main at 3 × 8 and a compound at 2 × 8–12, reaches 62.5 kg × 8 against
  45 kg × 12 by week 25, about 15 reps in reserve. "Last time" is fixed
  (lemmonchess333/Maiin#2614); the targets still drift.
- **Evidence:** specificity favours practising the same lift (MODERATE); a
  second exposure as a variation is common and favourable for regional growth
  (Kassiano 2022, WEAK).
- **Options:** (a) keep; (b) new plans give the second slot a variation of
  the pattern (incline or dumbbell bench; front squat or leg press);
  (c) the same lift in two slots shares one rule and one weight.
- **Answer: Measuring** (effective sets and gains for the novice personas
  under each). Either (b) or (c) is a generator choice for new plans and
  reverses nothing locked.

### L11. Light lifts that never step on their own

- **Locked today:** Lift4 (6): a step over about 15% is never automatic; the
  range stretches and the plan follows the person. No "try X kg" chip.
- **Found:** lifting-engine-audit §6.3 item 10; F2, F3, F9: a 10 kg lateral
  raise at 24 reps; the 2-day dumbbell beginner's mains wait from week 8.
- **Answer:** A3 (Pgm7) is the answer within the lock: one line, once, when
  a target first climbs past its range. **Answered; to build**, after the
  ceiling's maths is checked against Nuzzo 2024 (`stretchedRepCeiling` uses
  Epley past 10 reps, where Reynolds 2006 stops). Anything more (an automatic
  big step, a prompt) changes Lift4 (6): **Owner**.

### L12. Race build: the leg trim on 2-set lifts, and lighter weeks near a race

- **Found:** lifting-engine-audit §6.3 item 12: on a 45-minute plan the trim
  does nothing (`raceLegSets(2)` is 2, the main-lift floor); a 16-week half
  block makes 5 of the final 6 weeks lighter (S7).
- **Locked today:** Lift4 (10) and its 2026-10-06 STATUS: two lighter weeks
  whatever the taper; "together they replace the calendar lighter week".
- **Answer:** the trim's floor is **Kept**: two sets is Lift4 (5)'s floor
  for main lifts. The 5-of-6 count is **Measuring**: whether a run plan
  step-back week inside the final stretch also lightens the lifts, which
  "replace the calendar lighter week" says it shouldn't. If so, it is a
  correction.

### L13. Support my running

- **Found:** lifting-engine-audit §6.3 item 13: P5 squats once a week (2 × 3)
  plus a front squat; quads 4 sets.
- **Evidence:** heavy loading improved running economy above 12 km/h and in
  highly trained runners (Llanos-Lagos 2024 [VF]); at 12 km/h or slower,
  plyometrics helped and combined methods most. Most Tropos runners run
  slower than 5:00 /km.
- **Answer: Measuring**, as part of 4c's hybrid design. The simulator has no
  economy model, so plyometrics against heavy legs is decided on the evidence
  and the session time it costs.

### L14. Rest, and conservative first weights

- **Found:** §6.3 items 14 and 15: rests adequate (120 s for heavy triples at
  30 minutes, short but defensible); a compliant intermediate's bench starts
  at 60 kg against a 100 kg 1RM and converges in about 16 weeks unless they
  load more.
- **Answer: Kept.** Lift4 (1) follows the weight lifted from the first
  session, and the first-set hint says "Feels easy? Add weight on the next
  set." The simulator's personas who load what they know converge at once.

### L15. Barbell lifts planned under the bar

- **Found:** F10, in 11 of the 15 personas: curls at 5–17.5 kg, skull
  crushers at 15–17.5 kg, a weak lifter's press at 12.5–15 kg. Setup's first
  guesses aren't floored at the bar.
- **Evidence:** none needed on the physiology; the question is equipment.
  Fixed-weight barbells and EZ bars (about 7–10 kg) make light curls and
  skull crushers possible in many gyms; a 12.5 kg press is not, on a standard
  bar.
- **Options:** (a) keep; (b) new plans build a barbell isolation lift whose
  first guess is under the bar as its dumbbell twin, and start a barbell
  compound at the bar at least; (c) floor every barbell lift at 20 kg.
- **Answer: Owner** on the existing plans' side: an automatic swap in a plan
  someone follows reverses Lift4 (2). Recommendation: (b) for new plans, which
  is the generator's choice and reverses nothing; existing plans keep theirs
  (Pgm5), and Easier today already never goes under the bar
  (lemmonchess333/Maiin#2620).

### L16. Size plans give the quads 9 sets a week

- **Found:** F12: under ACSM 2026's 10.
- **Evidence:** Pelland 2025's growth curve has no step at 10 sets; 9 against
  10 is a small difference on a curve that keeps rising.
- **Answer: Kept** (rule 2). The simulator has no size model to separate
  them, and the `acsm-size:quads` check reads a threshold the curve doesn't
  have. The check stays as a report, not a target.

### L17. Swaps kept at Finish

- **Locked today:** Lift5 (lemmonchess333/Maiin#2628): Replace and Add take
  their role's numbers. Lift4 (11): Finish asks once whether to keep a swap.
- **Answer: Kept.** Lift5 answers it: its call (c) keeps Swap for today as it
  is, and a swap kept at Finish keeps its numbers. Nothing to build.

### L18. A leg miss after a hard run counts half (A9)

- **Answer:** kept and labelled an assumption (Pgm7). **Measuring** what A9
  asks: how often it changes a drop, from the hybrid personas' sessions.

### L19. The 4c designs

The strength track (a frequency floor per main lift, a top set with
back-offs, heavy singles and an optional dated test), the hypertrophy track
(fractional sets, priority muscles, a set added when a muscle stalls),
powerbuilding as a dial, lift targets answered with a forecast range, and an
e1RM trend. **Measuring**: each is designed under the quiet rule and compared
against Lift4 as built on the simulator before it comes here with an answer.

---

## Part 2 — Running

### R1. The derived benchmark reads easy runs as races

- **Locked today:** adaptive paces §10.2 (owner, 2026-06-11): ask in setup
  and also derive silently "from early `isVolumeEligible` runs"; RUN-EV-08's
  two-tier gate: a derived benchmark lands pending, prescriptions wait, and
  measurement surfaces use it at once.
- **Found:** F17: the derive takes the best of a runner's first easy runs as
  a race: 6.7–9.7 VDOT under the runner. The run summary, a measurement
  surface, then tells them to slow down on most easy and long runs: 20 for
  couch-to-5k, 18 for the new marathoner, 29 for each 2+3 hybrid. Pace Insight
  does the same from any run (audit §0 item 3).
- **Options:** (a) derive only from efforts: races, time trials, and since
  lemmonchess333/Maiin#2633 a tempo's work segments; (b) keep deriving from
  early runs, but read an easy run as easy, not as a race; (c) keep the
  derive and stop measurement surfaces using a pending benchmark.
- **Answer: Owner.** (a) narrows §10.2's "derive from early runs" to almost
  nobody in their first weeks; (c) reverses RUN-EV-08. (b) keeps both
  decisions, but an easy run bounds fitness from one side only, and someone
  who runs easy runs too fast would get paces too quick once they accept
  them. Recommendation: (a) plus the setup question §10.2 already asks for
  (R11), so a new runner has a benchmark from setup, not from easy runs.

### R2. With no benchmark, every tempo targets 4:30 /km and intervals are judged at 5:00

- **Locked today:** adaptive paces §6 (design, not an owner lock): with no
  benchmark the templates' fixed paces stand.
- **Found:** running-engine-audit §0 item 2: 4:30 /km is faster than a
  25:00 5K runner's race pace; PaceZoneBar judges intervals at 5:00 /km.
- **Evidence:** Runna shows "not enough data yet" until it has paces
  (explanation-ux §3); RPE-based targets are what the evidence gives when no
  pace exists (running-evidence §2).
- **Answer: Built** (Run20 (1), lemmonchess333/Maiin#2643). Until a pace
  exists, a tempo and intervals carry their effort words, not a pace: no
  pace target, no pace bar, no pace alerts, and no pace verdict.
- **Copy:** "Comfortably hard" on a tempo's launch card, with "Comfortably
  hard — hold the rhythm" on its blocks; "Hard, and even across every rep"
  on intervals. E1's one effort language can replace these words later.
- **Existing plans:** they change at once; nothing is stored.

### R3. Runs with no session type and the quality day

- **Found:** after lemmonchess333/Maiin#2635, a run done as a tempo, intervals
  or a race fills a quality day whatever its pace. A run with no session type
  (freeform, or from Health) is still held to the 4:30 /km bar.
- **Answer: Kept** (rule 2) until a runner-relative bucket exists
  (PR-J-Q1's original rule). Untyped runs on a quality day are the rare case.

### R4. The long run's weekday

- **Found:** F14: setup's schedules never put a run on a Sunday, and a
  runner-only plan's long run lands on Monday. Home now shows a Sunday race
  (lemmonchess333/Maiin#2637); the long run's day is the rest.
- **Evidence:** nothing checked here on the weekday itself. ADR-0002 gives
  "long run Sunday, intervals Tuesday, race countdown" as what makes runs
  date-pinned; road races are mostly at weekends, and the long run rehearses
  the race (CONVENTION).
- **Options:** (a) keep; (b) the long run goes on the weekend day among the
  person's run days (Sunday, else Saturday), else their last run day;
  (c) setup asks for the long-run day.
- **Answer: Built: (b)** for setup's default week, locked as Run20 (2)
  (lemmonchess333/Maiin#2640; lemmonchess333/Maiin#2647); (c) adds a setup
  step and waits for evidence that (b) isn't enough. `defaultWeekSchedule`
  moves one run to Sunday (Saturday when Sunday is taken) when no run falls
  on the weekend, choosing the run that leaves the runs most spread out; the
  long run takes the weekend day as before. `generateSchedule` stays the week
  derived for a profile that never stored one, so existing plans don't move.
- **Existing plans:** keep their weekdays until rebuilt (Pgm5).

### R5. The plan doesn't start from the runner's own running

- **Locked today:** Run15 (the re-entry spec: the race plan has no fitness
  input); planning foundations (owner-authorised 2026-09-13): an optional,
  confirmed report of recent weekly minutes and longest run, a ceiling that
  "never expires into an automatic volume increase"; adaptive paces §10.3
  (owner): fitness-scaled volume deferred, not refused.
- **Found:** F15: weeks 2–5 average 57–75% of what the experienced
  running-only personas already ran, and 2.6 and 5.8 times what the two
  beginners ran. Setup never asks.
- **Answer: Measuring.** Setup asking for the report the planning
  foundations already define (minutes a week, longest run), and the plan
  starting from it, against as built, on the run personas: dose in weeks
  2–5, spikes, injuries and VDOT. The planning foundations' "never grows on
  its own" stays: a person-confirmed step up is the growth path (R6).

### R6. The running baseline only ratchets down

- **Found:** running-engine-audit §0 item 6: re-confirming from recorded runs
  gives 150 → 142 → 129 → 120 minutes, and the long run is gone by week 9.
  A runner who follows the plan can never grow it.
- **Answer: Measuring.** The review prompt offering a step up the person
  confirms, within the planning foundations' rule that nothing raises it
  unconfirmed; the size of the step is what the simulation sets, read
  against its spike check (R7).

### R7. Single runs far longer than the month's longest

- **Found:** F18 `spike`: build-week long runs up to 1.76 times the month's
  longest; a marathon 6.9 and 10.6 times it, after 28 or more days without
  a long run; the new runner's first long run 7 times it.
- **Evidence:** Frandsen 2025 [VF], 5,205 runners: a run 10–30% longer than
  the longest of the last 30 days raised the hazard of injury (HR 1.64; 1.52
  for 30–100% longer, 2.28 past double). It measured distance only, and a
  step under 10% isn't shown safe. MODERATE.
- **Held back by the running handoff:** its explicit non-adoptions bar "a
  universal 10 percent rule" and "a new source-derived … long-run cap"
  added because a source has one, and its rules call long runs "purpose- and
  context-dependent", not "a universal percentage" (`docs/running-programming-claude-handoff.md`).
  A hard 10% cap in the scheduler is exactly that.
- **Answer: Measuring.** The spikes have three causes, each with its own fix
  elsewhere: the first long run set without the runner's own longest (R5),
  the rebound after a step-back week, and the race after a taper with no long
  run (R8). The simulation compares those fixes against as built; Frandsen's
  guard stays the simulator's `spike` check, which is where a source's
  number belongs. Fewer injuries follow from fewer spikes by construction,
  so the check reports spikes, not injuries. The new runner's own spike is
  built out by R14's build after run-walk (lemmonchess333/Maiin#2655).

### R8. The taper

- **Found:** F18 `taper-cut`, `taper-long`; audit §7 item 6: the marathon
  taper cuts volume about 60% in one step and holds it for three weeks, with
  no long run in the last 4; the half −66% for two weeks; the only quality is
  8 × 400 m at interval pace.
- **Evidence:** Bosquet 2007 [VA]: 8–14 days, volume cut 41–60%, intensity
  and frequency kept; up to 3 weeks still works. Pfitzinger and Daniels keep a
  reduced long run 2–3 weeks out.
- **Held back by the running handoff:** "a new source-derived or universal
  taper duration/percentage" is an explicit non-adoption; the handoff asks
  for a taper made "deliberate rather than accidental".
- **Answer: Measuring.** The defects are in the shape, not the length: one
  step held for three weeks, and no long run in the last four, so the
  marathon itself is the first long run in a month. The direction: a
  reduced long run in the first taper week, the cut in steps rather than
  one, run days and intensity kept, and the taper's quality at race pace or
  threshold rather than 400 m repeats. Its numbers stay Tropos heuristics,
  labelled as such. The model prices a taper low (+0.5% against the 2.6% the
  evidence expects), so the simulation can show spikes and the long-run gap,
  not which taper races faster.

### R9. Demanding days back to back

- **Found:** F18 `back-to-back`; audit §7 item 3: the medium-long (60–90 min)
  isn't treated as demanding, so it sits the day before quality in every
  4-day marathon build week; two-day weeks put the long run and quality on
  consecutive days; the beginner 5K runs Tuesday to Thursday in a row.
- **Evidence:** the hard–easy principle (CONVENTION, every coach); the
  running handoff's "space demanding sessions in the actual calendar";
  RUN-EV-10's own placement model.
- **Answer: Built** (Run20 (3), lemmonchess333/Maiin#2644). Placement
  counts a run of an hour or more as demanding: the medium-long takes the
  first easy day not beside the long run or a quality session. Where every
  easy day is beside one, the week keeps its order, since the days are the
  person's; so do a two-day week's long run and quality, and a beginner's
  three days in a row.

### R10. The taper sharpener bypasses placement

- **Found:** audit §0 item 5 and RUN-EV-10: the taper branch's `remaining[0]`
  puts 8 × 400 m on the first free day, after the long run.
- **Answer: Built** as a correction (lemmonchess333/Maiin#2642): the taper's
  session goes through the same placement as every quality session. Its
  content is R8's.

### R11. Setup asks for no benchmark

- **Locked today:** adaptive paces §10.2 (owner): "an optional onboarding
  question (recent 5K/10K time or self-rated level → conservative VDOT)".
- **Found:** audit §0 item 2: setup asks for no benchmark, time goal or
  current running.
- **Answer: Answered** as a correction: build the optional question the
  owner locked. Skipping it stays possible (§10.2: "never a dead-end").
  The race-time half is built (lemmonchess333/Maiin#2653): occasional and
  regular runners are asked for a recent 5K or 10K in minutes and seconds,
  saved as their own benchmark, and setup's plan uses it. Settings and
  setup read a typed time through one function, which refuses a time
  faster than anyone has raced. The self-rated level for a new runner is
  to build once the evidence gives a conservative VDOT for each level.

### R12. The copy that is wrong today

- **Found:** running-engine-audit §0 item 7 and §7 item 10:
  - the planner's compressed copy says "a shorter long-run progression",
    which is backwards;
  - "Lighter caps them at 10K", stale since Pgm6's rescale;
  - "the pace comes from your fitness", false with no benchmark and under A2;
  - "20 min @ goal pace @ 6:03 /km";
  - "All-out marathon effort" beside "start conservatively";
  - "Steady, controlled effort" on a long run judged as easy;
  - "Easy Run · Recovery pace" against Z2's "Easy";
  - `LONG_RUN_MAX_MINUTES`'s comment: Daniels applies 150 minutes from 64 km a
    week and 30% below it, not "the lesser of 150 minutes and ~25–30%".
- **Answer: Built** as corrections (lemmonchess333/Maiin#2641).

### R13. The quality ladder starts mid-way

- **Found:** audit §7 item 4: the ladder is indexed on block position, so a
  year-out marathoner's first quality is tempo_30 / 5 × 1K, the half's first
  intervals are 6 × 1K, and the beginner 5K's first-ever intervals are
  6 × 1K at VO2max.
- **Evidence:** intensity added gradually and ramped from exposure
  (running-evidence §5.20; Daniels, Lydiard order of phases [VA]).
- **Answer: Built** (Run20 (4), lemmonchess333/Maiin#2645). A runner's first
  quality session is the ladder's first rung, and each one climbs at most a
  rung past the highest before it; the block position caps it. It counts the
  sessions the plan held, not the ones done: counting completions needs run
  history the generator doesn't read today.

### R14. Quality for a new runner, and run-walk

- **Found:** F18 `novice-quality` (intervals from week 5), `run-walk` (a new
  runner asked for more than 20 continuous minutes in week one). The
  couch-to-5k persona is injured in 42% of seasons against 10–25%.
- **Evidence:** no structured quality for a novice's first 4–6 weeks;
  strides and hill sprints allowed (running-evidence, Daniels [VA]); NHS
  Couch to 5K and Galloway use run-walk [VA].
- **Answer: Built**, locked as Run20 (5) (lemmonchess333/Maiin#2640). No
  tempo or intervals in a new runner's first six weeks; a new runner's first
  weeks run as run-walk, through the session player's segments, building to
  continuous running. The first half is built (lemmonchess333/Maiin#2648):
  setup's "New to running" reaches the generator as the day the six weeks
  end, counted from the day setup finished (`onboardingCompletedAt`, which
  the server stamps; plans after setup counted from sign-up until the
  review caught it). The second half is built
  (lemmonchess333/Maiin#2655): a run-walk template family, from Couch to
  5K's week 1 to 20 minutes non-stop, and the generator giving each of a new
  runner's first weeks its session, run through the player's segments with
  no pace. After the six weeks the running builds from those 20 minutes,
  five more a week (the novice convention's 5–10 minutes a run every 1–3
  weeks), each run the longest of its kind that fits, until the plan's own
  runs fit: run-walk ended at 20 minutes while the race plan built on
  underneath, and week 7 asked for a 55-minute long run. That is part of
  "building to continuous running", specific to leaving run-walk, not the
  general cap R7 holds back. A tempo or intervals session that doesn't fit
  becomes a smaller dose of itself (the deload's rungs) or an easy run,
  never another session. A new runner without a race has no planned runs
  (R23), and one who runs freely first and adds a race later counts the six
  weeks from setup, so the race plan can find them part gone; where that
  plan should start is R5's. A race too soon to build to (a half twelve weeks out builds
  to about 35 minutes before a race of two hours or more) is the owner's
  (R14c): saying so is a claim about readiness. The
  six weeks is a Tropos heuristic inside the evidence's 4–6, serving the
  running handoff's own rule: build broad capacity before making work more
  event-specific. The runner model has no run-walk, so the injury effect
  can't be simulated.

### R15. Weekly jumps after step-back weeks

- **Found:** F18 `volume-jump`: +25% to +59% after a step-back.
- **Evidence:** Frandsen found week-to-week change unrelated to injury, and
  the only trial of the 10% rule (Buist) found no effect.
- **Answer: Kept.** Single-run spikes (R7) are what the simulator checks;
  the weekly percentage isn't.

### R16. The long run's share of a short week

- **Found:** F18 `long-share`; audit §7 item 2: 39–67% of the week on 2–4
  days.
- **Evidence:** Daniels' 25–30% is one coach's rule [VA]; nothing ties the
  share to injury. At 3 days it would halve a marathon long run.
- **Answer: Kept** (rule 2).

### R17. The marathon long run's peak (Run17)

- **Locked today:** Run17 (delegated, 2026-09-06): 150 minutes at the
  runner's own pace once a benchmark is confirmed; a Tropos heuristic.
- **Found:** audit §0 item 4: benchmarked runners at 6:34 /km peak at 20 km,
  slower than 7:40 /km at 15 km; without a benchmark, 25 km for everyone
  (about 4 hours for a slow runner).
- **Evidence:** Daniels: 30% of the week below 64 km a week, the lesser of
  25% or 150 minutes from 64 km [VA]; novice plans peak at 29–32 km,
  Hansons at about 26.
- **Answer: Measuring** (year-out-marathon, sub-3-30 and new-runner-marathon:
  peaks, spikes, finish times) against Run17 as built.

### R18. The year-out marathon's shape

- **Found:** audit §7 item 8 and §0 item 5: 20 weeks of easy base, a 15 km
  long run for 29 weeks, no race-specific work without a goal time, no
  tune-up race. The persona ends the year at −0.4 VDOT and 4:10, against
  +2–5 and 3:45–3:50 expected.
- **Answer: Measuring**, after R5, R8 and R13 are settled: the year re-run
  with them, then with strides and hills in base and a tune-up half.

### R19. Strides once a week; threshold as steady tempo

- **Evidence:** strides on 2–3 easy days a week is every coach's practice,
  and no trial isolates strides (running-evidence item 11); the sources name
  no default between steady tempo and cruise intervals.
- **Answer: Kept** for both (rule 2): the runner model can't value strides,
  and threshold's format is Tropos's choice.

### R20. The server's Monday check on a plan's first week (F16b)

- **Found:** the fell-behind check measures a partial first week against the
  full weekly target, so a plan made on a Thursday can read as behind.
- **Answer: Built** as a correction under Run19 (lemmonchess333/Maiin#2651):
  the prior week is graded against the runs it planned, counted from the day
  the account began when it began that week: the week's run days while the
  plan holds them, else the schedule's from that day, else the weekly target.
  A week begun after its last run day isn't graded.

### R21. Rebuilding a stale race week and "Re-plan from today"

- **Found:** Run19's PR (lemmonchess333/Maiin#2636) left these two paths:
  they regenerate the week with completions carried by date.
- **Answer: Answered** as a correction under Run19: neither plans a run
  before today.
- **Built** (lemmonchess333/Maiin#2669): both, and a first plan made on
  the device, build the week as the save does (`planWeekFromToday`): no
  run is generated before today, and the week's own days are kept as they
  were, so a done, moved, swapped or missed run stays. Before, a re-plan
  on a Saturday dated runs on days already gone, and a done or missed run
  took whatever session the rebuild put on its date.
- **Found on the way (2026-10-10):** the weekly layout editor's save
  (`refreshRunSchedule`) and its restructure (`regenerateProgram`) also
  rebuild this week from its Monday, keeping none of its days: a skip
  earlier in the week is lost and a run can be dated before today. A
  correction under Run19 too, in its own PR, since they carry the person's
  swaps by weekday. **Built** (lemmonchess333/Maiin#2670): both keep the
  week's days before today as they were, and the rebuilt week runs from
  today; from today on, the new layout decides the days as before.
- **Also found:** two Settings save tests from lemmonchess333/Maiin#2636
  assumed a plan's first week holds runs, which one saved on a Sunday after
  its run days doesn't (Run19's own case). They now save on this week's
  Monday.

### R22. The race plan after race day (F6)

- **Found:** F6: the client's Monday rollover after race day, and after
  recovery, deletes the run plan before the server's no-show and
  recovery-exit checks can read it. Every race persona ends still in race
  prep, and the Monday check then says they fell behind, weekly.
- **Answer: Built** as a correction (lemmonchess333/Maiin#2646): the race's
  own lifecycle (PR-J) decides when race prep ends. Past race week the
  rollover keeps the plan and race week's days, on their own dates, which
  the no-show, the return to free running and recovery for a race logged
  late read; no runs are planned, and the lifts move as they did before.
  Train's Run tab counts "All runs done this week" from this week's days
  only. The server's Monday check skips a week that began after the race.
- **Found on the way, not changed:** the no-show banner's "Log race now"
  opens the run screen, which records a run dated today, and recovery needs
  one on the race date, so a late log can't clear a no-show.

### R23. Freeform runners get no plan; only this week is visible

- **Locked today:** Run9 (owner, 2026-05-29): freeform is the always-on
  substrate and a race goal is the only plan; periodization hidden.
- **Answer: Owner.** Recommendation: the coming weeks' outline (long run and
  quality per week, no daily detail) on the race plan, as Runna shows its
  calendar.

### R24. Race predictions as ranges

- **Evidence:** Riegel is optimistic by about 10 minutes for half of
  recreational marathoners; Vickers & Vertosick's Model 1 corrects for
  weekly mileage (running-evidence §6.7 item 7).
- **Answer: Answered.** A predicted finish is a range, corrected for the
  runner's mileage. To lock and build with E3.

### R25. Lifting through a race year (phase-aware hybrids)

- **Answer: Measuring**, with L13 and the 4c design: build early, maintain in
  the marathon-specific block, heavy legs placed by the person's stated
  priority. Lift4 (10)'s race weeks are built and stay.

---

## Part 3 — Explaining runs (Phase 5c)

The owner's complaint: "it says easy, hard, strides … and it's not
explanatory what this actually is". The quiet rule for runs
(explanation-ux §7): the name and one feel line say what to do, the why is one
tap away, and a change the person didn't make gets one line.

### E1. One effort language

- **Answer: Answered.** Easy (full sentences) · Steady · Comfortably hard
  (a few words) · Hard · Quick and relaxed, for both sports, words first.
  The run screen's step headings use it ("MODERATE" goes); heart-rate zones
  carry their name ("Z2 · Easy"); a race's effort depends on its distance,
  not Z4 for all. Locked, with E2–E4, E6 and E9 and the checks below, as
  Run21 (lemmonchess333/Maiin#2654); to build.
- **Checked against the owner's decisions:** none covers running's words.
  Lifting's are Lift4's (owner): "reps to spare", and "comfortably easy" in
  a lighter week (A8). They stay exactly as locked, as explanation-ux §7.2
  says, so the ladder is for runs. The race zone (`hrZones.test.ts`, zone 4
  for every race) and the capitalised step headings are pinned only by
  tests. "Steady" is also the Performance card's word for a level week; the
  two never share a surface.
- **Built** as Run21 (1) (lemmonchess333/Maiin#2661): the run screen's
  step headings carry the effort ("HARD · REP 2/5", "COMFORTABLY HARD",
  "EASY · AFTER REP 2/5"), never a type key; the zones are Recovery, Easy,
  Steady, Comfortably hard and Hard, and the day sheet and Train's card say
  "Z2 · Easy · 111–129 bpm"; a 5K or 10K race is zone 5, a half or
  marathon zone 4.

### E2. Names that say what you'll do

- **Answer: Answered.** Tempo, intervals, strides and long run are kept and
  defined; every session has one feel line (running-evidence Appendix B).
  "Easy 60" and "Medium-long 75" become one family; the week strip names the
  session ("Easy 30 + strides", not "30m"); a long run with a race-pace
  finish says so. Physiology words appear only under "Coaches also call
  this…".
- **Checked:** no owner decision covers names. Home's today card shows the
  session and its dose and nothing more (owner, 2026-09-09; A6), so the feel
  line goes on Train's card, the day sheet and the pre-run screen. Train's
  week strip names the session and ends in "…" when the name doesn't fit;
  the full name stays in the tab's label and on the card. The names, "30m"
  and "Easy 30" are pinned only by tests.
- **Built, first part** as Run21 (2) (lemmonchess333/Maiin#2663): Train's
  week selector names each run on two lines ("Easy 30 + strides", "20 Min
  Tempo"), each line ending in "…" when it doesn't fit, and "Easy 60" is
  "Medium-long 60", one family with 75 and 90.
- **Built, second part** (lemmonchess333/Maiin#2665): a long run that
  finishes at race pace is "Long 15K with race pace" on every surface that
  names it, with its own four lines, and the launch card gives the block's
  size and pace. One gate (`racePaceWorkFor`) serves the launch and the
  surfaces. Still to build: the feel lines and "Coaches also call this…".
- **Found (2026-10-10):** a tempo in a half or marathon plan's build and
  taper runs at the goal pace (A2), but its reason said the pace "comes
  from your fitness", the taper's said "easy and short", and Train's card
  showed the fitness band. **Built** as a correction under Run21 (3)
  (lemmonchess333/Maiin#2666): "20 Min Tempo at race pace", its own
  lines and reasons, and the goal pace on Train's card and the day sheet.
- **Built, third part** (lemmonchess333/Maiin#2668): the one line under a
  planned run's name is its feel line, effort word first ("Easy: you can
  talk in full sentences. Slower is fine."), in the template description's
  place, on Train's card, the day sheet, the launch card and Home's day
  details. The day details are a detail surface; Home's today card, which
  A6 covers, still shows none. "What it is" now gives the session's shape
  from its template: the warm-up, the blocks or repeats and their rest, the
  cool-down, a run-walk's runs and walks. "Coaches also call this" is the
  last line of "Why this run": zone 2 for easy, medium-long and long runs,
  a threshold run for a tempo, VO2 max intervals for 1K repeats. The
  reasons, the template descriptions, Settings' pace bands (now Tempo and
  Intervals) and a guided run lose their physiology words, each held by a
  guard test. Left for its own PR: the Performance tab's run suggestion
  ("rebuild aerobic base"), which the server writes into each week's
  document.

### E3. "About this run", on every run surface

- **Answer: Answered.** An ⓘ sheet on every run surface, race plan or not:
  what it is, how it should feel, why it's in your week, what to do if it
  feels wrong; phase names defined there. Home's today card keeps no
  explanation (A6, owner): the sheet is one tap away on the session it opens.
- **Checked:** two owner decisions bound it. Run9f (owner, 2026-05-29) keeps
  base, build and peak internal and names only the taper; Run10's phase rail
  (owner-approved) and Lift4 (3)'s "the run plan's own phase names" have
  since shown them. Defining them is the owner's (E3a). The design guide's
  note on Lift4 (3) says "Why this run" stays a disclosure, so the four lines
  go inside the disclosure, and an ⓘ sheet for runs is the owner's (E3b).
  "Why it's in your week" needs a plan: a run with none gets the other three
  lines and no invented reason (`runSessionExplainer.test.ts`).
- **Built** as Run21 (3) (lemmonchess333/Maiin#2656): the four lines inside
  the closed "Why this run" disclosure on Train's card, the day sheet, Home's
  day details and the launch card, with lines of its own for each kind of
  session. The ⓘ sheet and the phase names wait for the owner (E3a, E3b).
  Shown together, no two lines share a phrase (a test reads every session in
  every phase): run-walk's and race day's reasons had repeated what the run
  is.
- **Found (2026-10-08):** the build's easy-day and long-run reasons named
  the quality sessions in every week, and a returning runner's weeks hold
  none (Run15), nor every other build week on the gentler setting: an
  invented reason. **Built** as a correction
  (lemmonchess333/Maiin#2660): they name them only when the run's week
  holds a tempo or intervals session.

### E4. "Hard" means one thing

- **Answer: Answered.** "Hard" is the effort word only. The lift side's hard
  run is A5's (built); intervals say "hard, but even"; the quality family is
  "quality sessions" in the planner, cockpit and verdict copy.
- **Checked:** the lift side's "after a long or hard run" is Lift4's words
  (owner) for A5's category, and stays. Running copy follows E4: the
  below-floor plan's "no hard sessions" becomes "no quality sessions", a
  test pin. The owner's label for that plan, "mostly-easy plan"
  (RUN-EV-05), stays.
- **Built** as Run21 (4) (lemmonchess333/Maiin#2658): the planner, the race
  cockpit, the realign message and "Why this run" say "quality sessions";
  the verdict's line is E9's (lemmonchess333/Maiin#2657). "1 km hard" stays:
  hard there is the effort, E1's Hard.

### E5. Strides on the week strip

- **Answer: Answered**, with E2.
- **Built** with E2 (lemmonchess333/Maiin#2663): the selector says "Easy 30 +
  strides" where it said "30m".

### E6. Minutes from the runner's own pace

- **Found:** Home says "about 80 min" for a 15 km long run from nominal
  minutes, and "About 40 min" for a 40-minute easy run.
- **Answer: Answered.** A timed run states its time ("40 min"); a distance
  run's minutes come from the runner's easy pace when a benchmark exists,
  else the distance alone.
- **Checked:** no owner decision sets the minutes shown. "A benchmark" means
  a confirmed one, the gate prescriptions use (RUN-EV-08, as Run17 plans
  with it).
- **Built** as Run21 (5) (lemmonchess333/Maiin#2659): "40 min" for a timed
  run, "15 km · about 100 min" for a long run at a confirmed pace and
  "15 km" without one, on Home's card and day details, the day sheet,
  Train's card and setup. The fuelling line still reads the template's
  minutes (nutrition's).

### E7. An easy run's ceiling

- **Found:** `runPaces.ts` sets the easy band's fast end at 72% of VO2max,
  about 18–20 s/km slower than Daniels' E table at VDOT 35–50 [C].
- **Answer: Measuring**: the band against Daniels' table before an easy
  ceiling ("6:10 /km or slower") is shown.
- **Measured (2026-10-08):** `trainingBands` gives VDOT 40 an easy band of
  5:59–6:44 /km, against the book's 5:56–6:38 [VA] (running-evidence §5.0):
  the fast end 3 s/km slower, the slow end 6 s/km slower. The "18–20 s/km"
  above doesn't reproduce from `runPaces.ts`, whose fast end is 72% of the
  VDOT oxygen cost, not Appendix A's 70% (6:07 at VDOT 40). Other VDOTs:
  25 → 8:36–9:36, 30 → 7:29–8:23, 35 → 6:38–7:28, 45 → 5:27–6:08,
  50 → 5:00–5:38 /km. The evidence carries the book's E range at VDOT 40
  only, so the other rows can't be checked against it here. Within noise
  at the one point that can, so the band stands; whether to show its fast
  end as a ceiling is still open.

### E8. "Run by feel today" in the heat

- **Evidence:** race pace slows about 0.2–0.6% per °C WBGT above about 10 °C,
  more for slower runners [C, WEAK]; nothing gives training-pace slopes.
- **Answer: Owner** (a heat line is a safety claim).

### E9. The post-run line

- **Answer: Answered.** The summary speaks only when a run didn't match its
  type (an easy run run hard, a tempo run easy), in one line, and stays quiet
  otherwise.
- **Checked:** no owner decision covers the line. The tone is still worked
  out and saved when nothing is said: the easier-week nudge reads it. Which
  benchmark judges a run stays RUN-EV-08's until the owner answers R1; a
  derived benchmark that is too slow already says "faster than easy" on most
  easy runs, and E9 doesn't change that.
- **Built** as Run21 (6) (lemmonchess333/Maiin#2657): an easy or long run
  run hard, and a tempo off its pace either way, get one calm line; a run on
  target, an easy run slower than its window and a race say nothing.

---

## Handed back to the owner

| #    | Question                                            | Why it's theirs                                 | Recommendation                                              |
| ---- | --------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------- |
| L3   | 4 × 3 and 4 × 7 on Get stronger                     | Lift4 (5)'s heavier and lighter days            | Keep; or undulate by load at a fixed 5                      |
| L4   | The sawtooth                                        | Lift4 (6); owner call (1)                       | After the simulation                                        |
| L6   | Added load on bodyweight lifts                      | Lift4 (1)'s change, pinned in its tests         | Follow the added load the person logs                       |
| L11  | Light lifts that wait for the person, beyond A3     | Lift4 (6): no automatic big step, no "try X kg" | A3's line first; measure before anything more               |
| L15  | Barbell lifts under the bar in existing plans       | Lift4 (2): no automatic swaps                   | Dumbbell twins for new plans; existing plans as they are    |
| R1   | The derived benchmark                               | Adaptive paces §10.2; RUN-EV-08                 | Derive from efforts only, plus the setup question (R11)     |
| R23  | Freeform runners' plan; the weeks ahead             | Run9                                            | An outline of the coming weeks on race plans                |
| E8   | Heat                                                | A safety claim                                  | "Run by feel today" on hot days, with no number             |
| E3a  | Phase names on run surfaces                         | Run9f keeps base, build and peak internal       | Define the names only where they already show               |
| E3b  | A sheet for runs, not the "Why this run" disclosure | The design guide's note on Lift4 (3)            | Keep the disclosure, with E3's four lines inside it         |
| R14c | A race too soon for someone new to running          | A claim about readiness                         | Say so at setup, and suggest run-walking it or a later date |
