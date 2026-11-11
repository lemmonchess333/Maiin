# How lifting and running work together

Investigator slice: the combined week. Every week below came out of the real
builder (`buildPlan`) and the real rollover (`rollRunWeeks`, `rollLiftWeeks`),
with every lift marked done each week. Nothing tracked was edited.

Scratch files (git-ignored): `src/features/program/__tests__/zzHybridWeeks.scratch.test.ts`,
`zzHybridGrid.scratch.test.ts`, `zzHybridProbe.scratch.test.ts`,
`zzHybridProbe2.scratch.test.ts`, `zzHybridProbe3.scratch.test.ts` (all under a checkout of main at `a199cfd7`).
Raw output: `evidence/hybrid-weeks.json`, `hybrid-grid.json`, `hybrid-trim.json`,
`hybrid-slip.json`, `hybrid-owndays.json`, `hybrid-recovery.json`, `hybrid-probe.json`,
`hybrid-probe2.json`, `hybrid-probe3.json`, `hybrid-schedules.json`.

## 1. Verdict

Two plans sharing a calendar. They are joined in about eight places, almost every join runs one way (lifting reads running), and most need a race.

- No race, no combined plan: a 4-lift, 3-run hybrid gets a lift-only week and free running. That is a locked position (Run9a).
- With a race, the week is counted, not coached. 14 of 20 lift/run count pairs have no rest day, and all 20 put heavy legs beside or on a hard run, or the two hard runs back to back.
- The spacing the builder does manage lasts until the first missed lift, because lifts rotate.
- The race end is the best part (two lighter lift weeks, a one-session race week, a light week after), but it only applies after a rollover, not in the week a plan is made.

## 2. The combined weeks

Reading the tables: `[n]` is the sets on leg lifts that day. A session's main squat,
deadlift or Romanian deadlift (RDL) is shown; for C the second barbell leg lift too. On a day with two
sessions the order is the one Home leads with: lift first, unless the goal is
Support my running (`src/lib/todaySession.ts:364`). Minutes are the lift
estimate plus the run templates' minutes. Intermediate, 80 kg, 60-minute
sessions, full gym, plan made Monday 9 November 2026.

**A1. 4 lifts + 3 runs, general fitness, as setup builds it (free running)**

| Day   | Every week                                           |
| ----- | ---------------------------------------------------- |
| Mon   | Upper Chest & Back                                   |
| Tue   | Lower Squat: Squat 3x6 @ 85, Deadlift 3x6 @ 100 [11] |
| Wed   | Upper Shoulders & Arms                               |
| Thu   | rest                                                 |
| Fri   | Lower Deadlift: Deadlift 3x8 @ 100 [12]              |
| Sat   | rest                                                 |
| Sun   | rest                                                 |
| Total | 4 lifts, 0 runs, 3 rest; 226 min; 23 leg sets        |

No run is planned anywhere and the weekly run target is 0. The week is identical to a lifter's who never runs. The three runs happen wherever the person puts them; the plan does not know.

**A3. 4 lifts + 3 runs, general fitness, 10K in 10 weeks (a race, or the starter goal for a new runner, is the only way to get planned runs)**

| Day   | Week 1                                               | Week 7 (build peak)                  | Week 8 (lifts lighter, runs peak)        | Week 10 (race)                 |
| ----- | ---------------------------------------------------- | ------------------------------------ | ---------------------------------------- | ------------------------------ |
| Mon   | Upper Chest & Back                                   | Upper Chest & Back                   | Upper Chest & Back                       | Upper Chest & Back (half sets) |
| Tue   | Easy 30                                              | 30 Min Tempo                         | 5×1K Intervals                           | Easy 30                        |
| Wed   | Easy 30 + strides                                    | Easy 50                              | Medium-long 60                           | Easy 30                        |
| Thu   | Lower Squat: Squat 3x6 @ 85, Deadlift 3x6 @ 100 [11] | same [11]                            | Lower Squat: Squat 2x6, Deadlift 2x6 [7] | skipped                        |
| Fri   | Upper Shoulders & Arms                               | Upper Shoulders & Arms               | Upper Shoulders & Arms                   | skipped                        |
| Sat   | Long 6K                                              | Long 10K                             | Long 12K                                 | Easy 30                        |
| Sun   | Lower Deadlift: Deadlift 3x8 @ 100 [12]              | same [12]                            | Lower Deadlift: Deadlift 2x8 [8]         | 10K Race (lift skipped)        |
| Total | 4 lifts, 3 runs, 0 rest; 226+95 min                  | 4 lifts, 3 runs, 0 rest; 226+150 min | 4 lifts, 3 runs, 0 rest; 172+160 min     | 1 lift, 4 runs, 2 rest         |

These are setup's own defaults (4 lifts, "I run regularly" gives 3 runs). No rest day for nine weeks. The deadlift day follows the long run every Sunday. Lifts halve in weeks 8 and 9 while the runs peak in week 8, which is right. Race week is right.

**B. 3 lifts + 4 runs, Support my running, half marathon in 12 weeks, leg trim on**

