# Measuring L4 and L5: the sawtooth's options and the time fit's warm-ups

Measured 2026-10-11 on `ddb985a2`, the integration of the open
training-engine PRs with the simulator's catch-up, by the simulator's
measuring suite: 20 seeds of each lifter model variant (base and harsh), 26
weeks, the 15 lifting personas. The report the suite wrote is under the
reading, as generated:

```
TROPOS_SIM_MEASURE=20 npx vitest run \
  src/features/program/__tests__/sim/measuring.sim.test.ts -t "L4:|L5"
```

The models are hypotheses (simulator.md, "What the simulator can and can't
say"): a difference below is the size of the effect the models assume, and
each section says which model term carries it.

## The reading

### L4: the sawtooth (Pgm8)

**The test.** An option costs gains when its gain, paired with as built's
for the same persona, seed and model variant, is more than 1 percentage
point lower in median, pooled or for any persona. It cuts misses and drops
when the paired difference in each, pooled, is below zero in median and in
mean. The mean was added after the first 20-seed run, because a season's
drops are a handful and their paired median sits at 0 either way; it can
only make the test harder to pass, and it changed no answer.

**No option cuts misses and drops, and none costs gains,** so by the lock's
own rule Lift4 (6) and owner call (1) stand. Every option's paired gain is
within 0.1 points of as built's, for every persona. Pooled, per 100 of the
tracked lifts' sessions (median):

| group                         | option                          | misses | drops | below best |
| ----------------------------- | ------------------------------- | ------ | ----- | ---------- |
| intermediate and advanced (9) | as built                        | 22     | 6     | 66         |
| intermediate and advanced (9) | weekly step, per slot (briefed) | 22     | 6     | 66         |
| intermediate and advanced (9) | weekly step, per lift (added)   | 20     | 5     | 67         |
| intermediate and advanced (9) | drop scaled by level            | 26     | 7     | 66         |
| intermediate and advanced (9) | e1RM trend                      | 15     | 12    | 80         |
| beginners (6)                 | as built                        | 32     | 11    | 28         |
| beginners (6)                 | e1RM trend                      | 28     | 19    | 37         |

- **Weekly step, per slot, as briefed: nothing changes, by construction.**
  A slot is one day's lift and the week's order carries over, so a slot's
  sessions are never less than 7 days apart (median 7, 90th percentile 10,
  over 222,510 gaps). Lift4 (6)'s step after every session is already at
  most one a week in each slot, and the rule held back no step in any
  season. A lift steps more often than weekly only through its other
  slots: the 4-day plans' press and deadlift, a novice's bench and squat.
- **Weekly step, per lift: added, so the weekly step had a reading that
  bites.** A step in any of the lift's slots holds its other slots back for
  the week. Misses fall where a lift has two slots on fixed reps
  (intermediate-man 26 to 23 per 100, advanced-man 27 to 22,
  powerbuilder-strength 27 to 24, layoff-eases-back 19 to 16) and hardly
  anywhere else (pooled, paired: -1 per 100 in median, -1.7 in mean).
  Drops fall by one or two per 100 in four of the nine personas and hold in
  the other five (paired: 0 in median, -0.6 in mean), so it doesn't clear
  the test on drops. Sessions below best: 0 in median, +1.2 in mean. Gains:
  0.0 to -0.1 points. It isn't the option the lock names. It is the one
  reading of "intermediates progress weekly" that changes anything here,
  should the owner want one.
- **Drop scaled by level: more misses and more drops** (misses 22 to 26
  per 100, paired +4 in median and +4.7 in mean; drops 6 to 7, paired +1
  and +1.6). A lift 5% down is back at the weight it missed in fewer
  sessions, and misses there again. Sessions below best barely move
  (paired -1, mean -1.7): the way back is shorter and taken more often.
- **e1RM trend: fewer misses, more drops and more sessions below best.**
  Intermediate and advanced: misses 22 to 15 per 100 (paired -4, mean
  -5.7), drops 6 to 12 (+4, mean +6.9), below best 66 to 80 (+11, mean
  +18.9). Beginners: misses 32 to 28 (-4, mean -4.1), drops 11 to 19 (+7,
  mean +7.6), below best 28 to 37 (+6, mean +7.2). Each miss now takes the
  lift to the trend's load, usually a step down, where Lift4 (7) holds the
  first miss and drops 10% on the second.
- **Oreb's waves: not run.** They need structure the plan doesn't have and
  effort the model doesn't log. The rotary wave (OREB-44) changes a main
  lift's rep target every week (10-8-6, 9-7-5, down to 5-3-1) and sets
  each week's load from a max by his table, about 4% a rep (OREB-45); the
  effort wave (OREB-02) climbs from RPE 7 to the limit across each 4-week
  phase. The plan holds one rep target and one weight per slot, moved only
  by the step rule, with no weekly schedule and no max or training max per
  lift, so a variant would have to supply the max. The only one the harness
  can take from the app is the e1RM of sets stopped at their target, which
  can't rise by itself: loaded by Oreb's table it falls about 4% a wave
  (his 6RM load is 80% of the max, and Epley reads 6 reps at 80% as 96% of
  it), and by Epley's own it stands still. Taking the simulator's true 1RM
  would measure an oracle no app has. And the effort wave needs logged
  effort, or reps past the target, which the model doesn't have: the reason
  the effort-gated step waits too.
- **One new rule break, from the app's own chain.** In 1 of 40 off-sick
  seasons under the trend, the workout screen sets out a 17.5 kg barbell
  press (`session-off-grid`). Ease back in takes a 20 kg press to 17.5 kg,
  under the bar (F10); a set done there carries into later sessions' rows
  through the per-set start values (F23) after the plan follows a heavier
  set back up to 25 kg. The trend only changed the history that led there:
  its own loads are on the grid and never lighter than the bar.

**The e1RM trend, as measured.** After a miss, a main lift's load is the
trend's: the app's own record of each of the lift's last 4 sessions (any of
its slots: the weight followed and the average set there, at most 10 reps,
after Reynolds 2006), through the app's Epley (`epley1RMExact`), a
least-squares line read at the latest session, and the load for the target
by the app's own rep-to-load scaling, Epley's 1 / (1 + reps / 30)
(`represcribe.ts`, `startingLoads.ts`; within 1.5% of Nuzzo 2024 from 3 to
12 reps, lifting-evidence §2.15). On the lift's grid, no lighter than the
bar. Nuzzo's `REPS_TO_FAILURE` table isn't in this base (it is on the
stretched-range branch), and the app has its own scaling, so that is the one
used. With Epley both ways, a set stopped at its target gives back the
weight it was lifted at. The person does the target and stops, as the app
asks, so a trend of their sets can confirm a weight but never raise one.
Paired with Nuzzo's table instead, the same sets would read about 5% heavier
each time (5 reps is 85.7% of 1RM by Epley, 89.8% by Nuzzo): a step in
disguise, not a trend. So the option keeps Lift4 (6)'s step as the only way
up and replaces Lift4 (7)'s hold and 10% with the trend's load. A trend that
could raise a load needs logged effort or reps past the target.

