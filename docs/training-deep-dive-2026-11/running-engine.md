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
- STATUS 2026-11-13: built (Run24 (1)). A marathon's long run may take 180 minutes, to a new 32 km rung, measured at the confirmed easy pace or, without a benchmark, at the recent runs' own, and never under the farthest recent run, so a benchmark accepted mid-block cannot lower it below a long run already run; 5K to half keep 150 minutes at the confirmed pace. Setup states the longest run ("Your longest run will be 30 km, about 3 h"). On the nominal table a full marathon block now climbs to 30 or 32 km; in the repo's traces sub-3:30 and the year-out marathon peak at 25 km (from 20), and the owner's, with no benchmark and runs at about 7:30 /km, at 20 km (from 25), since 25 km at that pace is past three hours. The planner now counts the person's own longest run in the reach check, and a 6-week marathon whose plan reaches 20 km leads with the race being out of reach. A side effect to weigh with call 2: a building runner who is not a regular one stays easy-only for longer, since the plan's long run climbs further ahead of their own.
- STATUS 2026-11-14, kept on the plan: built (Run24 (1), its review). The ceiling's pace and floor are worked out when the block is made and kept on its plan (`RunPlan.blockInputs`, `RaceBlockInputs`), so a rollover that reads different runs, or none, rebuilds the same weeks. The floor is the longest long run the block has held, kept as each week is reached, not the farthest run of the month: a 42 km race in the month no longer lifts a no-benchmark marathoner's peak at 8:00 /km from 22 km to the 32 km cap until it leaves the window, and a block that has held 26 km stays at 26 when a benchmark confirmed mid-block brings three hours down to 24. Without a confirmed benchmark the pace is the recent runs' when the block was made; a block made with none read (setup reads none) is sized at the template minutes, as before, and takes the first pace a rebuild reads, once. A plan made before the inputs were kept reads them as its rebuilds did, the farthest run of the month as what it has held, and keeps them from the first rebuild that reads runs. A plan generated once is unchanged: in the traces only the owner's marathon moves, since it keeps the 8:27 /km of its first read where each rollover read the month's pace as the runner got faster (7:40 by August), so its long runs climb to 18 km (was 20) and the race is 46 seconds slower. Not built: the block follows a runner who gets faster through a confirmed benchmark only (the time trial and the run summary's offer, Run24 (4)), not through the month's pace.

### D2. Long-run steps of +20 to +33% and rebounds after cutback weeks. Injury risk.

- Runner: 6 to 8, 12 to 15, 15 to 20, 20 to 25 km from one long run to the next. In the half, the first 20 km run comes straight after a 12 km cutback week.
- Evidence: every persona breaks the simulator's single-run guard (a run more than 10% longer than the longest of the last 30 days, the check the engine's own comments cite as the best-supported injury signal, `runScheduler.ts:831-833`) at every step; table above. Weekly minutes rise +20 to +38% after cutbacks in followed seasons and +57 to +82% in the plain outline.
- Root cause: eight long-run sizes, 6, 8, 10, 12, 15, 20, 25, 30 km (`runScheduler.ts:196-209`); Run23 limits the climb to one size a week, but the sizes are the steps (`:840-878`); easy runs step 30, 40, 50 then 60, 75, 90 (`:255-266`); the cutback takes 25% off a linear ramp and the next week returns to the line plus a week's growth (`:378, :553-558`); in short blocks the cutback lands on the week before the peak (`runPlanTiming.ts:106-111`) and the long run, medium-long, easy runs and quality all hit their peak in the same week.
- Fix: long-run sizes every 2 km from 6 to 32 (data, not logic); hold a week's planned minutes to about +15% over the last non-cutback week; no cutback in the week before the peak of a block under 10 weeks; stagger the peaks (quality peaks at 70% of the ramp already).
- Size M. Locks: Run23 stays as written (one rung a week, finer rungs). decisions.md R15 "kept" (weekly jumps) and the handoff's non-adoption of a "universal 10 percent rule" need the owner's word (call 6).
- STATUS 2026-11-13: built (Run24 (6)). The long run has a rung every 2 km from 6 to 32 km, so Run23's one rung a week is 2 km; 15 and 25 km stay only for plans that already hold them, and nothing picks them for a new run. A step-back week's long run sits at least a rung under the longest so far, which a short block's cutback had not. A base or build week's planned minutes are held to 15% over the last week that was not a step-back, its longest easy runs giving way a tier at a time; the long run and quality stay the ramp's. A block under 10 weeks has no step-back in the week before its peak. A lighter week steps a long run down 4 km from 16 km up and 2 km under it, about the step the coarser ladder took. On the nominal table a 20-week marathon now runs 14, 14, 16, 14, 18, 20, 20, 16, 22, 24, 26, 20, 28, 28, 30, 32 km, then 24 and 18 in its taper; its first long run is the 14 km base (was 12). Short blocks peak lower: a 6-week marathon at 18 km (was 20), a 10-week one at 24 (was 30), an 8-week half at 18 (was 20) with a peak week of 170 minutes (was 225). A returning runner takes longer to reach the plan's peak (a half 9 weeks out, was 7; a marathon 14, was 10), and setup's short-runway line comes up more often: from a 25-minute start a half 12 weeks out reaches 16 of the plan's 20 km. The owner's April marathon still climbs to 32. The week after a cutback still rises more than a quarter over the cutback week itself, back to the line it stepped back from. In the traces `half-moves-long-run` loses `volume-jump`; the year-out marathon gains `long-share` and the 2-3-day hybrids `taper-cut` (`runSeason.sim.test.ts` says why). Staggering the peaks is not built.

### D3. The plan starts everyone at the same place and never exceeds an experienced runner's own week. Hurts quality, breaks trust for the runners most likely to judge the app.