| Day   | Week 1                                            | Week 9 (run peak)                                 | Week 11 (taper)                      | Week 12 (race)               |
| ----- | ------------------------------------------------- | ------------------------------------------------- | ------------------------------------ | ---------------------------- |
| Mon   | FB Squat: Squat 2x3 @ 92.5 [4]                    | FB Squat: Squat 2x3 @ 92.5 [4]                    | FB Squat: Squat 1x3 @ 92.5 [2]       | FB Squat: Squat 1x3 @ 45 [2] |
| Tue   | Easy 30                                           | Medium-long 75                                    | Easy 30                              | Easy 30                      |
| Wed   | Easy 30 + strides                                 | 40 Min Tempo                                      | 8×400m Speed                         | Easy 30                      |
| Thu   | FB Deadlift: Deadlift 3x5 @ 107.5 [5]             | FB Deadlift: Deadlift 2x5 @ 107.5 [4]             | FB Deadlift: Deadlift 2x5 [3]        | skipped                      |
| Fri   | FB Posterior: RDL 3x5 @ 70 [7]                    | FB Posterior: RDL 2x5 @ 70 [6]                    | FB Posterior: RDL 2x5 [4]            | skipped                      |
| Sat   | Easy 30                                           | Easy 50 + strides                                 | Easy 30                              | Easy 30                      |
| Sun   | Long 10K                                          | Long 20K                                          | Easy 30                              | Half Marathon Race           |
| Total | 3 lifts, 4 runs, 0 rest; 176+145 min; 16 leg sets | 3 lifts, 4 runs, 0 rest; 168+293 min; 14 leg sets | 3 lifts, 4 runs, 0 rest; 126+115 min | 1 lift, 4 runs, 2 rest       |

No rest day for eleven weeks. Heavy squat triples every Monday, the day after the long run (20 km in week 9). The deadlift day is the day after the tempo. Deadlift then Romanian deadlift on consecutive days. Running doubled (145 to 293 min) while leg sets went 16 to 14. Lifts were lighter in weeks 4 and 8, the run plan's step-back weeks, which is right.

**C. 2 lifts + 5 runs, Support my running, marathon in 18 weeks, leg trim on**

| Day   | Week 1                                                  | Week 14 (run peak)                                | Week 16 (taper)                                 | Week 18 (race)                                    |
| ----- | ------------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------- |
| Mon   | FB Squat: Squat 2x3 @ 92.5, Deadlift 2x6 @ 107.5 [4]    | same [4]                                          | FB Squat: Squat 1x3, Deadlift 1x6 [2]           | FB Squat: Squat 1x3 @ 45, Deadlift 1x6 @ 52.5 [2] |
| Tue   | Easy 30                                                 | Medium-long 90                                    | Easy 50                                         | Easy 30                                           |
| Wed   | Easy 30 + strides                                       | 6×1K Intervals                                    | 8×400m Speed                                    | Easy 30                                           |
| Thu   | Easy 30                                                 | Easy 50 + strides                                 | Easy 30                                         | Easy 30                                           |
| Fri   | FB Deadlift: Deadlift 2x5 @ 107.5, Squat 2x8 @ 92.5 [6] | same [6]                                          | FB Deadlift: Deadlift 1x5 [3]                   | skipped                                           |
| Sat   | Easy 30                                                 | Easy 50                                           | Easy 30                                         | Easy 30                                           |
| Sun   | Long 12K                                                | Long 25K                                          | Long 15K                                        | Marathon Race                                     |
| Total | 2 lifts, 5 runs, 0 rest; 118+185 min; 10 leg sets       | 2 lifts, 5 runs, 0 rest; 118+371 min; 10 leg sets | 2 lifts, 5 runs, 0 rest; 81+215 min; 5 leg sets | 1 lift, 5 runs, 1 rest                            |

No rest day for 17 weeks. Squat and deadlift every Monday after the long run (25 km, 140 min at peak). Leg sets are 10 in every week from 1 to 15: the yes to "Lighten leg sessions" changed nothing. No lighter lift week before the taper, because a two-day plan gets none.

**D1. 6-day push/pull/legs + 3 runs, as setup builds it (free running)**

| Day   | Every week                                             |
| ----- | ------------------------------------------------------ |
| Mon   | Pull Lat                                               |
| Tue   | Push Chest                                             |
| Wed   | Legs Squat: Squat 3x4 @ 90, Deadlift 3x4 @ 105 [11]    |
| Thu   | Pull Row                                               |
| Fri   | Push Shoulder                                          |
| Sat   | Legs Deadlift: Deadlift 3x6 @ 105, Squat 3x8 @ 90 [10] |
| Sun   | rest                                                   |
| Total | 6 lifts, 0 runs, 1 rest; 292 min; 21 leg sets          |

The only free day follows the Legs Deadlift day. Three runs have to go on lifting days or on that Sunday, unplanned.

**D2. 6-day push/pull/legs + 3 runs, size goal, 10K in 10 weeks**

| Day   | Week 1                                                                         | Week 7 (build peak)                                    | Week 10 (race)                     |
| ----- | ------------------------------------------------------------------------------ | ------------------------------------------------------ | ---------------------------------- |
| Mon   | Pull Lat, then Easy 30                                                         | Pull Lat, then Easy 50                                 | Pull Lat (half sets), then Easy 30 |
| Tue   | Push Chest                                                                     | Push Chest                                             | skipped                            |
| Wed   | Legs Deadlift: Deadlift 3x4 @ 105, Squat 3x4 @ 90 [10], then Easy 30 + strides | Legs Deadlift [10], then 30 Min Tempo (clash flag set) | Easy 30 (lift skipped)             |
| Thu   | Push Shoulder                                                                  | Push Shoulder                                          | skipped                            |
| Fri   | Legs Squat: Squat 3x8 @ 90, Deadlift 3x6 @ 105 [12]                            | Legs Squat [12]                                        | skipped                            |
| Sat   | Pull Row                                                                       | Pull Row                                               | skipped                            |
| Sun   | Long 6K                                                                        | Long 10K                                               | 10K Race                           |
| Total | 6 lifts, 3 runs, 0 rest; 297+95 min                                            | 6 lifts, 3 runs, 0 rest; 297+150 min; 22 leg sets      | 1 lift, 3 runs, 4 rest             |

