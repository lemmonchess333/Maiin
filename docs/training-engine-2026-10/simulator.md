# The lifting simulator

Phase 2 of the training-engine prompt (`docs/agents/training-engine-prompt.md`),
its lifting half. It puts simulated people through 26 weeks of the app's
own plan code, one day at a time, and checks what comes out. The running
half follows in its own PR.

The code is in `src/test/sim/`, and the suites are in
`src/features/program/__tests__/sim/`.

## Running it

- `npm run test` runs it with everything else, in the `node` project, so
  it runs in all nine CI jobs: three time zones, two locales, the clock 90
  days on, and two shuffle orders.
- `npx vitest run src/features/program/__tests__/sim` runs just the
  simulator, in about 20 seconds.
- A change to what the plan does shows up as a diff in the traces
  (`__traces__/<persona>.txt`). Read the diff, then accept it with `-u`.
- The soak:
  `TROPOS_SIM_SEEDS=500 npx vitest run src/features/program/__tests__/sim/liftOutcomes.sim.test.ts`
  runs 500 seeds of each model variant and writes
  `test-results/sim/lifting-outcomes.md`. That file is ignored by git, so
  the report stays uncommitted. Without the variable, the outcome suite
  runs 3 seeds of each, which is enough for its plausibility checks in the
  PR gate.

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
- correcting a pre-filled set by hand;
- the person's other actions: Swap, Skip, Easier today, Take a lighter
  week, Adjust this week;
- running.

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

## Calibration status

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

| #   | What                                                                                                                                                                                                                                                                                                                                                                                                      | Status                                                      |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| F1  | New plans started dumbbell lifts at 2.5 or 7.5 kg, which a dumbbell rack doesn't have. A scan of 1,800 setups found eleven lifts started off the rack                                                                                                                                                                                                                                                     | Fixed in lemmonchess333/Maiin#2610, merged into this branch |
| F2  | A light barbell press waits at a stretched rep target: the novice woman's 15 kg press sat at 14 reps for 19 sessions, with 3–9 in reserve                                                                                                                                                                                                                                                                 | Part of F9                                                  |
| F3  | A high-rep slot stalls at its ceiling when the sets don't all reach the top (20, 20, 18)                                                                                                                                                                                                                                                                                                                  | Part of F9; at the lifter's limit, so not flagged           |
| F4  | Linear steps outrun slow-gaining lifts: novice presses miss or come down in 38–55 of every 100 sessions, the light trainer's squat and press in a third, the over-55's bench, deadlift and press                                                                                                                                                                                                          | Pinned (`misses`)                                           |
| F5  | `programTypes.ts`'s `repRangeMax` comment says generated plans don't set it; they do                                                                                                                                                                                                                                                                                                                      | For the lifting pass                                        |
| F6  | The client's Monday rollover past race day may delete the run plan before the server's no-show and recovery checks read it                                                                                                                                                                                                                                                                                | For the running half                                        |
| F7  | The loader's set floor undid the time fit: every load raised a main lift's 2 sets to 3, so the 30-minute dumbbell beginner ran 31–33 minutes                                                                                                                                                                                                                                                              | Fixed in lemmonchess333/Maiin#2612, merged into this branch |
| F8  | The time fit prices warm-ups at the starting weight, but a light barbell lift gains warm-up sets as it grows: a press under 50 kg gets the empty bar and another ramp step once past it. Fitted 60-minute sessions run 61–63                                                                                                                                                                              | Pinned (`over-time`)                                        |
| F9  | A light lift waits for the person. The plan's own step is at most 15%, so on a 2.5 kg grid nothing under 16.7 kg steps by itself, nor dumbbells from 10 to 17.5 kg. The reps stretch, then wait for the person to pick up the next weight. Someone who doesn't sits there: a 10 kg leg curl at 20 reps for 15 sessions with 9 in reserve, and every dumbbell main of the 2-day beginner from about week 8 | Pinned (`stall`)                                            |
| F10 | Barbell lifts planned below the bar: curls at 5–17.5 kg, skull crushers at 15–17.5 kg, a weak lifter's press at 12.5–15 kg. The barbell grid starts at 0, and starting loads from setup aren't floored at the bar                                                                                                                                                                                         | Pinned (`below-bar`); swap or floor is an owner call        |
| F11 | The workout screen starts a lift's rows from that exercise's last session, not that slot's. When one exercise is on two days, each day's rows take the other day's off-weight sets: the novice man's heavy squat day opens at 65 kg × 9, the light day's set. A failed set's reps also carry over as the next session's target for that set                                                               | Pinned (`stall:squat`)                                      |
| F12 | Size plans give the quads 9 sets a week, under ACSM 2026's 10                                                                                                                                                                                                                                                                                                                                             | Pinned (`acsm-size:quads`)                                  |

## Not covered yet

- **The person's actions as the commands the app sends:** Swap, Skip,
  Easier today, Take a lighter week and Adjust this week. Ease back in is
  covered.
- **The server's pure deciders**, through `createRequire`.
- **The running half:** runs, hybrids, race weeks (Lift4 (10)), runs only
  between a plan's creation and race day, and F6.
- **A scheduled soak:** it runs by hand for now.
