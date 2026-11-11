# Training deep dive: lifting, running and the two together

11 November 2026. Engine read at main `a199cfd7`. Nothing in the engine was
changed by this pass.

Six investigations ran side by side: the lifting builder's session shape, how
lifting adapts to the person, the run scheduler's printed plans, the combined
week, the market for each sport, and the repo's own record of how the
programming was decided. Plans below are the real builder's and scheduler's
output, driven by scratch harnesses (10,080 lifting plans in one sweep, 540 in
another, 30 run seasons, 20 lift and run day pairs). The owner's screenshots of
his own Train tab, sent the same day, are the fixed case.

This file is the summary. Each section names the slice file that holds its
evidence, with file and line for every code claim.

| File                       | What it holds                                                 |
| -------------------------- | ------------------------------------------------------------- |
| `lifting-session-shape.md` | Lifts per day, sets per lift, and the rules that make them    |
| `lifting-adaptation.md`    | What level, time, kit, injury and the person's edits change   |
| `running-engine.md`        | Twelve printed run plans read as a coach would, 18 defects    |
| `hybrid-week.md`           | The combined week for 20 lift and run counts, 14 defects      |
| `market-lifting.md`        | Reference programmes and apps in numbers, with sources        |
| `market-running.md`        | Runna, Strava, Nike Run Club, Garmin and others, with sources |
| `why-it-did-not-land.md`   | The repo's record: what was researched, decided and measured  |
| `evidence/`, `harness/`    | Printed plans, and the harnesses that regenerate everything   |

## 1. The answers

**Why is my day a dozen exercises at 2 sets each?** Two rules, both working as
written. A new plan cuts every lift to 2 sets before it removes one lift. A
plan you already have never loses a lift at all: when it is fitted to your
session length it can only cut sets, and it stops at 2. Your Pull A holds 12
lifts, so it is 12 lifts at 2 sets, priced by the app at 93 to 99 minutes
against a session length of about 45. There is no limit on lifts in a day and
nothing tells you the day runs over. It is not a gap in the research.

**Is the lifting programming good?** Not yet. At 60 minutes the builder gives 4
to 6 lifts and 11 to 17 sets. The programmes and apps read for this pass give 5
to 6 lifts and 15 to 20 sets, with 3 to 4 sets on the first lifts. Half of all
exercises are prescribed at 2 sets (two thirds for a beginner). Paired days are
lopsided: for six days at 60 minutes, Push A is 57 minutes, Pull A 37 and Pull
B 28. A six-day Build muscle week has 3 direct sets for biceps, 4 for triceps,
2 of hamstring curl and no rear-delt work.

**Does it adapt to the person?** It changes the exercise for kit and injury and
scales first weights for level, sex and bodyweight. It does not change the
dose. A lower-back injury gets a trap bar deadlift at the deadlift's full
weight. Advanced is intermediate with heavier first weights. You can add,
remove, replace and reorder lifts, but you cannot set sets or reps, and the
split you pick in setup is stored and ignored.

**Are the run plans good?** A coach would sign the run-walk starter and, with
small edits, the 10K and half plans for a first-timer. A coach would not sign
any marathon plan, the plan for an experienced runner, or the 5K plan as a way
to get faster.

**Are we level with Runna and Strava?** Strava is the wrong mark: its running
plans are Runna's now (sources in `market-running.md`). Against Runna the list
of mechanics matches and the defaults are safer. The plan content is behind for
marathons and for anyone who already runs, and the watch is the real gap: Runna
puts the session on the wrist, and here a run recorded on a watch does not even
count toward the plan.

**Can people improve without getting hurt?** Week to week the engine is
careful and errs low. The risk sits at the edges: race day at 1.7 to 2.8 times
the longest training run, long-run steps of 20 to 33%, and 1 km hard reps two
weeks after run-walk. On improvement, the repo's own simulator has recreational
runners finish a block 0.1 to 1.3 VDOT lower than they started, because the
plan gives them less than they already run.

**Do lifting and running work together?** They share a calendar. Fourteen of
twenty lift and run combinations have no rest day, setup's own defaults among
them. Squats or deadlifts land the day after the long run or the intervals in
most. Neither half sizes itself to the other.