It fits by stacking: nine sessions and no day off. The tempo or intervals share Wednesday with the heavy deadlift and squat session, lift listed first, with no word about order or a gap. Friday legs, Saturday pull, Sunday long run is fine. The runs are identical, minute for minute, to the 4-lift athlete's in A3.

**E1. 5 lifts + 2 runs, size goal, as setup builds it (free running)**

| Day   | Every week                                           |
| ----- | ---------------------------------------------------- |
| Mon   | Pull Lat                                             |
| Tue   | Push Chest                                           |
| Wed   | Legs Squat: Squat 3x6 @ 90, Deadlift 3x6 @ 105 [11]  |
| Thu   | Upper Chest & Back                                   |
| Fri   | Lower Squat: Squat 3x8 @ 90, Deadlift 3x6 @ 105 [12] |
| Sat   | rest                                                 |
| Sun   | rest                                                 |
| Total | 5 lifts, 0 runs, 2 rest; 288 min; 23 leg sets        |

**E2. 5 lifts + 2 runs, size goal, 5K in 8 weeks**

| Day   | Week 1                                               | Week 5 (build)                                   | Week 8 (race)          |
| ----- | ---------------------------------------------------- | ------------------------------------------------ | ---------------------- |
| Mon   | Pull Lat                                             | Pull Lat                                         | Pull Lat (half sets)   |
| Tue   | Long 6K                                              | Long 6K                                          | Easy 30                |
| Wed   | Easy 30                                              | 20 Min Tempo                                     | Easy 30                |
| Thu   | Legs Squat: Squat 3x4 @ 90, Deadlift 3x4 @ 105 [11]  | Legs Squat [11]                                  | skipped                |
| Fri   | Push Chest                                           | Push Chest                                       | skipped                |
| Sat   | Upper Chest & Back                                   | Upper Chest & Back                               | skipped                |
| Sun   | Lower Squat: Squat 3x8 @ 90, Deadlift 3x6 @ 105 [12] | Lower Squat [12]                                 | 5K Race (lift skipped) |
| Total | 5 lifts, 2 runs, 0 rest; 288+65 min                  | 5 lifts, 2 runs, 0 rest; 288+65 min; 23 leg sets | 1 lift, 3 runs, 3 rest |

The two runs sit on Tuesday and Wednesday, so the long run and the tempo are back to back, then heavy legs on Thursday: three hard leg days in a row, then lifting through to Monday. No rest day. The long run is on a Tuesday because no weekend day was free.

**F. New runner (starter goal, asked for 3 runs) who lifts 4 days, strength goal**

| Day   | Week 1                                                   | Week 4 (lighter lift week)               |
| ----- | -------------------------------------------------------- | ---------------------------------------- |
| Mon   | Upper Chest & Back                                       | Upper Chest & Back                       |
| Tue   | Run-walk 1                                               | Run-walk 1                               |
| Wed   | nothing planned (a run day in the schedule)              | nothing planned                          |
| Thu   | Lower Squat: Squat 4x3 @ 92.5, Deadlift 2x3 @ 107.5 [10] | Lower Squat: Squat 2x3, Deadlift 1x3 [5] |
| Fri   | Upper Shoulders & Arms                                   | Upper Shoulders & Arms                   |
| Sat   | Run-walk 1                                               | Run-walk 1                               |
| Sun   | Lower Deadlift: Deadlift 4x5 @ 107.5 [12]                | Lower Deadlift: Deadlift 2x5 [7]         |
| Total | 4 lifts, 2 runs, 1 rest; 229+58 min                      | 4 lifts, 2 runs, 1 rest; 154+58 min      |

Asked for three runs, gets two. Otherwise sensible: the run-walks are light and the lifting is untouched. (The stage did not move in this run because no runs were saved.)

**G1. 4-day lifter, strength goal, adds a 10K three weeks out (Sunday), 3 runs**

| Day   | Week 1 (the plan is made)                                | Week 2                                   | Week 3 (race)                  |
| ----- | -------------------------------------------------------- | ---------------------------------------- | ------------------------------ |
| Mon   | Upper Chest & Back                                       | Upper Chest & Back (half sets)           | Upper Chest & Back (half sets) |
| Tue   | Easy 30                                                  | Easy 30                                  | Easy 30                        |
| Wed   | Easy 30 + strides                                        | Easy 30                                  | Easy 30                        |
| Thu   | Lower Squat: Squat 4x3 @ 92.5, Deadlift 2x3 @ 107.5 [10] | Lower Squat: Squat 2x3, Deadlift 1x3 [5] | skipped                        |
| Fri   | Upper Shoulders & Arms                                   | Upper Shoulders & Arms                   | skipped                        |
| Sat   | Long 6K                                                  | Easy 30                                  | Easy 30                        |
| Sun   | Lower Deadlift: Deadlift 4x5 @ 107.5 [12]                | Lower Deadlift: Deadlift 2x5 [7]         | 10K Race (lift skipped)        |
| Total | 4 lifts, 3 runs, 0 rest; 22 leg sets                     | 4 lifts, 3 runs, 0 rest; 12 leg sets     | 1 lift, 4 runs, 2 rest         |

Week 1 is full lifting although the rule is "the last two weeks before the race are lighter". Weeks 2 and 3 behave.