- Runner: on 60 km a week you are given 34 to 40 km in week 1, with a 12 km long run. Your biggest week is your normal week. Your build's tempo and medium-long are quietly shortened.
- Evidence: plan G and the numbers table (week 1 at 56 to 65% of habit, weeks 2 to 5 at 62 to 71%, peak 1.06 to 1.08x); `evidence/direct/debug-exp.txt` weeks 9 to 12 ("was tempo_40: weekly", "was easy_90: weekly"); repo's own finding F15 `under-dose` still in the ratchet (`src/features/program/__tests__/sim/runSeason.sim.test.ts:61-62, 75-77`).
- Root cause: every block ramps from `RACE_CONFIGS[distance].baseLongKm` and 30-minute easy runs (`runPlanTiming.ts:38-43`, `runScheduler.ts:265-266`); ordinary easy runs cap at 50 min; the starting point can only shorten runs (`src/features/program/runningBaseline.ts:245-366`, "Both fits only ever shorten a run" `runScheduler.ts:1874`); the weekday budget climbs from what was done, and what was done is the under-dosed base, so it pins at the starting figure (`runningBaseline.ts:184, 211-218`).
- Fix: when the starting point is above the plan's base, start the long run and the weekday minutes at the starting point (rung at or under it) and ramp from there to a peak 20 to 30% above it, bounded by the long-run ceiling and the run days; let easy runs reach 60 to 70 min on 5+ run days; shorten the base phase for a "regular" runner already above base.
- Size L. In the way: planning-foundations rule that the baseline "never expires into an automatic volume increase" (decisions.md R5/R6, partly answered 2026-11-01, "F15's 0.57-0.90 stays open"). Owner call 2.
- STATUS 2026-11-13: built in part (Run24 (2)). Where the starting point is above the plan's base, the block starts from it: the long run at the rung at or under the longest run (at the confirmed easy pace, else the recent runs'), climbing to a peak 25% above it inside the ceiling, and the weekday easy runs at the rest of the week a run, climbing 25%, to an hour on five or more run days and 50 minutes on fewer (the medium-long keeps its own peak). Not for a new runner's block or a detrained one. A regular runner on 330 minutes a week with a 120-minute long run, a half 16 weeks out, now starts on 310 minutes with a 20 km long run (was 175 and 10 km) and peaks at 24 km and 385 minutes. In the traces `under-dose` is gone from every persona that had it, as are the year-out marathon's and the half's `long-share`, the 2-3-day hybrids' `taper-cut` and sub-3:30's `volume-jump`; the 3-4-day hybrids get `back-to-back` back (their own week takes Tuesday's medium-long past the hour beside Wednesday's quality, with no day clear of it). The shorter base phase for a regular runner is not built: phases are worked out in several places from the block's weeks alone, so it needs the plan to carry the choice.
- STATUS 2026-11-13: the shorter base built (Run24 (2)). A regular runner whose own week is above the plan's base (the `OwnWeek` decision, so never a new runner's block or a detrained one) gets base for a quarter of the weeks before the taper, not 40% (`SHORT_BASE_SHARE`, a Tropos heuristic). The plan decides it when it is made and keeps it (`RunPlan.shortBase`, carried by every rebuild of the block: the rollover, a Settings change, a realign, the load's rebuild); a plan stored without it keeps the 40%. `getPhaseForWeek` takes the plan's choice, and every reader of a week's phase passes it: the generator, the race card's rail, "Why this run" and its week line, the race-pace rules, the lifting's race build weeks and Train's lift label, and setup's planner, which now says "Your build starts in week 5, since you already run 330 minutes a week." Week 0, the taper, race week and the step-back weeks do not move. A 16-week half for a runner on 330 minutes a week starts its build and first tempo in week 5 (was 7) and holds two more quality sessions, its tempo climbing to 40 minutes (`shortBase.test.ts`, `ownWeek.test.ts`). In the traces the build starts in plan week 4 of sub-3:30's 16 and the 14-week half's (was 6), week 5 of the 3-4-day hybrids' 16 (was 7) and week 13 of the year-out marathon's 52 (was 21); quality sessions rise 8 to 10, 10 to 12, 9 to 11 and 34 to 41, injuries are unchanged, and the races finish 6 to 24 seconds faster (the year-out one the same, `hybrid-lighter-week`'s 5 seconds slower), and more of the extra sessions are run under their benchmark's pace on a tired day ("target too fast": the year-out marathon 1 to 5, the half 1 to 3). `hybrid-lighter-week` loses `back-to-back` and its Romanian deadlift stall; `half-moves-long-run` gets `volume-jump` back, 29% over its step-back week and level with the last full one (`personActions.sim.test.ts` says why). Not built: a base shortened for a runner who is not regular, and a choice that changes mid-block when the starting point does.
- STATUS 2026-11-14, kept on the plan: built (Run24 (2), its review). The starting point's long run is converted to km at the block's kept pace (`RaceBlockInputs`), so the first weeks no longer change when the runs are read again or a read fails. A regular runner on 330 minutes a week with a 100-minute longest run, a half with no benchmark made with their runs read at 6:30 /km, starts at 14 km, and every rollover rebuilds the same weeks whether it reads runs at 6:30, at 6:50 or none. Set up with no runs read, the block starts at the template minutes' 18 km (117 minutes at 6:30, past their longest), as before, and moves once, to 14, at the first rollover that reads their pace, then keeps it. A new starting point reads the pace again, keeping the last if the read fails. The climb from what was done (`runningClimb`) and a compressed block's taper use the same pace. Not built: a first long run under a runner's own longest when setup knows neither their pace nor a benchmark. A conservative assumed pace (8:00 /km) was measured: it starts that runner at 12 km and never moves, but it takes every no-benchmark marathon set up at onboarding to a 22 km peak whatever the runner's pace, so it is the owner's call.
- STATUS 2026-11-14, the kept pace from the runner's own running: built (Run24 (2), (4)). The pace a block is sized at without a confirmed benchmark (`RaceBlockInputs.runsPaceSPerKm`, `recentPace`) is read from the runs at the runner's own pace only (`runsAtOwnPace`): a race, a time trial, a tempo or an interval session, by the run's own type or its plan's session, and a run whose work was at a pinned pace are left out; a run that names neither, a free run among them, counts. The saved runs the plan reads now carry what was run (`datedRuns`: `activityType`, `templateId`, `workPacePinned`), and the simulator reads them through the same mapping. A month of an easy run and a 100-minute long run at 6:30 /km, with a time trial or a session each week, read 6:00 /km and started a half's long run at 16 km, 104 minutes at their own pace; it now reads 6:30 and starts at 14 (`raceBlockInputs.test.ts`). The rolling plans' own week reads the same pace. The traces are unchanged: no persona's first read holds a session. Not built: a long run with race-pace blocks run by effort, with no pinned pace, still counts (its easy majority dominates, and a kept pace is read again only for a new starting point).