**Which model term carries the differences.** Gains don't separate the
options because the lifter's dose (`lifter.ts`) counts a set in full within
4 reps of failure and calls any load of 8RM or heavier heavy: a step, or 5%
or 10% off for a few sessions, moves few sets past either line, so the
effective sets and the load zone hardly change. Misses come from the
day-to-day noise (`dayNoiseNovice`, `dayNoiseTrained`, after Grgic 2020's
3.3–5.5%), acute fatigue from the last sessions' hard sets, and the
person's rep z-score (Nuzzo 2024's spread). Drops and sessions below best
are each rule's arithmetic on those misses. Two things the model leaves out
bear on this question directly: fatigue that builds over weeks, so a drop
buys no recovery and grinding at the ceiling costs nothing past the day;
and logged effort, so neither an effort-gated step nor a trend that reads
reserve can run.

### L5: F8, the time fit's warm-ups

**(c) removes over-time in all five personas that had it, for one set a
week on one lift where a session grew. (b) removes it for one of the five
with a 4-week block and three with a 12-week block, and cuts more.**
Over-time sessions a season, median [10th–90th], and the share of seasons
with any:

| persona               | (a) as built     | (b), a 4-week block | (b), a 12-week block | (c)   | (c)'s cut                                                                                                   |
| --------------------- | ---------------- | ------------------- | -------------------- | ----- | ----------------------------------------------------------------------------------------------------------- |
| intermediate-man      | 18 [15–19], 100% | 0 [0–0], 10%        | 0, 0%                | 0, 0% | the Chest & Back day's press 4 to 3 sets in every season; the Shoulders & Arms day's pull-ups 4 to 3 in 10% |
| powerbuilder-strength | 0 [0–2], 13%     | as (a)              | 0, 0%                | 0, 0% | the Shoulders & Arms day's pull-ups 4 to 3 in 13%                                                           |
| layoff-eases-back     | 10 [0–14], 83%   | as (a)              | as (a)               | 0, 0% | the Deadlift Focus day's squat 3 to 2 in 83%                                                                |
| layoff-keeps-weights  | 11 [0–16], 83%   | as (a)              | as (a)               | 0, 0% | the same                                                                                                    |
| holidays              | 0 [0–15], 25%    | as (a)              | 0, 0%                | 0, 0% | the Chest & Back day's press 3 to 2 in 90%; the Shoulders & Arms day's lateral raise 3 to 2 in 25%          |

- **(c)'s cost, in sets per muscle** (the app's volume model, mean over
  seasons): intermediate-man's chest, front delts and triceps 14 to 13, 14
  to 13, 16 to 15; holidays' 12 to 11.1, 12 to 11.1, 15 to 14.1; the
  layoff personas' quads, hamstrings and glutes 8 to 7.2, 14 to 13.2, 14 to
  13.2; powerbuilder-strength's lats, rear delts and biceps 0.1 each on
  average. It
  re-fits about once a season, a day at a time, and costs nothing to the
  ten personas whose sessions never outgrew the fit.