**G3. The same lifter, plan made in race week (10K on Sunday)**

| Day   | Week 1 (race this Sunday)                                           | Week 2                                         |
| ----- | ------------------------------------------------------------------- | ---------------------------------------------- |
| Mon   | Upper Chest & Back, full                                            | Upper Chest & Back, full                       |
| Tue   | Easy 30                                                             | (no runs: the race was not logged in this run) |
| Wed   | Easy 30                                                             |                                                |
| Thu   | Lower Squat: Squat 4x3 @ 92.5, Deadlift 2x3 @ 107.5 [10]            | Lower Squat, full [10]                         |
| Fri   | Upper Shoulders & Arms (skipped on the day by the race's rest days) | Upper Shoulders & Arms, full                   |
| Sat   | Easy 30                                                             |                                                |
| Sun   | 10K Race (Lower Deadlift skipped on the day)                        | Lower Deadlift, full [12]                      |
| Total | 22 leg sets planned                                                 | 22 leg sets                                    |

No race week for the lifting at all: full-weight squats and deadlifts on Thursday, three days out, and a full week straight after the race.

**G4. The same lifter, race on a Wednesday**

| Day | Week 2 (taper)                           | Week 3 (race)                      |
| --- | ---------------------------------------- | ---------------------------------- |
| Mon | Upper Chest & Back (half sets)           | skipped (inside the two rest days) |
| Tue | Easy 30                                  | Easy 30                            |
| Wed | Easy 30                                  | 10K Race                           |
| Thu | Lower Squat: Squat 2x3 @ 92.5 [5]        | skipped                            |
| Fri | Upper Shoulders & Arms                   | skipped                            |
| Sat | Easy 30                                  |                                    |
| Sun | Lower Deadlift: Deadlift 2x5 @ 107.5 [7] | skipped                            |

The last lifting before the race is Sunday's deadlift session at full weight, three days out. Race week has no lifting.

**The default week for every count** (half marathon plan, week 7, general goal; goal does not change the layout). `*` marks a session with a squat, deadlift or RDL as a main lift. T = tempo, L = long, E = easy, with minutes.

| Lifts+runs | Mon             | Tue          | Wed                  | Thu             | Fri                | Sat   | Sun             | Rest days |
| ---------- | --------------- | ------------ | -------------------- | --------------- | ------------------ | ----- | --------------- | --------- |
| 2+2        | FB Squat*       | rest         | T45                  | rest            | FB Deadlift*       | rest  | L80             | 3         |
| 2+3        | FB Squat*       | E60          | rest                 | T45             | FB Deadlift*       | rest  | L80             | 2         |
| 2+4        | FB Squat*       | T45          | E40                  | E60             | FB Deadlift*       | L80   | rest            | 1         |
| 2+5        | FB Squat*       | E60          | T45                  | E40             | FB Deadlift*       | E40   | L80             | 0         |
| 3+2        | FB Squat*       | rest         | T45                  | FB Deadlift*    | FB Posterior*      | rest  | L80             | 2         |
| 3+3        | FB Squat*       | T45          | E60                  | FB Deadlift*    | FB Posterior*      | L80   | rest            | 1         |
| 3+4        | FB Squat*       | E60          | T45                  | FB Deadlift*    | FB Posterior*      | E40   | L80             | 0         |
| 3+5        | FB Squat* + E40 | E60          | FB Deadlift*         | T45             | FB Posterior*      | E40   | L80             | 0         |
| 4+2        | Lower Squat*    | rest         | T45                  | Lower Deadlift* | Upper              | Upper | L80             | 1         |
| 4+3        | Upper           | T45          | E60                  | Lower Squat*    | Upper              | L80   | Lower Deadlift* | 0         |
| 4+4        | Upper + E60     | Lower Squat* | Upper                | T45             | Lower Deadlift*    | E40   | L80             | 0         |
| 4+5        | Upper + E60     | Lower Squat* | Upper + E40          | T45             | Lower Deadlift*    | E40   | L80             | 0         |
| 5+2        | Pull            | L80          | T45                  | Legs Squat*     | Push               | Upper | Lower Squat*    | 0         |
| 5+3        | Pull + E60      | Push         | Legs Squat*          | Upper           | Lower Squat*       | T45   | L80             | 0         |
| 5+4        | Pull + E60      | Push         | Legs Squat* + T45    | Upper           | Lower Squat*       | E40   | L80             | 0         |
| 5+5        | Pull + E40      | Push         | Legs Squat* + T45    | Upper           | Lower Squat* + E60 | E40   | L80             | 0         |
| 6+2        | Pull + T45      | Push         | Legs Deadlift*       | Push            | Legs Squat*        | Pull  | L80             | 0         |
| 6+3        | Pull + E60      | Push         | Legs Deadlift* + T45 | Push            | Legs Squat*        | Pull  | L80             | 0         |
| 6+4        | Pull + E40      | Push         | Legs Deadlift* + T45 | Push            | Legs Squat* + E60  | Pull  | L80             | 0         |
| 6+5        | Pull + E40      | Push + E40   | Legs Deadlift* + T45 | Push            | Legs Squat* + E60  | Pull  | L80             | 0         |

## 3. Defects, most serious first

### 1. No rest day in most combined weeks

- **Severity:** injury or overreach risk.
- **Athlete experience:** trains every day for the length of the plan. The marathon persona does 7 sessions on 7 days for 17 weeks, peaking at 371 run-minutes plus two full-body lifts. The 6-day lifter does 9 sessions with no day off. Setup's own defaults (4 lifts, a regular runner's 3 runs, a race) give no rest day. Nothing says so.
- **Evidence:** 14 of 20 count pairs have 0 rest days in a build week: 2+5, 3+4, 3+5, 4+3, 4+4, 4+5, every 5+ and every 6+ (`hybrid-grid.json`). Personas A3, B, C, D2, E2: 0 rest days in every week until race week.
- **Root cause:** `src/lib/scheduleUtils.ts:130-153` gives each session its own day until all seven are used; `:159` then makes exactly `total - 7` double days, the fewest possible. `defaultWeekSchedule` (`:305-341`) only moves one run to the weekend. Setup says "Some days include a lift and a run" only past seven (`src/pages/Onboarding.tsx:1610-1614`); the layout editor checks nothing (`src/lib/weekReset.ts:43-67`).
- **Fix:** lay the week with doubles on purpose so every plan keeps at least one rest day: an easy run with an upper session first, then the quality run with a leg session. Say it at setup and let the person choose seven separate days instead.
- **Size:** M alone, part of the L in defect 2.
- **In the way:** no lock row asks for one session per day. The rule is a code comment and its tests (`scheduleUtils.ts:83-85`). Run20 (2), the weekend long run, stays.