### D4. Paces are set once and do not follow the runner. Hurts quality.

- Runner: 12 to 18 weeks on the paces of the race time typed at setup. A free account never gets a new number unless they type one. A no-benchmark runner has no pace for the first 40% of the plan. On a free account a PB in the goal race changes nothing.
- Evidence: all benchmarked seasons keep one pace table; plan H gets its first number in week 5 (pending); in plan G the frozen interval pace became faster than the detrained runner could hold in 5 sessions (`tooFast`, `evidence/run/p06-exp-marathon-5runs-16w-goal-3h15.json`).
- Root cause: the derive never replaces a benchmark that exists (`src/hooks/useRunFitnessAutoDerive.ts:97`); the recalibration suggestion is Pro only (`src/hooks/usePaceInsight.ts:95`), needs a 1.5 VDOT gap (`src/lib/runPaces.ts:483-486`), and reads only races and tempo work (`src/lib/benchmarkEfforts.ts:68-103`): interval reps never count, goal-pace tempos are excluded, and a tempo run at the prescribed pace returns the VDOT it was prescribed from; no plan schedules a time trial or tune-up race; base phases hold no effort to read.
- Fix: put a benchmark session in the plan (a 3 km or 5 km time trial or parkrun, week 1 or 2 for a runner with no benchmark, then every 4 to 6 weeks in place of that week's quality); offer the new paces on the run summary with one tap, for every account; read interval reps as evidence; offer the update after the goal race.
- Size M. In the way: adaptive-paces decision that the adaptive loop is Pro (usePaceInsight header), the handoff's non-adoption of "threshold tests", RUN-EV-08 (consent, respected by suggest and approve). Owner call 4.
- STATUS 2026-11-13, the offer and the evidence (Run24 (4)): the run summary's one-tap offer of new paces (`usePaceInsightFromRuns`) is every account's, so a race, a time trial, a tempo or now an interval session that shows a different fitness offers it after the run, the goal race included; Settings' continuous insight stays Pro. Interval repeats are read as evidence at the interval band's middle (`vdotFromIntervalPace`, at least 12 minutes of repeats, never a pinned pace). RUN-EV-08 stands: nothing changes paces without the tap. The benchmark session in the plan is not built yet.
- STATUS 2026-11-13, the time trial (Run24 (4)): a block with no confirmed benchmark holds a 3 km time trial in its second week, in place of its strides run, and every block a 5 km one about every five weeks after that, in place of the week's tempo or quality session, or a base week's strides run where it has a day between it and the long run; never in the ramp's last week, the taper, a new runner's or a detrained runner's block, or below the floor. It runs as a warm-up, the distance at "as hard as you can hold evenly" with no pace on it, and a cool-down, and says a parkrun does the same job; its work is read as a race, so the run summary offers the new paces after it, and a runner with no confirmed paces their first (`resolveFirstPaces`); taking faster or first paces is Pro's (`paceUpdateLocked`), slower ones stay one tap for every account. The time-limit, starting-point and new-runner fits keep the family: a trial becomes a shorter trial or an easy run, never repeats. A trial takes a quality week in five, so the quality ladders climb more slowly and a block's intervals reach their 6 x 1 km once, in its last build week (they used to reach it more than once). In the traces sub-3:30 and the 2-3-day hybrids get a `volume-jump` back and the hybrids `taper-cut`; the hybrid's lighter week gets `back-to-back`.

- STATUS 2026-11-13, faster paces are Pro (owner: "If it's a good additional feature it should be moved into pro"): the run summary still works the offer out for every account, but only a Pro account takes faster paces; a free account sees the change it would make ("Pro moves every upcoming training pace from VDOT 42 to 45.") with Try Pro free or See Pro (`paceUpdateLocked`, `src/lib/paceUpdateAccess.ts`). Slower paces, targets the runner cannot hold, stay one tap for every account. This narrows call 4's "for every account".

### D5. Seven quality sessions in three shapes, the same for a 5K and a marathon. Hurts quality.

- Runner: tempo, 1 km reps, tempo, 1 km reps. A 5K plan holds four quality sessions and never touches 5K pace. A marathon plan with no typed goal time has no marathon-pace running. The taper session is 8 x 400 for every distance, three weeks running in a marathon taper. One quality session a week even on six run days.
- Evidence: the catalogue (`evidence/run/_templates.json`): `tempo_20/30/40`, `4x1k/5x1k/6x1k`, `8x400`; plans C to G.
- Root cause: `TEMPO_TIERS` and `INTERVAL_TIERS` (`runScheduler.ts:336-345`); flavour by week parity (`:771-788`); no quality in base, which is 40% of the block (`runPlanTiming.ts:86-92`, `runScheduler.ts:1578-1601`); taper session hard-coded (`:1775`); race-pace work only for half and marathon and only with a goal time (`src/lib/racePace.ts:77, 141-166`); the marathon and repetition pace bands are computed and no prescription reads them (`src/lib/runPaces.ts:146-152, 249-265`).
- Fix: add time-based intervals (6 x 2 min, 5 x 3 min, 4 x 4 min), cruise intervals (3 x 8 to 10 min at threshold), short reps at repetition pace for 5K and 10K, a progression run, hill repeats, fartlek, marathon-pace blocks from the marathon band when no goal time is typed, race-pace sessions for 5K and 10K; choose by distance and phase; light quality (strides twice, hills or fartlek) in base; distance-specific taper sessions; a second quality day by default on 5+ run days for "regular" runners.
- Size L. In the way: the handoff's non-adoptions (track sessions, hills, "one intensity split") and decisions.md R19 "kept". Owner call 5.
- STATUS 2026-11-13, the sessions (Run24 (5)): the catalogue holds the library's sessions and the run screen plays each as ordered segments with a cue apiece, its pace judged in its work only. Cruise intervals (3 × 8 and 3 × 10 minutes at threshold); a progression run (40, 50 and 60 minutes, the last 10 to 20 comfortably hard at threshold); repeats by time at the interval band (6 × 2, 5 × 3 and 4 × 4 minutes); short repeats at repetition pace (8, 10 and 12 × 200 m); repeats at 5K pace (4 to 6 × 800 m) and at 10K pace (3 and 4 × 2 km); hill repeats (6 to 10 × 60 seconds), short hills (6 × 30 seconds) and a fartlek (6 × 1 minute), the last two half an hour each for the base; and a sharpener for each distance's taper (6 × 400 m at 5K pace, 4 × 1 km at 10K pace, 2 × 10 and 2 × 12 minutes for a half and a marathon, at race pace where the plan has one). Repetition and race paces come from the interval pace every surface already holds (`repeatPaceFromIntervalPace`, within 2 to 3 s/km of the pace table), so a session's pace, rest and minutes agree wherever it is named; hills and a fartlek take no pace with a benchmark or without, and without one every session speaks in effort words ("10K EFFORT · REP 1/3"). Rest is 70% of the repeat at the interval band, about twice it at repetition pace and 30% at a race's; by feel it is the template's jog back down. A fit that shortens a session (a time limit, the starting point) keeps the same kind of work, its own ladder first, so a hill session never becomes repeats at a pace, cruise intervals never a time trial and a sharpener never a build session; a new runner's fit keeps to the ladder. Repeats at anything but the interval band are never read as evidence of fitness, and a progression run never takes a goal pace. No plan holds the new sessions in this change; the traces are unchanged.
- STATUS 2026-11-13, the plan holds them (Run24 (5)): built. A build's quality sessions take turns through families by distance (`BUILD_FAMILIES`, a Tropos heuristic), each a ladder on the tempo or interval rung the block has reached, so the first of each kind is still its first rung and none climbs more than one, and a beginner's first is its first family's (Run24 (8)): a 5K's intervals are 1 km repeats, 5K-pace 800s, 200s at repetition pace and repeats by time, and its tempos the 20-minute tempo and a progression run; a 10K's are 1 km repeats, 2 km at 10K pace, repeats by time and 200s, and its tempos a tempo, cruise intervals and a progression run; a half's and a marathon's are 1 km repeats, repeats by time and hills, with the same three tempos. A half's or marathon's tempo and cruise intervals in a race-pace week (Run24 (9)) are race-pace blocks, at the marathon band when no goal time is typed. A base week with a run besides the long run and the medium-long holds a fartlek or short hills in turn; not on two run days, a detrained or compressed or gentler block, nor a beginner's block before 40 minutes in one go (Run24 (8)). The taper's session is the distance's sharpener (6 × 400 m at 5K pace, 4 × 1 km at 10K pace, 2 × 10 and 2 × 12 minutes at race pace) in place of 8 × 400 m for every race. A regular runner on five run days or more holds a second quality session by default, where both have a day clear of lifting (harder still may put one on a lifting day); not a new runner's block, nor gentler. The time trials still take a week's tempo or its one quality session, now a base week's light session among them, every five weeks (Run24 (4)); the weekly hold, own-week start and race week are unchanged. Traces: sub-3:30 (five days, regular) holds two quality sessions in each build week, easy 64 to 80% of the minutes each build week ran; the 2–3-day hybrids' `taper-cut` and `volume-jump` came out; the owner's, couch-to-5K and the freeform runner's traces are unchanged (their builds hold no quality, or no race). Race finishes in the simulator move 3 to 81 seconds slower (sub-3:30, 3:45:16 to 3:46:37), and injuries are unchanged: the model credits minutes, and a half-hour light session holds a longer easy run's place. Not built: a marathon-pace session of its own beyond the race-pace blocks; strides twice in a base week on three run days, where the light session takes the strides run's place; the freeform structured week, still tempo, 5 × 1 km and 8 × 400 m (call 3's ground); 6 × 1 minute pick-ups in a beginner's block before 40 minutes, which keeps its strides.
- STATUS 2026-11-14: built (Run24 (5)), the two the plan left out. A marathon's or a half's later build weeks hold a session of their own at race pace, a long run with blocks at it (`racePaceBlocks`; `long_16k_mp` to `long_32k_mp`, `long_14k_hmp` to `long_24k_hmp`): 2 × 3 km under 22 km and 3 × 3 km from it in a marathon's, 2 × 3 km in a half's, 1 km easy between and 1 or 2 km easy to finish, with 6 km or more of easy running first. It comes every other week from the build's second half, in place of the plain long run, the same distance and minutes, so the week and its weekly hold are the plain run's; not in a step-back week, the ramp's last (the peak long run stays easy), a time trial's, a new runner's, detrained, compressed or gentler block, a week whose runs the starting point's climb holds short, nor a long run a return from a gap holds under the ramp's (`racePaceWeeks`, a Tropos heuristic). Its blocks run at the goal time's pace or, for a marathon with none, the marathon band (Run24 (9)), pinned; without either they run by effort, named for the race ("MARATHON EFFORT · BLOCK 1/3"). The run summary gives it no pace verdict, since its average mixes easy running and race pace; a fit or a lighter week shortens it to a shorter one of its own race, else to a plain long run, and never gives a plain long run blocks. A 20-week marathon on four days holds two (28 and 30 km, `racePaceLongRun.test.ts`), a 14-week half on three days one (18 km). A three-run-day base week whose light session took the strides run's day now keeps strides on its one easy run, the medium-long, where its tier has them (`baseStridesAndPickUps.test.ts`). Traces: the year-out marathon runs 26 and 28 km with blocks, about 20 s/km quicker on average than its plain long runs; half-3-days holds an 18 km one and its three base weeks' 50-minute run gains strides, as do the 2-3-day hybrids' base weeks and half-moves-long-run's; sub-3:30's and the 3-4-day hybrids' fall in weeks the runner skips the long run; races move by a second or none, injuries and every coaching finding are unchanged. Not built: strides on a medium-long of an hour or more (no tier of that length has a strides run), the rolling base's three-day weeks before a capped block (its session still takes the week's one easy run), and the freeform structured week (call 3's ground).
- STATUS 2026-11-14, plans with no race date (Run24 (5)): built. The free-running plan with no date (`rollingRun`: Keep fit, Build to 5K, Build to 10K and Get faster at 5K, and the rolling base before a race far away) held tempo, 1 km repeats and 8 × 400 m outside the library, as the structured week did; it now takes the library as a block does. Its tempo and intervals take the families for the goal's distance in turn (`freeFamilies` over `BUILD_FAMILIES`): a 5K's for Build to 5K and Get faster at 5K, a 10K's for Build to 10K and for Keep fit, which names no distance, and the race's for the base before a race; each a rung past the last of its kind and never past the goal's peak, a time trial taking no family's turn. Under a 20-minute tempo (Build to 5K, Get faster at 5K, Keep fit, the base before a race) there are no cruise intervals, as a 5K's block holds none; where the rotation holds short reps of its own (Get faster at 5K, Keep fit) they are 8 to 12 × 200 m at repetition pace on their own ladder in place of 8 × 400 m, and the intervals leave 200s to them. The opening week and the rotation's light turns (two of every three build weeks in Build to 5K, one in three in Build to 10K and Keep fit) hold a fartlek or short hills in turn where the week has a run besides the long run and the medium-long, as a block's base week does; a lighter week keeps strides alone; gentler keeps to the tempo ladder's first rung, in its families' turn; a plan begun as a new runner holds none of them until the runner has run 40 minutes in one go (Run24 (8)), then starts each kind at its first family's first rung. The structured week, retired since Run9a and built only for a stored "structured" plan (no setup or Run plan offers it, and a stored one is read as free running), takes a 10K's families in turn on the rungs it held: 5 × 1 km, the 20-minute tempo, 3 × 2 km at 10K pace, a progression run, 5 × 3 minutes, 10 × 200 m. The weeks' levels, days, horizons, the weekly hold and the time trials' weeks are unchanged. Traces: `build-10k-no-date` holds a session or trial in 13 of its 20 weeks where it held 10, the new ones light sessions; its week 9's 3 × 2 km at 10K pace is over what the runner's climb allows that week, and the starting-point fit, which keeps a session's kind, makes it an easy 40, as it would in a block; its year ends at VDOT 41.61 where it ended at 41.74 (the model credits minutes, and a 30-minute light session holds a longer easy run's place). `year-out-marathon`'s base before its block holds 8 × 200 m, progression runs and light sessions where it held 8 × 400 m and easy weeks, and its race is unchanged at 4:01:56; `sick-six-weeks`'s two weeks before its block hold a fartlek and short hills, and its race is unchanged at 48:38. No coaching finding changed. Not built: a second quality day, by default or harder's, in a plan with no date; 6 × 1 minute pick-ups for a beginner before 40 minutes (as in a block); a shorter session at 10K pace for the fits to take.

### D6. A new runner is given 4 x 1 km hard two weeks after run-walk. Injury risk for novices.

- Runner: week 8 of plan B. The session takes 41 min and 5.6 km, the longest run of their life by 68%. On two run days (the repo's `new-runner-marathon` trace, `src/features/program/__tests__/sim/__traces__/run/new-runner-marathon.txt`, weeks 8 to 16) every week is one quality session and one long run.
- Root cause: reps are by distance (`src/lib/workoutTemplates.ts:261-330`); the new-runner cap fits a session by its nominal minutes, 29 for `4x1k`, which assumes reps at about 3:40 /km (`src/features/program/runTimeLimits.ts:38-50`, `src/features/program/newRunner.ts:185-213`); quality is allowed from the first week after the six run-walk weeks (`newRunner.ts:26`, `runScheduler.ts:1647-1652`).
- Fix: no tempo or 1 km reps in a block begun as a new runner until continuous runs reach 40 to 45 min; until then strides or 6 x 1 min pick-ups by time; size interval sessions in minutes at the runner's pace wherever a cap is applied.
- Size S to M. Lock: Run20 (5) sets six weeks without quality; this extends it (a STATUS line).
- STATUS 2026-11-13: built (Run24 (8)). A block begun as a new runner holds no tempo or intervals, its first six weeks or after, until the runner has run 40 minutes in one go (`beginnerQualityWeek`: from the week after the earliest such run among the recent runs); its easy weeks keep their strides until then, and the ladders start at their first rung when quality begins. In the repo's `new-runner-marathon` trace the tempo two weeks after run-walk goes, and the first quality session is 4 x 1 km the week after the runner's first 47-minute long run; in `couch-to-5k` the build's quality slot becomes a strides run. Sizing interval sessions in minutes at the runner's pace wherever a cap applies is not built.
- STATUS 2026-11-14, kept on the plan: built (Run24 (8), its review). A beginner's first week that may hold quality is kept on the plan once the runs show it (`RaceBlockInputs.qualityFrom`), so a read that fails, or a month whose 40-minute run has left the window, no longer takes quality back out of their weeks.
- STATUS 2026-11-14, pick-ups: built (Run24 (8)). A block begun as a new runner, past its run-walk weeks and before it holds quality, has 6 × 1 minute pick-ups by time in place of its strides every other week (`easy_30_pickups`, `easy_40_pickups`, `easy_50_pickups`): a 10-minute easy warm-up, six 1-minute pick-ups comfortably hard by feel with a minute easy between, then easy to the run's minutes, no pace in any segment with a benchmark or without. A new runner's minutes shorten one to a shorter pick-ups run, else to a plain easy run, as they do strides; a lighter week steps it down its own ladder. A 16-week 5K on three days holds them in its weeks 8, 10, 12 and 14 and strides in 9, 11 and 13 (week 7's runs are held to 25 minutes, too short for either), and none once the runner has run 40 minutes (`baseStridesAndPickUps.test.ts`). In the traces couch-to-5k's week 9 strides run becomes pick-ups; its race moves a second. Not built: pick-ups in the rolling base before a beginner's capped block, which keeps its strides.

### D7. No plan without a race date, and nothing after the recovery weeks. Breaks trust.

- Runner: "Free running" is an empty week forever. After the race, 1 to 4 weeks of 30-minute runs and then an empty week. The starter goal ends the same way.
- Evidence: plans A, L, and the last row of every season.
- Root cause: `weekRollover.ts:492-496`; setup's three options (`Onboarding.tsx:1425-1437`).
- Fix: rolling plans with no date ("build to 5K/10K", "get faster at 5K", "keep fit": the generator with a repeating 4-week cycle and a soft horizon), and a "what next" step when recovery ends.
- Size M to L. Lock: **Run9** (owner, 2026-05-29: a race goal is the only plan) and Pgm8 R23 ("free running unchanged"). Owner call 3.
- STATUS 2026-11-13, the rolling run (Run24 (3)): the weeks of a plan with no date are built (`rollingRun` in `runScheduler.ts`, the goals in `rollingPlan.ts`): a four-week cycle (three that build, one that steps back a rung, its easy runs a tier down, strides only), a climb from the runner's own week to the goal's horizon (a long-run rung every two build weeks, an easy tier every three, never under the runner's own), then held there with its quality rotating, the weekly hold and the time trials as a race block's. It runs first as the base before a far race (D9 below). Plans with no date, setup's and the run plan editor's goals, and the "what next" after recovery come with the next PRs.
- STATUS 2026-11-14: built (Run24 (3)). Plans with no date: setup ("Plan, no race" beside Free running, 30 minutes and Race prep) and Run plan (a "Plan, no race" card) offer Keep fit, Build to 5K, Build to 10K and Get faster at 5K, with runs a week and, at setup, the runner's own week (`RollingGoalPicker`). The profile stays on free running, with no race goal, and the plan lives on the programme (`RunPlan.mode` "rolling", `rollingGoal`, `rollingWeekKey`, `currentWeek` from 0), so no server or rules change; `rollingGoalOf` and `runModeWithPlan` are how every surface reads it (Train's week and header "Build to 10K · Week 3", Home's rest day kept rest, the run page's planned session, the rollover, Settings saves of the lifts or the layout, Reset programme). The weeks are `generateRollingPlan`: the goal's rolling run (horizons 8, 12, 10 and 10 km), the 15% weekly hold, the time trials (not for Build to 5K), and every fit a race block takes (new runner, time limits, starting point, layoff). Free on every account: `racePlanLocked` reads race_prep alone, so only half and full marathon race plans are Pro after week 1. When a race's recovery ends, Train's banner offers Choose a plan (Run plan on Keep fit), Set next race or No plan for now, in place of "What's next?" and Back to freeform; free running offers the plan too, dismissible. In the new `build-10k-no-date` trace the long run climbs 8 to 12 km by week 6 and holds, a lighter week every fourth, a session most weeks, the week from 141 to about 220 minutes over 20 weeks; its one coaching finding is `spike`, the 2 km rungs, as every race plan's. Not built: "The weeks ahead" outline for a plan with no date, Home's day peek purpose line for it, and a starter goal's own "what next" (its Done card still offers a 5K).
- STATUS 2026-11-14, after the starter goal (Run24 (3)): built. The 30-minute goal's Done card (`StarterDoneCard`, on Home and Train) offers what comes next as three rows, each one tap into Run plan with it chosen, as the recovery banner's Choose a plan opens it: Build to 5K and Keep fit, plans with no race date (`?goal=build_5k`, `?goal=keep_fit`), and Train for a 5K, at a race or on your own (`?goal=5k`, Run9 call 6's offer), each with what its weeks hold in a line, then Not now. Saving Build to 5K from there puts the plan on the programme with the profile on free running and keeps the goal with its stage (`RunPlanSettings.test.tsx`); the plan is free on every account, as every plan with no date is. The starter journey looks for the three. Not built: screenshots (the emulator rig needs firebase-tools and the emulators, which this sandbox does not have).

### D8. A race too close gets a plan that cannot prepare anyone, described in words that are not true. Breaks trust, injury risk.

- Runner: marathon in 4 weeks: twelve 30-minute runs, no long run, then the race. Copy: "the long runs build in fewer weeks, with bigger jumps between them". In 6 weeks: longest run 12 km. A trained runner who joins late is detrained by the plan; an untrained one is not told to pick another race.
- Evidence: plan K; planner copy in `evidence/direct/planner-copy.txt`.
- Root cause: a block that starts inside the taper has no build to take a share of, so every week is `easy_30` (`runScheduler.ts:403-414, 812-816, 1371-1373`); the marathon floor is 4 weeks, so 4 weeks is "compressed", not "very tight" (`runPlanTiming.ts:136-140`); the copy is per status, not per plan (`raceGoalPlanner.ts:492-503`).
- Fix: when the block opens in its taper, taper from the runner's stated starting point (75% and 60% of their own longest run and week), not from zero; if the starting point's longest run is under about half the race distance and the race is inside the minimum build, say so first and offer a later date or a shorter race; write the status line from what the generated weeks hold.
- Size S to M. No lock in the way (Pgm8 R14c already says this for new runners only).
- STATUS 2026-11-13: built. A compressed block's taper takes its 75% and 60% from the larger of its build's longest run and the runner's starting point, so a block with no build no longer runs easy 30s to a marathon. The planner's status line says what the weeks hold, and leads with both distances when the race is out of reach (the rule `raceOutOfReach` shared with the welcome-back sheet). The race card says a block with no build tapers. See `build-plan.md`, slice 3, #8.
- STATUS 2026-11-13, setup's words (Run24 (7)): setup leads with the honest sentence and the alternatives wherever the plan cannot build to the race. The race out of reach and C's short-runway line already did; a race too close for a full build now says so first and that a later race or a shorter one gives it time, then offers the mostly-easy plan, which can still be saved.
- STATUS 2026-11-13, setup's words (Run24 (1) and (7), review fixes): setup's preview runs the plan the save builds, with its easy pace (the race typed at setup over the stored benchmark), time limits and starting point; it ran without the easy pace, so a runner who typed a 10K in 68:00 (a 2:30 half, easy about 8:25 /km) setting up a marathon five months out was told "Your longest run will be 32 km" while the saved plan peaks at 20, and is now told "20 km, about 2 h 50 min" (`Onboarding.test.tsx`). The week previews' minutes take the same pace. A 5K's sentences offer a later race only, never a shorter one ("A later race gives it time."), and a 5K and a 10K are named "5K" and "10K" in the planner's sentences, not "5k".

### D9. A race far away is the same plan stretched. Hurts quality.

- Runner: 15 weeks of easy running only, a long run that does not move for six months.
- Evidence: plan K, 40 weeks.
- Root cause: base is 40% of whatever the block length is and the ramp is one straight line over it (`runPlanTiming.ts:86-92`, `runScheduler.ts:553`).
- Fix: cap the race block at 16 to 20 weeks; before it, a rolling base block (D7) or an intermediate race.
- Size M. decisions.md R18 is "measuring, not run".
- STATUS 2026-11-13: built (Run24 (3)). A race block runs at most 16 weeks for a 5K or 10K, 18 for a half and 20 for a marathon (`RACE_BLOCK_MAX_WEEKS`); a plan further out runs a rolling base first (`raceBaseRolling`): keep fit's run climbing from the block's opening to a long run of 8, 12, 14 or 18 km, with a light tempo, strides and 8 x 400 in turn and the time trials, stepping back every fourth week on the cycle that runs on into the block's. The block opens where the base got to (`OwnWeek`), and the weekly hold runs across the join. `getPhaseForWeek` and `isRunStepBackWeek` read the cap, so the cockpit, the lift side's lighter weeks and the session words agree with the weeks built. In the year-out marathon trace the base's long run reaches 18 km in week 6 and holds it for 30 weeks with a session most weeks, at about 234 minutes a week against the runner's 195; the block then climbs 18 to 28 km (the runner's ceiling at their pace, as before); the simulator's race is 4:01:50 against 4:00:24 before (with the shorter base for a regular runner, Run24 (2), the block's own base is a quarter of its weeks before the taper). No coaching ratchet moved. The rolling base rotates light sessions, so a far race's plan holds quality before its block's build; the block's own base holds none (`rollingPlan.test.ts`, and the marathon journey says so). Not built: an intermediate race in the base.

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
- STATUS 2026-11-13: built (Run24 (9)). A build's tempos alternate race pace and threshold in pairs of weeks (`buildTempoAtRacePace`), so with tempos every other week every other one is at race pace; every taper tempo stays at race pace. A marathon with no goal time runs its race-pace work, tempos and long-run finishes, at the middle of the marathon band a confirmed benchmark gives, and the words say "marathon pace", never a goal the runner did not set. A half with no goal time has none, as the lock reads.

### D13. Race week and the taper ignore how much the runner runs. Polish to quality.

- Evidence: race week is an `easy_30` on every run day before the race (six, Saturday included, for runner G; `runScheduler.ts:1434-1453`). In the repo's `owner-marathon` trace the taper and race week hold more weekday running (five 30-minute runs) than the build did (five 20-minute runs), lines 124-131 of `src/features/program/__tests__/sim/__traces__/run/owner-marathon.txt`. Fix: race week of two or three short runs and a 15 to 20 minute shake-out, never above the build's own easy runs. Size S.
- STATUS 2026-11-13, never above the build: built. Two causes. A week with no long run gave its weekday runs the long run's minutes as well, which is right for a lead-in and is how the owner's week before race week held five 30s after a build of five 20s; a taper or race week with no long run now keeps its weekday runs to their own minutes, cut to no shorter than 20. And a taper or race week fell back to 30-minute runs whatever the build held; where the build's easy runs were under 30 (a new runner's, a time limit), its 30s are now the build's. In the owner's trace the week before race week goes from 160 to 120 minutes and race week's runs before the race from 150 to 110 (`taperCutsWeekdays.test.ts`, `newRunner.test.ts`). Two or three runs in race week in place of one on every run day is not built: it cuts how often they run, which the taper's evidence keeps (Bosquet 2007), so it is a call to make on its own.
- STATUS 2026-11-13, race week: built (Run24 (10)). Race week keeps a run on each run day before the race, as before, and each is now a 20-minute shake-out in place of 30 (a build of shorter easy runs keeps its own). In the owner's trace race week's runs before the race go from 110 to 100 minutes; across the repo's season traces only race weeks move, injuries are unchanged and race finishes come in a few seconds faster.

### D14. Missed long runs collapse the plan without a word about the race. Breaks trust.

- Evidence: the repo's `owner-marathon` trace: long runs missed in weeks 18 to 21 while 4 or 5 of 6 runs were done each week; week 22 plans no long run, the taper 6 and 8 km, then the marathon at 5.27x the month's longest (lines 89-131). No fell-behind flag fires because the week is over half done (`functions/lib/fellBehindWeek.js:19`). The same trace holds zero quality sessions in 25 weeks and weekday runs of 10 to 20 min on six run days, because an "occasional" runner under the plan's minutes is held easy-only (`runningBaseline.ts:288`).
- Fix: a race-readiness check each week from the long runs actually done; when the reachable long run falls under half the race, say so and offer the three choices the fell-behind sheet already has. Fewer, longer runs when the weekly minutes are small.
- Size M.
- STATUS 2026-11-13: the check built (Run24 (11)). Home reads the farthest run of the last four weeks and builds on it 2 km a week through the weeks before the taper (`raceLongRunCheck`); when that is under half the race, it opens the fell-behind sheet in a race register once a week: "Your longest run in four weeks: 4 km", what it builds to and the race, with moving the race first and the realign one tap below. Not in a plan's first two weeks, not in recovery, and not for a runner with no run in four weeks, whom the run return greets; the weekly check's own sheet and the run return speak first (ADR-0004's amendment). Fewer, longer runs when the weekly minutes are small is not built: it is call 2's ground (the starting point).
- STATUS 2026-11-13, the check against the plan (Run24 (11), review fix): the check now opens only when the runner has fallen behind the long runs the plan put in their week (their longest run of four weeks is under 95% of the rung before this week's, read before the plan fitted the long run to the running done, so a month of missed long runs still counts though the plan has shrunk the week), and their reach before the taper is under half the race or under what the plan itself builds to, whichever is shorter (`RunPlan.peakLongRunKm`, the plan's longest long run from the week it was built, written at every build). Never in the taper or race week. Before, a marathon plan peaking under 21.1 km (easy slower than about 8:11 /km at the 180-minute ceiling, about VDOT 28 and under, or a short block) opened the sheet every week from the taper on for a runner who did every run, and said "before the taper" in the taper. Through a season (`raceLongRunCheck.sim.test.ts`): the owner's marathon opens it once, in its last build week after a month without a long run (week 22, 4 km building to 6), where before it also opened the week before, a step-back week of 16 km, a distance run that month, and each taper week and race week; the owner's set-up with a 10K benchmark at VDOT 27, its plan held to 20 km, opens it never when every run is run (before: each of the three taper weeks and race week, reach 20 under 21.1) and once, in the last build week, when the last long runs are missed. A plan stored before it carried its peak waits for its next weekly build. The sheet's words are unchanged.

### D15. Interval sessions are thin on structure. Polish.

- 5 min warm-up before 1 km reps, 90 s recovery for every runner (a 3:56 rep and a 6:37 rep get the same rest), `workoutTemplates.ts:261-330`. Fix: 10 to 15 min warm-up, recovery 50 to 90% of the rep's time. Size S.
- STATUS 2026-11-13, the warm-up: built. The four interval sessions warm up for 10 minutes, not 5, and their planned minutes rise by the same 5 (4 x 1 km 34, 5 x 1 km 40, 6 x 1 km 46, 8 x 400 m 30), so a week's planned minutes and the time-limit fits count it; the season traces move by those minutes and nothing else. Recovery as a share of the rep's time is not built: the rest is read in the launch config, the session player, Home's hero and "What it is", and a pace-led rest needs the rep pace at each of them, so it waits for its own change.
- STATUS 2026-11-13, the rest: built. With a confirmed benchmark the rest between repeats is 70% of the repeat at the runner's own interval pace, in half minutes and never under a minute (`src/lib/intervalRest.ts`): 1 km at 3:56 rests 3 minutes, at 6:37 4½. The run plays it (the launch's intervals and their recoveries), and Home's hero, the day's sheet, Train's run and "What it is" say it. An interval session's minutes are stated at that pace and rest too ("about 45 min"), as a long run's are at the easy pace, since the template's assume repeats of about 3:40 /km. Without a confirmed benchmark nothing changes: the template's 90 seconds and its minutes. A session someone sets up themselves keeps the rest they chose. The week's planned minutes and the time-limit fits still count the template's minutes, as they count its rep time.

### D16. "Harder" on six days puts tempo, a 75 to 90 minute run and intervals on consecutive days. Polish.

- Evidence: `evidence/direct/outlines.json`, `marathon-18w-harder-6days-easy-323`, weeks 9 to 14 (for example week 14: Mon 6x1k, Tue easy_90, Wed tempo_40). Root cause: with no clear day the fill order is kept (`src/features/program/runPlacement.ts:62-80`). Fix: in a two-quality week cap the medium-long at 50 to 60 min or drop it. Size S.
- STATUS 2026-11-13: built. A week with two quality sessions whose medium-long has no day clear of them and the long run holds it at 50 minutes, under the hour Run20 counts as demanding: the six-day harder marathon's Tuesdays of 60, 75 and 90 minutes between intervals and a tempo are 50 (`midLongTwoQuality.test.ts`). Its stepped taper then takes its shares of the 50 the build held (Run22). A week with one quality session, or a clear day, keeps its medium-long.

### D17. Heart rate plays no part in a plan. Hurts quality against HR-led competitors.

- No session is prescribed by zone. Live heart rate needs the Watch bridge, which is off unless `VITE_CONNECTED_TRAINING_ENABLED` is set (`src/lib/heartRateSource.ts:107-111`, `src/lib/connectedTrainingRelease.ts:6-7`). Easy and long runs carry no pace target and no in-run "too fast" cue (`src/lib/runPaces.ts:432-437`); the summary says so afterwards. Fix: an easy-run ceiling cue in-run; optional zone targets once the Watch path ships. Size M. The handoff bars "mandatory" zones only.
- STATUS 2026-11-13: the easy cue built (Run24 (12)). For a runner with a confirmed benchmark, an easy or a long run going more than 10 s /km faster than the fast end of easy hears so (`checkEasyCeiling`), spaced 30, 60 and 120 seconds and at most three a stretch like the pace alert, in its easy running only (`judgesEasyNow`: not the strides, a race-pace finish or a run-walk), under the run's pace-alert switch. The run still carries no pace target. Zones wait for the Watch path. A device check is in `docs/qa/pre-launch-backlog.md`.

### D18. Short-race long runs are low and flat. Polish.

- 5K peaks at 8 km and 10K at 12 km for any runner (`runPlanTiming.ts:39-40`); plan C holds 6 km for seven weeks. Fix: scale the 5K and 10K long-run peak from the starting point (10 to 12 km and 14 to 16 km for regular runners). Size S.
- STATUS 2026-11-13: built with D3 (Run24 (2)): a 5K or 10K block starts from the runner's own long run and peaks 25% above it, so a 10K runner with a 75-minute long run at 5:40 /km goes from 12 to 14 km and a 5K runner with an hour's run from 10 to 12 km. A runner under the plan's base keeps its 8 and 12 km.

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