**Why has all the research not produced a programme you trust?** It was turned
into rules, never into a target week. Each rule was locked and tested on its
own count. Nobody, you included, was ever shown a printed week to accept or
reject. The project wrote this down itself on 28 July 2026: "A rule can be
implemented perfectly and still produce a bad programme."

## 2. Your own plan

### 2.1 As the app shows it (your screenshots, 11 November 2026)

Train reads "Week 3 of 26 · Base · 6 days/week".

| Day    | What it holds                                                                                                                                                                                             |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pull A | 12 lifts, each 2 sets: Barbell Row, Single-Arm Lat Pulldown, Barbell Curl, Pull-Ups, Preacher Curl, Deadlift, Tricep Dips, Barbell Squat, Front Squat, Romanian Deadlift, Seated Calf Raise, Cable Crunch |
| Push A | At least 5 lifts, each 2 sets: Bench Press 2 x 8-10, Rope Tricep Pushdown 2 x 12-13, Overhead Press 2 x 12, Skull Crushers 2 x 15, Lateral Raise 2 x 12-14                                                |
| Legs A | 5 lifts, each 2 sets, "about 44 min": Barbell Squat 2 x 8-10, Deadlift 2 x 8-10, Bulgarian Split Squat 2 x 12, Cable Crunch 2 x 15, Standing Calf Raise 2 x 12-14                                         |

What that shows:

1. **Pull A is 24 sets across 12 lifts and the app prices it at 93 to 99
   minutes** (`evidence/owner-pull-a.txt`). The builder's own Pull A for six
   days is 3 lifts. The other nine were added, by you or by an earlier build,
   and the re-fit then cut all twelve to 2 sets
   (`sessionFit.ts:396-422`: "nothing is dropped").
2. **Legs A is the 45-minute plan.** Ten sets priced at 44 minutes is 4.4
   minutes a set. At 45 minutes the builder gives every lift 2 sets, in every
   plan it makes (`lifting-session-shape.md`).