### 2. Heavy legs sit beside the hard runs by default

- **Severity:** injury or overreach risk.
- **Athlete experience:** squats or deadlifts the day after the long run, every week (B: squat triples at 92.5 kg after 20 km; C: squat and deadlift after 25 km and 140 min). Or the day after intervals. Or the long run and tempo back to back with heavy legs next (E2). The app then tags that session "Easier today: Recommended, hard run yesterday" and counts a miss there as half: the adviser disagrees with the plan it sits on, weekly.
- **Evidence:** all 20 count pairs have at least one of the following in a build week. A leg main lift the day after the long run: 8 pairs (2+2, 2+3, 2+5, 3+2, 3+4, 3+5, 4+2, 4+3). The day after tempo or intervals: 8 pairs. The day before tempo or intervals: 4. The day before the long run: 2 (2+4, 3+3). Same day as a hard run: 5. Long run and quality back to back: 3 (5+2, 5+3, 6+2). The clash is there even where days are free: 2+2 lifts on Monday after Sunday's long run with Tuesday empty. In 12 of 60 default weeks "Why this session" warns about a clash the layout made.
- **Root cause:** three pickers that share nothing.
  - `scheduleUtils.ts:76,130-153` alternates lift and run through the slot order Mon, Wed, Fri, Tue, Thu, Sat, Sun. On the calendar that is Mon lift, Tue run, Wed run, Thu lift, Fri lift, Sat run. Three lifts and three runs could alternate perfectly and do not. Past seven, run-only days are filled last, so they are always Saturday and Sunday together (`:195-212`).
  - `src/features/program/runPlacement.ts:11-55` places quality by run spacing and by whether a day has a lift, not which lift.
  - `src/features/program/overlapModel.ts:471-522` orders lifts for the long run's eve and lift-to-lift seams only (`:484-500`). Nothing weighs the day after the long run, either side of quality, or the same day.
- **Fix:** one scored layout for the whole week, replacing the three: day types, which run where and which lift where in one search (small: the lift-order search already tries 720 orders). Costs in order: a rest day; long and quality runs two days apart; no leg main lift the day before or after a long or quality run unless it shares the quality day; no leg days back to back; long run at the weekend. Plans people have keep their days, with "Re-lay my week" offered in the layout sheet.
- **Size:** L.
- **In the way:** Lift13 (this extends it). Run20 (2) and (3) keep. Lift4 (10) "nothing moves" holds for plans people already have. ADR-0002 is untouched: this sets a starting order.

### 3. The spacing lasts until the first missed lift

- **Severity:** injury or overreach risk.
- **Athlete experience:** miss Thursday's session once. On Friday the calendar says Upper, Home offers Lower Squat, the day before the long run. From the next week on, the squat day sits on the long run's eve every week, with the app's own note warning about it.
- **Evidence:** `hybrid-slip.json`. Week 1 as planned: Mon Upper, Thu Lower Squat, Fri Upper, Sat Long, Sun Lower Deadlift. After Monday only: Friday's slot is "Upper Shoulders & Arms", Home offers "Lower Squat Focus". One session left undone, then weeks 2 and 3: Mon Lower Deadlift, Thu Upper, Fri Lower Squat [11], Sat Long, Sun Upper. Friday's note: "Your long run is the next day, and heavy leg work can leave your legs tired for it."
- **Root cause:** lifts run in order, not by day. `src/features/program/nextUpCursor.ts:20-36` offers the first session not done; `src/lib/homeLift.ts:45` puts it on today's card; `src/features/program/programEngine.ts:3097-3100` rotates the week to start with the session not reached. None of them looks at the runs.
- **Fix:** keep lifts split-ordered, make "next up" aware of the runs. Among the sessions still to do this week, offer the one that fits today (not the leg session the day before or after a long or quality run when an upper one is waiting). At the rollover, choose the new order the same way. No session is dropped and nothing is doubled.
- **Size:** M.
- **In the way:** Lift4 (10) ("heavy legs before a long or key run is a note, and nothing moves"), Lift4 (11) ("the session order carries over"), ADR-0002 (kept: still no weekday pinning). Owner call 2.

### 4. No race taper for the lifting in the week a plan is made

