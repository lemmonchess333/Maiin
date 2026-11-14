# What good looks like in numbers: the market and the coaches

Investigator slice 6 of 6. Read 11 November 2026. Repo read-only at a checkout of main at `a199cfd7`.

Evidence grades used below: **[P]** primary (the vendor's help centre or page, the coach's own page, the paper), **[R]** a review or third-party summary, **[C]** a competitor writing about a rival, **[T]** a tally made from a published table rather than a figure the source states.

## 1. Verdict

- A top app or coach programme at 60 minutes is 5 to 6 exercises and 15 to 20 working sets: 3 to 4 sets on the first two or three lifts, 2 to 3 on the rest. Tropos at 60 minutes is 4.9 exercises and 12 sets, with 64% of slots at 2 sets (brief's first look). The exercise count is normal. The sets are 3 to 8 short.
- Two-set prescriptions do exist in the market, in three places only: a beginner's accessories (Helms, Alpha Progression), week 1 of a block that then adds sets (RP, Alpha), and sold-as-minimalist plans where the 1 to 2 sets go to 0 to 1 reps in reserve on machines (Nippard). Tropos gives 2 sets as a permanent floor at 2 reps in reserve on barbell lifts, which matches none of the three.
- The market meets a time limit by dropping whole accessory exercises and pairing lifts, and keeps sets per exercise. Tropos does the reverse: sets go to 2 everywhere before any lift is dropped (`sessionFit.ts:14-25`).
- The cause is the time pricing of several barbell mains in one session (4 warm-up sets, 180 s rests, 90 s setup each), which the repo's own audit already measured. Coaches put one or two heavy barbell lifts in a session, then cheap-to-set-up lifts.
- Tropos has no volume progression and no per-muscle feedback. RP, Juggernaut, Alpha Progression and JEFIT all move sets across a block.

## 2. Reference numbers

No app publishes "N sets at 60 minutes". The 60-minute figure above is built from the rows marked (a), (b) and (c).

| Programme or app                            | Split, days                             | Session length                                     | Exercises per session                                                | Sets per exercise: mains / accessories                                                                               | Working sets per session                             | Weekly sets per muscle                                                                          | Grade                            |
| ------------------------------------------- | --------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------- |
| r/Fitness Basic Beginner Routine            | Full body, 3                            | not stated                                         | 3                                                                    | 3x5+ on all three                                                                                                    | 9                                                    | not stated                                                                                      | P                                |
| GZCLP                                       | Full body rotation, 3 or 4              | not stated                                         | 3                                                                    | T1 5x3+, T2 3x10 / T3 3x15+                                                                                          | 11                                                   | not stated                                                                                      | P                                |
| 5/3/1 for Beginners                         | Full body, 3                            | not stated                                         | 5 (2 main, 3 assistance)                                             | 3 work sets plus 5x5 per main lift / 50 to 100 reps per assistance category                                          | 16 on mains, plus assistance                         | not stated                                                                                      | P                                |
| Helms and Morgan, novice bodybuilding       | Upper/lower, 4                          | not stated                                         | 4 to 6                                                               | 3x5 or 3x8-10 / 2 sets on second-tier upper lifts, 3 on leg accessories, 4 on calves                                 | 12 to 16                                             | about quads 12, chest 10, back 10                                                               | P, T                             |
| Helms and Morgan, intermediate bodybuilding | Lower, upper, lower, push, pull, 5      | not stated                                         | 4 to 6                                                               | 4x3-5 / 3 sets, calves 5                                                                                             | 11 to 20                                             | about 12 to 16 on big muscles                                                                   | P, T                             |
| PHUL                                        | Upper/lower, 4                          | not stated, 90 s rests                             | 5 to 7                                                               | 3-4 / 3-4, arms and press 2-3 on power day                                                                           | 16 to 28                                             | not stated                                                                                      | P                                |
| Reddit PPL (Metallicadpa)                   | PPL, 6                                  | not stated                                         | 5 to 7                                                               | 4x5 plus 1x5+ (squat 2x5 plus 1x5+) / 3x8-12, some 4 to 5                                                            | 17 to 24                                             | not stated                                                                                      | P                                |
| PHAT (Layne Norton)                         | 2 power, 3 hypertrophy, 5               | not stated                                         | 7 to 10                                                              | 3x3-5 / 2-3                                                                                                          | 17 to 28, about 118 a week                           | not stated                                                                                      | P                                |
| StrengthLog upper/lower                     | Upper/lower, 4                          | under an hour                                      | 2 to 4 core, 2 optional                                              | 5x5 / 3-4x10                                                                                                         | 9 to 16 core, up to 22 with options                  | not stated                                                                                      | P                                |
| Jeff Nippard, Essentials                    | Full body 2, FB/U/L 3, U/L 4, U/L/PPL 5 | under about 45 min with warm-up                    | not stated on the page                                               | compounds 2-3 hard sets / isolations 1-2                                                                             | not stated                                           | not stated                                                                                      | P                                |
| Jeff Nippard, Min-Max                       | 4 or 5                                  | about 45 min with warm-up                          | not stated on the page                                               | 1-2 hard sets on most lifts, 0 to 1 reps in reserve                                                                  | not stated                                           | not stated                                                                                      | P                                |
| Jeff Nippard, Ultimate PPL                  | PPL variants, 4 to 6                    | 60 to 90 min with warm-up                          | not stated on the page                                               | not stated on the page                                                                                               | not stated                                           | not stated                                                                                      | P                                |
| Alpha Progression generator (a)             | 5-day PPL hybrid, intermediate          | Short about 50, Medium about 65, Long about 85 min | 5 to 6                                                               | 3 to 5; beginner plan 2 to 3 (6 exercises, 12 sets)                                                                  | about 15 to 25                                       | shown, no target band                                                                           | R                                |
| Hevy's own example programmes (b)           | Full body 3; push day; upper/lower 4    | intermediate 50 to 60 min; full body 60 to 75      | 8; 5; 6 and 4                                                        | compounds 3-4 / isolations 2-3                                                                                       | 26; 15; 24, 16, 23, 16                               | 10 to 20, small muscles 6 to 10 direct                                                          | P                                |
| Fitbod (c)                                  | Full body, upper/lower or PPL           | 15 to 90 min setting                               | 4 main exercises take 27 to 51 min, 5 take 35 to 60, 6 take 39 to 63 | not published                                                                                                        | not published                                        | hypertrophy 10 to 20; example chest target 12                                                   | P                                |
| RP (chest guide, Israetel sheet)            | 2 to 6 days                             | not stated                                         | 1 to 3 exercises per muscle per session                              | about 3 sets per muscle per session at the minimum, twice a week; 4 to 12 per muscle per session as the working band | week 1 about 91 a week over 6 days, week 4 about 172 | chest minimum about 6, ceiling about 20 at twice a week; sheet runs chest 10 to 16 over 4 weeks | P for the guide, R for the sheet |
| Schoenfeld 2019 trial                       | Full body, 3                            | 13 min at 1 set; about 68 min at 5 sets            | 7                                                                    | 1, 3 or 5                                                                                                            | 7, 21 or 35                                          | not stated here                                                                                 | P abstract, R for 68 min         |
| Iversen 2021 review                         | any                                     | not stated                                         | at least one leg press pattern, one pull, one push                   | not stated                                                                                                           | not stated                                           | minimum 4, 10 or more if time allows                                                            | P                                |
| **Tropos, beginner 3-day, 60 min**          | Full body                               | est 56 to 59                                       | 6                                                                    | mains 3x8 / 2 sets, one 4-set curl                                                                                   | 14 to 16                                             | chest 8, quads 7 (1:1 counting)                                                                 | repo measurement                 |
| **Tropos, intermediate 4-day, 45 min**      | Upper/lower                             | est 41 to 45                                       | 3 to 6                                                               | 2-3 / 2                                                                                                              | 8 to 12                                              | 38 sets a week, most muscles under 10                                                           | repo measurement and audit       |
| **Tropos, intermediate 6-day, 75 min**      | PPL twice                               | est 37 to 69                                       | 4 to 6                                                               | 3 / 2-3                                                                                                              | 10 to 18                                             | 86 sets a week                                                                                  | repo measurement                 |
| **Tropos, 4-day, 30 min**                   | Upper/lower                             | est 25 to 31                                       | 3 to 5                                                               | 2 / 2                                                                                                                | 6 to 10                                              | 28 sets a week                                                                                  | repo measurement                 |

Tropos rows are from `docs/training-engine-2026-10/measurements/lifting-plans.md` and `lifting-engine-audit.md:62-64`. They are October measurements and were not re-run.

Rep ranges by goal, for comparison with `roleTable.ts`:

| Source                      | Strength                                       | Muscle                                                            | Notes                                     |
| --------------------------- | ---------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------- |
| Alpha Progression [R]       | about 4 to 10                                  | 6 to 15                                                           | endurance 12 to 20                        |
| Fitbod [P]                  | mostly 1 to 6, rests 3 to 5 min                | mostly 6 to 12                                                    | within 1 to 2 reps of failure for size    |
| RP chest guide [P]          | n/a                                            | heavy 5 to 10, moderate 10 to 20, light 20 to 30                  | about half the sets in the moderate band  |
| Helms and Morgan [P]        | 3x5 at 2 reps in reserve on strength days      | 8 to 15 on volume days                                            | first set at 2 reps in reserve throughout |
| Tropos `roleTable.ts:12-18` | mains 5, compounds 6 to 10, isolations 8 to 12 | mains 6 to 10, compounds 8 to 12, isolations 10 to 15 or 12 to 20 | in line with all of the above             |

## 3. How the best meet a time limit, in order of what goes first

1. **Whole accessory exercises go first, sets per exercise stay.** Fitbod scales the number of exercises to the duration setting [P]. Fitbod's own user data: in short sessions exercises per workout fall 40.5% while sets per exercise fall 0.15, isolations are cut more often than compounds (47% against 36%), and its writer's advice is to drop exercises [P]. Alpha Progression adapts the split, the selection and the amount of work to the stated time [P]. 5/3/1's shortest template keeps only the day's main lift at 3 work sets [R].
2. **Pair lifts.** Nippard's 45-minute programme supersets antagonist or non-competing lifts with 30 to 60 s between them [P]. The r/Fitness 5/3/1 page lists accessories inside main-lift rests, push/pull/core circuits, and a time-saver template [P]. A Stronger By Science write-up of an 8-week trial in 43 trained lifters: supersets took 36% less time with no difference in size or strength [P]. Iversen 2021: supersets, drop sets and rest-pause roughly halve session time at the same volume [P].
3. **Shorter rests on small lifts, not on the heavy ones.** Helms: 2 to 3 min on mains, 60 to 90 s on isolations [P]. RP: about 3 to 5 min after a heavy deadlift, about a minute after a light curl [P]. Iversen: 1 to 2 min untrained, 2 min or more trained [P]. Fitbod's data shows users do not shorten rests when short of time [P].
4. **Warm-ups trimmed to the first lift for each muscle group.** Iversen 2021 [P]. Fitbod users cut warm-up sets from 47% of workouts to 28% in short sessions [P].
5. **Fewer, harder sets.** Nippard Min-Max: 1 to 2 hard sets at 0 to 1 reps in reserve, mainly on machines and cables, about 45 minutes [P]. Dr. Muscle defaults to rest-pause sets and offers 30 or 45 minute sessions [P, vendor claim].
6. **Volume stops growing.** RP: tell the app a muscle's workload is at your limit, time included, and it adds no more sets; sets can also be removed by hand [P].

Tropos's order (`sessionFit.ts:14-25`): isolation sets to 2, other compounds' sets to 2, drop isolations whose muscles keep two days, main lifts' sets to 2, then further drops. The reason given is to keep calf, side-delt and ab work (`sessionFit.ts:42-46`). The repo already holds the market's order in another module: the one-off Express session drops whole accessories first and says thin 2-set remnants across many stations are the wrong trade (`expressSession.ts:17-22, 245-249`). The two modules disagree with each other.

## 4. How the best adapt

**Level.** Alpha Progression: beginners get 2 to 3 sets an exercise and are told to leave RIR, periodisation and deloads off; intermediates get 3 to 5 [R, and the repo's `lifting-evidence.md` §5.1]. MacroFactor Workouts uses experience to set starting volume and intensity [P]. Boostcamp asks beginner, intermediate or advanced by years, plus a low, medium or high volume preference [P]. Helms scales by programme: novice 12 to 16 sets a session, intermediate up to 20, with 4-set mains [P]. RP says its app is not beginner-led and one reviewer agrees [P, R].

**Injury and pain.** Hevy Trainer added an Injuries tab in August 2026: it replaces high-risk exercises or adds a warning, and removing the injury can bring the lifts back [P, R]. Boostcamp asks ankle, knee, wrist, shoulder, chest, elbow, back or neck and builds around them [P]. RP asks joint pain per exercise each session (repo `lifting-evidence.md` §5.1, not re-read here). Juggernaut's daily soreness log lowers that day's load only [R]. Alpha Progression and MacroFactor have no injury question; the tool is excluding or blacklisting a lift [P]. Fitbod learns from Replace, Recommend Less and Never Again [P].

**Equipment.** Gym profiles that filter the exercise pool are standard: Fitbod, MacroFactor (a profile per day is allowed), Alpha Progression, Gravl, Hevy Trainer, Boostcamp [P]. Nippard ships two ranked substitutes per exercise [P].

**Feedback during a block.**

- RP: pump, soreness and workload per muscle move sets up, hold them or cut them; load rises a few percent a week, or a rep per set when the jump is too big; the last week of every block is a deload [P]. RP's chest guide starts near the minimum (its example is 2 sets) and climbs toward the ceiling (its example is 6), with reps in reserve falling from 3 or 4 to 0 or 1 [P].
- Juggernaut AI: a questionnaire sets minimum and maximum volume; a readiness check before each session changes volume or load; RPE on the top set and back-off set changes the next sets; check-ins at session, week, block and programme level [P]. One reviewer saw a third set removed after an RPE 10 second set [R].
- Alpha Progression: a weight and rep target for every set from the last workout and today's sets, using the gym's real increments; optional set periodisation rising 2 to 4 over four weeks, then a deload [P, R].
- Hevy Trainer: weight goes up only when every set reaches the top of the range; stall reminders; optional deload every six weeks at 40% less load [P].
- MacroFactor Workouts: targets update after each workout; exercises, layout and sets never change unless the person edits them [P].
- Fitbod: per-muscle recovery from 0 to 100%, an estimated max per lift, alternating heavier and lighter sessions, periodic max-effort sets, optional RiR [P].
- JEFIT (2026): on-ramp, accumulation, intensification, deload; a weekly step, a half-step "bridge week" or an early deload [P].

**Edits.** Hevy Trainer and Alpha Progression ask whether a swap is for today or for the plan [P]. Juggernaut offers per day or for the rest of the block [R]. MacroFactor's structure is the person's until they change it [P]. Fitbod's weekly set targets cannot be edited by hand [P].

**What users say** (thin evidence, review aggregates only). RP: praised for periodisation, criticised for price, for not suiting beginners and for long sessions, which RP answers in a help article [C, R, P]. Juggernaut: praised as responsive; complaints are price, the daily check-in and not seeing future weeks [R]. Alpha Progression: targets feel realistic; complaints are price and no way to tell whether weekly volume is enough [R]. Fitbod: easy and flexible on equipment; complaints are price and bugs [R]. Hevy Trainer: criticised by rivals for a single fixed rule and no recovery input [C].

## 5. Capability table

Best of the rest is Alpha Progression (the best-documented generator outside the four named).

| Capability                  | Fitbod                                         | RP Hypertrophy                              | Juggernaut AI                                 | Hevy Trainer                                               | Alpha Progression                          | Tropos                                                                                                                       |
| --------------------------- | ---------------------------------------------- | ------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Asks session length         | Yes, 15 to 90 min                              | Not verified                                | Not verified (reviews: 45 to 90 min sessions) | Yes                                                        | Yes, about 50, 65 or 85 min                | Yes, 30, 45, 60, 75 (`sessionFit.ts:68-69`)                                                                                  |
| How time is met             | Scales the number of exercises                 | Stops adding sets when told; manual removal | Not verified                                  | Not published                                              | Adapts split, selection and amount of work | Cuts sets to 2 before dropping lifts; 30-min plans rest less (`sessionFit.ts:9-25`, `restTime.ts:9-14`)                      |
| Typical sets per exercise   | Not published                                  | Starts near minimum, adds                   | Not verified                                  | Not published for Trainer; Hevy's own examples 3-4 and 2-3 | 3 to 5; beginners 2 to 3                   | 3 by role, beginners 2 off mains, fitted down to 2 (`roleTable.ts:20-23`, `sessionFit.ts:75`)                                |
| Sets change across a block  | Weekly set targets recalculated                | Yes, from pump, soreness, workload          | Yes, by phase and check-in                    | Not verified                                               | Optional, 2 to 4 over four weeks           | No (`sessionFit.ts:9-12`; `owner-lifting-sources.md` row "A stuck lift gets nothing said")                                   |
| Load progression            | Estimated max, varied loading, max-effort sets | A few percent weekly, or a rep per set      | RPE on top and back-off sets                  | Top of range on all sets, then weight                      | Per-set weight and reps, real increments   | Double progression; fixed targets step when every set hits (`roleTable.ts:8-10`)                                             |
| Effort input                | Optional RiR                                   | RIR target falls weekly                     | RPE each session                              | Optional RPE                                               | Optional RIR 0 to 3                        | Cue in words; optional effort row; 9.5 holds the step (`effortCue.ts:1-27`; `lifting-evidence.md` L17)                       |
| Recovery or readiness input | Per-muscle recovery %                          | Soreness, pump                              | Sleep, mood, energy, soreness                 | None [C]                                                   | None found                                 | None (`owner-lifting-sources.md` row (6))                                                                                    |
| Deload                      | None documented                                | Last week of every block                    | By phase                                      | Optional, every 6 weeks, 40% lighter                       | Optional at plan end; half the sets        | Half the sets, same weights, every 4th trained week, intermediates on 3+ days (`lift-programming-claude-handoff.md:781-800`) |
| Priority muscle             | Focus areas feed targets                       | Emphasise, grow, maintain                   | Weak points asked                             | One focus group                                            | Prioritise and deprioritise                | None (`owner-lifting-sources.md` row (4))                                                                                    |
| Injury handling             | Exclude or Never Again                         | Joint pain per exercise (not re-read)       | Soreness lowers the day's load [R]            | Injuries tab swaps or warns                                | No question; blacklist                     | Substitution table by injury, safe for all listed injuries (`injurySubstitutions.ts:1-10`)                                   |
| Equipment                   | Gym profiles                                   | Not verified                                | Swap per day or block [R]                     | Yes                                                        | Gym profiles                               | Equipment swaps (`matchTemplate.ts:22-40`)                                                                                   |
| Supersets in the plan       | Yes, setting                                   | Not verified                                | Yes [R]                                       | Not verified for Trainer                                   | Yes                                        | Session only, never reaches the plan (`superset.ts:1-13`)                                                                    |
| Swap persistence            | Learns from swaps                              | Not verified                                | Day or rest of block [R]                      | Asks: permanent or today                                   | Asks: plan or today                        | Never swaps on its own; person's Replace and Add don't take the role's numbers (`lifting-engine-audit.md:44`)                |
| Strength peak or test       | No                                             | No (points to Juggernaut)                   | Yes, meet date                                | No                                                         | No                                         | No (`lifting-engine-audit.md:78-80`)                                                                                         |

## 6. Where the engine's rules agree and differ (Part C)

Read: `docs/lift-programming-claude-handoff.md`, `docs/training-engine-2026-10/lifting-evidence.md`, `owner-lifting-sources.md`, `sessionFit.ts`, `volumeModel.ts`, `roleTable.ts`, `restTime.ts`, `expressSession.ts`.

**Agrees with the market and the coaches**

- Session length as a first-class input. Fitbod, Hevy, Alpha, MacroFactor, Gravl, JEFIT and Dr. Muscle all ask it.
- Three sets as the default and a beginner's accessories at 2 (`roleTable.ts:20-23`). Helms's novice plan and Alpha's beginner plan do the same.
- Rep bands by role, double progression, rest by role, 2 reps in reserve on compounds. Hevy Trainer's rule is the same double progression. Helms uses 2 reps in reserve on the first set.
- Every muscle twice a week. Helms, PHUL, PHAT and the Reddit PPL all hold it.
- Half-set lighter week. Alpha's deload halves sets; RP and Hevy schedule one.
- Injury substitution table. Ahead of Alpha and MacroFactor, level with Hevy and Boostcamp.
- Honest time pricing. No coach programme above states a session length except Nippard and StrengthLog; many 20-set sessions run past an hour in practice.

**Plainly different**

1. **Cut order.** Market drops exercises and keeps sets. `sessionFit.ts` cuts sets to 2 first. The result is the owner's complaint.
2. **Session composition.** Measured Tropos upper day at 45 minutes: bench 3x4-8, barbell row 3x4-8, overhead press 2x4-8, each at 180 s with up to 4 warm-up sets, and nothing else (`lifting-plans.md`, P3 day 1). One heavy main costs about 17 minutes for 3 sets by the engine's own constants (`expressSession.ts:125-130`, `restTime.ts`). Helms, PHUL and Nippard put one or two heavy barbell lifts first, then dumbbell, machine and cable work that needs little warm-up.
3. **The engine contradicts its own ceiling note.** `volumeModel.ts:990-1008` says 18 sets is about an hour. The fit delivers 12 at 60 minutes.
4. **No set progression.** RP, Alpha, JEFIT and Juggernaut move sets through a block. Tropos holds them. The owner's own source asks for sets to rise when a muscle stalls (`owner-lifting-sources.md`, OREB-27 row).
5. **Low sets at low effort.** Where the market runs 1 to 2 sets it runs them at 0 to 1 reps in reserve on stable machines. Tropos's 2-set floor sits on barbell lifts at 2 in reserve. The owner's source also flags that effort does not rise on short or infrequent plans (OREB-25 row).
6. **No supersets in the plan** (`superset.ts:10-11`). The owner-sources file already lists pairing as an opportunity for 30 to 45 minute plans (OREB-11 row).
7. **Counting.** Fitbod and Hevy count an indirect set as half. Tropos counts it as one (`volumeModel.ts:128-143`), so its weekly tallies read fuller than the same plan would on the market's scale, and its ceilings bite sooner. The repo's evidence file already recommends taking this back to the owner (`lifting-evidence.md` §0 finding 2).
8. **No priority muscle and no volume preference.** Hevy, Alpha, MacroFactor, RP, Boostcamp and Fitbod all take one.

## 7. The five changes that would most close the gap

1. **Reverse the fit: drop or pair accessories before any lift goes below 3 sets.** Floor of 3 on the day's main lift and first compound for non-beginners, 2 only on isolations. Source: Fitbod's data and advice; Hevy's and Helms's shapes; the repo's own `expressSession.ts` policy.
2. **One heavy barbell main a session, two at most, then low-setup lifts; price a full warm-up ramp only on the first lift for each muscle group.** This is where the missing 3 to 6 sets at 60 minutes are. Source: Iversen 2021 on warm-ups; Helms, PHUL and Nippard session shapes; `lifting-engine-audit.md:62-64` for the cause.
3. **Write antagonist supersets into 30 and 45 minute plans, optional at 60.** Pair accessories and upper push with pull; never squat or deadlift. Source: Stronger By Science (36% less time, no loss); Iversen 2021; Nippard Essentials; the r/Fitness 5/3/1 page.
4. **Make "2 sets" a starting point, not a floor: add sets through a block.** Start at 2 to 3, add a set where the person reports it easy or a lift stalls, stop at the time limit, then a lighter week. One question per muscle is enough. Source: RP help centre and chest guide; Alpha's 2 to 4 periodisation; JEFIT; OREB-27. Add one priority-muscle input at the same time (Hevy, Alpha, MacroFactor, RP).
5. **Where sets must stay low (30-minute plans, a beginner's accessories), raise the effort and say so.** One to two sets at 0 to 1 reps in reserve on machines and cables, 2 in reserve kept for barbell lifts. Source: Nippard Min-Max and Essentials; Iversen's 4-set weekly minimum; Schoenfeld 2019 (strength held at 1 set an exercise, size rose with sets).

**Where sources disagree**

- Volume: Nippard's 1 to 2 hard sets and Iversen's 4-set weekly minimum against RP's climb to about 172 sets a week and PHAT's 118. Schoenfeld 2019 sits between: more sets, more size, no more strength.
- Deloads: RP every block, Hevy off by default, MacroFactor optional, the owner's coach none in year one.
- Rest: PHUL 90 s on everything; Helms 2 to 4 min on mains; RP by feel.
- Set counting: half for indirect work (Fitbod, Hevy), direct only for abs (RP), one for one (Tropos).

## 8. Sources

Apps, primary

- Fitbod, How Fitbod Creates Your Workout: https://help.fitbod.me/hc/en-us/articles/360004429814-How-Fitbod-Creates-Your-Workout
- Fitbod, workout settings and duration: https://help.fitbod.me/hc/en-us/articles/34336407191191
- Fitbod, customising today's workout: https://help.fitbod.me/hc/en-us/articles/38318585683991
- Fitbod, Weekly Set Targets: https://help.fitbod.me/hc/en-us/articles/24739986755223-Weekly-Set-Targets
- Fitbod, Exercise Variability: https://help.fitbod.me/hc/en-us/articles/29976242163223
- Fitbod blog, the algorithm: https://fitbod.me/blog/fitbod-algorithm
- Fitbod blog, what gets cut when lifters are short on time: https://fitbod.me/blog/what-gets-cut-when-lifters-are-short-on-time/
- RP, how the app adds weight, reps and sets: https://help.rpstrength.com/hc/en-us/articles/32600173777815-How-does-the-app-determine-when-to-add-weight-reps-and-sets
- RP, why so many sets, long workouts: https://help.rpstrength.com/hc/en-us/articles/32600133107863-Why-is-the-app-giving-me-so-many-sets-Long-Workouts
- RP, deload placement: https://help.rpstrength.com/hc/en-us/articles/33510413024279-Does-the-app-automatically-place-deloads
- RP, which template: https://help.rpstrength.com/hc/en-us/articles/41101429376535-Which-Template-Should-I-Pick
- RP, chest training guide: https://help.rpstrength.com/hc/en-us/articles/32433153518359-Chest
- RP, who the app is for: https://help.rpstrength.com/hc/en-us/articles/33510008280087-Who-is-the-RP-Hypertrophy-App-for
- RP, why there is no rest timer: https://help.rpstrength.com/hc/en-us/articles/30805293312407-Why-is-there-no-rest-timer
- Juggernaut AI, how it is individualised: https://help.jtsstrength.com/en/articles/3-how-juggernautai-is-individualized-to-you
- Juggernaut AI product page: https://www.jtsstrength.com/juggernautai
- Hevy Trainer explained: https://help.hevyapp.com/hc/en-us/articles/38385724273047-Hevy-Trainer-Explained-How-It-Builds-Your-Workout-Program
- Hevy Trainer feature page: https://www.hevyapp.com/features/workout-plan-generator/
- Hevy, announcing Trainer: https://www.hevyapp.com/announcing-hevy-trainer/
- Hevy, how long should a workout be: https://www.hevyapp.com/how-long-should-a-workout-be/
- Hevy, how many sets: https://www.hevyapp.com/how-many-sets/
- Alpha Progression guide: https://alphaprogression.com/en/blog/alpha-progression-guide
- MacroFactor Workouts, inputs to generation: https://help.macrofactorapp.com/en/articles/370-what-information-does-macrofactor-workouts-use-to-generate-my-program
- MacroFactor Workouts, smart generation steps: https://help.macrofactorapp.com/en/articles/285-create-a-new-program-via-smart-generation
- MacroFactor Workouts, how often the programme updates: https://help.macrofactorapp.com/en/articles/369-how-often-does-my-program-update
- MacroFactor Workouts page: https://macrofactor.com/workouts/
- Boostcamp personalised programmes: https://www.boostcamp.app/features/personalized-programs
- Dr. Muscle feature page (vendor): https://dr-muscle.com/what-makes-dr-muscle-different/
- Gravl plan setup: https://intercom.help/gravl/en/articles/10185534-gravl-essentials-set-up-your-fitness-plan
- JEFIT adaptive mesocycle: https://www.jefit.com/blog/adaptive-mesocycle-training-jefits-smarter-way-to-progress
- Ladder, App Store listing: https://apps.apple.com/gb/app/id1502936453
- Caliber FAQ: https://caliberstrong.com/faqs

Apps, reviews and competitor pieces

- Alpha Progression review (sponsored, AIToolsBakery): https://aitoolsbakery.com/?p=19503
- Alpha Progression on Hevy (competitor): https://alphaprogression.com/en/blog/alpha-progression-vs-hevy
- Hevy review (AIToolsBakery): https://aitoolsbakery.com/blog/hevy-review/
- Hevy review (SensAI, competitor): https://www.sensai.fit/blog/hevy-review-2026
- Strong review (SensAI, competitor): https://www.sensai.fit/blog/strong-app-review-2026
- Juggernaut AI review (PowerliftingTechnique): https://powerliftingtechnique.com/juggernaut-ai-review/
- Juggernaut AI review (Garage Gym Reviews): https://www.garagegymreviews.com/equipment/category/training-programs/garagegymreviews.com/juggernautai-review
- RP app review (Dr. Muscle, competitor): https://dr-muscle.com/rp-hypertrophy-app-review/
- RP app, six months (user): https://medium.com/@justinsmith31491/i-used-the-rp-hypertrophy-app-for-6-months-f20e67378b20
- Fitbod review (TechRadar): https://www.techradar.com/health-fitness/fitbod-app-review
- MacroFactor Workouts review (GainFrame): https://gainframe.app/blog/macrofactor-workouts-review/

Programmes and coaches

- r/Fitness routines index: https://thefitness.wiki/routines/strength-training-muscle-building/
- r/Fitness Basic Beginner Routine: https://thefitness.wiki/routines/r-fitness-basic-beginner-routine/
- 5/3/1 for Beginners: https://thefitness.wiki/routines/5-3-1-for-beginners/
- 5/3/1 primer: https://thefitness.wiki/5-3-1-primer/
- 5/3/1 main-lift-only template (Lift Vault summary): https://liftvault.com/resources/im-not-doing-jack-shit/
- GZCLP: https://thefitness.wiki/routines/gzclp/
- Reddit PPL: https://thefitness.wiki/reddit-archive/a-linear-progression-based-ppl-program-for-beginners/
- Helms and Morgan, novice bodybuilding programme: https://rippedbody.com/novice-bodybuilding-program/
- Helms and Morgan, intermediate bodybuilding programme: https://rippedbody.com/intermediate-bodybuilding-program/
- PHUL: https://www.muscleandstrength.com/workouts/phul-workout
- PHAT, Layne Norton: https://biolayne.com/articles/training/phat-power-hypertrophy-adaptive-training/
- Jeff Nippard, Essentials: https://jeffnippard.com/products/the-essentials-program
- Jeff Nippard, Min-Max: https://jeffnippard.com/products/the-min-max-program
- Jeff Nippard, Min-Max phase 2: https://jeffnippard.com/products/min-max-program-phase-2
- Jeff Nippard, Ultimate PPL: https://jeffnippard.com/products/the-ultimate-push-pull-legs-system
- StrengthLog upper/lower: https://www.strengthlog.com/strengthlogs-upper-lower-program-4-days-week/
- Stronger By Science bundle (Lift Vault summary): https://liftvault.com/programs/strength/stronger-by-science-sbs-program-bundle-by-greg-nuckols/
- Israetel hypertrophy sheet (Lift Vault summary): https://liftvault.com/programs/bodybuilding/mike-israetel-5-week-hypertrophy-workout-routine-spreadsheet/
- Brett Gibbs AMA remark: https://lr.eu.psf.lt/r/powerlifting/comments/4ajatl/im_brett_gibbs_ama/d11vbzd/?context=3

Research

- Iversen, Norum, Schoenfeld, Fimland 2021, No Time to Lift: https://pmc.ncbi.nlm.nih.gov/articles/PMC8449772/
- Schoenfeld et al. 2019, volume in trained men (abstract): https://academicworks.cuny.edu/le_pubs/274
- Stronger By Science, supersets research: https://www.strongerbyscience.com/supersets-research/

Repo files read: `src/features/program/sessionFit.ts`, `volumeModel.ts`, `roleTable.ts`, `restTime.ts`, `expressSession.ts`, `weeklyFrequency.ts`, `superset.ts`, `effortCue.ts`, `injurySubstitutions.ts`, `matchTemplate.ts`; `docs/lift-programming-claude-handoff.md`; `docs/training-engine-2026-10/lifting-evidence.md`, `owner-lifting-sources.md`, `lifting-engine-audit.md`, `measurements/lifting-plans.md`.

## 9. Not verified

- Fitbod's sets per exercise and its exercise count for each duration. The help centre gives only completion-time ranges for 4, 5 and 6 main exercises.
- Hevy Trainer's splits by day count, exercises and sets per workout, and what a shorter length removes. Not published; no independent test found.
- RP app's exact starting and maximum sets per exercise, its deload recipe, and what a joint-pain rating changes. The 2 and 6 are the chest guide's worked example. The joint-pain rating is from the repo's evidence file, not re-read.
- Juggernaut AI's sets per session, any time-limit handling and injury handling. Its help centre does not cover them.
- MacroFactor Workouts' session-length options and generated sets per exercise. Launch in January 2026 is from the repo's evidence file and a newsletter title, not fetched.
- Caliber and Ladder session shapes. Caliber is human-coached; Ladder is weekly coach-written sessions of 30 to 45 minutes.
- StrengthLog's app was checked only as a programme library.
- Strong: confirmed as a logger with no generator, from a competitor's review only.
- Brett Gibbs: no published template found. One AMA remark that squat volume rose for five weeks and then fell.
- Layne Norton's programmes after PHAT.
- Jeff Nippard's exercise counts per session and weekly sets. The programmes are paid; the product pages give sets per exercise and session length only.
- Stronger By Science bundle: accessory counts and session length. Its main-lift shape (3 to 4 sets plus a last set to failure) is from a third-party summary.
- Weekly per-muscle figures for the Helms programmes are tallies from the tables.
- Schoenfeld 2019: the 13 minutes is from the abstract; the 68 minutes for 35 sets is Hevy's summary of the paper. The paper's full text would not load.
- User praise and complaints: review aggregates only. Reddit was not reachable.
- Tropos figures: the 64%, 4.9 exercises, 12 sets and 13.5 sets are the brief's. The per-plan rows are the repo's October measurements. Neither was re-run.