3. **One lift, two unrelated weights.** Barbell Squat is 87.5 kg x 10 on Pull A
   (last 85 kg x 10, 10) and 47.5 kg x 8-10 on Legs A (last 60 kg x 6, 6, "12.5
   kg less than last time"). Deadlift is 102.5 kg on Pull A and 100 kg on Legs
   A, where the last session was 80 kg x 8, 8, 8. Cable Crunch is 40 kg x 10 on
   one day and 37.5 kg x 15 on the other, where the last session was 15 kg x
   12, 12. The plan keeps progression per slot, not per lift
   (`applySessionSets`, `programEngine.ts:2584`), so two slots of one lift
   never see each other's sessions. Why the Legs A squat fell 12.5 kg while its
   deadlift rose 20 kg is not explained yet. It needs your stored plan.
4. **"2 x 12-13"** on the pushdown is a one-rep range, the same family as the
   "3 x 14-15" in `lifting-adaptation.md` D5.
5. **Pull-Ups read "+67.5 kg".** The app treats that as 67.5 kg added to
   bodyweight. If it is an assisted machine or a pulldown stack, the app is
   stepping it the wrong way. To check with you.

### 2.2 What the builder gives a new plan for your setup

Six lift days, General fitness, intermediate, full gym, 80 kg
(`evidence/owner-lift.txt`). `*` marks a main lift.

At 45 minutes, 55 sets a week:

| Day    | Lifts | Sets | Min | Prescription                                                                                                               |
| ------ | ----- | ---- | --- | -------------------------------------------------------------------------------------------------------------------------- |
| Pull A | 3     | 8    | 36  | Pull-Ups 3x6-10\*, Barbell Row 3x6-10\*, Dumbbell Curl 2x8-13                                                              |
| Push A | 4     | 9    | 42  | Bench 3x6-10\*, Overhead Press 2x6-10\*, Dumbbell Bench 2x6-10, Overhead Tricep Extension 2x8-13                           |
| Legs A | 4     | 8    | 41  | Squat 2x6-10\*, Deadlift 2x6-10\*, Hack Squat 2x6-10, Cable Crunch 2x8-13                                                  |
| Pull B | 3     | 8    | 31  | Barbell Row 3x10-14\*, Lat Pulldown 3x10-14, Seated Cable Row 2x10-14                                                      |
| Push B | 5     | 12   | 44  | Overhead Press 3x10-14\*, Dumbbell Bench 3x10-14, Dumbbell Shoulder Press 2x10-14, Pushdown 2x12-17, Lateral Raise 2x12-17 |
| Legs B | 5     | 10   | 44  | Deadlift 2x8-12\*, Squat 2x10-14\*, Leg Curl 2x12-17, Hack Squat 2x10-14, Seated Calf Raise 2x12-17                        |

At 60 minutes, 67 sets a week:

| Day    | Lifts | Sets | Min | Prescription                                                                                                                            |
| ------ | ----- | ---- | --- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Pull A | 3     | 8    | 37  | Pull-Ups 3x6-10\*, Barbell Row 3x6-10\*, Lat Pulldown 2x6-10                                                                            |
| Push A | 6     | 14   | 57  | Bench 3x6-10\*, Overhead Press 3x6-10\*, Dumbbell Bench 2x6-10, Pushdown 2x8-13, Overhead Tricep Extension 2x8-13, Lateral Raise 2x8-13 |
| Legs A | 5     | 13   | 58  | Squat 3x6-10\*, Deadlift 3x6-10\*, Hack Squat 3x6-10, Cable Crunch 2x8-13, Standing Calf Raise 2x8-13                                   |
| Pull B | 3     | 7    | 28  | Barbell Row 3x10-14\*, Lat Pulldown 2x10-14, Seated Cable Row 2x10-14                                                                   |
| Push B | 4     | 11   | 39  | Overhead Press 3x10-14\*, Dumbbell Bench 2x10-14, Dumbbell Shoulder Press 3x10-14, Lateral Raise 3x12-17                                |
| Legs B | 6     | 14   | 58  | Deadlift 3x8-12\*, Squat 3x10-14\*, Leg Curl 2x12-17, Hack Squat 2x10-14, Cable Crunch 2x12-17, Seated Calf Raise 2x12-17               |

No curl on any day at 60 minutes. No rear-delt work at any length. Asking for
75 minutes takes Push A down from six lifts to four and leaves Pull A at 37
minutes.

### 2.3 Your run plan

The repo keeps your setup of 1 November as a simulator persona
(`src/test/sim/runPersonas.ts:320`: six run days, no benchmark, a marathon 25
weeks out) and a saved trace of the season
(`src/features/program/__tests__/sim/__traces__/run/owner-marathon.txt`).

- Weeks 1 to 4: five 10-minute runs and one run of 20 to 40 minutes.
- No tempo or interval session in any of the 25 weeks.
- The long run reaches 20 km in week 13 and 25 km in weeks 18 and 19.
- In the trace the runner misses long runs late in the build while doing 4 or 5
  of 6 runs. The plan then holds no long run, a 6 km and an 8 km, and then the
  marathon at 5.27 times the month's longest run. Nothing is said about the
  race. The modelled finish is 5:13:42.

### 2.4 The two together

Six lifts and six runs are twelve sessions on seven days. The layout rule makes
five double days and no rest day (`src/lib/scheduleUtils.ts:159`), and setup
says only that "some days include a lift and a run". A coach building toward a
first marathon would cut the lifting to two or three days. The app sizes
neither half to the other (`hybrid-week.md`, defect 9).

## 3. Lifting

Evidence: `lifting-session-shape.md`, `lifting-adaptation.md`,
`market-lifting.md`.

### 3.1 What comes out

540 built weeks (three goals, three levels, 45, 60 and 75 minutes, 3 to 6
days):

| Measure                                | Result                                           |
| -------------------------------------- | ------------------------------------------------ |
| Exercises prescribed at 2 sets         | beginner 66%, intermediate 49%, advanced 49%     |
| A 45-minute session                    | 4 to 5 lifts, 8 to 10 sets, every lift at 2 sets |
| A 60-minute session                    | 4 to 6 lifts, 11 to 17 sets                      |
| Days using under 70% of the time asked | 118 of 486                                       |
| Days over their time                   | 0                                                |

In the 10,080-plan sweep's Build muscle, full-gym, intermediate plans, the
share of lifts at 2 sets or fewer is 94% at 30 minutes, 85% at 45, 50% at 60
and 17% at 75.

Direct sets a week against what the engine counts, Build muscle, six days, 60
minutes:

| Muscle     | Direct sets | Counted by the engine | Engine's band |
| ---------- | ----------- | --------------------- | ------------- |
| Biceps     | 3           | 20                    | 12 to 20      |
| Triceps    | 4           | 22                    | 12 to 20      |
| Hamstrings | 2           | 14                    | 12 to 20      |
| Rear delts | 0           | 17                    | 6 to 26       |
| Calves     | 2           | 4                     | 8 to 20       |
| Chest      | 9           | 18                    | 12 to 20      |

### 3.2 The rules that make the shape

| Rule                                                                                                      | Where                                            | Decided by                                                              |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------- |
| Sets are cut to 2 on every lift before any lift is dropped                                                | `sessionFit.ts:14-25`, `:75`                     | The implementer's order under Lift4 (5); Lift9 and Lift11 extended it   |
| A plan the person has never loses a lift when re-fitted                                                   | `sessionFit.ts:396-422`                          | Lift4 (5): "sets only"                                                  |
| A working set is priced at about 4 minutes; a heavy barbell main at 3 sets costs about 17                 | `expressSession.ts:125-130`, `restTime.ts:15-32` | Constants never checked against saved sessions                          |
| Heavier and lighter days are applied to every goal, so a Build muscle A day starts its mains at sets of 4 | `programEngine.ts:1473`                          | July 2026 backlog                                                       |
| Every muscle twice a week comes before a lift's third set                                                 | `weeklyFrequency.ts`, `sessionFit.ts:28-33`      | Lift4 (5), Lift11                                                       |
| An indirect set counts as a whole set, and a muscle over its ceiling loses its direct lifts               | `volumeModel.ts:143`, `:945-987`                 | ADR-0010, Lift12; Lift17 then stopped the removals at three lifts a day |
| Nothing fills a day that prices well under its length                                                     | The top-up was retired with Lift4                | Lift4 (13)                                                              |
| The split is derived from the day count; `preferredSplit` is stored and ignored                           | `planBuilder.ts:163-168`                         | Pgm5 Q1                                                                 |

The thin pull day has an exact history. On 13 October 2026 Lift12 took the
six-day "Pull - Row Focus" from four lifts to two, to bring biceps under a
ceiling counted at one for one, and the two-lift day was committed to the
golden snapshot. The next day Lift17 parked it at three, where it still is
(`why-it-did-not-land.md` 2d).

The engine also disagrees with itself. `volumeModel.ts:990-1008` says 18 sets
is about an hour, and the time fit delivers 12 to 14. The one-off Express
session drops whole accessories first and calls 2-set remnants across many
stations the wrong trade (`expressSession.ts:17-22`), while the plan fit does
the reverse.

### 3.3 Against the market

Sources and grades are in `market-lifting.md`. No app publishes sets per
duration, so the market figure is built from published programmes, Hevy's own
example programmes, Fitbod's help centre and one sponsored review of Alpha
Progression.

- A 60-minute session elsewhere: 5 to 6 exercises, 15 to 20 working sets.
- Two sets appears in three places only: a beginner's accessories, week 1 of a
  block that then adds sets, and minimalist plans taken to 0 or 1 reps in
  reserve on machines. Tropos prescribes 2 sets as a standing floor at 2 in
  reserve on barbell lifts.
- Short on time, the market drops or pairs accessories and keeps sets per
  exercise. Fitbod's own data: exercises per workout fall 40.5% in short
  sessions while sets per exercise fall 0.15.
- Missing here and present in most: sets that rise through a block, a priority
  muscle, supersets written into short plans, indirect sets counted at half.
- Already level: session length as an input, rep bands by role, double
  progression, a lighter week, injury swaps.

### 3.4 Adaptation

| Input          | What changes                                                                                         | The gap                                                                                                                                   |
| -------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Level          | Beginner: fixed 3x8 mains, 2-set support, simpler lifts. Advanced: intermediate with heavier weights | Two tiers in practice. A beginner who moves up keeps the beginner plan (Lift4 (12))                                                       |
| Session length | Sets, then lifts                                                                                     | An existing plan moved from 60 to 30 minutes stays at 43 to 48 minutes while the dialog promises "about 30"                               |
| Injury         | The named lifts are swapped; none survives in 8,640 injured plans                                    | The swap keeps the load and the reps. Lower back: trap bar deadlift at full weight in 688 of 720 plans; loaded crunches in 1,300 of 1,440 |
| Equipment      | Barbell lifts become dumbbell or single-leg lifts                                                    | They keep barbell rep numbers (Bulgarian split squat at sets of 3). "Minimal / bodyweight" is the home-gym plan in 2,440 of 2,520 pairs   |
| The person     | Add, remove, replace, reorder all survive saves and rollovers                                        | No way to set sets or reps. An added Lateral Raise starts at 32.5 kg, Dumbbell Flyes at 55 kg (60 of 105 lifts have no load factor)       |
| Bodyweight     | First weights scale with it                                                                          | No cap: a 150 kg beginner is given Squat 3x8 at 105 kg on day one                                                                         |
| Week to week   | Load or reps climb per lift; half the sets every fourth trained week for intermediates               | No change in sets or exercises through a block. Light dumbbell lifts stall for months (12.5 kg x 15 for 18 weeks)                         |

### 3.5 What works and must stay

No built day runs over its time. Main lifts are never dropped. The split per
day count is sound. Beginner rules are right in kind. Missed weeks, layoffs and
"Easier today" behave well. A barbell lift that would start under the bar is
built as its dumbbell version. "Lose fat" lifts as Build muscle.

## 4. Running

Evidence: `running-engine.md`, `market-running.md`.

### 4.1 The plans, read as a coach would

| Plan                                  | Verdict                                                                                                                                   |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Starter, run-walk to 30 minutes       | Sign it. Then nothing is planned                                                                                                          |
| New runner, 5K in 11 weeks            | Weeks 1 to 6 right. Week 8 gives 4 x 1 km hard two weeks after the first 20 minutes non-stop                                              |
| 5K improver, 10 weeks                 | Safe, not a plan to get faster: four quality sessions, none at 5K pace, long run at 6 km for seven weeks                                  |
| 10K, 4 runs, 12 weeks                 | Sign it for a first 10K. Starts below what the runner already does; long-run steps of 20 to 33%                                           |
| Half, 4 runs, 14 weeks                | The best plan the engine makes. One 20 km run, a 33% step, in the last build week                                                         |
| First marathon, 4 runs, 18 weeks      | Do not sign. Longest run 20 km; race day is 2.11 times it; the planner says "Good runway"                                                 |
| Marathon for a 3:15, 6 runs, 16 weeks | Not a plan for this runner. Week 1 is 40 km for someone on 60. Peak week is his normal week. Longest run 25 km                            |
| Slow marathoner (10K in 63:30)        | Longest run 15 km if a race time was typed, 25 km if not. Accepting the app's own pace suggestion mid-plan takes it from 20 km back to 15 |
| Marathon in 4 weeks                   | Twelve 30-minute runs, then 42.2 km. The copy says "the long runs build in fewer weeks"                                                   |
| Marathon in 40 weeks                  | Fifteen weeks of easy running with no quality; the long run sits at 12 to 15 km for 28 weeks                                              |
| No race                               | Nothing is planned, ever. After any race: one to four weeks of 30-minute runs, then nothing                                               |

### 4.2 The causes

1. **The marathon long run is capped by minutes at the runner's pace.**
   `LONG_RUN_MAX_MINUTES = 150` (`runScheduler.ts:243`) gives 15 km to anyone
   slower than about a 4:33 marathon, 20 km to 3:36, 25 km to 2:58. The ladder
   stops at 30 km against a configured 32. Locked as Run17, whose own
   measurement had no slow runner in it.
2. **Long runs come in eight sizes** (6, 8, 10, 12, 15, 20, 25, 30 km), so
   every step is 20 to 33% (`runScheduler.ts:196-209`).
3. **Every block starts at the same base** whatever the runner does now, and
   the fit to "running now" can only shorten runs (`runningBaseline.ts`).
4. **Paces are set once.** They move only if the runner types a new race time.
   The suggestion is Pro only, needs a 1.5 VDOT gap, and reads races and tempo
   runs, never intervals. No plan holds a time trial.
5. **Seven quality sessions in three shapes**, the same for a 5K and a
   marathon. None in the first 40% of a block. One a week even on six run days.
   Every taper session is 8 x 400 m.
6. **A plan needs a race date** (Run9), and ends in empty weeks.

### 4.3 Against the market

Sources are in `market-running.md`. Dated claims there are as reported by the
pages cited; several could only be read second-hand and are marked so.

- Mechanics match Runna's list: periodised 5K to marathon, paces from a recent
  time, cutbacks, taper, realign after a bad week, a beginner route in.
- Defaults are safer. Runna's defaults are its top volume and top difficulty
  settings, and it spent 2026 adding ways to tone plans down.
- Missing: the session on a watch (Apple Watch companion is built and switched
  off; nothing for Garmin), credit for runs recorded elsewhere (ADR-0007),
  hills, progression and fartlek sessions, a dated holiday or illness mode,
  plans beyond one race.
- Ahead: a real lifting plan in the same week, food tied to the day, and
  price.
- Nobody has outcome proof. Do not sell strength work as injury prevention; the
  supportable claim is running economy.

### 4.4 What works and must stay

Guided sessions with spoken cues and pace judged only in the work segments. The
run-walk ladder. Paces only from a benchmark the runner confirmed. The stepped
taper. Missed weeks and three-week layoffs. Suggest, preview, apply, undo. The
simulator and its ratchets.

## 5. The two together

Evidence: `hybrid-week.md`.

1. **No rest day in 14 of 20 lift and run counts**, including setup's defaults
   of 4 lifts and 3 runs with a race. Each session gets its own day until the
   week is full (`scheduleUtils.ts:130-159`).
2. **Heavy legs beside hard runs in all 20.** The day after the long run in 8,
   the day after tempo or intervals in 8. Three pickers place days, runs and
   lifts and share nothing.
3. **The spacing lasts until the first missed lift**, because lifts rotate and
   "next up" does not look at the runs.
4. **No lifting taper in the week a plan is made.** A race added 6 days out
   leaves squats 4x3 at full weight three days before it.
5. **Without a race there is no combined plan.** A 4-lift, 3-run person gets a
   lifting week with no runs on it and a run target of 0 (Run9a).
6. **The person's days are thrown away.** Setup never asks for them, and adding
   one lift day re-deals the week.
7. **"A third fewer leg sets" changes nothing in 82 of 225 plans.** A marathon
   runner who said yes kept 10 leg sets while running went from 185 to 371
   minutes a week.

What works: two lighter lift weeks before the race, a one-session race week, a
light week after, lighter lifting on the run plan's step-back weeks, and no
session lost when a day slips.

## 6. Why the research did not land

Evidence: `why-it-did-not-land.md`.

1. **No target week exists anywhere in the record.** The research became rules
   and prohibitions. The handoffs bar importing "a sample plan, numeric
   protocol, or competitor behaviour", and no document sets lifts per session
   or sets per lift.
2. **Acceptance was conformance to the lock.** "Lift4 is the acceptance spec
   for the lifting system as built." Whether the result is good was a separate
   phase (4c in the training-engine prompt) that was never run.
3. **The measuring instrument cannot see the complaint.** The simulator scores
   strength gain, time fit and rule compliance. It has no size model and no
   six-day lifter, and its traces never print a day. Since Lift4, too little is
   not a defect; a minute over is.
4. **Decisions were made on labels or handed back.** Lift4 rounds 2 to 5 were
   answered on your behalf. Lift10 to Lift12 were picked from sweep findings by
   short labels such as "Second day before 3rd set". Every time you changed the
   outcome, it was because you saw the app.
5. **Patches stacked.** Nine locks on the plan a person gets landed in four
   days in October, several answering the side effect of the one before.
6. **The work that matched the goal was deferred**: priority muscles, supersets
   for short sessions, estimator calibration, set progression, the strength
   track.
7. **Names.** Layne Norton appears once in the repo, as the author of PHAT in a
   source row. Brett Gibbs does not appear at all. The coach transcripts you
   supplied (Sebastian Oreb) ask for 4 to 6 working sets on a big lift and
   supersetted accessories; the six generator checks drawn from them were never
   built.

## 7. What to do, in order

### Step 0. Change how a programme is accepted

A printed week is the unit of acceptance: day, lifts in order, sets and reps,
minutes, as Train shows it. For a fixed panel of setups, starting with yours,
you accept or reject each print beside a reference programme for the same days
and time. Accepted prints become the golden files. Shape checks take numbers
you set from the prints. Too little becomes a defect again. One generator
change per review.

### Step 1. Defects that need no decision

None of these has a lock in the way. Sizes are S (under a day) or M.

| #   | Defect                                                                                                    | Size |
| --- | --------------------------------------------------------------------------------------------------------- | ---- |
| 1   | An added or swapped lift starts at a compound's weight (60 of 105 lifts)                                  | S-M  |
| 2   | Lower back: rack pull and kettlebell swing offered as safe; trap bar at full weight; loaded trunk flexion | M    |
| 3   | First weights uncapped by bodyweight                                                                      | S    |
| 4   | A day over its time says nothing: show the day's real minutes and say when it is over                     | S    |
| 5   | Kit and injury swaps keep barbell rep numbers; one-rep ranges such as 12-13                               | M    |
| 6   | No lifting taper in the week a plan is made or a race is added                                            | S-M  |
| 7   | Lift order is chosen before the week is finished being built                                              | S    |
| 8   | A race the plan cannot prepare for is described in words that are not true                                | S-M  |
| 9   | An easy 30 the day after a marathon, on every run day, for four weeks                                     | S    |
| 10  | First week back after a layoff is the full base week                                                      | S-M  |
| 11  | A reorder can cost sets at the next rollover                                                              | S    |
| 12  | The "No equipment" preset decided on 9 November (Lift4 STATUS) is not on main                             | M    |
| 13  | "Lighten leg sessions" is shown where it changes nothing                                                  | S    |
| 14  | The same lift on two days keeps two unrelated weights (section 2.1)                                       | M    |

### Step 2. The lifting session, rebuilt to size

Build each day to its minutes from a template, in place of a long list cut
down:

1. One heavy barbell main at 3 to 4 sets (two at most from 75 minutes), a
   second compound at 3 sets, then accessories at 2 to 3 sets until the time is
   used.
2. Short on time: drop or pair accessories first. No lift under 3 sets on the
   first two slots for a non-beginner.
3. Paired days are built to the same size. A day that prices well under its
   length is filled.
4. Indirect sets count half. A ceiling flags; it never deletes a lift.
5. Antagonist supersets written into 30 and 45 minute plans.
6. The estimator calibrated against saved sessions before it removes anything.
7. Then: sets that rise through a block and one priority-muscle input.

Section 9 has a draft of two days for you to react to.

### Step 3. Run plan content

Marathon long run to 180 minutes or 32 km with 2 km rungs. Start from the
runner's own week and peak 20 to 30% above it. A benchmark session in the plan
and a one-tap pace update for every account. A session library chosen by
distance and phase. Rolling plans with no race date and a "what next" after
one. No 1 km reps for a new runner until continuous runs reach 40 to 45
minutes.

### Step 4. One week

One scored layout for days, runs and lifts together, with a rest day kept by
placing doubles on purpose. "Next up" chooses among waiting lifts by the runs
around it. Ask the days at setup. Leg work steps down as run minutes climb in a
race block.

### Step 5. The watch

Turn on the Apple Watch companion once its device checks pass, count
watch-recorded runs toward the plan, then look at Garmin. This is the largest
gap against Runna and it is delivery, not programming, so it comes after the
plans are right.

## 8. Decisions needed

Each has options and the reasoning in its slice file. Recommendations are
mine. If you answer only five, answer 1, 2, 3, 9 and 10.

| #   | Decision                                                                                             | In the way                     | Recommend                                                                       |
| --- | ---------------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------- |
| 1   | A printed week you sign is the acceptance test, and reference programmes may be used to judge output | The handoffs' "no sample plan" | Yes                                                                             |
| 2   | Lifts before sets, or sets before lifts, when time is short                                          | Lift4 (5), Lift9, Lift11       | Drop or pair accessories first; 3 sets on the first two lifts                   |
| 3   | Indirect sets at half, and ceilings that never delete a lift                                         | ADR-0010, Lift12, Lift17       | Yes to both                                                                     |
| 4   | Every muscle twice a week as a first rule                                                            | Lift4 (5)                      | Big muscles twice; small ones need direct work once                             |
| 5   | A plan you have that no longer fits its time                                                         | Lift4 (5) "sets only"          | Ask: keep my lifts and show the real length, or trim to time                    |
| 6   | Setting sets and reps per lift; choosing a split                                                     | Lift4 (5), Pgm5 Q1             | Sets and reps now; split after the shape is fixed                               |
| 7   | Injury swaps start lighter at moderate reps                                                          | None                           | Yes                                                                             |
| 8   | Moving up a level updates supporting sets                                                            | Lift4 (12)                     | Offer it once, sets only                                                        |
| 9   | Marathon long-run ceiling                                                                            | Run17                          | 180 minutes, 32 km cap, 2 km rungs, never lowered mid-block                     |
| 10  | Start a run plan from the runner's own week                                                          | Planning foundations (F15)     | Yes, peak 20 to 30% above it                                                    |
| 11  | Plans without a race date, and after a race                                                          | Run9, Run9a                    | Rolling plans; for hybrids at least ask the usual run days                      |
| 12  | Pace updates for every account                                                                       | Adaptive paces is Pro          | A scheduled benchmark and one-tap update free; Pro keeps the continuous insight |
| 13  | A wider session library                                                                              | Handoff non-adoptions, R19     | Yes, mapped by distance and phase                                               |
| 14  | A rest day by default                                                                                | None (a code comment)          | Yes, doubles placed on purpose                                                  |
| 15  | "Next up" may choose by the runs around it                                                           | Lift4 (10), (11)               | Yes, within the week, nothing dropped                                           |
| 16  | Leg work steps down through a race block                                                             | Lift4 (10)                     | Yes, for everyone with a race                                                   |

## 9. A draft to react to

This is my draft, not engine output. It is priced on the engine's own clock
(`harness/zzDraft.scratch.test.ts.txt`, `evidence/draft-days.txt`) for General
fitness, intermediate, 60 minutes.

| Day    | Today's new plan                                                                                                                                       | Draft                                                                                                                                  |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Pull A | 3 lifts, 8 sets, 37 min: Pull-Ups 3x6-10, Barbell Row 3x6-10, Lat Pulldown 2x6-10                                                                      | 5 lifts, 16 sets, 57 min: Pull-Ups 4x6-10, Barbell Row 3x8-12, Lat Pulldown 3x10-14, Face Pulls 3x12-17, Dumbbell Curl 3x10-15         |
| Push A | 6 lifts, 14 sets, 57 min: Bench 3x6-10, Overhead Press 3x6-10, Dumbbell Bench 2x6-10, Pushdown 2x8-13, Overhead Extension 2x8-13, Lateral Raise 2x8-13 | 5 lifts, 16 sets, 59 min: Bench 4x6-10, Dumbbell Shoulder Press 3x8-12, Dumbbell Bench 3x8-12, Lateral Raise 3x12-17, Pushdown 3x10-15 |
| Legs A | 5 lifts, 13 sets, 58 min: Squat 3x6-10, Deadlift 3x6-10, Hack Squat 3x6-10, Cable Crunch 2x8-13, Calf Raise 2x8-13                                     | 5 lifts, 16 sets, 60 min: Squat 4x6-10, Romanian Deadlift 3x8-12, Hack Squat 3x10-14, Leg Curl 3x10-15, Calf Raise 3x10-15             |

One heavy main, nothing under 3 sets, paired days the same size. A sixth lift
at 2 sets takes each day to 63 to 68 minutes on the engine's clock, so it fits
60 only when the last two lifts are paired. The clock itself is unchecked: it
prices your ten-set Legs A at 44 minutes.

## 10. Limits

- Nothing was run on a device, in a browser or on the emulators. What screens
  draw is read from code, apart from the four screenshots.
- Plan content is real engine output. Race times, fitness drift and injury
  rates are the repo simulator's model.
- The market figures for lifting are built from published programmes and help
  pages; no app publishes sets per duration. Several running claims rest on
  second-hand reports of a paywalled article. Each slice lists what it could
  not verify.
- Your stored plan was not read. Section 2.1 is from screenshots, and the
  reasons for the Legs A weights are open.
- The six-day run side of your setup is from the repo's persona of 1 November,
  not from today's screenshots.
- The large raw outputs (the 10,080-plan sweep, the grids, the per-season
  JSON) are not committed. Copy a file from `harness/` into
  `src/features/program/__tests__/` without its `.txt` suffix and run it with
  vitest to regenerate them; each writes to `/tmp/work/train`.