- **Severity:** breaks trust, with overreach in race week.
- **Athlete experience:** adds a race 6, 13 or 20 days out and the lifting for the rest of that week is unchanged. In race week that is squats 4x3 @ 92.5 kg and deadlifts on Thursday, three days before a 10K, described only as "built for strength". Because the week was never marked as race week, the week after the race is full too.
- **Evidence:** `hybrid-probe.json`: race added 20, 13 and 6 days out on an existing 4-day plan gives `currentPhase: progression`, no `raceWeek`, 56 sets, while `raceLiftWeek` calls that same week "taper", "taper" and "race". Personas G1 week 1 (22 leg sets), G3 weeks 1 and 2 (22 and 22).
- **Root cause:** the race's weeks are applied only by the rollover (`programEngine.ts:2951`, `:3043-3053`, `:3101-3107`). `buildPlan` handles the build-week trim alone (`src/features/program/planBuilder.ts:706-725`) and only carries a lighter week that already exists (`:660-677`).
- **Fix:** in `buildPlan`, when the run plan's week is one of the race's (`raceBlockWeek`, `raceLiftWeek`), halve the sessions not yet done, apply race week's one session, and stamp `currentPhase` and `raceWeek`.
- **Size:** S to M.
- **In the way:** nothing. This is Lift4 (10) not reaching one path.

### 5. Without a race the hybrid has no combined plan

- **Severity:** breaks trust (it is the pitch).
- **Athlete experience:** says "I lift 4 days and run regularly" and gets a lifting week with no runs on it, no weekly run target, and leg days placed with no idea when they run. The 6-day lifter's one free day follows the Legs Deadlift day.
- **Evidence:** A1, D1, E1: 0 run days, `weeklyRunDaysTarget: 0`. The lifting is identical with and without the runs (A1 and A3: 56 sets, 226 min). The only joins left for a free runner are the Easier today tag and the half miss, and a free run counts as hard only from 75 minutes (`src/lib/hybridGuidance.ts:37,47`), so a 45-minute interval session is invisible to the lifting.
- **Root cause:** by decision. `src/lib/onboardingPlan.ts:57-62`, `planBuilder.ts:318,857`, `src/features/program/weekRollover.ts:492-496`, `src/lib/trainingWeek.ts:17-20`.
- **Fix:** not a run plan. Ask a free runner which days they usually run and which is the long or hard one, store them as run days on the week (the field and the editor exist), and lay the lift days and leg sessions around them with defect 2's scorer. No runs prescribed, no target.
- **Size:** M after defect 2.
- **In the way:** Run9a and its 2026-05-29 stress test (hole 1), `GLOSSARY.md:415-458` ("Do NOT re-derive an open-ended running plan"). Owner call 3.

### 6. The person's own days are thrown away

- **Severity:** breaks trust.
- **Athlete experience:** (a) setup never asks which days. (b) A free runner who marks run days in the layout sheet loses the whole layout at the next settings save. (c) Anyone who adds or removes one lift day in settings gets the whole week re-dealt: the long run moves from Sunday to Saturday and the rest day goes.
- **Evidence:** `hybrid-probe.json`: "Mon lift, Tue run, Wed lift, Thu run, Fri lift, Sat lift, Sun run" becomes "Mon lift, Tue lift, Wed lift, Thu rest, Fri lift, Sat rest, Sun rest" after an equipment change. `hybrid-probe2.json`: "Mon lift, Tue run, Wed lift, Thu run, Fri lift, Sat rest, Sun run" with one more lift day becomes "Mon lift, Tue run, Wed run, Thu lift, Fri lift, Sat run, Sun lift"; the long run goes Sunday to Saturday. The confirm says "rebuilds your weekly structure" and nothing about the runs (`src/lib/programmeChanges.ts:337-339`).
- **Root cause:** `scheduleUtils.ts:361-375` keeps the week only when both counts match, else deals the default. A free runner's count is forced to 0 (`planBuilder.ts:318`, `src/components/program/ProgrammeSettings.tsx:575-576`), so marked run days never match. The layout sheet lets a free runner mark them (`src/features/program/useProgrammeScheduleEditor.ts:205-223,249-252`). Setup shows a preview only (`Onboarding.tsx:1349,2142`).
- **Fix:** keep every day still valid and apply the smallest change (place the added day, remove the dropped one). Never rewrite a free runner's marked days. Ask the days at setup, with the laid week as the default.
- **Size:** M.
- **In the way:** nothing; Pgm5 (keep the structure on a content edit) argues for it.

### 7. "Lighten leg sessions" removes far less than it says, often nothing

- **Severity:** breaks trust.
- **Athlete experience:** answers yes to "A third fewer sets on leg lifts". On a Support my running 2-day plan, where yes is the default, nothing changes at all.
- **Evidence:** `hybrid-trim.json`, 225 plans: the yes changes nothing in 82 (36%); the median cut is 14% of leg sets; 38 plans reach 30%. Support my running, intermediate, 60 min: 2 days 10 to 10, 3 days 16 to 14. Persona C: 10 leg sets from week 1 to week 15 while running goes 185 to 371 min.
- **Root cause:** `programEngine.ts:3156-3158`: a lift keeps at least two sets, and these plans' leg lifts already have two. Copy: `Onboarding.tsx:1622`, `src/lib/liftSessionPurpose.ts:129-130`.
- **Fix:** now: do not show the switch when it would change nothing, and word what it does. Then: see defect 9.
- **Size:** S for the copy.
- **In the way:** Lift4 (10); decisions.md L12 measured this and answered "Kept" (the two-set floor). The promise in the copy was not part of that answer.

### 8. Two sessions on one day: no order by content, no gap, and the clash flag is never shown

