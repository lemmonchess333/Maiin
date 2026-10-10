# The training simulator

Phase 2 of the training-engine prompt (`docs/agents/training-engine-prompt.md`).
It puts simulated people through the app's own plan code, lifting and
running, one day at a time, and checks what comes out. The lifting half
came first (lemmonchess333/Maiin#2613); the running half is below, under
"The running half", and its findings are F13–F18. "The person's actions"
puts the app's buttons besides Start through what the app does with them;
its findings are F19–F22.

The code is in `src/test/sim/`, and the suites are in
`src/features/program/__tests__/sim/`.

## Running it

- `npm run test` runs it with everything else, in the `node` project, so
  it runs in all nine CI jobs: three time zones, two locales, the clock 90
  days on, and two shuffle orders.
- `npx vitest run src/features/program/__tests__/sim` runs just the
  simulator, in about 20 seconds.
- A change to what the plan does shows up as a diff in the traces
  (`__traces__/<persona>.txt`, `__traces__/run/<persona>.txt` for the run
  and hybrid personas, and `__traces__/actions/<persona>.txt` for the
  people who tap more than Start). Read the diff, then accept it with
  `-u`.
- The soak:
  `TROPOS_SIM_SEEDS=500 npx vitest run src/features/program/__tests__/sim/liftOutcomes.sim.test.ts`
  runs 500 seeds of each model variant and writes
  `test-results/sim/lifting-outcomes.md`. That file is ignored by git, so
  the report stays uncommitted. Without the variable, the outcome suite
  runs 3 seeds of each, which is enough for its plausibility checks in the
  PR gate. `runOutcomes.sim.test.ts` does the same for the runners, into
  `test-results/sim/running-outcomes.md`. `sim-soak.yml` runs both at 500
  seeds each Monday, outside the PR gate, and uploads the reports with the
  run (about 30 and 45 minutes; each suite's timeout grows with the seeds).

## What runs

Only the person is simulated. Everything the plan does is the app's own
code, called in the order the app calls it (`liftSeason.ts` has the steps):

1. Setup builds the plan (`buildOnboardingPlan`), and the loader reads it
   back (`normalizeProgramState`, `migrateProgramState`).
2. Each morning, if the person opens the app, the weekly rollover runs
   (`rollRunWeeks`, then `rollLiftWeeks`), then Home's welcome back and
   Home's card (`todaySession`).
3. Train opens the session (`sessionPrescription`). The workout screen
   starts its rows from the plan and from last time's sets
   (`buildInitialSetLogs`, `startingSetRows`, `lastSetsByExercise`).
4. The person does the sets.
5. Finish: `toCompletionSetLogs`, `toSessionProgression`, the save's
   check, `applySessionProgression` and `markDayDone`. Then the saved
   workout (`liftWorkoutExercises`), which the next session's rows read.

It is deterministic. The clock is pinned at local noon each simulated
day, days are counted with the app's local date helpers, exercise ids come
from a sequential source, and each person draws from one seeded PRNG
(`mulberry32`). The same seed gives the same trace, byte for byte, in
every CI job. One persona starts in July, so between them the personas
cross both of Auckland's clock changes.

## The person

**Their body** is the virtual lifter from lifting-evidence §4.4
(`lifter.ts`). Every number it uses is in `athleteParameters.ts`, with
its range, source, marker and grade.

- Strength grows per movement family, towards a ceiling set by training
  age. The weekly gain follows the week's effective sets, how often the
  family was trained, and how heavy. The curve is fitted so a lifter at
  the reference dose lands on §4.2's central rows.
- Reps at a load follow Nuzzo 2024's mean and spread, with one z-score
  per person.
- Day to day there is noise, and acute fatigue from the last sessions'
  hard sets.
- A set counts in full within 4 reps of failure, and less the further
  from failure it is. A plan that under-loads gives a smaller dose.
- Every run is reported under two variants: **base**, with each value at
  its table value, and **harsh**, with each weak value at its pessimistic
  end.

**How they use the app** decides more than the plan does:

- They start the share of Home's sessions their persona sets.
- They do each set to the row's target, or stop at failure.
- When a set gets less than half its target, they take weight off for the
  rest. They go down the equipment's weights, never below an empty bar,
  to the first weight they could lift for the target with 2 reps in
  reserve. The app then follows the weight most sets were done at, as it
  does for anyone.
- Persona by persona, they may also:
  - load their known working weight the first time each slot shows a lift;
  - pick up the next weight when the plan waits for them to;
  - tap Ease back in or Keep my old weights after a break;
  - not open the app on holiday, so the rollover catches up on their return.

**Not modelled yet:**

- muscle size;
- energy balance (a cut or a bulk changes nothing in the model);
- age (the over-55 persona's lifts are an assumption);
- injuries;
- logged effort;
- correcting a pre-filled set by hand.

The person's other taps (Skip, Swap, Replace, Easier today, a lighter
week) are under "The person's actions" below.

## The personas

| Persona               | Who                                                     | How they use the app                                    |
| --------------------- | ------------------------------------------------------- | ------------------------------------------------------- |
| novice-man            | §4.5's novice: bench 60, squat 70, 3 days, Get stronger | 95% of sessions                                         |
| novice-woman          | bench 30, squat 45, 3 days, general                     | 95% of sessions                                         |
| intermediate-man      | §4.5's bench of 100 kg wanting +10 kg, 4 days, strength | 95%; loads what he knows he can do                      |
| intermediate-woman    | §4.5's size persona, 4 days, Build muscle, lean bulk    | 95%; loads what she knows                               |
| advanced-man          | squat 200, 5 days, strength                             | 95%; loads what he knows                                |
| powerbuilder-size     | squat 150, 4 days, run on Build muscle                  | 90%; loads what he knows; picks up the next weight      |
| powerbuilder-strength | the same person on Get stronger                         | the same                                                |
| light-trainer         | a novice planning 4 days                                | does about 2 of 4                                       |
| dumbbell-beginner     | 2 days, 30 minutes, dumbbells at home, a cut            | 90%                                                     |
| layoff-eases-back     | intermediate, 3 days                                    | 4 weeks off (weeks 9–12), app closed; then Ease back in |
| layoff-keeps-weights  | the same                                                | the same break; then Keep my old weights                |
| off-sick              | novice, 3 days                                          | 6 weeks off sick (weeks 7–12), still opening the app    |
| holidays              | intermediate, 4 days, Build muscle                      | a week away twice (weeks 8 and 17), app closed          |
| cutting               | intermediate, 3 days, Lose fat, a cut                   | 90%; loads what he knows                                |
| over-55               | over 55, new to lifting, 3 days; starts in July         | 90%                                                     |

## The checks

### The app's rules (hard, `Rule` in `liftSeason.ts`)

Each is a promise the app's own code makes. A persona may break only the
rules listed against it in `KNOWN_RULE_FAILURES`, and a listed rule that
stops failing has to come off the list.

| Rule          | Broken when                                                                                                                 |
| ------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `bad-number`  | a plan weight, set count or rep target is not a number                                                                      |
| `no-load`     | a loaded lift is at 0 kg                                                                                                    |
| `off-grid`    | a weight the equipment doesn't come in (`loadSteps.ts`)                                                                     |
| `below-bar`   | a barbell lift lighter than the 20 kg bar                                                                                   |
| `normalise`   | normalising the plan a second time changes it                                                                               |
| `home-train`  | Home's card and Train's next session differ (ADR-0002)                                                                      |
| `over-time`   | a session the app estimates past the length the person chose (Lift4 (5))                                                    |
| `week-sets`   | a week that doesn't start from the plan's own sets: half in a lighter week, one fewer in the first week back, otherwise all |
| `stash`       | a lighter week's stashed weight or reps left after it                                                                       |
| `week-number` | the week number moves after an untrained week, or holds after a trained one                                                 |
| `not-landed`  | the save refuses a session finished the day it started                                                                      |
| `unexplained` | a lift's numbers change in a way the rules sheet (`liftRules.ts`) doesn't allow                                             |

The `unexplained` check is written from the rules sheet, not from the
engine, so the two can disagree. Its own unit test
(`liftRulesCheck.test.ts`) shows it catching each forbidden change.
Changing the engine to lower a lift on its first miss sets it off in the
first simulated week.

**Today:** no persona breaks `unexplained`, `week-number`, `week-sets`,
`stash`, `home-train`, `not-landed`, `normalise`, `no-load`, `off-grid` or
`bad-number`. Two rules are broken:

- `below-bar` (F10), in 11 of the 15 personas;
- `over-time` (F8), in 5.

### The traces (`__traces__/`)

There is one per persona, at seed 1 under the base model. Each week shows:

- the plan week and its phase, and the sessions done and offered;
- the app's time estimates;
- for each tracked lift:
  - the plan's heaviest prescription;
  - the true 1RM, and the app's estimate from the best set logged;
  - every session's sets by weight, and what the session did to the plan:
    `step`, `reps`, `hold`, `miss`, `LOWERED`, or `own` (the person chose
    the weight);
- the sets and days each muscle got;
- events: a weight loaded, weight taken off, Ease back in.

A summary at the end counts each lift's steps, rep climbs, holds, misses,
lowerings and the person's own weights.

### The coaching checks (`liftCoaching.ts`)

These are judgements, held in a ratchet like `planSweep.golden.test.ts`'s
(`KNOWN_COACHING`):

- `stall`: a lift's plan numbers, weight and target reps, stay put for 8 or
  more of its sessions while the person has 2 or more reps to spare. A rep
  target climbing through its range is progress, and a lifter at their
  limit is the plateau the rules sheet answers with a variation.
- `misses`: a tracked lift missed or lowered in more than a third of its
  sessions.
- `acsm-coverage`: a fully trained week that leaves out a major muscle
  group. ACSM 2026 asks for all of them, at least twice a week in total.
- `acsm-heavy`: on a strength plan, a main lift with two sets at 80% of 1RM
  or more in fewer than half the fully trained weeks after week 6.
- `acsm-size`: on a size plan, a major muscle group under 10 sets in most
  fully trained weeks.

**Today:** no `acsm-coverage` or `acsm-heavy` findings. The others are
listed under Findings below.

### Outcomes (`liftOutcomes.sim.test.ts`)

Each tracked lift's gain in true 1RM, across seeds and both variants, is
reported against lifting-evidence §4.2. It is asserted only as broad
plausibility, because the model is a hypothesis and §4.2's own intervals
are model outputs:

- no median falls by more than 10% (20% with weeks off);
- none passes twice §4.2's 80% upper bound for the level.

At 20 seeds of each variant (`TROPOS_SIM_SEEDS=20`, a minute), every
persona passes. The 26-week medians are below, as the base model's median
and the harsh model's, against §4.2's central value for the level. A lift
the persona doesn't do shows as -.

| Persona               | Squat       | Bench       | Deadlift    | Press       | §4.2 (lower / upper) |
| --------------------- | ----------- | ----------- | ----------- | ----------- | -------------------- |
| novice-man            | 39.2 / 32.7 | 24.7 / 20.2 | 39.3 / 32.6 | 19.8 / 14.7 | 38 / 30              |
| novice-woman          | 37.5 / 31.9 | 26.5 / 21.1 | 38.3 / 31.8 | 17.4 / 14.8 | 38 / 30              |
| light-trainer         | 23.6 / 18.3 | 16.0 / 11.9 | 25.3 / 18.0 | 17.8 / 12.8 | 38 / 30              |
| off-sick              | 31.8 / 24.6 | 19.7 / 15.1 | 31.6 / 24.7 | 14.6 / 10.1 | 38 / 30              |
| over-55               | 37.0 / 31.1 | 26.1 / 20.8 | 37.7 / 31.2 | 16.0 / 0.2  | 38 / 30              |
| intermediate-man      | 9.0 / 6.3   | 7.5 / 5.0   | 9.0 / 6.2   | 7.7 / 5.2   | 9 / 8                |
| intermediate-woman    | 8.9 / 6.3   | 7.4 / 5.0   | 8.9 / 6.2   | 7.6 / 5.2   | 9 / 8                |
| powerbuilder-size     | 8.8 / 6.1   | 7.3 / 4.9   | 8.7 / 6.0   | 7.4 / 5.0   | 9 / 8                |
| powerbuilder-strength | 8.8 / 6.2   | 7.3 / 4.9   | 8.8 / 6.1   | 7.5 / 5.1   | 9 / 8                |
| layoff-eases-back     | 8.5 / 5.5   | 6.5 / 4.0   | 8.4 / 5.3   | 5.1 / 3.1   | 9 / 8                |
| layoff-keeps-weights  | 8.6 / 5.7   | 6.6 / 4.1   | 8.5 / 5.7   | 5.2 / 3.2   | 9 / 8                |
| holidays              | 8.4 / 5.6   | 6.8 / 4.5   | 8.3 / 5.5   | 7.0 / 4.5   | 9 / 8                |
| cutting               | 9.3 / 6.5   | 7.1 / 4.7   | 9.3 / 6.6   | 5.5 / 3.1   | 9 / 8                |
| advanced-man          | 3.9 / 2.4   | 3.0 / 1.7   | 3.8 / 2.3   | 3.0 / 1.8   | 4 / 3                |

The dumbbell beginner's lifts are a goblet squat 19.4 / 15.5, a dumbbell
RDL 19.3 / 15.6, a dumbbell bench 16.7 / 11.9 and a dumbbell press
14.4 / 11.4, against 38 and 30.

What the table says:

- **Where the plan doses fully, the model lands on §4.2's centre.** That's
  the base model's squat and deadlift at every level, which is what the
  calibration promised. The harsh model runs a sixth lower for novices and
  about a third lower for intermediates and the advanced lifter.
- **Novice upper body falls short:** a bench of about 25 against 30, and a
  press of 17–20. The 3-day plans train the bench twice a week and the
  press once, and the press moves in 2.5 kg steps on a 30–40 kg lift (F2,
  F4). Misses on the novice presses run from 22 to 55 of every 100
  sessions.
- **The 2-day, 30-minute dumbbell beginner gets about half of §4.2:**
  two short days, then F9's waits from about week 8.
- **A light trainer doing about half the sessions** gets 60–65% of the
  novice man's squat, bench and deadlift gains.
- **The over-55 persona's press** is a 15 kg barbell, below the bar
  (F10). Under the harsh model, the person mostly can't lift it.

## The running half

The run and hybrid personas live their plans through the app's run code
and its server's, on the same day loop as the lifting: `liftSeason.ts`
drives both, and `runSeason.ts` has the run side.

### What runs

Each simulated day, in this order:

1. **The server's morning.** The daily race sweep
   (`decideReconciliationActions`: the no-show, the recovery exit, the
   return to freeform) and, on a Monday, the fell-behind check
   (`decideFellBehindFlag`), required from `functions/lib/`
   (lemmonchess333/Maiin#2616). Each write lands as Firestore would apply
   it: run days replaced, the run plan and the profile merged. The sweep
   runs before the app opens on each simulated local day. That is true in
   Europe and a simplification further east and west, kept so a day
   happens in the same order in every time zone.
2. **Opening the app.** The rollover gets the layoff class from the 20
   latest runs (`layoffFromRuns`, as `fetchRecentLayoff` reads them), and
   `raceWeekNeedsBuilding` is asked after it. The Programme page's
   benchmark derive runs (`resolveAutoDeriveBenchmark`). Home's card gets
   the app's claim map (`claimableRuns`, `claimMapFor`,
   lemmonchess333/Maiin#2615).
3. **The run.** Home's card's run, or on race day the race, from Train
   when Home shows none. The run screen sets it out with Run.tsx's inputs
   (`computePlanMetadata`, then `finalisePlanMetadata` at Start), the
   runner runs it, and the saved run (`runDocument`, read back by
   `parseSavedRun`) goes to the server's recovery entry
   (`decideRecoveryEntry`, as `onRunCreated` calls it).
4. **A hybrid's lift** comes after the run, or before it (`runsFirst`). A
   long or hard run in the 24 hours before the lift rides its finish
   (`isHardRun`, as `useHardRunBefore` reads it), and a lift day that loaded
   the legs (`isLowerBodyDay`) dampens the next 48 hours' quality running.

### The runner (`runner.ts`)

running-evidence §6.2–6.7. Every number is in `athleteParameters.ts`'s
`RUNNER` table, with its range, source, marker and grade.

- **Fitness and fatigue** are running averages of weekly effort-minutes
  over τ₁ 42 days and τ₂ 10. A quality minute counts as 1.3 easy ones,
  the app's own `QUALITY_RUN_FACTOR`.
- **True VDOT** is an untrained base plus a concave curve of fitness
  (headroom 15, scale 250 minutes a week), times a responder draw (log-SD
  0.4). On the day, freshness adds up to 2.6% and fatigue takes as much.
- **Paces** come from the app's own Daniels–Gilbert bands
  (`trainingBands`). A target faster than the runner can hold is run at
  what they can.
- **Injury:** 30 per 1000 h, falling to 7.7 over a novice's first 13
  weeks; × Frandsen's single-run spikes (1.64 for 10–30% past the month's
  longest run, 1.52 to double it, 2.28 past that); × 1.5 for a year after
  an injury. Kluitenberg's tiers decide whether it halves running for a
  week or stops it for days or weeks. A runner arrives with a longest run
  of a third of their weekly minutes, unless the persona says otherwise.
- **Race day** is the race the day's VDOT runs, with Vickers & Vertosick's
  low-volume correction on a marathon (§6.7 item 7).
- **Three variants:** base; harsh (fitness fading faster, fatigue
  lingering, less headroom, injuries at the novice rate's top); and
  intensity (a quality minute at 2.5 easy ones, TRIMP's interval
  weighting), which shows how much an outcome rests on what the model
  gives intensity.
- **Not modelled:** heat, terrain, economy, run-walk, illness beyond a
  break the persona takes, and how the runner feels.

**How they use the app:**

- They go out for the share of Home's planned runs their persona sets.
  On race day they always race, unless injured.
- They run each session as the run screen sets it out: its segments, its
  distance or time, or else the session's own length. They run at their
  own band's pace, or at the target when they can hold it.
- When their persona says so, they enter a race result and a goal time in
  Settings, and accept a benchmark the app derives.
- A freeform runner runs their own weekdays.

### The personas

| Persona              | Who                                                                                               | How they use the app                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| couch-to-5k          | §6.5 A: sedentary (VDOT 24, 20 minutes a week), "New to running", a 5K in 11 weeks, 3 runs a week | sets up on a Thursday; 80% of runs                                         |
| half-3-days          | VDOT 42 on 175 minutes a week, a half in 14 weeks on 3 run days                                   | 90%; entered a 5K                                                          |
| sub-3-30             | §6.5 C: a 3:45 marathoner on about 48 km a week, sub-3:30 in 16 weeks, 5 run days                 | 92%; entered the 3:45 and the goal                                         |
| sick-six-weeks       | §6.5 D: VDOT 44 on 220 minutes a week, a 10K in 20 weeks, 4 run days                              | 90%; 6 weeks off sick (weeks 6–11), app closed                             |
| new-runner-marathon  | "New to running" at setup's default of one run a week, a marathon in 20 weeks                     | 85%                                                                        |
| freeform-runner      | VDOT 38, no plan, 20 weeks                                                                        | 40, 40 and 75 minutes on Tuesday, Thursday and Sunday                      |
| year-out-marathon    | §6.5 B: a 50-minute 10K on 30 km a week, a first marathon in 52 weeks, 3 lifts and 4 runs         | 85% of each; runs before lifting; crosses both of Auckland's clock changes |
| hybrid-3-4-(no-)trim | VDOT 40, 3 lifts and 4 runs, a half in 16 weeks; the race leg trim on, and off                    | 90%; runs before lifting                                                   |
| hybrid-2-3-(no-)trim | VDOT 36, 2 lifts and 3 runs, a 10K in 12 weeks; the leg trim on, and off                          | 85% of runs, 90% of lifts; lifts before running                            |

Each season runs to the race, through its recovery and three weeks on,
where the plan has to have let the race go.

### The checks

The app's rules gain six (`Rule` in `liftSeason.ts`), held the same way:

| Rule              | Broken when                                                                |
| ----------------- | -------------------------------------------------------------------------- |
| `before-plan`     | a planned run is dated before the plan was made                            |
| `after-race`      | a planned run comes after race day, outside recovery                       |
| `race-day-card`   | on race day, Home's card shows no run                                      |
| `not-counted`     | a planned run done on its day is not counted by Home                       |
| `race-unresolved` | two weeks after the race (or its recovery), the plan still prepares for it |
| `race-week-stale` | after the rollover, this week's race runs need building again              |
| `race-weeks`      | a hybrid's lifting out of Lift4 (10)'s race weeks, read off the calendar   |
| `verdict-slow`    | the run summary calls a tempo slow whose tempo pace the runner held        |

`race-weeks` holds Lift4 (10) against the calendar rather than the run
plan's own count: the two weeks before race week are lighter, race week is
one session with none from two days out, and the week after is light. On
a yes at race setup the leg lifts are trimmed in the run plan's build
weeks, and never on a no. `verdict-slow` reads the run summary's verdict
(`plannedRunVerdict`, lemmonchess333/Maiin#2618), which each simulated run
saves as the app does.

**Today:** no persona breaks `after-race`, `race-unresolved`,
`race-week-stale` or `race-weeks`. The others are F13, F14, F16 and F22
below.

The coaching checks (`runCoaching.ts`) are judgements from running-evidence
§5.20, §2 and §4.5 and running-engine-audit §7, in the same ratchet:

- `quality-cap`: more than two quality sessions besides the long run in a
  week;
- `novice-quality`: tempo or intervals in a new runner's first six weeks;
- `back-to-back`: two demanding days in a row (a long run, tempo,
  intervals, a race, or an easy run of an hour or more);
- `spike`: a run more than 10% longer than the month's longest (the
  single-run guard);
- `volume-jump`: a week planning over 25% more than the last, outside race
  week;
- `taper-long`: a half or marathon plan with no long run in the two weeks
  before race week;
- `taper-cut`: a taper whose first week plans under half the last build
  week;
- `long-share`: the long run over half the week's minutes in most weeks;
- `one-run-week`: race preparation on one run a week;
- `run-walk`: a new runner's first week asking for more than 20 minutes at
  a time;
- `under-dose`: the plan's first full month under 80% of what the runner
  already ran;
- `derived-low`: a derived benchmark three or more VDOT under the runner;
- `nag-after-race`: the server saying they fell behind after their race;
- `easy-nag`: the run summary telling them to slow down on most easy and
  long runs.

**Today:** no `quality-cap` or `nag-after-race` finding; the rest are in
F15, F17 and F18.

**The traces** (`__traces__/run/`), one per persona at seed 1 under the
base model: each week's plan phase and week, the planned runs by day,
their planned minutes, long run and quality sessions, and how many Home
counted; each run as run (distance, minutes, pace, the run summary's
verdict, NOT COUNTED, a target too fast, an injury, a race's finish); the
week's minutes, kilometres,
easy share and its longest run against the month's; and the runner's
true VDOT and fitness, with their own easy band against the one the app
prescribed. A hybrid's trace has its lifting after.

### Outcomes (`runOutcomes.sim.test.ts`)

The change in true VDOT by race morning, the finish, the share of seasons
with an injury and the share of planned runs Home counted, across seeds
and the three variants. Asserted only as broad plausibility: the median
change between −4 and +6, and a median race no slower than twice its
start-of-season equivalent. At 20 seeds of each:

| Persona              | VDOT change (base / harsh / intensity) | Finish (median [10th–90th]) | Injured | Counted | Expected (§6.1, §6.5)                     |
| -------------------- | -------------------------------------- | --------------------------- | ------- | ------- | ----------------------------------------- |
| couch-to-5k          | +2.9 / +2.1 / +3.4                     | 33:57 [31:50–35:37]         | 42%     | 82%     | first 5K 30–40 min; 10–25% injured        |
| half-3-days          | −1.1 / −0.9 / −0.6                     | 1:46:25 [1:44:23–1:49:04]   | 20%     | 84%     | +1.5–3 VDOT                               |
| sub-3-30             | −1.6 / −1.5 / −0.9                     | 3:48:36 [3:44:36–3:58:38]   | 47%     | 90%     | +1.5–3; sub-3:30 for 10–25%               |
| sick-six-weeks       | −2.6 / −1.9 / −2.3                     | 48:20 [47:03–50:14]         | 25%     | 93%     | −7% to −16% VO2max off, rebuilt in ~6 wks |
| new-runner-marathon  | +0.8 / +0.4 / +0.8                     | 5:11:42 [5:04:11–5:18:40]   | 80%     | 99%     | none                                      |
| freeform-runner      | +0.2 / +0.2 / +0.2                     | no race                     | 50%     | -       | little change                             |
| year-out-marathon    | −0.4 / −0.6 / −0.1                     | 4:10:31 [4:04:44–4:17:55]   | 55%     | 87%     | +2 to +5; 3:45–3:50, 80% 3:35–4:10        |
| hybrid-3-4-(no-)trim | −0.3 / −0.3 / +0.1                     | 1:49:21 [1:47:09–1:51:59]   | 27%     | 88%     | +1.5–3                                    |
| hybrid-2-3-(no-)trim | −0.2 / −0.2 / +0.2                     | 54:15 [53:06–55:41]         | 15%     | 83%     | +1–3                                      |

What the table says, with the model's limits in view:

- **The beginner gains as §6.5 A expects:** +2.9 VDOT, and a first 5K of
  34 minutes, inside 30–40. But 42% of seasons have an injury against
  10–25%: the plan gives about two hours of continuous running a week
  from week 1, not Couch to 5K's run-walk (F15, F18).
- **Recreational runners lose fitness by race day:** −0.3 to −1.6 VDOT on
  the base model against §6.1's +1.5–3, and −0.9 to +0.2 crediting quality
  sessions at their top weight. The plan's dose is most of it, and the
  dose is the plan's, not the model's: weeks 2–5 average 57–75% of what
  the running-only runners already ran (F15), and the taper cuts the week by about 60% in
  one step (F18). The model also prices a taper low (+0.5% where §6.7
  expects about 2.6%), so race-morning VDOT understates what the taper
  adds.
- **No sub-3:30:** a median 3:48:36 and no seed under 3:30, against §6.5
  C's 10–25%.
- **The year-out marathoner gets −0.4 VDOT for the year and a 4:10,** the
  slow end of §6.5 B's 80% range. The plan's peak is 353 minutes in the
  last build weeks, after 20 weeks of base below the runner's 195.
- **One run a week to a marathon injures 80% of seasons,** on single runs
  up to ten times the month's longest.
- **Home counts 82–99% of planned runs done;** every miss is a quality
  session (F13).
- **The leg trim changes only the lifting.** Both hybrid pairs run the
  same plan; the trim's fewer leg sets bring a 3-day hybrid's sessions in
  under their length more often (`over-time` 2 times against 6).

### Calibration status

| Target (running-evidence §6.1, §6.4, §6.7 item 8)                         | Status                                                                                       |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Recreational, 16 weeks adding 90 minutes a week: +1.5–3 VDOT              | Met: +2.1 (`runnerCalibration.test.ts`)                                                      |
| Well-trained, 16 weeks: about +2% of race time (+0.5–2 VDOT at 55)        | Met: +0.9                                                                                    |
| Novice, 12 weeks from 100 to 150 minutes: +1.5–3 VDOT                     | Met: +1.6                                                                                    |
| Detraining after 1, 3, 6 and 10 weeks off (§6.4)                          | Met: 0%, 3.2%, 7.5%, 11.3%                                                                   |
| A strict taper's 2.6% over a relaxed one                                  | Missed, pinned: +0.5%. Fitness follows minutes, so a taper loses some                        |
| Recreational trials at about constant volume (Festa 2020: +3% in 8 weeks) | Not reproduced: the model credits volume more than intensity; the intensity variant spans it |
| §6.3's injury proportions, each by its definition                         | Not checked against a programme's exposure; the C25K result runs high                        |
| Riegel optimistic by 10 minutes for half of recreational marathoners      | Built in: Vickers & Vertosick's correction on race day                                       |

## The person's actions

The person's taps besides Start go through what the app does with them
(`actionPersonas.ts`, `personActions.sim.test.ts`). Each persona is a
lifting or running one tapping one thing more, so its trace reads against
theirs.

A tap the app sends as a programme command runs through the server's
reducer and then the transaction's top-level allow-list, as the
`applyProgramCommand` callable runs them (`commands.ts`, over
`functions/lib/programCommands.js` and `programStateSanitizer.js`). The
plan afterwards is the stored document as the client reads it back: raw,
or loaded again after a lighter week, as `sendDeloadCommand` does. A
refusal leaves the plan as it was and fails `refused`. A result the
transaction couldn't store fails `unstorable`: a key the allow-list drops,
or an `undefined`, which the Admin SDK's `tx.set` rejects. The client's own
writes strip them and the server's don't, so the state sent is stripped
first, as the client's last write stored it.

| Action                   | What the app does                                                                                        | Persona                                                                   |
| ------------------------ | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Skip a lift              | `skipWorkoutDay`, from Home's day sheet                                                                  | light-trainer-skips, on each lift day they don't train                    |
| Swap for today, kept     | the session's swap (`swappedForToday`), then Finish's question; kept, the new lift takes the slot        | swaps-bench-keeps: dumbbells for the barbell bench from week 3            |
| Swap for today, not kept | the same; not kept, the planned lift stays as it was                                                     | swaps-squat-today: the leg press for the squat, every session from week 5 |
| Replace Exercise         | `replaceExercise`, at `weightAfterExerciseSwap`'s start                                                  | replaces-row: a seated row for the barbell row in week 2                  |
| Easier today             | `buildEasierSession`'s copy of the day; the plan moves at Finish, up only                                | dumbbell-easier-days, barbell-easier-days: a third of sessions            |
| Take a lighter week      | Train's menu, where `lighterWeekAllowed` offers it: `applyDeloadWeek`, with `planDeloadWeek`'s run swaps | lighter-after-misses (3 misses the week before), hybrid-lighter-week (2)  |
| Move the long run        | `moveRunDay`, to a day `resolveRunMoveOptions` allows                                                    | half-moves-long-run: to Sunday each week                                  |
| Skip a run               | `transitionRunDay` to skipped                                                                            | half-moves-long-run: each run they miss                                   |
| Not now                  | the fell-behind sheet's `dismissFellBehindPrompt`                                                        | half-moves-long-run                                                       |

The app's own race-rest skips (`raceRestSkips`, Lift4 (10)) run for
everyone with a race: from two days out, each session not done is skipped
through the same command, after the rollovers.

Rules added with them:

| Rule               | Broken when                                                                                         |
| ------------------ | --------------------------------------------------------------------------------------------------- |
| `refused`          | the server refuses a command the app sent                                                           |
| `unstorable`       | a command's result the transaction couldn't store                                                   |
| `session-off-grid` | the workout screen sets out a weight the equipment doesn't come in, or a barbell lift under the bar |
| `run-day-card`     | a run planned for today, not a race, that Home's card doesn't show                                  |

**Today:** the server accepted and could store all 73 commands: 42 lift
skips, a replace, 13 lighter weeks, 11 moves, 4 run skips and 2 "Not now".
The 22 swaps and 32 easier sessions, which stay on the phone until Finish,
saved as the plan's rules say. The actions' own findings are F20 and F21;
the rest are their base personas'.

## Calibration status (lifting)

| Target (lifting-evidence §4.2, §4.4)                                                         | Status                                                                                                                                                  |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| §4.2's central rows at the reference dose                                                    | Fitted by construction: `STRENGTH_CURVE` is within 0.5% of each row at 8, 16, 26 and 52 weeks, at 8 effective sets a week, twice a week, 8RM or heavier |
| The curve's shape (Latella 2024, Steele 2023)                                                | Spanned, not checked: γ runs from 1.25 (base) to 1.5 (harsh)                                                                                            |
| Trained rates (Latella 2020)                                                                 | Not checked                                                                                                                                             |
| Helms 2018's upper tail (about 36% chance of +10% bench in 8 weeks after a programme change) | Not checked: it needs a bench-specific block, which no plan here runs                                                                                   |
| Ahtiainen 2016's spread                                                                      | Not checked: the responder spread (log-SD 0.35) is an assumption                                                                                        |
| Lift4's own miss rates                                                                       | Reported: misses per 100 sessions, in the outcome table                                                                                                 |
| The owner's coaching anchors, at the 90th–95th percentile                                    | Not checked: they are 52-week and two-year anchors, and the seasons run 26 weeks                                                                        |
| §4.3 muscle size                                                                             | Not modelled                                                                                                                                            |

## Findings

Numbered as found. Each pinned one sits in a ratchet, so its fix has to
take it out.

| #   | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Status                                                                                                                                 |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | New plans started dumbbell lifts at 2.5 or 7.5 kg, which a dumbbell rack doesn't have. A scan of 1,800 setups found eleven lifts started off the rack                                                                                                                                                                                                                                                                                                                                                                        | Fixed in lemmonchess333/Maiin#2610, merged into this branch                                                                            |
| F2  | A light barbell press waits at a stretched rep target: the novice woman's 15 kg press sat at 14 reps for 19 sessions, with 3–9 in reserve                                                                                                                                                                                                                                                                                                                                                                                    | Part of F9                                                                                                                             |
| F3  | A high-rep slot stalls at its ceiling when the sets don't all reach the top (20, 20, 18)                                                                                                                                                                                                                                                                                                                                                                                                                                     | Part of F9; at the lifter's limit, so not flagged                                                                                      |
| F4  | Linear steps outrun slow-gaining lifts: novice presses miss or come down in 38–55 of every 100 sessions, the light trainer's squat and press in a third, the over-55's bench, deadlift and press                                                                                                                                                                                                                                                                                                                             | Pinned (`misses`)                                                                                                                      |
| F5  | `programTypes.ts`'s `repRangeMax` comment says generated plans don't set it; they do                                                                                                                                                                                                                                                                                                                                                                                                                                         | For the lifting pass                                                                                                                   |
| F6  | The client's Monday rollover after race day, and after recovery, deletes the run plan before the server's no-show and recovery-exit checks can read it. Every race persona ends its season still in race prep for a race that is over, and the Monday server check then tells them weekly that they fell behind                                                                                                                                                                                                              | Fixed in lemmonchess333/Maiin#2646, on main: each race persona's recovery ends on the server, and no one is told they fell behind      |
| F7  | The loader's set floor undid the time fit: every load raised a main lift's 2 sets to 3, so the 30-minute dumbbell beginner ran 31–33 minutes                                                                                                                                                                                                                                                                                                                                                                                 | Fixed in lemmonchess333/Maiin#2612, merged into this branch                                                                            |
| F8  | The time fit prices warm-ups at the starting weight, but a light barbell lift gains warm-up sets as it grows: a press under 50 kg gets the empty bar and another ramp step once past it. Fitted 60-minute sessions run 61–63                                                                                                                                                                                                                                                                                                 | Pinned (`over-time`)                                                                                                                   |
| F9  | A light lift waits for the person. The plan's own step is at most 15%, so on a 2.5 kg grid nothing under 16.7 kg steps by itself, nor dumbbells from 10 to 17.5 kg. The reps stretch, then wait for the person to pick up the next weight. Someone who doesn't sits there: a 10 kg leg curl at 20 reps for 15 sessions with 9 in reserve, and every dumbbell main of the 2-day beginner from about week 8                                                                                                                    | Pinned (`stall`)                                                                                                                       |
| F10 | Barbell lifts planned below the bar: curls at 5–17.5 kg, skull crushers at 15–17.5 kg, a weak lifter's press at 12.5–15 kg. The barbell grid starts at 0, and starting loads from setup aren't floored at the bar                                                                                                                                                                                                                                                                                                            | Pinned (`below-bar`); swap or floor is an owner call                                                                                   |
| F11 | The workout screen starts a lift's rows from that exercise's last session, not that slot's. When one exercise is on two days, each day's rows take the other day's off-weight sets: the novice man's heavy squat day opens at 65 kg × 9, the light day's set. A failed set's reps also carry over as the next session's target for that set                                                                                                                                                                                  | Fix in lemmonchess333/Maiin#2614; pinned (`stall:squat`) until it lands                                                                |
| F12 | Size plans give the quads 9 sets a week, under ACSM 2026's 10                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Pinned (`acsm-size:quads`)                                                                                                             |
| F13 | Home counts a tempo or interval day only when the whole run averaged under 4:30/km (`runClaims.ts`'s pace bar). None of the 86 quality sessions the personas ran counted, the sub-3:30 runner's included; the race-day check already says why that bar is wrong for races                                                                                                                                                                                                                                                    | Pinned (`not-counted`)                                                                                                                 |
| F14 | Setup's week schedules never put a run on a Sunday (runner-only at 1–6 days; hybrids at 2+2, 2+3, 3+2, 3+3 and 4+3), and Home shows a run only on a run day, so a Sunday race reads as a rest day: 7 of the 10 race personas. Runner-only long runs land on a Monday                                                                                                                                                                                                                                                         | Pinned (`race-day-card`)                                                                                                               |
| F15 | The plan doesn't size from the runner, and setup never asks how much they run: weeks 2–5 average 57–75% of what the running-only experienced runners already ran (126 of 220 minutes for the 10K runner) and 86–90% for the year-out marathoner and the hybrids, against 2.6 and 5.8 times what the two beginners ran                                                                                                                                                                                                        | Pinned (`under-dose`)                                                                                                                  |
| F16 | A plan made mid-week writes that week's earlier runs: made on a Thursday, it plans that Monday and Wednesday. The prompt's question, confirmed                                                                                                                                                                                                                                                                                                                                                                               | Pinned (`before-plan`)                                                                                                                 |
| F17 | The benchmark the app derives takes the best of a runner's first easy runs as a race: 6.7–9.7 VDOT under the runner. It lands pending, so prescriptions wait, but measurement surfaces use it at once. The run summary is one: it then tells the runner to slow down on every easy and long run it judges, 20 for couch-to-5k, 18 for the new marathoner and 29 for each 2+3 hybrid                                                                                                                                          | Pinned (`derived-low`, `easy-nag`)                                                                                                     |
| F19 | Train's "Take a lighter week" banner comes from the Performance Index alone (`shouldSuggestDeload`) and doesn't ask `lighterWeekAllowed`. In the week after a lighter week, or a first week back, its button sends a command the server refuses (`applyDeloadWeek`'s preconditions), and the person gets an error for the app's own suggestion. Found reading the code                                                                                                                                                       | Not pinned: the simulator doesn't run the Performance Index yet                                                                        |
| F20 | "Easier today" takes 85% of each weight to the nearest 2.5 kg, whatever the equipment (`deloadWeight`). The dumbbell plan's easier sessions set out 13 weights in 10 sessions that a rack doesn't have (7.5 kg bench and row dumbbells, a 2.5 kg curl); a light barbell plan's bench and row went to 17.5 kg, under the bar, 4 times in 22                                                                                                                                                                                   | Pinned (`session-off-grid`)                                                                                                            |
| F21 | A run moved to a day that isn't one of the plan's run days is dated there, and Home's card shows a rest day. The half marathoner moved the long run to Sunday 11 times, and Home showed a rest day each time; the simulator has them start it from Train. It is F14's weekday reading again                                                                                                                                                                                                                                  | Pinned (`run-day-card`)                                                                                                                |
| F22 | The run summary judges a tempo by the whole run's average, warm-up and cool-down included (running-engine-audit §2.3, the prompt's Phase 5a): 27 of the 29 tempos run by the running personas who entered a benchmark read slow, 14 of them with the tempo pace held; with a derived benchmark (F17), tempos read fast                                                                                                                                                                                                       | Pinned (`verdict-slow`)                                                                                                                |
| F18 | The plan's shape, as running-engine-audit §7 found it: long runs step past the single-run guard in build (up to 1.76 times the month's longest), a marathon comes 28 or more days after the last long run (6.9 and 10.6 times the month's longest), weeks jump over 25%, demanding days sit back to back, the taper cuts about 60% in one step and holds it, long runs fill over half the week on 3 days or fewer, and a new runner gets continuous runs from week 1, intervals from week 5 and a marathon on one run a week | Pinned (`spike`, `volume-jump`, `back-to-back`, `taper-cut`, `taper-long`, `long-share`, `run-walk`, `novice-quality`, `one-run-week`) |

## Not covered yet

- **Home against Train on runs:** Train's run surface has no pure
  resolver to compare with yet.
- **The "Take this week easier?" nudge:** its inputs are put together
  inline in `ProgrammeRunSection.tsx`, so it needs a seam before the
  simulator can show it and have the person answer it. So does the
  post-run effort check-in it also reads.
- **The Performance Index:** the server's weekly scores aren't computed,
  so its lighter-week banner (F19) and Home's performance card aren't
  shown.
- **Pace Insight**, and Adjust this week's "Re-plan from today" and the
  fell-behind sheet's "Rebuild my plan" (`realignRacePlan`).
- **Express and time-budget sessions**, the other workout-screen variants
  beside Easier today.
