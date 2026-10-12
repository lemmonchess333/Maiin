# R17 measured: the marathon long run's peak

decisions.md R17 (Run17, delegated 2026-09-06) asked for year-out-marathon,
sub-3-30 and new-runner-marathon to be measured against Run17 as built: peaks,
spikes and finish times. They are the simulator's only marathon personas.
Measured 2026-10-11 on ddb985a2, the open training-engine PRs integrated, the
stepped taper (lemmonchess333/Maiin#2682) among them. The code is the R17
section of `src/features/program/__tests__/sim/measuring.sim.test.ts`:
`TROPOS_SIM_MEASURE=20 npx vitest run src/features/program/__tests__/sim/measuring.sim.test.ts -t R17`
writes the report below to `test-results/sim/measuring.md` in about five
minutes. Each option is the generator's own ladder and taper built to that
option's peak, and nothing else changed; the check at the end shows every
simulated week's long run replayed before it was changed.

## Reading

- **The new marathoner's long run isn't R17's.** It is the new-runner build's
  (Run20 (5): six weeks of run-walk, then 20 minutes and 5 more a week), which
  tops the build out at 12 km and the taper at 15 km before a 42 km race,
  whatever the peak: Run17, 25 km and 30 km give identical seasons. Daniels is
  the only option that changes it, to 6 km (30% of a two-run week is under 20
  minutes), and it costs the race 7 minutes. How long a new runner's long run
  gets before a marathon 20 weeks out is R14's question, and R14c's, the
  owner's.
- **The slower benchmarked runner** (the year-out marathoner, 6:22 /km easy)
  keeps the long run inside 150 minutes only on Run17 (20 km, 2 h 04) and
  Daniels (12 km, 1 h 16). Hansons' 25 km takes them 2 h 35, six runs of 2½
  hours or more; 30 km takes 3 h 04, twelve of them.
- **Run17 is the option that costs the faster runner.** A 3:45 marathoner whose
  benchmark plans at 6:14 /km is held to 20 km (1 h 56 at their own pace) and
  finishes 1.8 minutes slower than on 25 km, 3.2 slower than on 30 km. Daniels
  (15 km) costs them 2.0 minutes more than Run17. None reaches their sub-3:30.
- **Daniels shortens every long run here,** because the app's weeks hold two
  to five runs: 30% of the peak week leaves 78–99 minutes for the benchmarked
  runners (12 and 15 km) and 18 for the new runner. It costs every race 2–7
  minutes.
- **So none of the four does all of it.** Hansons' 25 km comes closest: no race
  slower, the faster runner's peak 2 h 24 at their own pace, the slower runner's
  2 h 35, 31 minutes past Run17's. The model prices that at 8–11% more expected
  injuries over the build, less risk in the race (the race 1.7 times the
  month's longest, not 2.1) and about 2 minutes off each finish. But a
  distance can't hold a slow runner to a time: 25 km is over 150 minutes for
  anyone slower than 6:00 /km easy, and 3 h 12 at 7:40 /km, where Run17 gives
  15 km. No persona runs there. Every option reached the start in 92–100% of
  seasons, a seed or two apart.
- **Found on the way** (not an R17 option): in every season the new runner's
  taper plans a longer long run than their build did, 15 km two weeks before
  race week after a 12 km build. The stepped taper (Run22) takes its 75% and
  60% of the ladder's 25 km peak, not of the build's longest as the new-runner
  build held it, which is what R8's built text says it takes.

## What the model can't say

- **Whether a long run is one the runner can finish, or recover from.** Every
  run is run as set, at the runner's own pace; nothing models fuel, durability
  or pacing practice. A long run is worth its minutes (fitness, so VDOT) and
  its kilometres (the race-day low-volume correction, Vickers & Vertosick), so
  a longer peak is a faster race by construction. Each finish gap is those two
  terms, roughly half each (two thirds VDOT for the new runner); the day
  (freshness, fatigue) carries next to nothing.
- **A long run's own risk.** The injury hazard is Videbæk's rate per hour times
  Frandsen's single-run spikes, so a run's third hour costs what its first did,
  a longer long run costs injuries in proportion to its time, and a peak nearer
  the race distance makes the race a smaller spike, by construction.
- **How big the gaps are.** Their size is the model's assumption; only their
  direction follows from the terms above.
- **The runners the question is most about.** No persona is a benchmarked
  runner at 7:40 /km or slower (Run17's 15 km), or a slow runner without a
  benchmark who isn't new (25 km, about 4 hours). The year-out marathoner, at
  6:22 /km, is the slowest benchmarked one.
- **The taper.** The model prices it low (+0.5% against the 2.6% the evidence
  expects), so nothing here separates the tapers each option builds.

## The report, 20 seeds

20 seeds of each runner model variant (base, harsh, intensity): 60 seasons per persona and option, the same seed and variant being the same runner under each option. The year-out marathoner lifts on the base lifter.

As built (Run17), the long run climbs the plan's sizes (6, 8, 10, 12, 15, 20, 25 and 30 km) to the longest one inside 150 minutes at the runner's confirmed easy pace, or inside the sizes' nominal minutes without a benchmark (25 km). Each option sets that peak and changes nothing else: the generator builds each week's long run again to it, with its own ramp, step-back weeks, peak hold and stepped taper (Run22: 75% and 60% of the ladder's peak), and a new runner's build and any run time limit then fit it at the pace the app plans with, as they do as built. Daniels: the long run 30% of the week under 64 km a week, the lesser of 25% and 150 minutes from 64 km, read once from the peak week (the build's last) as the app plans it, the week including the long run (3/7 of the week's other planned minutes), the longest size inside that, at the pace the app plans with, or the 6 km floor; reading the week with the long run as built in it gives the same sizes here. 30 km: the middle of the novice plans' 29–32 km, the plan's top size, whatever the pace. Hansons: 25 km, the plan's size nearest Hansons' 16 miles (25.7 km), whatever the pace.

### The plan

Per season, median [10th–90th]. Peak allowed: the longest size the option lets this runner's plan reach. Peak long run: the plan's longest before race week; its minutes at the runner's own easy pace that week, and its share of that week's planned minutes. Taper over build: the share of seasons whose taper plans a longer long run than the base and build did (Run22 means the taper's long runs to be 75% and 60% of the build's longest). Biggest weekly rise: the largest rise in planned minutes from one week to the next before race week. Single runs: the longest before the race against the longest of the 30 days before it (the single-run guard's yardstick, Frandsen 2025), the runs over 1.1 times it, and the race's.

| persona             | option           | peak allowed                | peak long run, km | its minutes   | its share of the week | taper over build | biggest weekly rise | biggest run ÷ month's longest | runs past 1.1× | race ÷ month's longest |
| ------------------- | ---------------- | --------------------------- | ----------------- | ------------- | --------------------- | ---------------- | ------------------- | ----------------------------- | -------------- | ---------------------- |
| sub-3-30            | as built (Run17) | 20 km (150 min at 6:14 /km) | 20 [20–20]        | 116 [111–116] | 33%                   | 0%               | 1.30 [1.29–1.30]    | 1.33 [1.33–1.38]              | 1 [1–1]        | 2.11 [2.11–2.81]       |
| sub-3-30            | Daniels          | 15 km                       | 15 [15–15]        | 87 [86–89]    | 27%                   | 0%               | 1.30 [1.29–1.30]    | 1.25 [1.25–1.31]              | 1 [1–1]        | 2.81 [2.81–3.73]       |
| sub-3-30            | 30 km            | 30 km                       | 30 [29–30]        | 172 [163–173] | 43%                   | 0%               | 1.46 [1.44–1.46]    | 1.33 [1.33–1.38]              | 3 [3–3]        | 1.41 [1.41–2.11]       |
| sub-3-30            | Hansons, 25 km   | 25 km                       | 25 [25–25]        | 144 [138–145] | 38%                   | 0%               | 1.33 [1.33–1.33]    | 1.33 [1.33–1.38]              | 2 [2–2]        | 1.69 [1.69–2.81]       |
| new-runner-marathon | as built (Run17) | 25 km (nominal minutes)     | 15 [15–15]        | 112 [107–115] | 82%                   | 100%             | 1.48 [1.48–1.48]    | 2.19 [2.16–2.23]              | 7 [6–7]        | 2.81 [2.81–3.52]       |
| new-runner-marathon | Daniels          | 6 km                        | 6 [6–6]           | 46 [44–47]    | 65%                   | 0%               | 1.48 [1.48–1.48]    | 2.19 [2.16–2.23]              | 4 [3–4]        | 7.03 [7.03–7.03]       |
| new-runner-marathon | 30 km            | 30 km                       | 15 [15–15]        | 112 [107–115] | 82%                   | 100%             | 1.48 [1.48–1.48]    | 2.19 [2.16–2.23]              | 7 [6–7]        | 2.81 [2.81–3.52]       |
| new-runner-marathon | Hansons, 25 km   | 25 km                       | 15 [15–15]        | 112 [107–115] | 82%                   | 100%             | 1.48 [1.48–1.48]    | 2.19 [2.16–2.23]              | 7 [6–7]        | 2.81 [2.81–3.52]       |
| year-out-marathon   | as built (Run17) | 20 km (150 min at 6:22 /km) | 20 [20–20]        | 124 [122–127] | 41%                   | 0%               | 1.61 [1.61–1.62]    | 1.33 [1.33–1.37]              | 3 [3–4]        | 2.11 [2.11–3.38]       |
| year-out-marathon   | Daniels          | 12 km                       | 12 [12–12]        | 76 [75–77]    | 29%                   | 0%               | 1.35 [1.34–1.35]    | 1.18 [1.17–1.20]              | 2 [1–2]        | 3.52 [3.52–4.54]       |
| year-out-marathon   | 30 km            | 30 km                       | 30 [30–30]        | 184 [180–188] | 50%                   | 0%               | 1.48 [1.48–1.49]    | 1.33 [1.33–1.45]              | 5 [5–5]        | 1.41 [1.41–1.41]       |
| year-out-marathon   | Hansons, 25 km   | 25 km                       | 25 [25–25]        | 155 [151–157] | 46%                   | 0%               | 1.62 [1.62–1.63]    | 1.33 [1.33–1.33]              | 4 [4–4]        | 1.69 [1.69–3.09]       |

### The runner

Long runs of 2½ hours or more: run before race day, per season. Injured: the share of seasons with an injury before race day. Expected injuries: the model's injury hazard summed over the runs before race day (each run's chance, 1 − e^−hazard), median [10th–90th]; the race's own: its chance in the race. The three runner variants share each seed's draws, so a seed's injuries tend to come in all three. Reached the start: the share of seasons that raced; the finish is over full races (a reduced-running injury halves the race too). VDOT on race morning and the weekly kilometres of the eight weeks before it are the two inputs to the model's race time.

| persona             | option           | long runs of 2½ h+ | injured | expected injuries | the race's own      | reached the start | finish                                          | VDOT on race morning | km a week, last 8 weeks |
| ------------------- | ---------------- | ------------------ | ------- | ----------------- | ------------------- | ----------------- | ----------------------------------------------- | -------------------- | ----------------------- |
| sub-3-30            | as built (Run17) | 0 [0–0]            | 45%     | 0.46 [0.39–0.56]  | 0.071 [0.063–0.105] | 92%               | 3:47:55 [3:43:07–3:54:31] · under 3:30:00 in 0% | 44.1 [43.3–44.5]     | 40.6 [33.9–43.7]        |
| sub-3-30            | Daniels          | 0 [0–0]            | 40%     | 0.44 [0.41–0.53]  | 0.072 [0.064–0.105] | 97%               | 3:49:35 [3:45:09–3:56:49] · under 3:30:00 in 0% | 43.8 [42.5–44.3]     | 37.9 [33.4–40.6]        |
| sub-3-30            | 30 km            | 2 [1–2]            | 45%     | 0.53 [0.46–0.65]  | 0.048 [0.042–0.071] | 92%               | 3:44:51 [3:39:04–3:50:27] · under 3:30:00 in 0% | 44.4 [43.9–45.0]     | 46.2 [38.7–49.8]        |
| sub-3-30            | Hansons, 25 km   | 0 [0–0]            | 45%     | 0.51 [0.46–0.60]  | 0.049 [0.042–0.071] | 97%               | 3:46:16 [3:41:05–3:51:52] · under 3:30:00 in 0% | 44.2 [43.4–44.8]     | 43.7 [37.3–47.2]        |
| new-runner-marathon | as built (Run17) | 0 [0–0]            | 20%     | 0.32 [0.28–0.37]  | 0.086 [0.081–0.126] | 100%              | 5:01:12 [4:49:38–5:09:21]                       | 32.0 [31.1–33.7]     | 15.1 [12.6–16.9]        |
| new-runner-marathon | Daniels          | 0 [0–0]            | 22%     | 0.26 [0.24–0.30]  | 0.088 [0.084–0.129] | 100%              | 5:08:36 [4:57:47–5:16:01]                       | 31.3 [30.7–32.6]     | 10.9 [9.0–12.3]         |
| new-runner-marathon | 30 km            | 0 [0–0]            | 20%     | 0.32 [0.28–0.37]  | 0.086 [0.081–0.126] | 100%              | 5:01:12 [4:49:38–5:09:21]                       | 32.0 [31.1–33.7]     | 15.1 [12.6–16.9]        |
| new-runner-marathon | Hansons, 25 km   | 0 [0–0]            | 20%     | 0.32 [0.28–0.37]  | 0.086 [0.081–0.126] | 100%              | 5:01:12 [4:49:38–5:09:21]                       | 32.0 [31.1–33.7]     | 15.1 [12.6–16.9]        |
| year-out-marathon   | as built (Run17) | 0 [0–0]            | 45%     | 1.33 [1.23–1.70]  | 0.077 [0.068–0.114] | 95%               | 4:07:20 [4:02:17–4:16:16]                       | 39.9 [39.1–40.4]     | 33.2 [26.2–37.2]        |
| year-out-marathon   | Daniels          | 0 [0–0]            | 45%     | 1.22 [1.12–1.53]  | 0.079 [0.070–0.116] | 100%              | 4:12:19 [4:07:32–4:20:59]                       | 39.4 [38.7–39.9]     | 28.3 [23.6–31.0]        |
| year-out-marathon   | 30 km            | 12 [10–14]         | 58%     | 1.56 [1.40–2.01]  | 0.068 [0.045–0.077] | 95%               | 4:01:47 [3:57:42–4:08:41]                       | 40.4 [39.6–41.0]     | 38.8 [29.7–42.4]        |
| year-out-marathon   | Hansons, 25 km   | 6 [4–7]            | 47%     | 1.44 [1.32–1.83]  | 0.069 [0.046–0.084] | 98%               | 4:04:39 [4:00:12–4:13:51]                       | 40.1 [39.4–40.7]     | 35.5 [27.6–40.1]        |

### What carries the finish

Each option's finish against the same runner's as built (both full races), minutes, median [10th–90th]; then the median of each model term's part of it: VDOT on race morning (fitness from minutes run, and any injury's lost weeks), the weekly kilometres the race-day correction reads (Vickers & Vertosick), and the day (freshness or fatigue, and the day's noise), each the model's race time with that input changed alone.

| persona             | option         | pairs | finish vs as built   | VDOT | weekly km | the day |
| ------------------- | -------------- | ----- | -------------------- | ---- | --------- | ------- |
| sub-3-30            | Daniels        | 55    | +2.0 [+1.1 to +2.6]  | +1.1 | +0.9      | −0.0    |
| sub-3-30            | 30 km          | 55    | −3.2 [−4.3 to −2.3]  | −1.5 | −1.7      | +0.0    |
| sub-3-30            | Hansons, 25 km | 55    | −1.8 [−2.4 to −1.3]  | −0.9 | −0.9      | +0.0    |
| new-runner-marathon | Daniels        | 60    | +7.4 [+5.2 to +10.8] | +5.1 | +2.3      | −0.2    |
| new-runner-marathon | 30 km          | 60    | ±0.0 [±0.0 to ±0.0]  | ±0.0 | ±0.0      | ±0.0    |
| new-runner-marathon | Hansons, 25 km | 60    | ±0.0 [±0.0 to ±0.0]  | ±0.0 | ±0.0      | ±0.0    |
| year-out-marathon   | Daniels        | 57    | +4.6 [+3.3 to +6.9]  | +2.6 | +1.9      | −0.1    |
| year-out-marathon   | 30 km          | 57    | −4.8 [−9.4 to −3.8]  | −2.4 | −2.0      | −0.1    |
| year-out-marathon   | Hansons, 25 km | 57    | −2.0 [−3.3 to −1.6]  | −1.1 | −0.8      | +0.0    |

Check: each week the variant first replays the generator's long run for the week as the plan holds it, a returning runner's (Run15) included, and changes only a long run it replays. sub-3-30, Daniels: 960 of 960 weeks replayed, 30 of them a returning runner's (the peak week's other runs 231 min); sub-3-30, 30 km: 960 of 960 weeks replayed, 30 of them a returning runner's; sub-3-30, Hansons, 25 km: 960 of 960 weeks replayed, 30 of them a returning runner's; new-runner-marathon, Daniels: 1200 of 1200 weeks replayed, 0 of them a returning runner's (the peak week's other runs 41 min); new-runner-marathon, 30 km: 1200 of 1200 weeks replayed, 0 of them a returning runner's; new-runner-marathon, Hansons, 25 km: 1200 of 1200 weeks replayed, 0 of them a returning runner's; year-out-marathon, Daniels: 3120 of 3120 weeks replayed, 12 of them a returning runner's (the peak week's other runs 181 min); year-out-marathon, 30 km: 3120 of 3120 weeks replayed, 24 of them a returning runner's; year-out-marathon, Hansons, 25 km: 3120 of 3120 weeks replayed, 16 of them a returning runner's.