- **Severity:** hurts quality.
- **Athlete experience:** tempo and Legs Deadlift share Wednesday (D2). Home leads with the lift because the goal is not running. Nothing says which first or how far apart. Nothing marks the day.
- **Evidence:** D2 weeks 5 to 9. A leg main lift shares a day with a hard run in 5 count pairs (5+4, 5+5, 6+3, 6+4, 6+5), by coincidence of two pickers.
- **Root cause:** order is one rule, goal equals running (`todaySession.ts:364`, `src/lib/homeHero.ts:57-66`). `clashesWithLift` is written (`src/features/program/runScheduler.ts:1925-1927`) and its promised "shares a day with lifting" note (`src/features/program/programTypes.ts:600-607`) is rendered nowhere; `hardClashDays` is computed and unused (`src/lib/raceGoalPlanner.ts:470,518`). The only reader is the move sheet's warning (`src/components/program/plan/MoveRunSheet.tsx:72`).
- **Fix:** order by what the sessions are: a quality run first and the lift later; an easy run after lifting. One line on the day ("Run first, lift later, a few hours apart if you can"). Choose which double day takes the quality run by the lift on it.
- **Size:** S to M.
- **In the way:** nothing found.

### 9. Neither half sizes itself to the other, and feedback runs one way

- **Severity:** hurts quality.
- **Athlete experience:** the lifting is the same whether they run 0 or 370 minutes a week; the runs are the same whether they lift 2 or 6 days. A long run that wrecks them changes nothing unless they pick "Easier today" themselves. A heavy leg day never changes a run. "Take it easier this week" on the run tab leaves the lifting at full.
- **Evidence:** A1 against A3: same 56 sets. A3 against D2: runs 95, 95, 95, 95, 115, 134, 150, 160, 85 min for both. C: leg sets flat at 10 while running doubles. Beginners and 2-day lifters get no lighter week on the run plan's step-back weeks (`src/features/program/weekPrescription.ts:51-59`).
- **The joins that exist:** lighter lift week on the run plan's step-back week; two lighter weeks, race week and the week after; the opt-in leg trim; the eve-of-long-run order at creation (Lift13); the "next day" note; the Easier today tag after a hard run yesterday (`src/features/program/easierToday.ts:158-169`); a leg miss after a hard run counts half (`src/features/program/sessionCompletion.ts:284-292`); a manual lighter week steps the runs down a rung (`src/lib/planDeloadWeek.ts`, `useProgram.ts:3266-3276`). From lifting to running: nothing. The run plan knows only which days are doubles. Run-tab easing touches runs only (`src/lib/adjustWeek.ts:1-18`).
- **Fix:** phase-aware lifting for anyone with a race: build early, then hold leg work at maintenance (fewer leg sets, same weights) as weekly run minutes climb, for everyone, not as an opt-in. One "ease this week" action for both halves.
- **Size:** L.
- **In the way:** Lift4 (10) (opt-in trim). decisions.md R25 and L13 already list this as "Measuring, not run yet".

### 10. The lift order is chosen before the week is finished being built

- **Severity:** hurts quality.
- **Athlete experience:** deadlift on Thursday and Romanian deadlift on Friday (B), the worst pair of the three by the builder's own measure (3-day general plan: that pair overlaps 13, squat with posterior 10; `hybrid-probe.json`).
- **Evidence:** `hybrid-probe3.json`: re-running the ordering rule on the finished week finds a strictly better order in 199 of 900 hybrid plans, and in 129 of 180 with three lift days (3+2: 42 of 45, 3+3: 45 of 45, 3+4: 42 of 45).
- **Root cause:** `orderForAdjacency` runs at `programEngine.ts:2003`, before the overlap caps (`:2019`), the level gate (`:2023`), the repeat cap (`:2034`), the twice-weekly additions (`:2041`), injuries and kit (`:2049-2078`), the role table and the time fit all change what is in each session.
- **Fix:** run it last, on new plans only (its own contract, `overlapModel.ts:466-469`).
- **Size:** S.
- **In the way:** nothing.

### 11. A new runner who lifts gets two runs when they asked for three

- **Severity:** hurts quality.
- **Evidence:** persona F: run days Tue, Wed, Sat; runs on Tue and Sat; Wednesday is an empty run day. A done week needs two runs, so there is no slack.
- **Root cause:** the default week puts two run days side by side (defect 2), and the starter will not run on adjacent days (`src/features/program/starterPlan.ts:199`).
- **Fix:** falls out of defect 2. Alone: space the run days when the goal is the starter's. **Size:** S.

### 12. Fuel follows the planned calendar, not the combined day