- **(b) prices ahead from the plan's own rule, and most of F8's growth isn't
  the plan's.** All five personas load the weights they know in their first
  sessions (intermediate-man's 40 kg press done at 52.5 to 57.5), and range
  lifts climb reps for weeks before a step. Four weeks of the plan's steps
  catch only intermediate-man's press, a 4 × 3 that steps every session and
  reaches the ramp's last step (50 kg) inside the block, at the same cost as
  (c) there. Twelve weeks catch three of the five but cut more: a pull-up
  set in every season for intermediate-man and powerbuilder-strength,
  holidays' barbell curl (2 sets to none) and a lateral-raise set, and
  light-trainer's rope pushdown (2 sets to none) though its sessions never
  ran over. They still miss the layoff personas.
- **(c) works to the fit's own standard**, the unrounded estimate, while
  the `over-time` rule rounds to the minute. So it also cuts a day that runs
  over by under half a minute, which the rule doesn't count: holidays'
  Chest & Back day estimates 60.25 minutes once his press carries the 45 kg
  he knows (the rule reads 60), so its press loses a set in 90% of seasons,
  where the rule flagged only the Shoulders & Arms day, in 25%.
- **The app's re-fit path doesn't match its generator.** Run on a new plan
  with nothing grown, the calls planBuilder's re-fit for a new session
  length makes (`refitSessionsToTime`, then `balanceWeekVolume`) give 5 of
  the 15 personas a set the generator's fit didn't: a hack squat for three
  strength plans, a lateral raise, a dumbbell bench, each 2 to 3.
  `balanceWeekVolume`'s comment says the two come out alike. Built on
  that path as it stands, (c) would carry those sets in with its first
  re-fit; the measured variant keeps only the re-fit's cuts on the day that
  grew, so the cost above is the ramp's alone.
- **What the model can't say here.** The estimator's constants (45 seconds
  a set, 60 a warm-up set, 90 a lift's setup) have never been checked
  against saved sessions (decisions.md L5), so over-time is the app's
  estimate against the length it promised, not a stopwatch. A set a week
  less on one lift is a cost the lifter model can't price: it has no muscle
  size, and its strength dose is per movement family.

### How it was run

- `src/test/sim/sawtooth.ts` holds L4's options, each a
  `ProgressionVariant` (new in `liftSeason.ts`): applied at Finish to each
  lift the session trained, from where the app's own rules left it, after
  the rules check has held the app's code to its sheet. The session's
  outcome is read off the plan the option leaves, and each option counts
  what it changed.
- `src/test/sim/timeFit.ts` holds F8's (b), a warm-up pricing, and (c), a
  `PlanVariant` that calls the app's own `sessionFits`,
  `refitSessionsToTime` and `balanceWeekVolume`. (b)'s projection is
  `applyProgression`, the plan's own rule, run for a block's sessions with
  every set at its target, a slot coming round once a week, on the rep
  range the generator stamps.
- One app-side seam, a pure refactor with no behaviour change:
  `setWarmupPricing` in `sessionFit.ts`, which the app never calls. The fit
  priced each loaded lift's warm-up inline at the heavier of its weight and
  an established lifter's starting weight; that is now `establishedWeight`,
  and a measurement can price it another way and put it back. The fit's
  tests, the plan sweep and every simulator trace are unchanged.

## The report

### L4: the session-to-session sawtooth

Lift4 as built: a step whenever every set hits its target (Lift4 (6)); two misses in a row, 10% lighter, then a step a session back (Lift4 (7), owner call (1)). Each option is laid over it at Finish (`ProgressionVariant`, `sawtooth.ts`), from where the app's own rules left each lift. **Weekly step, per slot** (as briefed): an intermediate's or advanced lifter's slot steps at most once in 7 days; a step the app takes sooner is held back, weight and reps as before it (every step, a lowered lift's way back included). **Weekly step, per lift** (an addition, since the per-slot rule never bites; see below the table): the same, with a step in any of the lift's slots starting the 7 days for all of them. **Drop scaled by level:** an intermediate's or advanced lifter's two-miss drop is 5% on its grid (at least a step), climbing back as built. A beginner keeps Lift4 (6) and the 10% under these three, so they are left out of their rows. **e1RM trend:** after a miss, a main lift's load is the trend's: the app's own record of each of the lift's last 4 sessions (any slot, at most 10 reps), through its Epley (`epley1RMExact`), a least-squares line read at the latest, and the load for the target by the app's own rep-to-load scaling, Epley's 1 / (1 + reps / 30); on the grid, no lighter than the bar. The step stays as built: the person stops each set at its target, so an e1RM read off it gives back the weight it was lifted at, and only a step raises a load. Accessories as built. Oreb's waves aren't run (the reading says why).

26 weeks; 20 seeds of each lifter model variant; per season, median [10th–90th]. Over the persona's tracked lifts (squat, bench, deadlift, press; the dumbbell beginner's four): **gain**, true 1RM, %, averaged over the lifts; **Δ gain**, the option's gain less as built's for the same seed and model variant, percentage points; per 100 of their sessions, **misses** (a session the plan judged short at its weight), **drops** (the plan took the lift down after it) and **below best** (planned under the slot's heaviest plan weight at its sessions before). **Changed**: what the option did in the season, on every loaded lift for the weekly step and the drop: steps held back, drops made 5%, and for the trend, loads taken down / second misses kept at their weight. **New rules**: rules of the app's code the option's seasons break that as built's don't.

| persona               | option                | gain %           | Δ gain, pp       | misses /100 | drops /100 | below best /100 | changed               | new rules        |
| --------------------- | --------------------- | ---------------- | ---------------- | ----------- | ---------- | --------------- | --------------------- | ---------------- |
| novice-man            | as built              | 26.9 [19.3–36.4] | -                | 25 [15–32]  | 7 [4–12]   | 26 [17–44]      | -                     | none             |
| novice-man            | e1RM trend            | 27.0 [19.4–36.4] | -0.0 [-0.2–0.2]  | 20 [13–32]  | 18 [11–24] | 31 [23–48]      | 31 [20–39] / 0 [0–1]  | none             |
| novice-woman          | as built              | 26.4 [19.2–35.3] | -                | 31 [22–43]  | 11 [8–17]  | 22 [15–31]      | -                     | none             |
| novice-woman          | e1RM trend            | 26.2 [18.9–35.3] | -0.1 [-0.9–0.0]  | 26 [18–35]  | 19 [15–23] | 34 [21–48]      | 32 [26–37] / 1 [0–4]  | none             |
| intermediate-man      | as built              | 6.8 [4.4–9.7]    | -                | 26 [19–32]  | 7 [4–11]   | 61 [41–86]      | -                     | none             |
| intermediate-man      | weekly step, per slot | 6.8 [4.4–9.7]    | 0.0 [0.0–0.0]    | 26 [19–32]  | 7 [4–11]   | 61 [41–86]      | 0 [0–0]               | none             |
| intermediate-man      | weekly step, per lift | 6.8 [4.4–9.7]    | -0.0 [-0.0–0.0]  | 23 [19–29]  | 7 [3–9]    | 62 [35–85]      | 18 [16–22]            | none             |
| intermediate-man      | drop scaled by level  | 6.9 [4.4–9.8]    | 0.0 [0.0–0.1]    | 31 [24–40]  | 9 [5–14]   | 61 [36–86]      | 25 [10–33]            | none             |
| intermediate-man      | e1RM trend            | 6.8 [4.4–9.8]    | 0.0 [-0.0–0.1]   | 24 [16–32]  | 22 [15–30] | 68 [48–91]      | 38 [28–53] / 0 [0–1]  | none             |
| intermediate-woman    | as built              | 6.8 [4.4–9.6]    | -                | 16 [8–27]   | 3 [1–9]    | 46 [3–87]       | -                     | none             |
| intermediate-woman    | weekly step, per slot | 6.8 [4.4–9.6]    | 0.0 [0.0–0.0]    | 16 [8–27]   | 3 [1–9]    | 46 [3–87]       | 0 [0–0]               | none             |
| intermediate-woman    | weekly step, per lift | 6.7 [4.4–9.6]    | -0.0 [-0.0–0.0]  | 15 [8–26]   | 3 [1–8]    | 44 [3–87]       | 5 [0–9]               | none             |
| intermediate-woman    | drop scaled by level  | 6.7 [4.4–9.6]    | 0.0 [0.0–0.0]    | 18 [8–31]   | 3 [1–11]   | 43 [3–88]       | 8 [2–19]              | none             |
| intermediate-woman    | e1RM trend            | 6.7 [4.4–9.6]    | -0.0 [-0.1–-0.0] | 7 [4–14]    | 6 [4–13]   | 81 [34–92]      | 12 [7–22] / 0 [0–1]   | none             |
| advanced-man          | as built              | 2.7 [1.6–4.0]    | -                | 27 [23–31]  | 8 [6–10]   | 75 [51–88]      | -                     | none             |
| advanced-man          | weekly step, per slot | 2.7 [1.6–4.0]    | 0.0 [0.0–0.0]    | 27 [23–31]  | 8 [6–10]   | 75 [51–88]      | 0 [0–0]               | none             |
| advanced-man          | weekly step, per lift | 2.7 [1.5–4.0]    | -0.0 [-0.0–-0.0] | 22 [19–28]  | 6 [4–8]    | 78 [52–88]      | 45 [37–55]            | none             |
| advanced-man          | drop scaled by level  | 2.8 [1.6–4.0]    | 0.0 [0.0–0.0]    | 35 [28–41]  | 11 [7–13]  | 74 [45–88]      | 41 [23–61]            | none             |
| advanced-man          | e1RM trend            | 2.7 [1.6–4.0]    | 0.0 [-0.0–0.0]   | 25 [19–30]  | 22 [18–28] | 82 [67–92]      | 58 [45–68] / 0 [0–1]  | none             |
| powerbuilder-size     | as built              | 6.6 [4.2–9.4]    | -                | 13 [6–30]   | 3 [1–9]    | 50 [2–85]       | -                     | none             |
| powerbuilder-size     | weekly step, per slot | 6.6 [4.2–9.4]    | 0.0 [0.0–0.0]    | 13 [6–30]   | 3 [1–9]    | 50 [2–85]       | 0 [0–0]               | none             |
| powerbuilder-size     | weekly step, per lift | 6.6 [4.2–9.4]    | -0.0 [-0.0–0.0]  | 14 [6–29]   | 3 [1–9]    | 50 [2–85]       | 5 [0–13]              | none             |
| powerbuilder-size     | drop scaled by level  | 6.7 [4.2–9.4]    | 0.0 [0.0–0.1]    | 14 [7–37]   | 3 [1–11]   | 54 [1–85]       | 15 [3–33]             | none             |
| powerbuilder-size     | e1RM trend            | 6.5 [4.1–9.4]    | -0.1 [-0.1–0.0]  | 7 [4–14]    | 7 [4–14]   | 88 [46–92]      | 11 [6–22] / 0 [0–0]   | none             |
| powerbuilder-strength | as built              | 6.7 [4.3–9.5]    | -                | 27 [21–34]  | 7 [4–10]   | 61 [37–84]      | -                     | none             |
| powerbuilder-strength | weekly step, per slot | 6.7 [4.3–9.5]    | 0.0 [0.0–0.0]    | 27 [21–34]  | 7 [4–10]   | 61 [37–84]      | 0 [0–0]               | none             |
| powerbuilder-strength | weekly step, per lift | 6.6 [4.3–9.5]    | -0.0 [-0.0–0.0]  | 24 [16–32]  | 6 [3–9]    | 64 [37–84]      | 17 [11–21]            | none             |
| powerbuilder-strength | drop scaled by level  | 6.7 [4.3–9.5]    | 0.0 [0.0–0.1]    | 33 [24–40]  | 9 [5–12]   | 56 [30–84]      | 25 [13–31]            | none             |
| powerbuilder-strength | e1RM trend            | 6.7 [4.3–9.5]    | 0.0 [-0.0–0.0]   | 25 [17–30]  | 23 [15–28] | 70 [46–91]      | 38 [25–48] / 0 [0–1]  | none             |
| light-trainer         | as built              | 17.8 [11.7–26.0] | -                | 41 [32–50]  | 15 [9–19]  | 30 [12–50]      | -                     | none             |
| light-trainer         | e1RM trend            | 17.8 [11.7–26.0] | -0.1 [-0.2–0.1]  | 37 [24–45]  | 29 [21–35] | 41 [25–56]      | 32 [23–38] / 0 [0–3]  | none             |
| dumbbell-beginner     | as built              | 14.6 [10.0–21.0] | -                | 15 [6–17]   | 5 [2–7]    | 7 [2–12]        | -                     | none             |
| dumbbell-beginner     | e1RM trend            | 14.5 [9.8–21.2]  | -0.0 [-0.2–0.2]  | 10 [4–18]   | 7 [2–10]   | 11 [3–20]       | 7 [2–9] / 1 [0–5]     | none             |
| layoff-eases-back     | as built              | 5.6 [3.4–8.5]    | -                | 19 [4–31]   | 6 [0–12]   | 56 [21–83]      | -                     | none             |
| layoff-eases-back     | weekly step, per slot | 5.6 [3.4–8.5]    | 0.0 [0.0–0.0]    | 19 [4–31]   | 6 [0–12]   | 56 [21–83]      | 0 [0–0]               | none             |
| layoff-eases-back     | weekly step, per lift | 5.5 [3.3–8.5]    | -0.1 [-0.2–-0.0] | 16 [4–25]   | 5 [0–10]   | 63 [34–84]      | 22 [15–28]            | none             |
| layoff-eases-back     | drop scaled by level  | 5.7 [3.5–8.6]    | 0.0 [0.0–0.2]    | 22 [4–43]   | 7 [0–16]   | 51 [20–86]      | 15 [2–34]             | none             |
| layoff-eases-back     | e1RM trend            | 5.6 [3.3–8.4]    | -0.1 [-0.1–-0.0] | 11 [4–20]   | 8 [3–14]   | 78 [45–89]      | 9 [4–15] / 0 [0–0]    | none             |
| layoff-keeps-weights  | as built              | 5.8 [3.6–8.6]    | -                | 22 [5–39]   | 6 [1–13]   | 43 [2–83]       | -                     | none             |
| layoff-keeps-weights  | weekly step, per slot | 5.8 [3.6–8.6]    | 0.0 [0.0–0.0]    | 22 [5–39]   | 6 [1–13]   | 43 [2–83]       | 0 [0–0]               | none             |
| layoff-keeps-weights  | weekly step, per lift | 5.8 [3.5–8.6]    | -0.0 [-0.1–0.0]  | 21 [5–35]   | 6 [1–13]   | 48 [2–83]       | 8 [0–15]              | none             |
| layoff-keeps-weights  | drop scaled by level  | 5.9 [3.6–8.6]    | 0.0 [0.0–0.1]    | 30 [5–52]   | 10 [1–19]  | 41 [1–86]       | 20 [2–40]             | none             |
| layoff-keeps-weights  | e1RM trend            | 5.7 [3.5–8.5]    | -0.1 [-0.2–-0.0] | 13 [4–22]   | 8 [3–15]   | 72 [31–89]      | 9 [4–16] / 0 [0–0]    | none             |
| off-sick              | as built              | 20.9 [13.9–29.5] | -                | 34 [24–41]  | 12 [8–15]  | 46 [24–69]      | -                     | none             |
| off-sick              | e1RM trend            | 20.7 [13.8–29.2] | -0.1 [-0.4–0.0]  | 29 [20–39]  | 21 [15–26] | 53 [32–73]      | 24 [18–29] / 0 [0–3]  | session-off-grid |
| holidays              | as built              | 6.2 [3.8–9.0]    | -                | 15 [8–26]   | 3 [1–9]    | 47 [2–85]       | -                     | none             |
| holidays              | weekly step, per slot | 6.2 [3.8–9.0]    | 0.0 [0.0–0.0]    | 15 [8–26]   | 3 [1–9]    | 47 [2–85]       | 0 [0–0]               | none             |
| holidays              | weekly step, per lift | 6.2 [3.8–9.0]    | 0.0 [-0.0–0.0]   | 15 [8–24]   | 3 [1–8]    | 47 [2–86]       | 5 [0–11]              | none             |
| holidays              | drop scaled by level  | 6.2 [3.8–9.0]    | 0.0 [-0.0–0.0]   | 16 [8–30]   | 3 [1–10]   | 48 [1–85]       | 14 [3–25]             | none             |
| holidays              | e1RM trend            | 6.2 [3.8–9.0]    | -0.1 [-0.1–-0.0] | 7 [4–15]    | 6 [4–15]   | 86 [41–91]      | 10 [6–22] / 0 [0–0]   | none             |
| cutting               | as built              | 6.3 [4.0–9.0]    | -                | 21 [6–34]   | 6 [1–12]   | 45 [1–83]       | -                     | none             |
| cutting               | weekly step, per slot | 6.3 [4.0–9.0]    | 0.0 [0.0–0.0]    | 21 [6–34]   | 6 [1–12]   | 45 [1–83]       | 0 [0–0]               | none             |
| cutting               | weekly step, per lift | 6.3 [4.0–9.0]    | -0.0 [-0.0–0.0]  | 21 [6–31]   | 5 [1–11]   | 47 [1–82]       | 8 [0–19]              | none             |
| cutting               | drop scaled by level  | 6.4 [4.0–9.0]    | 0.0 [0.0–0.1]    | 26 [6–44]   | 6 [1–16]   | 45 [1–80]       | 28 [2–43]             | none             |
| cutting               | e1RM trend            | 6.2 [3.9–8.9]    | -0.1 [-0.1–0.0]  | 15 [3–20]   | 8 [2–12]   | 76 [30–91]      | 8 [4–15] / 0 [0–0]    | none             |
| over-55               | as built              | 23.4 [16.3–34.1] | -                | 40 [35–46]  | 15 [13–19] | 63 [37–81]      | -                     | none             |
| over-55               | e1RM trend            | 23.4 [16.5–34.6] | -0.0 [-0.3–0.2]  | 35 [29–43]  | 20 [19–23] | 68 [50–81]      | 28 [25–31] / 5 [1–21] | none             |

As built, a slot's sessions come 7 days apart at the least (median 7, 90th percentile 10; 222510 gaps, every persona and season): each slot is one day's lift, and the week's order carries over, so a slot comes round a week later or more, never sooner. Lift4 (6)'s step after every session is already at most one a week in each slot, so the weekly step per slot holds nothing back; a lift steps more often than weekly only through its other slots.

Pooled, every season of the group's personas, median [10th–90th]; each Δ is the option's value less as built's for the same persona, seed and model variant, median [10th–90th] and mean:

| group                         | option                | gain %           | Δ gain, pp                  | misses /100 | Δ misses              | drops /100 | Δ drops             | below best /100 | Δ below best         |
| ----------------------------- | --------------------- | ---------------- | --------------------------- | ----------- | --------------------- | ---------- | ------------------- | --------------- | -------------------- |
| beginners (6)                 | as built              | 22.0 [13.3–32.5] | -                           | 32 [15–45]  | -                     | 11 [5–18]  | -                   | 28 [8–65]       | -                    |
| beginners (6)                 | e1RM trend            | 22.0 [13.2–32.6] | -0.1 [-0.4–0.1], mean -0.10 | 28 [11–41]  | -4 [-9–0], mean -4.1  | 19 [9–28]  | 7 [2–14], mean 7.6  | 37 [13–70]      | 6 [1–15], mean 7.2   |
| intermediate and advanced (9) | as built              | 6.2 [3.4–9.2]    | -                           | 22 [8–33]   | -                     | 6 [1–12]   | -                   | 66 [4–86]       | -                    |
| intermediate and advanced (9) | weekly step, per slot | 6.2 [3.4–9.2]    | 0.0 [0.0–0.0], mean 0.00    | 22 [8–33]   | 0 [0–0], mean 0.0     | 6 [1–12]   | 0 [0–0], mean 0.0   | 66 [4–86]       | 0 [0–0], mean 0.0    |
| intermediate and advanced (9) | weekly step, per lift | 6.2 [3.3–9.2]    | -0.0 [-0.1–0.0], mean -0.02 | 20 [8–30]   | -1 [-5–0], mean -1.7  | 5 [1–10]   | 0 [-2–0], mean -0.6 | 67 [4–86]       | 0 [-2–6], mean 1.2   |
| intermediate and advanced (9) | drop scaled by level  | 6.2 [3.5–9.2]    | 0.0 [0.0–0.1], mean 0.04    | 26 [8–43]   | 4 [0–12], mean 4.7    | 7 [1–15]   | 1 [0–5], mean 1.6   | 66 [2–86]       | -1 [-7–2], mean -1.7 |
| intermediate and advanced (9) | e1RM trend            | 6.1 [3.4–9.1]    | -0.0 [-0.1–0.0], mean -0.04 | 15 [4–27]   | -4 [-14–0], mean -5.7 | 12 [3–26]  | 4 [1–17], mean 6.9  | 80 [42–92]      | 11 [4–47], mean 18.9 |

### L5 (F8): the time fit's warm-ups

(a) as built: the fit prices each loaded lift's warm-up at the heavier of its weight and an established lifter's starting weight (`sessionFit.ts`). (b): each barbell lift's warm-up is priced at the heavier of that and its weight after a block, the weight the plan's own rule (`applyProgression`) takes it to in 4 sessions of every set at its target, from its starting weight: the shortest block the app offers, a slot coming round once a week; the row for the longest block, 12 weeks, checks that choice. Through the fit's pricing seam (`setWarmupPricing`), so the plan is built and balanced as the app would build it so priced. (c): at a week's first rollover, a day the app's own check says no longer fits (`sessionFits`) is re-fitted as the app re-fits a plan to a new length (`refitSessionsToTime`, then `balanceWeekVolume`), keeping only the re-fit's cuts on that day; a lighter week or the first week back waits for the next ordinary one (`timeFit.ts`).

26 weeks; 20 seeds of each lifter model variant; per season, median [10th–90th]. **Over-time**: sessions the app estimates past the chosen length (the `over-time` rule, on the estimate rounded to the minute), and the share of seasons with any. **Sets**: the plan's working sets in a full week at the season's end (its own sets, `baseSets`). **Lifts**: each lift whose sets in that week differ from (a)'s, by day, and in what share of seasons. **Muscles**: each muscle's sets in that week as the app's volume model counts them (`weeklyVolumeByJudgementMuscle`), the mean over seasons, where it differs from (a)'s. **Re-fits**: days (c) re-fitted in the season. The fit's own check is on the unrounded estimate, so (c) also re-fits a day that runs over by under half a minute, which the rule doesn't count.

| persona               | option                         | over-time sessions | seasons with any | sets       | lifts, (a) → option                                                                                     | muscles, (a) → option                                                                                                  | re-fits |
| --------------------- | ------------------------------ | ------------------ | ---------------- | ---------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------- |
| novice-man            | (a) as built                   | 0 [0–0]            | 0%               | 38 [38–38] | -                                                                                                       | -                                                                                                                      | -       |
| novice-man            | (b) priced at a block's weight | 0 [0–0]            | 0%               | 38 [38–38] | none                                                                                                    | none                                                                                                                   | -       |
| novice-man            | (b), a 12-week block           | 0 [0–0]            | 0%               | 38 [38–38] | none                                                                                                    | none                                                                                                                   | -       |
| novice-man            | (c) re-fit at the rollover     | 0 [0–0]            | 0%               | 38 [38–38] | none                                                                                                    | none                                                                                                                   | 0 [0–0] |
| novice-woman          | (a) as built                   | 0 [0–0]            | 0%               | 39 [39–39] | -                                                                                                       | -                                                                                                                      | -       |
| novice-woman          | (b) priced at a block's weight | 0 [0–0]            | 0%               | 39 [39–39] | none                                                                                                    | none                                                                                                                   | -       |
| novice-woman          | (b), a 12-week block           | 0 [0–0]            | 0%               | 39 [39–39] | none                                                                                                    | none                                                                                                                   | -       |
| novice-woman          | (c) re-fit at the rollover     | 0 [0–0]            | 0%               | 39 [39–39] | none                                                                                                    | none                                                                                                                   | 0 [0–0] |
| intermediate-man      | (a) as built                   | 18 [15–19]         | 100%             | 53 [53–53] | -                                                                                                       | -                                                                                                                      | -       |
| intermediate-man      | (b) priced at a block's weight | 0 [0–0]            | 10%              | 52 [52–52] | Upper — Chest & Back: overhead-press 4 → 3 in 100%                                                      | Chest 14.0 → 13.0, FrontDelts 14.0 → 13.0, Triceps 16.0 → 15.0                                                         | -       |
| intermediate-man      | (b), a 12-week block           | 0 [0–0]            | 0%               | 51 [51–51] | Upper — Shoulders & Arms: pull-ups 4 → 3 in 100%, Upper — Chest & Back: overhead-press 4 → 3 in 100%    | Chest 14.0 → 13.0, FrontDelts 14.0 → 13.0, RearDelts 8.0 → 7.0, Triceps 16.0 → 15.0, Lats 8.0 → 7.0, Biceps 10.0 → 9.0 | -       |
| intermediate-man      | (c) re-fit at the rollover     | 0 [0–0]            | 0%               | 52 [52–52] | Upper — Shoulders & Arms: pull-ups 4 → 3 in 10%, Upper — Chest & Back: overhead-press 4 → 3 in 100%     | Chest 14.0 → 13.0, FrontDelts 14.0 → 13.0, RearDelts 8.0 → 7.9, Triceps 16.0 → 15.0, Lats 8.0 → 7.9, Biceps 10.0 → 9.9 | 1 [1–1] |
| intermediate-woman    | (a) as built                   | 0 [0–0]            | 0%               | 59 [59–59] | -                                                                                                       | -                                                                                                                      | -       |
| intermediate-woman    | (b) priced at a block's weight | 0 [0–0]            | 0%               | 59 [59–59] | none                                                                                                    | none                                                                                                                   | -       |
| intermediate-woman    | (b), a 12-week block           | 0 [0–0]            | 0%               | 59 [59–59] | none                                                                                                    | none                                                                                                                   | -       |
| intermediate-woman    | (c) re-fit at the rollover     | 0 [0–0]            | 0%               | 59 [59–59] | none                                                                                                    | none                                                                                                                   | 0 [0–0] |
| advanced-man          | (a) as built                   | 0 [0–0]            | 0%               | 60 [60–60] | -                                                                                                       | -                                                                                                                      | -       |
| advanced-man          | (b) priced at a block's weight | 0 [0–0]            | 0%               | 60 [60–60] | none                                                                                                    | none                                                                                                                   | -       |
| advanced-man          | (b), a 12-week block           | 0 [0–0]            | 0%               | 60 [60–60] | none                                                                                                    | none                                                                                                                   | -       |
| advanced-man          | (c) re-fit at the rollover     | 0 [0–0]            | 0%               | 60 [60–60] | none                                                                                                    | none                                                                                                                   | 0 [0–0] |
| powerbuilder-size     | (a) as built                   | 0 [0–0]            | 0%               | 56 [56–56] | -                                                                                                       | -                                                                                                                      | -       |
| powerbuilder-size     | (b) priced at a block's weight | 0 [0–0]            | 0%               | 56 [56–56] | none                                                                                                    | none                                                                                                                   | -       |
| powerbuilder-size     | (b), a 12-week block           | 0 [0–0]            | 0%               | 56 [56–56] | none                                                                                                    | none                                                                                                                   | -       |
| powerbuilder-size     | (c) re-fit at the rollover     | 0 [0–0]            | 0%               | 56 [56–56] | none                                                                                                    | none                                                                                                                   | 0 [0–0] |
| powerbuilder-strength | (a) as built                   | 0 [0–2]            | 13%              | 52 [52–52] | -                                                                                                       | -                                                                                                                      | -       |
| powerbuilder-strength | (b) priced at a block's weight | 0 [0–2]            | 13%              | 52 [52–52] | none                                                                                                    | none                                                                                                                   | -       |
| powerbuilder-strength | (b), a 12-week block           | 0 [0–0]            | 0%               | 51 [51–51] | Upper — Shoulders & Arms: pull-ups 4 → 3 in 100%                                                        | RearDelts 8.0 → 7.0, Lats 8.0 → 7.0, Biceps 10.0 → 9.0                                                                 | -       |
| powerbuilder-strength | (c) re-fit at the rollover     | 0 [0–0]            | 0%               | 52 [51–52] | Upper — Shoulders & Arms: pull-ups 4 → 3 in 13%                                                         | RearDelts 8.0 → 7.9, Lats 8.0 → 7.9, Biceps 10.0 → 9.9                                                                 | 0 [0–1] |
| light-trainer         | (a) as built                   | 0 [0–0]            | 0%               | 50 [50–50] | -                                                                                                       | -                                                                                                                      | -       |
| light-trainer         | (b) priced at a block's weight | 0 [0–0]            | 0%               | 50 [50–50] | none                                                                                                    | none                                                                                                                   | -       |
| light-trainer         | (b), a 12-week block           | 0 [0–0]            | 0%               | 48 [48–48] | Upper — Chest & Back: rope-tricep-pushdown 2 → 0 in 100%                                                | Triceps 15.0 → 13.0                                                                                                    | -       |
| light-trainer         | (c) re-fit at the rollover     | 0 [0–0]            | 0%               | 50 [50–50] | none                                                                                                    | none                                                                                                                   | 0 [0–0] |
| dumbbell-beginner     | (a) as built                   | 0 [0–0]            | 0%               | 16 [16–16] | -                                                                                                       | -                                                                                                                      | -       |
| dumbbell-beginner     | (b) priced at a block's weight | 0 [0–0]            | 0%               | 16 [16–16] | none                                                                                                    | none                                                                                                                   | -       |
| dumbbell-beginner     | (b), a 12-week block           | 0 [0–0]            | 0%               | 16 [16–16] | none                                                                                                    | none                                                                                                                   | -       |
| dumbbell-beginner     | (c) re-fit at the rollover     | 0 [0–0]            | 0%               | 16 [16–16] | none                                                                                                    | none                                                                                                                   | 0 [0–0] |
| layoff-eases-back     | (a) as built                   | 10 [0–14]          | 83%              | 43 [43–43] | -                                                                                                       | -                                                                                                                      | -       |
| layoff-eases-back     | (b) priced at a block's weight | 10 [0–14]          | 83%              | 43 [43–43] | none                                                                                                    | none                                                                                                                   | -       |
| layoff-eases-back     | (b), a 12-week block           | 10 [0–14]          | 83%              | 43 [43–43] | none                                                                                                    | none                                                                                                                   | -       |
| layoff-eases-back     | (c) re-fit at the rollover     | 0 [0–0]            | 0%               | 42 [42–43] | Full Body — Deadlift Focus: squat 3 → 2 in 83%                                                          | Quads 8.0 → 7.2, Hamstrings 14.0 → 13.2, Glutes 14.0 → 13.2                                                            | 1 [0–1] |
| layoff-keeps-weights  | (a) as built                   | 11 [0–16]          | 83%              | 43 [43–43] | -                                                                                                       | -                                                                                                                      | -       |
| layoff-keeps-weights  | (b) priced at a block's weight | 11 [0–16]          | 83%              | 43 [43–43] | none                                                                                                    | none                                                                                                                   | -       |
| layoff-keeps-weights  | (b), a 12-week block           | 11 [0–16]          | 83%              | 43 [43–43] | none                                                                                                    | none                                                                                                                   | -       |
| layoff-keeps-weights  | (c) re-fit at the rollover     | 0 [0–0]            | 0%               | 42 [42–43] | Full Body — Deadlift Focus: squat 3 → 2 in 83%                                                          | Quads 8.0 → 7.2, Hamstrings 14.0 → 13.2, Glutes 14.0 → 13.2                                                            | 1 [0–1] |
| off-sick              | (a) as built                   | 0 [0–0]            | 0%               | 39 [39–39] | -                                                                                                       | -                                                                                                                      | -       |
| off-sick              | (b) priced at a block's weight | 0 [0–0]            | 0%               | 39 [39–39] | none                                                                                                    | none                                                                                                                   | -       |
| off-sick              | (b), a 12-week block           | 0 [0–0]            | 0%               | 39 [39–39] | none                                                                                                    | none                                                                                                                   | -       |
| off-sick              | (c) re-fit at the rollover     | 0 [0–0]            | 0%               | 39 [39–39] | none                                                                                                    | none                                                                                                                   | 0 [0–0] |
| holidays              | (a) as built                   | 0 [0–15]           | 25%              | 59 [59–59] | -                                                                                                       | -                                                                                                                      | -       |
| holidays              | (b) priced at a block's weight | 0 [0–15]           | 25%              | 59 [59–59] | none                                                                                                    | none                                                                                                                   | -       |
| holidays              | (b), a 12-week block           | 0 [0–0]            | 0%               | 56 [56–56] | Upper — Shoulders & Arms: lateral-raise 3 → 2 in 100%, Upper — Chest & Back: barbell-curl 2 → 0 in 100% | SideDelts 5.0 → 4.0, UpperBack 14.0 → 13.0, Biceps 11.0 → 9.0                                                          | -       |
| holidays              | (c) re-fit at the rollover     | 0 [0–0]            | 0%               | 58 [57–58] | Upper — Shoulders & Arms: lateral-raise 3 → 2 in 25%, Upper — Chest & Back: overhead-press 3 → 2 in 90% | Chest 12.0 → 11.1, FrontDelts 12.0 → 11.1, SideDelts 5.0 → 4.8, Triceps 15.0 → 14.1, UpperBack 14.0 → 13.8             | 1 [1–2] |
| cutting               | (a) as built                   | 0 [0–0]            | 0%               | 39 [39–39] | -                                                                                                       | -                                                                                                                      | -       |
| cutting               | (b) priced at a block's weight | 0 [0–0]            | 0%               | 39 [39–39] | none                                                                                                    | none                                                                                                                   | -       |
| cutting               | (b), a 12-week block           | 0 [0–0]            | 0%               | 39 [39–39] | none                                                                                                    | none                                                                                                                   | -       |
| cutting               | (c) re-fit at the rollover     | 0 [0–0]            | 0%               | 39 [39–39] | none                                                                                                    | none                                                                                                                   | 0 [0–0] |
| over-55               | (a) as built                   | 0 [0–0]            | 0%               | 39 [39–39] | -                                                                                                       | -                                                                                                                      | -       |
| over-55               | (b) priced at a block's weight | 0 [0–0]            | 0%               | 39 [39–39] | none                                                                                                    | none                                                                                                                   | -       |
| over-55               | (b), a 12-week block           | 0 [0–0]            | 0%               | 39 [39–39] | none                                                                                                    | none                                                                                                                   | -       |
| over-55               | (c) re-fit at the rollover     | 0 [0–0]            | 0%               | 39 [39–39] | none                                                                                                    | none                                                                                                                   | 0 [0–0] |
