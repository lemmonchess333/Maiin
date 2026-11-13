# The running engine's actual output: a coach's read

Investigator slice: the running engine, in code and in printed plans. Worktree a checkout of main at `a199cfd7` (main), 2026-11-11.
Every plan below is the real engine's output. Seasons were driven a day at a time through the repo's own simulator
(`src/test/sim/liftSeason.ts`: setup's `buildOnboardingPlan`, the weekly `rollRunWeeks`, the run screen's prefill, the server's race sweep),
with my personas, seed 1, every planned run done and the injury draw switched off unless stated. Raw output: `evidence/run/*.json|txt`,
direct generator outlines in `evidence/direct/`. Scratch tests: `src/features/program/__tests__/zzRun*.scratch.test.ts`.
Race times and VDOT drift in the seasons are the simulator's model (fitness follows minutes), useful for direction only. Sessions, minutes and km are the engine's.

## 1. Verdict

- A coach would sign the starter (run-walk) path and, with small edits, the 10K and half plans for a first-timer. A coach would not sign any marathon plan, the plan for an experienced runner, or the 5K plan as a "get faster" plan.
- The engine is safe week to week and errs low. The injury risk it creates is at the edges: race day at 1.7 to 2.8 times the longest training run, long-run steps of +20 to +33%, and 1 km "hard" reps for someone two weeks out of run-walk.
- It does not individualise. Volume comes from the race distance and the number of run days, not from the runner: the peak week is 2.4x a low-volume runner's habit and 1.06x an experienced marathoner's, who is cut to 56% of his normal week in week 1.
- Paces come from the runner's own fitness (VDOT from a typed race) but do not move during a plan unless the runner types a new race time (Pro gets a suggestion, and only from a race or a tempo run faster than prescribed).
- Not on par with a top-tier plan app on plan content: 7 quality sessions in 3 shapes, no plan without a race date, nothing after the recovery weeks. Delivery of a session (structured segments, spoken cues, pace on screen) is good.

## 2. The plans

Legend. `E30` easy run, 30 min, conversational; a pace band is shown when a benchmark is confirmed, never a target. `E30s` the same, ending with 4 x 20 s strides. `ML60/75/90` medium-long easy run.
`L15` long run, 15 km, easy effort. `T20/T30/T40` tempo: 5 to 10 min warm-up, 20 / 30 / 2 x 20 min at threshold pace (the middle of the band), 5 min cool-down; with a half or marathon goal time the blocks run at goal pace instead.
`4x1k/5x1k/6x1k` 5 min warm-up, 1 km reps at interval pace, 90 s recoveries, 5 min cool-down. `8x400` 400 m reps at interval pace, 60 s recoveries. `RW1-6` run-walk sessions, `NS20/25/30` 5 min walk then N min non-stop.
Min = minutes at the runner's own paces. km is approximate. Long % = the long run's share of the week's minutes. Hard % = minutes at tempo or interval pace. Phase names are the engine's.

### A. Brand new runner, starter goal "30 minutes", 3 runs a week

| Wk  | Phase   | Sessions (Mon→Sun)             | Min | ≈km | Long km | Long % | Δ min | Hard % |
| --- | ------- | ------------------------------ | --- | --- | ------- | ------ | ----- | ------ |
| 1   | starter | Wed RW1 · Fri RW1 · Sun RW1    | 87  | 8   | -       | -      |       | 0%     |
| 2   | starter | Wed RW2 · Fri RW2 · Sun RW2    | 87  | 8   | -       | -      | +0%   | 0%     |
| 3   | starter | Wed RW3 · Fri RW3 · Sun RW3    | 75  | 7   | -       | -      | -14%  | 0%     |
| 4   | starter | Wed RW4 · Fri RW4 · Sun RW4    | 90  | 9   | -       | -      | +20%  | 0%     |
| 5   | starter | Wed RW5 · Fri RW5 · Sun RW5    | 90  | 9   | -       | -      | +0%   | 0%     |
| 6   | starter | Wed RW6 · Fri RW6 · Sun RW6    | 90  | 9   | -       | -      | +0%   | 0%     |
| 7   | starter | Wed NS20 · Fri NS20 · Sun NS20 | 90  | 9   | -       | -      | +0%   | 0%     |
| 8   | starter | Wed NS25 · Fri NS25 · Sun NS25 | 105 | 10  | -       | -      | +17%  | 0%     |
| 9   | starter | Wed NS30 · Fri NS30 · Sun NS30 | 120 | 12  | -       | -      | +14%  | 0%     |
| 10  | no plan | (nothing planned)              | 0   | 0   | -       | -      | -     | -      |

Sessions: RW1 = 8 x (1 min run, 90 s walk); RW2 = 6 x (90 s, 2 min walk); RW3 = 90 s and 3 min, twice; RW4 = 3 x 5 min; RW5 = 10 + 8 min; RW6 and NS20 = 20 min non-stop. A week repeats until two of its runs are saved.
Read: this is NHS Couch to 5K's shape and a coach would sign it. Longest continuous run goes 5, 10, 20 min in weeks 4 to 6 (doubling twice); week 7 repeats week 6. After week 9 the plan is over and nothing is planned.

### B. Brand new runner who picks a 5K race 11 weeks out, 3 runs a week (no benchmark)

| Wk  | Phase    | Sessions (Mon→Sun)            | Min | ≈km | Long km | Long % | Δ min | Hard % |
| --- | -------- | ----------------------------- | --- | --- | ------- | ------ | ----- | ------ |
| 1   | base     | Wed RW1 · Fri RW1 · Sun RW1   | 87  | 8   | -       | -      |       | 0%     |
| 2   | base     | Wed RW2 · Fri RW2 · Sun RW2   | 87  | 8   | -       | -      | +0%   | 0%     |
| 3   | base     | Wed RW3 · Fri RW3 · Sun RW3   | 75  | 7   | -       | -      | -14%  | 0%     |
| 4   | base     | Wed RW4 · Fri RW4 · Sun RW4   | 90  | 9   | -       | -      | +20%  | 0%     |
| 5   | build    | Wed RW5 · Fri RW5 · Sun RW5   | 90  | 9   | -       | -      | +0%   | 0%     |
| 6   | build    | Wed RW6 · Fri RW6 · Sun RW6   | 90  | 9   | -       | -      | +0%   | 0%     |
| 7   | build    | Wed E20 · Fri E20 · Sun E20   | 60  | 6   | -       | -      | -33%  | 0%     |
| 8   | build    | Wed 4x1k · Fri E30 · Sun E30  | 105 | 12  | -       | -      | +74%  | 29%    |
| 9   | build    | Wed T20 · Fri E30 · Sun L6    | 116 | 13  | 6       | 48%    | +11%  | 17%    |
| 10  | taper    | Wed 8x400 · Fri E30 · Sun E30 | 101 | 11  | -       | -      | -13%  | 24%    |
| 11  | race     | Wed E30 · Fri E30 · Sun RACE  | 102 | 11  | 5       | 41%    | +1%   | 0%     |
| 12  | recovery | Wed E30 · Fri E30 · Sun E30   | 90  | 10  | -       | -      | -12%  | 0%     |
| 13  | no plan  | (nothing planned)             | 0   | 0   | -       | -      | -     | -      |

Read: weeks 1 to 6 are right. Week 8 is not: the week goes from 60 to about 105 minutes and opens with `4x1k` "hard", two weeks after the first 20 minutes non-stop. It took this runner 41 min and 5.6 km against a longest run of 3.3 km (x1.68). The template says 29 min. The 5K race came in at 34:11 in the model.

### C. 5K improver, 3 runs a week, recent 5K 27:30 (VDOT 34.2), runs 100 min a week, longest 6 km

Paces: easy 6:46-7:36, tempo 5:50, intervals 5:17 /km. Fixed for the whole plan.

| Wk  | Phase    | Sessions (Mon→Sun)            | Min | ≈km | Long km | Long % | Δ min | Hard % |
| --- | -------- | ----------------------------- | --- | --- | ------- | ------ | ----- | ------ |
| 1   | base     | Wed E30 · Fri E30s · Sun L6   | 103 | 14  | 6       | 42%    |       | 0%     |
| 2   | base     | Wed E30 · Fri E30s · Sun L6   | 103 | 14  | 6       | 42%    | +0%   | 0%     |
| 3   | base     | Wed E30 · Fri E30s · Sun L6   | 103 | 14  | 6       | 42%    | +0%   | 0%     |
| 4   | base     | Wed E30 · Fri E30s · Sun L6   | 103 | 14  | 6       | 42%    | +0%   | 0%     |
| 5   | build    | Wed T20 · Fri E40 · Sun L6    | 113 | 16  | 6       | 38%    | +10%  | 18%    |
| 6   | build    | Wed 4x1k · Fri E40 · Sun L6   | 119 | 17  | 6       | 36%    | +5%   | 18%    |
| 7   | build    | Wed T20 · Fri E40 · Sun L6    | 113 | 16  | 6       | 38%    | -5%   | 18%    |
| 8   | build    | Wed 5x1k · Fri E50 · Sun L8   | 150 | 22  | 8       | 38%    | +32%  | 18%    |
| 9   | taper    | Wed 8x400 · Fri E30 · Sun E30 | 94  | 14  | -       | -      | -37%  | 18%    |
| 10  | race     | Wed E30 · Fri E30 · Sun RACE  | 88  | 13  | 5       | 31%    | -7%   | 0%     |
| 11  | recovery | Wed E30 · Fri E30 · Sun E30   | 90  | 13  | -       | -      | +3%   | 0%     |
| 12  | no plan  | (nothing planned)             | 0   | 0   | -       | -      | -     | -      |

Read: four identical weeks to open, the long run sits at 6 km (the runner's existing long run) for seven weeks and peaks at 8 km once. Four quality sessions in ten weeks, none before week 5, no work at 5K pace or faster than interval pace. One week of recovery, then no plan. Model race: 27:40 against a 27:30 benchmark. Safe, and not a plan to get faster.

### D. 10K, 4 runs a week, recent 10K 54:00 (VDOT 36.6), runs 150 min a week, longest 8 km, 12 weeks

Paces: easy 6:25-7:12, tempo 5:31, intervals 5:00 /km.

| Wk  | Phase    | Sessions (Mon→Sun)                      | Min | ≈km | Long km | Long % | Δ min | Hard % |
| --- | -------- | --------------------------------------- | --- | --- | ------- | ------ | ----- | ------ |
| 1   | base     | Mon E30 · Wed E30s · Fri E30 · Sun L6   | 131 | 19  | 6       | 31%    |       | 0%     |
| 2   | base     | Mon E30 · Wed E30s · Fri E30 · Sun L6   | 131 | 19  | 6       | 31%    | +0%   | 0%     |
| 3   | base     | Mon E30 · Wed E30s · Fri E30 · Sun L6   | 131 | 19  | 6       | 31%    | +0%   | 0%     |
| 4   | base     | Mon E30 · Wed E30s · Fri E30 · Sun L6   | 131 | 19  | 6       | 31%    | +0%   | 0%     |
| 5   | build    | Mon E40 · Wed T20 · Fri E30s · Sun L8   | 154 | 23  | 8       | 35%    | +18%  | 13%    |
| 6   | build    | Mon E40 · Wed 4x1k · Fri E40s · Sun L8  | 169 | 26  | 8       | 32%    | +9%   | 12%    |
| 7   | build    | Mon E50 · Wed T20 · Fri E40s · Sun L10  | 188 | 28  | 10      | 36%    | +11%  | 11%    |
| 8   | build    | Mon E40 · Wed 4x1k · Fri E30s · Sun L8  | 159 | 24  | 8       | 34%    | -15%  | 13%    |
| 9   | build    | Mon E40 · Wed T30 · Fri E40s · Sun L10  | 193 | 29  | 10      | 35%    | +21%  | 16%    |
| 10  | build    | Mon E50s · Wed 5x1k · Fri E50 · Sun L12 | 223 | 34  | 12      | 37%    | +15%  | 11%    |
| 11  | taper    | Mon E30 · Wed 8x400 · Fri E30 · Sun E30 | 123 | 19  | -       | -      | -45%  | 13%    |
| 12  | race     | Mon E30 · Wed E30 · Fri E30 · Sun RACE  | 144 | 23  | 10      | 38%    | +17%  | 0%     |
| 13  | recovery | Mon E30 · Wed E30 · Fri E30 · Sun E30   | 120 | 18  | -       | -      | -17%  | 0%     |
| 14  | recovery | Mon E30 · Wed E30 · Fri E30 · Sun E30   | 120 | 18  | -       | -      | +0%   | 0%     |

Read: a coach would sign this for a first 10K. Cutback in week 8, taper week, two recovery weeks. Marks against it: weeks 1 to 4 identical and below what the runner already does (131 v 150 min, long run 6 v 8 km), every long-run step is +20 to +33%, peak long run only 12 km, taper cuts 45% in one step. The 3-run version of the same runner starts at 101 min (67% of habit).

### E. Half marathon, 4 runs a week, recent 5K 25:00 (VDOT 38.3), runs 160 min a week, longest 10 km, 14 weeks

Paces: easy 6:11-6:57, tempo 5:19, intervals 4:49 /km.

| Wk  | Phase    | Sessions (Mon→Sun)                       | Min | ≈km | Long km | Long % | Δ min | Hard % |
| --- | -------- | ---------------------------------------- | --- | --- | ------- | ------ | ----- | ------ |
| 1   | base     | Mon E30 · Wed E30s · Fri E30 · Sun L10   | 156 | 24  | 10      | 42%    |       | 0%     |
| 2   | base     | Mon E30 · Wed E30s · Fri E30 · Sun L10   | 156 | 24  | 10      | 42%    | +0%   | 0%     |
| 3   | base     | Mon E30 · Wed E30s · Fri E30 · Sun L12   | 169 | 26  | 12      | 47%    | +8%   | 0%     |
| 4   | base     | Mon E30 · Wed E30s · Fri E30 · Sun L10   | 156 | 24  | 10      | 42%    | -8%   | 0%     |
| 5   | base     | Mon E40 · Wed E30s · Fri E30 · Sun L12   | 179 | 27  | 12      | 44%    | +15%  | 0%     |
| 6   | build    | Mon E40 · Wed 4x1k · Fri E40s · Sun L15  | 212 | 33  | 15      | 46%    | +19%  | 9%     |
| 7   | build    | Mon E50 · Wed T20 · Fri E40s · Sun L15   | 218 | 34  | 15      | 45%    | +3%   | 9%     |
| 8   | build    | Mon E40 · Wed 4x1k · Fri E30s · Sun L12  | 183 | 29  | 12      | 43%    | -16%  | 11%    |
| 9   | build    | Mon E40s · Wed T30 · Fri E40 · Sun L15   | 224 | 35  | 15      | 44%    | +22%  | 13%    |
| 10  | build    | Mon E40s · Wed 5x1k · Fri ML60 · Sun L15 | 239 | 38  | 15      | 41%    | +7%   | 10%    |
| 11  | build    | Mon E50s · Wed T30 · Fri E50 · Sun L20   | 276 | 43  | 20      | 48%    | +16%  | 11%    |
| 12  | taper    | Mon E30 · Wed 8x400 · Fri E30 · Sun L12  | 171 | 27  | 12      | 46%    | -38%  | 9%     |
| 13  | taper    | Mon E30 · Wed 8x400 · Fri E30 · Sun E30  | 122 | 19  | -       | -      | -29%  | 13%    |
| 14  | race     | Mon E30 · Wed E30 · Fri E30 · Sun RACE   | 205 | 35  | 21.1    | 56%    | +67%  | 0%     |
| 15  | recovery | Mon E30 · Wed E30 · Fri E30 · Sun E30    | 120 | 18  | -       | -      | -41%  | 0%     |

Read: the best plan the engine makes. Real base, six quality sessions, 20 km peak, two-step taper with a 12 km long run, three recovery weeks. Marks against it: the first 20 km run is a +33% step and falls in the last build week (only one before the race), long run is 42 to 48% of the week, five weeks with no quality for a regular runner. The 12-week version goes 15, 12 (cutback), 20 km in its last three build weeks (+38% weekly minutes into the peak week, table in `evidence/run/p04-half-4runs-12w.txt`).

### F. First marathon, 4 runs a week, recent 10K 55:00 (VDOT 35.8, predicted marathon about 4:13), runs 170 min a week, longest 12 km, 18 weeks

Paces: easy 6:31-7:20, tempo 5:37, intervals 5:05 /km. No goal time, so no marathon-pace running anywhere.

| Wk  | Phase    | Sessions (Mon→Sun)                       | Min | ≈km | Long km | Long % | Δ min | Hard % |
| --- | -------- | ---------------------------------------- | --- | --- | ------- | ------ | ----- | ------ |
| 1   | base     | Mon E30 · Wed E30s · Fri E30 · Sun L12   | 173 | 25  | 12      | 48%    |       | 0%     |
| 2   | base     | Mon E30 · Wed E30s · Fri E30 · Sun L12   | 173 | 25  | 12      | 48%    | +0%   | 0%     |
| 3   | base     | Mon E30 · Wed E30s · Fri E30 · Sun L15   | 194 | 28  | 15      | 54%    | +12%  | 0%     |
| 4   | base     | Mon E30 · Wed E30s · Fri E30 · Sun L12   | 173 | 25  | 12      | 48%    | -11%  | 0%     |
| 5   | base     | Mon E40 · Wed E30s · Fri E30 · Sun L15   | 204 | 29  | 15      | 51%    | +18%  | 0%     |
| 6   | base     | Mon E50 · Wed E30s · Fri E30 · Sun L15   | 214 | 31  | 15      | 49%    | +5%   | 0%     |
| 7   | build    | Mon E50 · Wed T20 · Fri E30s · Sun L15   | 214 | 32  | 15      | 49%    | +0%   | 9%     |
| 8   | build    | Mon E40 · Wed 4x1k · Fri E30s · Sun L12  | 188 | 28  | 12      | 44%    | -12%  | 11%    |
| 9   | build    | Mon E40s · Wed T20 · Fri E40 · Sun L15   | 214 | 32  | 15      | 49%    | +14%  | 9%     |
| 10  | build    | Mon E40s · Wed 5x1k · Fri E40 · Sun L15  | 225 | 34  | 15      | 46%    | +5%   | 11%    |
| 11  | build    | Mon E40s · Wed T30 · Fri E40 · Sun L20   | 264 | 39  | 20      | 53%    | +17%  | 11%    |
| 12  | build    | Mon E30s · Wed 4x1k · Fri ML60 · Sun L15 | 229 | 34  | 15      | 45%    | -13%  | 9%     |
| 13  | build    | Mon E40s · Wed T30 · Fri E50 · Sun L20   | 274 | 41  | 20      | 51%    | +20%  | 11%    |
| 14  | build    | Mon E50s · Wed 6x1k · Fri E50 · Sun L20  | 286 | 43  | 20      | 48%    | +5%   | 11%    |
| 15  | taper    | Mon E30 · Wed 8x400 · Fri ML60 · Sun L15 | 227 | 34  | 15      | 46%    | -21%  | 7%     |
| 16  | taper    | Mon E50 · Wed 8x400 · Fri E30 · Sun L12  | 196 | 29  | 12      | 42%    | -14%  | 8%     |
| 17  | taper    | Mon E30 · Wed 8x400 · Fri E30 · Sun E30  | 123 | 19  | -       | -      | -37%  | 13%    |
| 18  | race     | Mon E30 · Wed E30 · Fri E30 · Sun RACE   | 343 | 55  | 42.2    | 74%    | +178% | 0%     |
| 19  | recovery | Mon E30 · Wed E30 · Fri E30 · Sun E30    | 120 | 17  | -       | -      | -65%  | 0%     |

Read: a coach would not sign it. Longest run 20 km (2 h 18), three times; the race is 2.11x the longest run of the previous 30 days. Peak week 43 km. Long run is 42 to 54% of every week. The planner calls it "Good runway. Full Base → Build → Taper → Race progression for your marathon." The day after the marathon holds an easy 30. The 20-week version is the same with one more 20 km run.

### G. Experienced marathoner chasing 3:15, 6 runs a week, recent 10K 42:00 (VDOT 49.1), runs 330 min (about 60 km) a week, longest 24 km, 16 weeks

Paces: easy 5:04-5:43, intervals 3:56 /km, tempos at goal pace 4:37 (threshold 4:21 is never run).

| Wk  | Phase    | Sessions (Mon→Sun)                                                   | Min | ≈km | Long km | Long % | Δ min | Hard % |
| --- | -------- | -------------------------------------------------------------------- | --- | --- | ------- | ------ | ----- | ------ |
| 1   | base     | Mon E30 · Tue E30s · Wed E30 · Thu E30 · Fri E30 · Sat L12           | 215 | 40  | 12      | 30%    |       | 0%     |
| 2   | base     | Mon E30 · Tue E30s · Wed E30 · Thu E30 · Fri E30 · Sat L15           | 231 | 43  | 15      | 35%    | +8%   | 0%     |
| 3   | base     | Mon E40 · Tue E30s · Wed E30 · Thu E30 · Fri E30 · Sat L15           | 241 | 45  | 15      | 34%    | +4%   | 0%     |
| 4   | base     | Mon E30 · Tue E30s · Wed E30 · Thu E30 · Fri E30 · Sat L12           | 215 | 40  | 12      | 30%    | -11%  | 0%     |
| 5   | base     | Mon E50 · Tue E30s · Wed E30 · Thu E30 · Fri E30 · Sat L15           | 251 | 47  | 15      | 32%    | +17%  | 0%     |
| 6   | build    | Mon E50 · Tue 4x1k · Wed E30s · Thu E30 · Fri E30 · Sat L20          | 278 | 53  | 20      | 39%    | +11%  | 6%     |
| 7   | build    | Mon E40s · Tue T20 · Wed E40 · Thu ML60 · Fri E40 · Sat L20          | 318 | 60  | 20      | 34%    | +14%  | 6%     |
| 8   | build    | Mon E50 · Tue 4x1k · Wed E30s · Thu E30 · Fri E30 · Sat L15          | 251 | 48  | 15      | 32%    | -21%  | 6%     |
| 9   | build    | Mon E40s · Tue T30 · Wed E40 · Thu E50 · Fri E40 · Sat L20           | 323 | 61  | 20      | 33%    | +29%  | 9%     |
| 10  | build    | Mon E40s · Tue 5x1k · Wed E40 · Thu ML60 · Fri E40 · Sat L25         | 350 | 66  | 25      | 38%    | +9%   | 6%     |
| 11  | build    | Mon E40s · Tue T30 · Wed E40 · Thu E50 · Fri E40 · Sat L25           | 350 | 66  | 25      | 39%    | -0%   | 9%     |
| 12  | build    | Mon E50s · Tue 6x1k · Wed E50 · Thu E40 · Fri E40 · Sat L25          | 356 | 67  | 25      | 38%    | +2%   | 7%     |
| 13  | taper    | Mon E30 · Tue 8x400 · Wed E30 · Thu ML60 · Fri E30 · Sat L15         | 260 | 49  | 15      | 31%    | -27%  | 5%     |
| 14  | taper    | Mon E50 · Tue 8x400 · Wed E30 · Thu E30 · Fri E30 · Sat L15          | 250 | 47  | 15      | 32%    | -4%   | 5%     |
| 15  | taper    | Mon E30 · Tue 8x400 · Wed E30 · Thu E30 · Fri E30 · Sat E30          | 180 | 34  | -       | -      | -28%  | 7%     |
| 16  | race     | Mon E30 · Tue E30 · Wed E30 · Thu E30 · Fri E30 · Sat E30 · Sun RACE | 373 | 76  | 42.2    | 52%    | +108% | 0%     |
| 17  | recovery | Mon E30 · Tue E30 · Wed E30 · Thu E30 · Fri E30 · Sat E30            | 180 | 33  | -       | -      | -52%  | 0%     |

Read: not a plan for this runner. Week 1 is 40 km with a 12 km long run for someone on 60 km with a 24 km long run. Weeks 2 to 5 average 71% of his habit (62% on 5 run days). Peak week 67 km is his normal week. Longest run 25 km. One quality session a week on six days. The fit to his "running now" then cut the build: week 11 `tempo_40` to `tempo_30`, week 12 `easy_90` to `easy_40` (`evidence/direct/debug-exp.txt`). Race week holds six 30-minute runs, Saturday included. The model has him lose fitness (VDOT 49.1 to 48.1 on race morning) and run 3:28. The repo's own `sub-3-30` persona reaches its goal in 0% of 60 seasons, median 3:47:55 from a 3:45 start (`docs/training-engine-2026-10/measuring-r17.md`, "The runner" table).

### H. No benchmark at all: "occasional" runner, 10K in 12 weeks, 3 runs, runs 80 min a week, longest 5 km

| Wk  | Phase | Sessions (Mon→Sun)            | Min | ≈km | Long km | Long % | Δ min | Hard % |
| --- | ----- | ----------------------------- | --- | --- | ------- | ------ | ----- | ------ |
| 1   | base  | Wed E20 · Fri E20 · Sun L6    | 84  | 11  | 6       | 53%    |       | 0%     |
| 2   | base  | Wed E30 · Fri E20 · Sun E40   | 90  | 12  | -       | -      | +7%   | 0%     |
| 3   | base  | Wed E30 · Fri E30s · Sun L6   | 104 | 14  | 6       | 43%    | +16%  | 0%     |
| 4   | base  | Wed E30 · Fri E30 · Sun E40   | 100 | 13  | -       | -      | -4%   | 0%     |
| 5   | build | Wed T20 · Fri E40 · Sun L8    | 129 | 18  | 8       | 46%    | +29%  | 15%    |
| 6   | build | Wed 4x1k · Fri E40 · Sun L8   | 137 | 19  | 8       | 43%    | +6%   | 17%    |
| 7   | build | Wed T20 · Fri E50 · Sun L10   | 154 | 21  | 10      | 48%    | +12%  | 13%    |
| 8   | build | Wed 4x1k · Fri E40 · Sun L8   | 137 | 19  | 8       | 43%    | -11%  | 17%    |
| 9   | build | Wed E40 · Fri E50 · Sun L10   | 164 | 22  | 10      | 45%    | +19%  | 0%     |
| 10  | build | Wed 5x1k · Fri ML60 · Sun L12 | 195 | 27  | 12      | 46%    | +19%  | 15%    |
| 11  | taper | Wed 8x400 · Fri E30 · Sun E30 | 96  | 13  | -       | -      | -51%  | 20%    |
| 12  | race  | Wed E30 · Fri E30 · Sun RACE  | 127 | 18  | 10      | 53%    | +32%  | 0%     |

Read: no paces at all until week 5, because there is nothing to derive one from in a base phase with no efforts; tempo and intervals arrive as "comfortably hard" and "hard". The app derived a benchmark from the week-5 tempo (VDOT 33.0 against a true 33.4) and holds it pending until the runner accepts it in Settings. Weeks 1 to 4 alternate a 6 km long run with a 40-minute easy run (a rung artefact of the starting-point climb), week 9 silently loses its tempo, and the peak week is 2.4x the runner's habit ten weeks in.

### I. One slow marathoner, three ways (VDOT 30.2, 10K 63:30, runs 180 min a week, longest 12 km, 4 runs, 18 weeks)

| Version                                                      | Long runs, weeks 1 to 14 (km)             | Taper (km)   | Longest, minutes                 | Race / longest of last 30 days |
| ------------------------------------------------------------ | ----------------------------------------- | ------------ | -------------------------------- | ------------------------------ |
| Typed the 10K time at setup                                  | 12 12 12 12 12 12 15 12 15 15 15 12 15 15 | 10, 8, none  | 15 km, 118 min                   | 2.81x                          |
| Typed no time                                                | 12 15 15 12 15 15 20 15 20 20 20 15 25 25 | 15, 15, none | 25 km, 188 min                   | 1.69x                          |
| No time, then accepted the app's derived benchmark in week 7 | 12 15 15 12 15 15 20 12 15 15 15 12 15 15 | 10, 8, none  | 20 km once (156 min), then 15 km | 2.81x                          |

Read: the same runner gets a 15 km or a 25 km marathon build depending on whether the app knows their pace, and accepting the app's own fitness suggestion mid-plan takes the long run from 20 km back to 15 km. Neither is right: 15 km before a 5-hour marathon, or 3 h 08 for a runner the 150-minute rule exists to protect.

### J. Returning after 4 weeks off mid-plan (runner E, weeks 6 to 9 off, app not opened)

| Wk  | Phase | Sessions (Mon→Sun)                     | Min | ≈km | Long km | Long % | Δ min | Hard % |
| --- | ----- | -------------------------------------- | --- | --- | ------- | ------ | ----- | ------ |
| 1   | base  | Mon E30 · Wed E30s · Fri E30 · Sun L10 | 156 | 24  | 10      | 42%    |       | 0%     |
| 2   | base  | Mon E30 · Wed E30s · Fri E30 · Sun L10 | 156 | 24  | 10      | 42%    | +0%   | 0%     |
| 3   | base  | Mon E30 · Wed E30s · Fri E30 · Sun L12 | 169 | 26  | 12      | 47%    | +8%   | 0%     |
| 4   | base  | Mon E30 · Wed E30s · Fri E30 · Sun L10 | 156 | 24  | 10      | 42%    | -8%   | 0%     |
| 5   | base  | Mon E40 · Wed E30s · Fri E30 · Sun L12 | 179 | 27  | 12      | 44%    | +15%  | 0%     |
| 6   | away  | (no runs; app not opened)              | 0   | 0   | -       | -      | -     | -      |
| 7   | away  | (no runs; app not opened)              | 0   | 0   | -       | -      | -     | -      |
| 8   | away  | (no runs; app not opened)              | 0   | 0   | -       | -      | -     | -      |
| 9   | away  | (no runs; app not opened)              | 0   | 0   | -       | -      | -     | -      |
| 10  | build | Mon E30 · Wed E30 · Fri E30 · Sun L10  | 156 | 24  | 10      | 42%    |       | 0%     |
| 11  | build | Mon E40 · Wed E30 · Fri E30 · Sun L10  | 166 | 25  | 10      | 40%    | +6%   | 0%     |
| 12  | taper | Mon E30 · Wed E30 · Fri E30 · Sun L6   | 129 | 20  | 6       | 30%    | -22%  | 0%     |
| 13  | taper | Mon E30 · Wed E30 · Fri E30 · Sun E30  | 120 | 18  | -       | -      | -7%   | 0%     |
| 14  | race  | Mon E30 · Wed E30 · Fri E30 · Sun RACE | 205 | 35  | 21.1    | 56%    | +71%  | 0%     |

Read: the engine notices (21 days without a run makes the runner "detrained"): no quality, long run back to the 10 km base. But week 10 is the full base week straight away (156 min, 10 km long run) after four weeks of nothing, the long run then holds at 10 km instead of climbing, and the half marathon stays on the calendar at 2.11x the longest recent run. The prompt on return offers "Rebuild my plan" and "My race moved".
Missing one week (week 7 of the half, week 10 of the marathon): the plan carries on by the calendar, repeats the previous quality rung and holds the long run one rung, and still reaches the same peak. That is handled well.

### K. Race too close, race too far (runner F)

Marathon in 4 weeks:

| Wk  | Phase    | Sessions (Mon→Sun)                     | Min | ≈km | Long km | Long % | Δ min | Hard % |
| --- | -------- | -------------------------------------- | --- | --- | ------- | ------ | ----- | ------ |
| 1   | taper    | Mon E30 · Wed E30 · Fri E30 · Sun E30  | 120 | 17  | -       | -      |       | 0%     |
| 2   | taper    | Mon E30 · Wed E30 · Fri E30 · Sun E30  | 120 | 17  | -       | -      | +0%   | 0%     |
| 3   | taper    | Mon E30 · Wed E30 · Fri E30 · Sun E30  | 120 | 17  | -       | -      | +0%   | 0%     |
| 4   | race     | Mon E30 · Wed E30 · Fri E30 · Sun RACE | 343 | 55  | 42.2    | 74%    | +186% | 0%     |
| 5   | recovery | Mon E30 · Wed E30 · Fri E30 · Sun E30  | 120 | 17  | -       | -      | -65%  | 0%     |

Marathon in 6 weeks:

| Wk  | Phase    | Sessions (Mon→Sun)                     | Min | ≈km | Long km | Long % | Δ min | Hard % |
| --- | -------- | -------------------------------------- | --- | --- | ------- | ------ | ----- | ------ |
| 1   | base     | Mon E30 · Wed E30s · Fri E30 · Sun L12 | 173 | 25  | 12      | 48%    |       | 0%     |
| 2   | build    | Mon E40s · Wed E30 · Fri E30 · Sun L12 | 183 | 26  | 12      | 45%    | +6%   | 0%     |
| 3   | taper    | Mon E30 · Wed E30 · Fri E30 · Sun L8   | 145 | 21  | 8       | 38%    | -21%  | 0%     |
| 4   | taper    | Mon E30 · Wed E30 · Fri E30 · Sun L6   | 132 | 19  | 6       | 32%    | -10%  | 0%     |
| 5   | taper    | Mon E30 · Wed E30 · Fri E30 · Sun E30  | 120 | 17  | -       | -      | -9%   | 0%     |
| 6   | race     | Mon E30 · Wed E30 · Fri E30 · Sun RACE | 343 | 55  | 42.2    | 74%    | +186% | 0%     |
| 7   | recovery | Mon E30 · Wed E30 · Fri E30 · Sun E30  | 120 | 17  | -       | -      | -65%  | 0%     |

Read: with 4 weeks the plan is three weeks of four 30-minute runs and then 42.2 km (9.5x the longest run of the last 30 days), for a runner who told setup they run 170 min a week with an 83-minute long run. The planner labels it "Short runway" and says "the long runs build in fewer weeks, with bigger jumps between them". There are no long runs. With 6 weeks the longest run is 12 km, and the planner adds that "a marathon plan with these weeks builds to 15 km", which is the app's own measure of what a marathon needs (`evidence/direct/planner-copy.txt`).
Marathon in 40 weeks (`evidence/run/p10b-marathon-in-40-weeks.txt`): weeks 1 to 15 are base with no quality at all, the long run moves between 12 and 15 km for 28 weeks, reaches 20 km in week 29 and stays there, weekly km goes 25 to 50 over 36 weeks. First quality session in week 16.

### L. No race

"Free running" (the setup default): nothing is planned, ever (`evidence/run/p07-freeform-no-race.txt`). "Structured" is not offered at setup (`src/pages/Onboarding.tsx:1425-1437` offers Free running, 30 minutes, Race prep) and the rollover drops it (`src/features/program/weekRollover.ts:492-496`). After any race the plan is 1 to 4 weeks of 30-minute easy runs and then nothing.

### Numbers across the personas (weeks before race week)

| Persona            | Habit min/wk | Week 1 min | Weeks 2-5 mean (of habit) | Peak week (x habit) | Biggest week-on-week rise | Long-run steps               | Quality sessions before taper (first in week) | Long % range |
| ------------------ | ------------ | ---------- | ------------------------- | ------------------- | ------------------------- | ---------------------------- | --------------------------------------------- | ------------ |
| C 5K, 3 runs       | 100          | 103        | 106 (106%)                | 150 (1.50x)         | +32%                      | 6 to 8 (+33%)                | 4 (5)                                         | 36-42%       |
| 10K, 3 runs        | 150          | 101        | 107 (71%)                 | 183 (1.22x)         | +26%                      | 6-8-10-12 (+33, +25, +20%)   | 6 (5)                                         | 41-46%       |
| D 10K, 4 runs      | 150          | 131        | 137 (91%)                 | 223 (1.48x)         | +21%                      | same                         | 6 (5)                                         | 31-37%       |
| E half, 14 wk      | 160          | 156        | 165 (103%)                | 276 (1.73x)         | +22%                      | 10-12-15-20 (+20, +25, +33%) | 6 (6)                                         | 41-48%       |
| half, 12 wk        | 160          | 156        | 175 (109%)                | 266 (1.66x)         | +38%                      | same                         | 5 (5)                                         | 41-49%       |
| F marathon, 18 wk  | 170          | 173        | 186 (109%)                | 286 (1.69x)         | +20%                      | 12-15-20 (+25, +33%)         | 8 (7)                                         | 42-54%       |
| G marathon, 6 runs | 330          | 215        | 234 (71%)                 | 356 (1.08x)         | +29%                      | 12-15-20-25 (+25, +33, +25%) | 7 (6)                                         | 30-39%       |
| marathon, 5 runs   | 330          | 185        | 204 (62%)                 | 351 (1.06x)         | +32%                      | same                         | 7 (6)                                         | 35-43%       |
| H no benchmark 10K | 80           | 84         | 106 (132%)                | 195 (2.43x)         | +29%                      | 6-8-10-12                    | 5 (5)                                         | 43-53%       |
| marathon, 40 wk    | 170          | 173        | 173 (102%)                | 326 (1.92x)         | +36%                      | 12-15-20                     | 21 (16)                                       | 40-54%       |

The generator's own outline with no starting point (what "The weeks ahead" is built from) jumps harder: +71% into the peak week of an 8-week half the planner calls "Good runway" (164 to 280 min, long run 12 to 20 km), +57% in an 18-week marathon, +82% on two run days (`evidence/direct/outlines.json`).

## 3. Defects, most serious first

### D1. The marathon long run tops out at 15, 20 or 25 km, and lowest for the slowest runners. Injury risk on race day, breaks trust.

- Runner: runner F (first marathon, predicted 4:13) never runs past 20 km, runner I (a 5-hour marathoner) never past 15 km, runner G (chasing 3:15) never past 25 km. Race day is 1.7 to 2.8 times the longest run. The planner says "Good runway". Typing a race time, or accepting the app's derived benchmark, shortens the long run (plan I).
- Evidence: scratch runs F, G, I; the planner's copy for each is "Good runway. Full Base → Build → Taper → Race progression for your marathon." (`evidence/direct/planner-copy.txt`). Ceiling by fitness (`evidence/direct/ceiling-boundaries.txt`): benchmarked runners slower than VDOT 32.3 (equivalent marathon 4:33) get 15 km; VDOT 32.3 to 43 (4:33 to 3:36) 20 km; 43 to 54 (3:36 to 2:58) 25 km; 54+ 30 km; no benchmark 25 km at any pace (188 min for runner I). 32 km is never scheduled.
- Root cause: `LONG_RUN_MAX_MINUTES = 150` applied at the runner's confirmed easy pace, `src/features/program/runScheduler.ts:243, 627-650`; the ladder stops at 30 km (`:196-209`) against a configured 32 km peak (`src/features/program/runPlanTiming.ts:42`); the ceiling is re-read every weekly regen from `planningEasyPaceSPerKm(profile.runFitness)` (`src/features/program/weekRollover.ts:225`), so a benchmark accepted mid-block lowers it; the planner's "short of race" check compares the plan against the same capped plan (`src/lib/raceGoalPlanner.ts:217-231, 484-491`).
- Fix: for the marathon use a 180-minute ceiling with a 32 km cap (150 stays for 5K to half); apply the same ceiling to no-benchmark runners at the pace of their recent runs (`recentPace` already exists); never lower the ceiling below the longest long run the block has already held; say the peak at setup ("your longest run will be 24 km, about 2 h 50").
- Size M. Lock in the way: **Run17** (measured and kept 2026-10-12; its own measurement notes no persona covers the slow benchmarked or the slow unbenchmarked runner), RUN-EV-06, and the running handoff's non-adoption of a new long-run cap. Owner call 1.

### D2. Long-run steps of +20 to +33% and rebounds after cutback weeks. Injury risk.

- Runner: 6 to 8, 12 to 15, 15 to 20, 20 to 25 km from one long run to the next. In the half, the first 20 km run comes straight after a 12 km cutback week.
- Evidence: every persona breaks the simulator's single-run guard (a run more than 10% longer than the longest of the last 30 days, the check the engine's own comments cite as the best-supported injury signal, `runScheduler.ts:831-833`) at every step; table above. Weekly minutes rise +20 to +38% after cutbacks in followed seasons and +57 to +82% in the plain outline.
- Root cause: eight long-run sizes, 6, 8, 10, 12, 15, 20, 25, 30 km (`runScheduler.ts:196-209`); Run23 limits the climb to one size a week, but the sizes are the steps (`:840-878`); easy runs step 30, 40, 50 then 60, 75, 90 (`:255-266`); the cutback takes 25% off a linear ramp and the next week returns to the line plus a week's growth (`:378, :553-558`); in short blocks the cutback lands on the week before the peak (`runPlanTiming.ts:106-111`) and the long run, medium-long, easy runs and quality all hit their peak in the same week.
- Fix: long-run sizes every 2 km from 6 to 32 (data, not logic); hold a week's planned minutes to about +15% over the last non-cutback week; no cutback in the week before the peak of a block under 10 weeks; stagger the peaks (quality peaks at 70% of the ramp already).
- Size M. Locks: Run23 stays as written (one rung a week, finer rungs). decisions.md R15 "kept" (weekly jumps) and the handoff's non-adoption of a "universal 10 percent rule" need the owner's word (call 6).

### D3. The plan starts everyone at the same place and never exceeds an experienced runner's own week. Hurts quality, breaks trust for the runners most likely to judge the app.

- Runner: on 60 km a week you are given 34 to 40 km in week 1, with a 12 km long run. Your biggest week is your normal week. Your build's tempo and medium-long are quietly shortened.
- Evidence: plan G and the numbers table (week 1 at 56 to 65% of habit, weeks 2 to 5 at 62 to 71%, peak 1.06 to 1.08x); `evidence/direct/debug-exp.txt` weeks 9 to 12 ("was tempo_40: weekly", "was easy_90: weekly"); repo's own finding F15 `under-dose` still in the ratchet (`src/features/program/__tests__/sim/runSeason.sim.test.ts:61-62, 75-77`).
- Root cause: every block ramps from `RACE_CONFIGS[distance].baseLongKm` and 30-minute easy runs (`runPlanTiming.ts:38-43`, `runScheduler.ts:265-266`); ordinary easy runs cap at 50 min; the starting point can only shorten runs (`src/features/program/runningBaseline.ts:245-366`, "Both fits only ever shorten a run" `runScheduler.ts:1874`); the weekday budget climbs from what was done, and what was done is the under-dosed base, so it pins at the starting figure (`runningBaseline.ts:184, 211-218`).
- Fix: when the starting point is above the plan's base, start the long run and the weekday minutes at the starting point (rung at or under it) and ramp from there to a peak 20 to 30% above it, bounded by the long-run ceiling and the run days; let easy runs reach 60 to 70 min on 5+ run days; shorten the base phase for a "regular" runner already above base.
- Size L. In the way: planning-foundations rule that the baseline "never expires into an automatic volume increase" (decisions.md R5/R6, partly answered 2026-11-01, "F15's 0.57-0.90 stays open"). Owner call 2.

### D4. Paces are set once and do not follow the runner. Hurts quality.

- Runner: 12 to 18 weeks on the paces of the race time typed at setup. A free account never gets a new number unless they type one. A no-benchmark runner has no pace for the first 40% of the plan. On a free account a PB in the goal race changes nothing.
- Evidence: all benchmarked seasons keep one pace table; plan H gets its first number in week 5 (pending); in plan G the frozen interval pace became faster than the detrained runner could hold in 5 sessions (`tooFast`, `evidence/run/p06-exp-marathon-5runs-16w-goal-3h15.json`).
- Root cause: the derive never replaces a benchmark that exists (`src/hooks/useRunFitnessAutoDerive.ts:97`); the recalibration suggestion is Pro only (`src/hooks/usePaceInsight.ts:95`), needs a 1.5 VDOT gap (`src/lib/runPaces.ts:483-486`), and reads only races and tempo work (`src/lib/benchmarkEfforts.ts:68-103`): interval reps never count, goal-pace tempos are excluded, and a tempo run at the prescribed pace returns the VDOT it was prescribed from; no plan schedules a time trial or tune-up race; base phases hold no effort to read.
- Fix: put a benchmark session in the plan (a 3 km or 5 km time trial or parkrun, week 1 or 2 for a runner with no benchmark, then every 4 to 6 weeks in place of that week's quality); offer the new paces on the run summary with one tap, for every account; read interval reps as evidence; offer the update after the goal race.
- Size M. In the way: adaptive-paces decision that the adaptive loop is Pro (usePaceInsight header), the handoff's non-adoption of "threshold tests", RUN-EV-08 (consent, respected by suggest and approve). Owner call 4.

### D5. Seven quality sessions in three shapes, the same for a 5K and a marathon. Hurts quality.

- Runner: tempo, 1 km reps, tempo, 1 km reps. A 5K plan holds four quality sessions and never touches 5K pace. A marathon plan with no typed goal time has no marathon-pace running. The taper session is 8 x 400 for every distance, three weeks running in a marathon taper. One quality session a week even on six run days.
- Evidence: the catalogue (`evidence/run/_templates.json`): `tempo_20/30/40`, `4x1k/5x1k/6x1k`, `8x400`; plans C to G.
- Root cause: `TEMPO_TIERS` and `INTERVAL_TIERS` (`runScheduler.ts:336-345`); flavour by week parity (`:771-788`); no quality in base, which is 40% of the block (`runPlanTiming.ts:86-92`, `runScheduler.ts:1578-1601`); taper session hard-coded (`:1775`); race-pace work only for half and marathon and only with a goal time (`src/lib/racePace.ts:77, 141-166`); the marathon and repetition pace bands are computed and no prescription reads them (`src/lib/runPaces.ts:146-152, 249-265`).
- Fix: add time-based intervals (6 x 2 min, 5 x 3 min, 4 x 4 min), cruise intervals (3 x 8 to 10 min at threshold), short reps at repetition pace for 5K and 10K, a progression run, hill repeats, fartlek, marathon-pace blocks from the marathon band when no goal time is typed, race-pace sessions for 5K and 10K; choose by distance and phase; light quality (strides twice, hills or fartlek) in base; distance-specific taper sessions; a second quality day by default on 5+ run days for "regular" runners.
- Size L. In the way: the handoff's non-adoptions (track sessions, hills, "one intensity split") and decisions.md R19 "kept". Owner call 5.

### D6. A new runner is given 4 x 1 km hard two weeks after run-walk. Injury risk for novices.

- Runner: week 8 of plan B. The session takes 41 min and 5.6 km, the longest run of their life by 68%. On two run days (the repo's `new-runner-marathon` trace, `src/features/program/__tests__/sim/__traces__/run/new-runner-marathon.txt`, weeks 8 to 16) every week is one quality session and one long run.
- Root cause: reps are by distance (`src/lib/workoutTemplates.ts:261-330`); the new-runner cap fits a session by its nominal minutes, 29 for `4x1k`, which assumes reps at about 3:40 /km (`src/features/program/runTimeLimits.ts:38-50`, `src/features/program/newRunner.ts:185-213`); quality is allowed from the first week after the six run-walk weeks (`newRunner.ts:26`, `runScheduler.ts:1647-1652`).
- Fix: no tempo or 1 km reps in a block begun as a new runner until continuous runs reach 40 to 45 min; until then strides or 6 x 1 min pick-ups by time; size interval sessions in minutes at the runner's pace wherever a cap is applied.
- Size S to M. Lock: Run20 (5) sets six weeks without quality; this extends it (a STATUS line).

### D7. No plan without a race date, and nothing after the recovery weeks. Breaks trust.

- Runner: "Free running" is an empty week forever. After the race, 1 to 4 weeks of 30-minute runs and then an empty week. The starter goal ends the same way.
- Evidence: plans A, L, and the last row of every season.
- Root cause: `weekRollover.ts:492-496`; setup's three options (`Onboarding.tsx:1425-1437`).
- Fix: rolling plans with no date ("build to 5K/10K", "get faster at 5K", "keep fit": the generator with a repeating 4-week cycle and a soft horizon), and a "what next" step when recovery ends.
- Size M to L. Lock: **Run9** (owner, 2026-05-29: a race goal is the only plan) and Pgm8 R23 ("free running unchanged"). Owner call 3.

### D8. A race too close gets a plan that cannot prepare anyone, described in words that are not true. Breaks trust, injury risk.

- Runner: marathon in 4 weeks: twelve 30-minute runs, no long run, then the race. Copy: "the long runs build in fewer weeks, with bigger jumps between them". In 6 weeks: longest run 12 km. A trained runner who joins late is detrained by the plan; an untrained one is not told to pick another race.
- Evidence: plan K; planner copy in `evidence/direct/planner-copy.txt`.
- Root cause: a block that starts inside the taper has no build to take a share of, so every week is `easy_30` (`runScheduler.ts:403-414, 812-816, 1371-1373`); the marathon floor is 4 weeks, so 4 weeks is "compressed", not "very tight" (`runPlanTiming.ts:136-140`); the copy is per status, not per plan (`raceGoalPlanner.ts:492-503`).
- Fix: when the block opens in its taper, taper from the runner's stated starting point (75% and 60% of their own longest run and week), not from zero; if the starting point's longest run is under about half the race distance and the race is inside the minimum build, say so first and offer a later date or a shorter race; write the status line from what the generated weeks hold.
- Size S to M. No lock in the way (Pgm8 R14c already says this for new runners only).
- STATUS 2026-11-13: built. A compressed block's taper takes its 75% and 60% from the larger of its build's longest run and the runner's starting point, so a block with no build no longer runs easy 30s to a marathon. The planner's status line says what the weeks hold, and leads with both distances when the race is out of reach (the rule `raceOutOfReach` shared with the welcome-back sheet). The race card says a block with no build tapers. See `build-plan.md`, slice 3, #8.

### D9. A race far away is the same plan stretched. Hurts quality.

- Runner: 15 weeks of easy running only, a long run that does not move for six months.
- Evidence: plan K, 40 weeks.
- Root cause: base is 40% of whatever the block length is and the ramp is one straight line over it (`runPlanTiming.ts:86-92`, `runScheduler.ts:553`).
- Fix: cap the race block at 16 to 20 weeks; before it, a rolling base block (D7) or an intermediate race.
- Size M. decisions.md R18 is "measuring, not run".

### D10. Recovery starts the day after the race and never changes. Hurts quality, some injury risk.

- Runner: an easy 30 on the Monday after a Sunday marathon, on every run day of the week (six for runner G), identical for four weeks.
- Evidence: plans F, G rows after the race.
- Root cause: `scheduleRecoveryWeekV2` puts `easy_30` on every run day (`runScheduler.ts:970-1000`).
- Fix: by distance: after a marathon no run for 4 to 7 days, then two or three short easy runs, then 50%, 75% of the pre-race week.
- Size S.
- STATUS 2026-11-12: built by distance, with fixed steps (20, 30, then 40 minutes) standing for the 50% and 75%, since the recovery does not read the pre-race week. See `build-plan.md`, slice 3, #9.

### D11. Coming back after 3 to 4 weeks: the right idea, the wrong first week, and the race stays. Moderate injury risk.

- Runner: full base week on day one back (156 min, 10 km long run), three weeks held flat, then a half marathon at 2.1x the longest recent run.
- Evidence: plan J; `evidence/run/p09b-half-off-weeks-6to8-opens-app.txt`.
- Root cause: a detrained runner's peak is set to base and base is unchanged by the layoff (`runScheduler.ts:1253, 1529`); re-entry lasts 21 days (`src/features/program/layoffDetection.ts:57, 79`).
- Fix: first week back at about 60% of the last trained week with the long run a rung under base, then a rung a week while time allows; when the race is more than 1.5x what the long run can reach, lead the return prompt with moving the race.
- Size S to M. Lock: Run15 (spec for re-entry) needs a STATUS line.
- STATUS 2026-11-12: the first week back and the climb built (20-minute easy runs and a rung under base, then a rung and ten minutes a week). Leading the return prompt with moving the race is left to the owner: Run15 decided Tropos never tells someone their race is out of reach. See `build-plan.md`, slice 3, #10.
- STATUS 2026-11-12, second half: built, as a fact rather than a verdict (the owner left the call to us). When the long run gets neither to the race's distance nor to three quarters of what a full block builds, the welcome-back sheet gives both distances and leads with "Move my race", the rebuild one tap below. Not the 1.5x above: the long-run ladder stops at 25 km, so 1.5x would have flagged every marathon. See `build-plan.md`, slice 3, #10.

### D12. With a goal time every tempo becomes goal pace; without one there is no race-pace work. Hurts quality.

- Evidence: plan G: tempos at 4:37, threshold 4:21 never run; plan F: none. Root cause: `racePace.ts:146-150`. Fix: alternate threshold and goal-pace sessions; use the marathon band when no goal is typed. Size S.

### D13. Race week and the taper ignore how much the runner runs. Polish to quality.

- Evidence: race week is an `easy_30` on every run day before the race (six, Saturday included, for runner G; `runScheduler.ts:1434-1453`). In the repo's `owner-marathon` trace the taper and race week hold more weekday running (five 30-minute runs) than the build did (five 20-minute runs), lines 124-131 of `src/features/program/__tests__/sim/__traces__/run/owner-marathon.txt`. Fix: race week of two or three short runs and a 15 to 20 minute shake-out, never above the build's own easy runs. Size S.

### D14. Missed long runs collapse the plan without a word about the race. Breaks trust.

- Evidence: the repo's `owner-marathon` trace: long runs missed in weeks 18 to 21 while 4 or 5 of 6 runs were done each week; week 22 plans no long run, the taper 6 and 8 km, then the marathon at 5.27x the month's longest (lines 89-131). No fell-behind flag fires because the week is over half done (`functions/lib/fellBehindWeek.js:19`). The same trace holds zero quality sessions in 25 weeks and weekday runs of 10 to 20 min on six run days, because an "occasional" runner under the plan's minutes is held easy-only (`runningBaseline.ts:288`).
- Fix: a race-readiness check each week from the long runs actually done; when the reachable long run falls under half the race, say so and offer the three choices the fell-behind sheet already has. Fewer, longer runs when the weekly minutes are small.
- Size M.

### D15. Interval sessions are thin on structure. Polish.

- 5 min warm-up before 1 km reps, 90 s recovery for every runner (a 3:56 rep and a 6:37 rep get the same rest), `workoutTemplates.ts:261-330`. Fix: 10 to 15 min warm-up, recovery 50 to 90% of the rep's time. Size S.
- STATUS 2026-11-13, the warm-up: built. The four interval sessions warm up for 10 minutes, not 5, and their planned minutes rise by the same 5 (4 x 1 km 34, 5 x 1 km 40, 6 x 1 km 46, 8 x 400 m 30), so a week's planned minutes and the time-limit fits count it; the season traces move by those minutes and nothing else. Recovery as a share of the rep's time is not built: the rest is read in the launch config, the session player, Home's hero and "What it is", and a pace-led rest needs the rep pace at each of them, so it waits for its own change.

### D16. "Harder" on six days puts tempo, a 75 to 90 minute run and intervals on consecutive days. Polish.

- Evidence: `evidence/direct/outlines.json`, `marathon-18w-harder-6days-easy-323`, weeks 9 to 14 (for example week 14: Mon 6x1k, Tue easy_90, Wed tempo_40). Root cause: with no clear day the fill order is kept (`src/features/program/runPlacement.ts:62-80`). Fix: in a two-quality week cap the medium-long at 50 to 60 min or drop it. Size S.
- STATUS 2026-11-13: built. A week with two quality sessions whose medium-long has no day clear of them and the long run holds it at 50 minutes, under the hour Run20 counts as demanding: the six-day harder marathon's Tuesdays of 60, 75 and 90 minutes between intervals and a tempo are 50 (`midLongTwoQuality.test.ts`). Its stepped taper then takes its shares of the 50 the build held (Run22). A week with one quality session, or a clear day, keeps its medium-long.

### D17. Heart rate plays no part in a plan. Hurts quality against HR-led competitors.

- No session is prescribed by zone. Live heart rate needs the Watch bridge, which is off unless `VITE_CONNECTED_TRAINING_ENABLED` is set (`src/lib/heartRateSource.ts:107-111`, `src/lib/connectedTrainingRelease.ts:6-7`). Easy and long runs carry no pace target and no in-run "too fast" cue (`src/lib/runPaces.ts:432-437`); the summary says so afterwards. Fix: an easy-run ceiling cue in-run; optional zone targets once the Watch path ships. Size M. The handoff bars "mandatory" zones only.

### D18. Short-race long runs are low and flat. Polish.

- 5K peaks at 8 km and 10K at 12 km for any runner (`runPlanTiming.ts:39-40`); plan C holds 6 km for seven weeks. Fix: scale the 5K and 10K long-run peak from the starting point (10 to 12 km and 14 to 16 km for regular runners). Size S.

## 4. What already works and must not be broken

- **Session delivery.** A planned tempo or interval session reaches the run screen as ordered segments (warm-up, reps, recoveries, cool-down) with a spoken cue per segment, pace judged only in the work segments, pause-correct clocks (`src/lib/runSegments.ts`, `src/hooks/useSessionPlayer.ts`, `src/pages/Run.tsx:1661-1676`). Without a benchmark the session speaks in effort words, never an invented pace (Run20, Run21).
- **The new-runner path.** Six-week run-walk ladder, weeks that repeat until done, no tempo or intervals in those weeks, the starter goal to 30 minutes, the "too soon" note at setup.
- **The pace engine.** Daniels-Gilbert VDOT bands, prescriptions only from a benchmark the runner confirmed (RUN-EV-08), derived benchmarks only from races and tempo work, goal-pace long-run finishes for half and marathon behind a feasibility gate.
- **The taper and race week skeleton.** Stepped taper with a reduced long run taken from what the build actually held (Run22), a sharpener, race placed by date, distance-scaled recovery weeks.
- **Honest adaptation.** A missed week holds the long run and repeats the quality rung; 21 days away switches to easy-only re-entry for 21 days; "Adjust this week" and the ease-week nudge are suggest, preview, apply, undo; nothing moves a race date or replaces a plan silently; a plan made mid-week plans nothing in the past (Run19).
- **Placement.** Long run on a weekend run day, quality spaced from it and off lifting days, hard-run and lift clashes flagged, the medium-long kept off hard days where the week allows.
- **Cutbacks every fourth week that ease the whole week**, the quality ladder starting at its first rung, one long-run rung a week.
- **The simulator and its ratchets** (`src/test/sim/`, `src/features/program/__tests__/sim/`). Every fix above can be measured before it ships. It lacks the personas that matter most for D1: a benchmarked 5-hour marathoner and a slow runner with no benchmark.

## 5. Owner calls needed

1. **Marathon long-run ceiling (Run17).** (a) Keep 150 min for all. (b) Marathon only: 180 min, 32 km cap, 2 km rungs, same rule with or without a benchmark, never lowered mid-block, peak stated at setup. (c) Distance-led 30 to 32 km for everyone. Recommend (b): runner F reaches about 26 km, runner I about 23 km, runner G 32 km.
2. **Start from the runner's own week (F15, planning foundations).** (a) Keep the fixed base. (b) Start at the stated starting point and peak 20 to 30% above it. Recommend (b); it is the difference between a plan and a template for anyone already running.
3. **Plans without a race and after one (Run9).** (a) Keep race-only. (b) Add rolling no-date plans and a "what next" after recovery. Recommend (b); most runners are between races most of the year.
4. **Pace updates.** (a) Keep typed benchmarks and the Pro suggestion. (b) Scheduled benchmark sessions and a one-tap update for every account, Pro keeps the continuous insight. Recommend (b); a plan on stale paces is a correctness problem, not a premium feature.
5. **Session library (handoff non-adoptions: track sessions, hills).** (a) Keep seven. (b) Add about a dozen sessions with a per-distance, per-phase map. Recommend (b).
6. **Step sizes (R15 kept, "no universal 10% rule").** (a) Keep. (b) Finer rungs and a ceiling on a week's rise over the last non-cutback week, as a property of the ladder, not a rule shown to users. Recommend (b).
7. **Races the plan cannot prepare for.** (a) Keep "never blocking, one muted line". (b) Lead with the honest sentence and the alternatives, still allow it. Recommend (b).
8. **Beginner quality (Run20 (5)).** (a) Quality from week 7. (b) Strides and timed pick-ups only until continuous runs reach 40 to 45 min. Recommend (b).

## 6. Not verified

- Anything about Runna, Strava or other apps (another investigator's slice). Comparisons here are to ordinary coaching practice and to the sources the code itself cites.
- Real outcomes. Race times, VDOT drift and injuries are the simulator's model. Plan content is real.
- The run screen on a device: audio cues, the pace bar and segment walking were read in code, not run. The Watch heart-rate path was not exercised.
- Pace Insight (Pro) in a season: read in code; the simulator models only the free derive.
- Tuning knobs in a full season: "harder/bigger" was printed from the generator directly with no starting point; "lighter/gentler" not printed. Run time limits not exercised.
- Hybrid plans (lifting with running): only the repo's saved traces were read; my personas were running-only.
- Long runs skipped while other runs are done: taken from the repo's saved `owner-marathon` trace, not re-simulated with my personas.
- The starter path with missed weeks (stage repeat and step-back), single-run moves and skips, treadmill runs, Thursday-to-Sunday starts (lead-in week), time zones.
- The legacy "structured" mode: in my season it planned one week and then nothing, and the server check flagged the empty weeks as "fallen behind" (`evidence/run/p07b-structured-no-race.txt`); I did not confirm whether a real legacy account is migrated before that check runs.
- Whether the 40%-base and one-quality-a-week defaults were explicit owner choices; I found no lock row for either.

## Evidence files

- Seasons (JSON and trace per persona): `evidence/run/` (`p01` to `p11`), summarised by `harness/summ.py`, `md.py`, `spikes.py`.
- Direct generator output: `evidence/direct/outlines.json`, `ceiling.txt`, `ceiling-boundaries.txt`, `planner-copy.txt`, `debug-exp.txt`, `debug-6w.txt`.
- Scratch tests (git-ignored, safe to delete): `harness/zzRunPlans.scratch.test.ts`, `zzRunDirect.scratch.test.ts`, `zzRunDebug.scratch.test.ts`.