- **Severity:** hurts quality (Pro only).
- **What happens:** calories are flat whatever the day (`src/hooks/useEffectiveTargets.ts:212`, Nutr1). The fat-to-carb shift takes the higher of the run and the lift, never both (`src/lib/dayIntensity.ts:191`). The lift's tier is the programme's heaviest day applied to every lift day (`src/lib/trainingSignals.ts:105,151`, `dayIntensity.ts:168`). It follows the weekday the lift was planned on, not the session done.
- **Evidence:** 4+3 build week: Upper Shoulders & Arms is HARD and the 60-minute medium-long run is EASY; six HARD days of seven. 6+3: the Legs days are MODERATE. A free runner's run day is REST; a schedule run day with nothing planned is MODERATE whether or not they run (`dayIntensity.ts:141-145`, `hybrid-recovery.json` week 8).
- **Fix:** tier each lift day from its own session; on a double day step up one tier; count an easy run of 60 minutes or more as MODERATE (Run20 (3)'s own line); for a free runner read the run saved today. **Size:** M.
- **In the way:** Nutr1 (flat calories) stays.

### 13. A midweek race

- **Severity:** polish.
- **Evidence:** G4: the last session before a Wednesday race is the taper week's Sunday Lower Deadlift at full weight (Deadlift 2x5 @ 107.5), three days out. Race week then has no lifting.
- **Root cause:** "nothing heavy for the legs" belongs to race week's one session (`programEngine.ts:3195-3223`), and that session falls inside the two rest days (`src/features/program/raceRest.ts:22`).
- **Fix:** apply the half-weight leg rule to any session within five days of the race. **Size:** S.

### 14. After a half or a marathon, full leg lifting is back after one week

- **Severity:** polish, owner call 7.
- **Evidence:** `hybrid-recovery.json`: marathon on Sunday; one lighter lift week; full sessions from the Monday eight days after, while the run side holds four recovery weeks of Easy 30.
- **In the way:** Lift4 (10) ("the week after is light"), which replaced RP2d (lifts lighter for the length of the run recovery).

## 4. What already works and must not be broken

- **The race's final weeks**, once the plan is rolling: two lighter lift weeks whatever the run taper, race week as one short session with leg lifts at half weight, sessions inside the two days before the race skipped, a lighter week after. Seen in A3 weeks 8 to 11, B 10 to 13, C 16 to 19, D2, E2. Each week says why in "Why this session".
- **Lifts ease when the runs do:** the lighter lift week lands on the run plan's step-back week (B weeks 4 and 8), not on a separate count.
- **Lifts give way at the run peak** for a 10K: lifts halve in week 8 as the runs hit their highest week (A3).
- **The long run** goes to a weekend run-only day; quality stays off the long run's neighbours and off lift days where the week has room (`runPlacement.ts`).
- **Lift13:** on an upper/lower week the session before the long run is an upper one at creation (4+2 and 4+3 in the grid).
- **No session is lost** when a day slips (ADR-0002). Any fix to defect 3 has to keep that.
- **The person's days are kept** when the counts do not change, and the run plan is laid on them (`hybrid-owndays.json`, kept in all four cases).
- **Support my running keeps lifts heavy and short** (2 sets of 3 to 5): right for runners. The problem is where the sessions sit, not what is in them.
- **Honest advice:** Easier today is recommended for one known reason only; a leg miss after a hard run counts half; no readiness score.
- **A manual lighter week** eases both halves a notch.
- **Fuel:** the day before a long run is fuelled up, and the taper has its own calories.
- **The starter** never runs two days running.

## 5. Owner calls needed

1. **A rest day by default.** (a) Keep one session a day until the week is full (today). (b) Always keep at least one rest day by making doubles on purpose. (c) Ask at setup. **Recommend (b)**, with the question asked only when lifts plus runs reach seven.
2. **May the app choose which waiting lift comes next by the runs around it?** (a) Keep plain rotation and the note (Lift4 (10), (11)). (b) Run-aware next-up inside the week: no session dropped, no weekday pinning. (c) Pin leg sessions to weekdays (reverses ADR-0002). **Recommend (b).**
3. **Hybrids without a race.** (a) Keep free running as it is (Run9a). (b) Ask the usual run days and the long or hard one, and lay the lifting around them; still no run prescribed and no target. (c) A no-race run plan (reverses Run9a). **Recommend (b).** It keeps the lock's position and gives the pitch something to stand on.
4. **Lifting through a race block.** (a) Keep the opt-in trim with its two-set floor. (b) Hide the switch where it does nothing and reword it. (c) Leg work steps down to maintenance as run minutes climb, for everyone with a race (decisions.md R25, L13). **Recommend (b) now and (c) as the designed piece.**
5. **Order on a double day.** (a) Keep "running goal means run first". (b) By content: quality run first, lift later; easy run after the lift; one line about the gap. **Recommend (b).**
6. **Ask the days at setup?** **Recommend yes**, one screen, with "lay it out for me" as the default answer.
7. **Leg lifting after a half or a marathon.** (a) One light week (Lift4 (10)). (b) Leg lifts stay light for the run recovery's length, upper body back after a week. **Recommend (b)** for the half and the marathon only.

## 6. Not verified

- Nothing was run in a browser or on the emulators. What Home, Train, the layout sheet and the pre-session chooser actually draw is read from code: the Easier today "Recommended" tag, the empty run day in F, a free runner reaching the layout sheet's run days, the confirm copy.
- The lifter was not simulated. Every lift was marked done without logging sets, so weights never moved and misses after long runs were not measured. `src/test/sim` was not run.
- The race was not logged, so the hand-off into recovery (`completeRunDay`) was not exercised; for `hybrid-recovery.json` the recovery phase was set by hand. Run days after race week in the tables are leftovers of that.
- The grid is one level (intermediate), one session length (60 min) and a full gym, on a half marathon plan in week 7. Layout depends on the counts only by the code, but other levels, kits, 5K and marathon grids were not printed. Run tuning (bigger, harder) was not varied.
- The server copies in `functions/` (deload, commands, `leaguePlanned`) were not read.
- Whether a real athlete recovers from any of these weeks is coaching convention applied to the printed plan, not a measurement.
- The Lift13 sweep of 675 setups was not re-run; its numbers are quoted from the lock row.
- Fuel labels ("Lighter week", "Taper week") come from a React hook and were read, not run; the tiers were run (`classifyDayIntensity`).
