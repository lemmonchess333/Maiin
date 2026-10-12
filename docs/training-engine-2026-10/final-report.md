# The training-engine pass: final report

The report [`docs/agents/training-engine-prompt.md`](../agents/training-engine-prompt.md)
asks for at its end ("DONE MEANS"): the PRs shipped, the known defects
left, the decisions, Phase 0's claims, the simulator's calibration and the
new baseline. Written 2026-10-10 and brought up to date on 2026-10-12, once
every PR of the pass was merged. The answers themselves, with their
evidence and measurements, are in [`decisions.md`](decisions.md); the
simulator is described in [`simulator.md`](simulator.md).

## Where it stands

- **Every PR of the pass is merged**, 98 in all (numbers here are
  lemmonchess333/Maiin's): the 74 this report first listed, seven that
  merging and building them added, and the 14 builds of the questions the
  owner had handed back, with their three locks. On 2026-10-11 the owner asked for every
  open PR of the pass to be merged and for the hand-back questions to be
  decided; the answers are Pgm8 (lemmonchess333/Maiin#2683).
- **How they were merged** is in section 1: in the order the stacks set,
  each on a head that merges main as a dry run of all 71 resolved it, and
  each only once its CI was green.
- **What merging and building found**, twelve things, is in section 1 too.
  Each was fixed in the PR it belonged to, or in one of its own.
- **Main after the last merge** is section 6's baseline.

## 1. The PRs shipped

### Merged first (3)

| PR                        | What                                                         |
| ------------------------- | ------------------------------------------------------------ |
| lemmonchess333/Maiin#2608 | Move the weekly rollover into a pure module the effects call |
| lemmonchess333/Maiin#2646 | After race day the race plan waits for the race's own ending |
| lemmonchess333/Maiin#2652 | ci: clear dpkg's lock between Playwright install attempts    |

### How the rest were merged

- **A dry run first.** All 71 open PRs were merged locally, in order, into
  one integration branch, and the full unit suite run on its tip. Each
  place two PRs met was resolved there once (the appendix lists the ones
  that needed thought), and the simulator's PRs were adapted to the fixes
  merged before them: harness, ratchets and traces.
- **Then one at a time on GitHub, in that order.** Locks went before the PRs
  that build on them, Pgm7 first. Each PR's head became a merge of main
  whose tree is the integration's after that PR, so its diff was its own
  and its CI ran on main as it was. Main squash-merges, so each head was
  rebuilt after the merge before it; a head that shared files with a PR
  still open before it carried that one's change until it merged.
- **Checked before each push.** `tsc -b`, the suites near the change and
  the source guards ran on every head, and a resolver checked each against
  a simulated squash of the PRs before it. The resolver also ran ahead on
  a simulated main, so the next head was built and tested while the PR
  before it was in CI, and the real build had to match the tree tested.
- **Merged on green.** A PR merged once CI passed on its head; one that
  changes what the app shows waited for the capture specs too. None was
  merged red, and no test was skipped.
- **The simulator's ratchets.** Each known defect is an entry in a ratchet,
  and each fix takes its entry out. Section 2 says what is left.

### Locks (12)

| PR                        | What                                                                            |
| ------------------------- | ------------------------------------------------------------------------------- |
| lemmonchess333/Maiin#2604 | plan: lock Pgm7, the owner's answers for the training-engine pass               |
| lemmonchess333/Maiin#2628 | plan: lock Lift5, Replace and Add take their role's numbers                     |
| lemmonchess333/Maiin#2632 | plan: STATUS on PR-J-Q1, a quality day counts the run done as a quality session |
| lemmonchess333/Maiin#2634 | plan: lock Run19, a plan made mid-week plans no run before that day             |
| lemmonchess333/Maiin#2640 | plan: lock Run20, the training-engine pass's running answers                    |
| lemmonchess333/Maiin#2649 | plan: lock Lift6, the push/pull balance weighs presses against pulls            |
| lemmonchess333/Maiin#2654 | plan: lock Run21, how the app explains a run                                    |
| lemmonchess333/Maiin#2681 | plan: lock Run22, the taper in steps with a reduced long run                    |
| lemmonchess333/Maiin#2683 | plan: lock Pgm8, the hand-back answers of the training-engine pass              |
| lemmonchess333/Maiin#2686 | plan: Run19 STATUS, a week with no run day left starts on next week's runs      |
| lemmonchess333/Maiin#2688 | plan: lock Lift7, the rollover re-fits a day its warm-ups outgrew               |
| lemmonchess333/Maiin#2708 | plan: STATUS on Pgm8, Lift7, Run17 and Run22, the hand-back answers built       |

### Seams the simulator needed (7)

| PR                        | What                                                                       |
| ------------------------- | -------------------------------------------------------------------------- |
| lemmonchess333/Maiin#2605 | One seeded generator and a swappable instance-id source, for the simulator |
| lemmonchess333/Maiin#2606 | Stamp a session's history record with the session's date, where it is made |
| lemmonchess333/Maiin#2607 | One definition of a long or hard run: the run plan's (Pgm7 A5)             |
| lemmonchess333/Maiin#2609 | Share mark-day-done and the session's prescription and progression         |
| lemmonchess333/Maiin#2615 | The claim map as a pure module: runClaims.ts                               |
| lemmonchess333/Maiin#2616 | The server's race-day decisions as a pure module                           |
| lemmonchess333/Maiin#2618 | The run summary's pace verdict as a module: plannedRunVerdict.ts           |

### The simulator (4)

| PR                        | What                                                                                     |
| ------------------------- | ---------------------------------------------------------------------------------------- |
| lemmonchess333/Maiin#2613 | A lifting simulator: fifteen people through 26 weeks of the plan code                    |
| lemmonchess333/Maiin#2617 | The running half of the simulator: eleven runners and hybrids through their race plans   |
| lemmonchess333/Maiin#2619 | The simulator: the person's taps as commands, race weeks, the run verdict, a weekly soak |
| lemmonchess333/Maiin#2680 | The simulator measures decisions.md's open comparisons                                   |

### Lifting (14)

| PR                        | What                                                                            |
| ------------------------- | ------------------------------------------------------------------------------- |
| lemmonchess333/Maiin#2610 | Start dumbbell and kettlebell lifts on a weight the rack has                    |
| lemmonchess333/Maiin#2612 | Keep a short session's two-set main lifts through every load                    |
| lemmonchess333/Maiin#2614 | Last time for a lift is the last session in its own slot                        |
| lemmonchess333/Maiin#2620 | Easier today's weights on the lift's own equipment, never under the bar         |
| lemmonchess333/Maiin#2621 | The lighter-week banner only when a lighter week can be taken                   |
| lemmonchess333/Maiin#2622 | A lighter week taken from Train restarts the calendar's count                   |
| lemmonchess333/Maiin#2623 | One set of goal names: General fitness and Support my running                   |
| lemmonchess333/Maiin#2624 | Miss counts start again after a break, however the person came back             |
| lemmonchess333/Maiin#2625 | A bodyweight lift on a fixed target climbs a rep when every set hits it         |
| lemmonchess333/Maiin#2626 | No lifting suggestions on the Performance tab                                   |
| lemmonchess333/Maiin#2627 | Each session keeps its heavier or lighter role as the week's order carries over |
| lemmonchess333/Maiin#2629 | A level change sets how the main lifts progress                                 |
| lemmonchess333/Maiin#2630 | Replace and Add take their role's numbers                                       |
| lemmonchess333/Maiin#2650 | The push/pull balance weighs presses against pulls; curls stop filling it       |

### Running: corrections (12)

| PR                        | What                                                                           |
| ------------------------- | ------------------------------------------------------------------------------ |
| lemmonchess333/Maiin#2633 | A tempo is judged by its blocks, against the pace they were set at             |
| lemmonchess333/Maiin#2635 | A tempo or interval day counts the run done as that session, whatever its pace |
| lemmonchess333/Maiin#2636 | A plan made mid-week plans no run before the day it is made                    |
| lemmonchess333/Maiin#2637 | Home shows a run on the date the plan holds it, whatever the weekday           |
| lemmonchess333/Maiin#2638 | A race plan needs at least two run days a week                                 |
| lemmonchess333/Maiin#2639 | An easy run reaches the run screen timed by its length                         |
| lemmonchess333/Maiin#2641 | Say what the run plan does: the copy that was wrong today                      |
| lemmonchess333/Maiin#2642 | The taper's session is placed like every quality run                           |
| lemmonchess333/Maiin#2651 | The Monday check grades a first week against what it planned                   |
| lemmonchess333/Maiin#2653 | Setup asks for a recent 5K or 10K time, optionally                             |
| lemmonchess333/Maiin#2669 | Re-plan from today and a rebuilt race week plan no run before today            |
| lemmonchess333/Maiin#2670 | A layout change mid-week keeps the week's days already gone                    |

### Running: answers built (7)

| PR                        | What                                                                          |
| ------------------------- | ----------------------------------------------------------------------------- |
| lemmonchess333/Maiin#2643 | A tempo and intervals say how they feel until there's a pace to give          |
| lemmonchess333/Maiin#2644 | A medium-long run of an hour or more isn't put beside a hard day              |
| lemmonchess333/Maiin#2645 | The quality ladder starts at its first rung                                   |
| lemmonchess333/Maiin#2647 | A new plan's week runs on the weekend, and the long run goes there            |
| lemmonchess333/Maiin#2648 | A new runner's first six weeks hold no tempo or intervals                     |
| lemmonchess333/Maiin#2655 | A new runner's first six weeks run as run-walk                                |
| lemmonchess333/Maiin#2682 | The taper in steps: a shorter long run and easy runs at 75%, then 60% (Run22) |

### Explaining runs (Run21) and the copy the journeys found (12)

| PR                        | What                                                                               |
| ------------------------- | ---------------------------------------------------------------------------------- |
| lemmonchess333/Maiin#2656 | "Why this run" says what the run is, how it should feel and what to do             |
| lemmonchess333/Maiin#2657 | The run summary speaks only when a run didn't match its type                       |
| lemmonchess333/Maiin#2658 | Running copy calls tempo and intervals the quality sessions                        |
| lemmonchess333/Maiin#2659 | A run states its own minutes: its time, or a long run's at a confirmed pace        |
| lemmonchess333/Maiin#2660 | Why this run names the quality sessions only when the week holds one               |
| lemmonchess333/Maiin#2661 | One effort language on the run screen, and in heart-rate zones                     |
| lemmonchess333/Maiin#2663 | Train's week selector names each run, and the 60-minute rung is Medium-long        |
| lemmonchess333/Maiin#2665 | A long run that finishes at race pace says so                                      |
| lemmonchess333/Maiin#2666 | A tempo at the goal race pace says so                                              |
| lemmonchess333/Maiin#2668 | Each run shows one feel line; physiology names only under "Coaches also call this" |
| lemmonchess333/Maiin#2677 | The recovery banner says what the weeks hold, not a template id                    |
| lemmonchess333/Maiin#2678 | The Performance tab's run suggestion says it in plain words                        |

### End to end, CI and fixes found on the way (6)

| PR                        | What                                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------------- |
| lemmonchess333/Maiin#2631 | The rest-day card and the usual-meal row fit at large text; the large-text spec no longer needs today's meals |
| lemmonchess333/Maiin#2672 | The plan moves on with the day while the app stays open, on the plan the server holds                         |
| lemmonchess333/Maiin#2674 | Fonts are never inlined, so the CSP loads them                                                                |
| lemmonchess333/Maiin#2675 | Run the signed-out specs in CI: three on every push, six nightly                                              |
| lemmonchess333/Maiin#2676 | Journeys: one person through weeks of the app, against the emulator                                           |
| lemmonchess333/Maiin#2679 | Journey: a runner with no benchmark, through every surface that explains a planned run                        |

### This pass's documents (1)

| PR                        | What                                                                             |
| ------------------------- | -------------------------------------------------------------------------------- |
| lemmonchess333/Maiin#2601 | A prompt for the lifting and running pass, and the audits and evidence behind it |

### Found while merging and building (6)

| PR                        | What                                                                      |
| ------------------------- | ------------------------------------------------------------------------- |
| lemmonchess333/Maiin#2687 | A race plan made after its week's last run day starts on next week's runs |
| lemmonchess333/Maiin#2689 | The race-plan tests plan a race half a year out, not in 2099              |
| lemmonchess333/Maiin#2690 | The weight sheet's tests run at noon, so midnight can't split one         |
| lemmonchess333/Maiin#2691 | History's chart labels fit at large text on a Monday, and at 1W and 6M    |
| lemmonchess333/Maiin#2692 | ci: give the unit job 25 minutes                                          |
| lemmonchess333/Maiin#2698 | Treadmill journey: Home waits for Train's day after the summary's Done    |

- **#2687** was found by R23's build: a race plan saved on a Sunday after
  its week's run days planned no run that week, and never planned one
  again. Run19's STATUS (#2686) records the answer.
- **#2689**: since #2672 the run rollover builds a race plan twice for each
  week it rolls, and tests that planned a race in 2099 (3,800 weeks a
  build) passed the 5 s timeout on loaded runners.
- **#2690**: a test that ran across midnight read the next day's log
  (unit-locale went red at 23:59:15 UTC).
- **#2691**: on a Monday History's 1M range draws six weeks, and "This
  week" ran 2 px past its bar at 135% text on a 320 px phone, which turned
  the capture specs red on main.
- **#2692**: the required `unit` job installs, lints, tests, builds and
  checks the bundle inside 15 minutes, and ran 10 to 13.5 of them during
  the merges. On #2666 it passed every step and was cancelled at 15:01
  while cleaning up, and the job can't be re-run from here, so its budget
  is 25 minutes now. #2666 carried the same line until #2692 merged.
- **#2698**: on L15's head the treadmill journey's last check failed with
  its 20 s wait, on a page showing Train, not Home. Done on the run
  summary goes to Train, which writes the day it shows into its URL once
  its plan loads, and that write overtook the journey's tap on Home. The
  journey waits for the day first. A person who taps a tab while Train
  loads can be taken back to Train the same way; that is an app change,
  left for its own PR.

Six more were fixed in the PR they belonged to, on its merge with main:

- **#2659**: its dose test spied through setup's real plan builder, and a
  spy an earlier test left behind made it call itself (shuffle seed 5).
  The file now restores its spies after each test.
- **#2668**: with R2's effort words (#2643) and E2c's feel line both on the
  Run page's launch card, a quality session with no pace said how it should
  feel twice. #2679 carried the change that drops R2's line, for whichever
  of the two merged second; #2668's merge took it, so main never showed the
  line twice.
- **#2676**: once F22 (#2633) was on main the Run page saves `workPortion`,
  and the journeys' run document, pinned to the page's field for field,
  lacked it. #2676's merge took #2679's line.
- **#2676**: CI's journeys job, the first run on main, found setup's
  optional recent race time (R11) has its own "Recent race distance" group,
  with a 5K and a 10K of its own. A role lookup matches a name by
  substring, so "Race distance" found both groups. `setUpPlan` names the
  group exactly.
- **#2676 and #2679**: setup's default week now gives the runs a weekend
  day (Run20 (2)), so a race plan made on a Monday needn't run that day,
  and its long run is at the weekend. The treadmill journey takes the
  plan's first run, and the runner with no benchmark the first week's long
  run, each moving the day to it. The treadmill build carries the change
  in its own version of the journey.
- **#2676**: run fourth on the same emulators, the treadmill journey's last
  check, Home's week showing the run done, missed Playwright's default
  5 s once in two runs of the same commit, with the run saved and marked
  done. It takes the 20 s the rig's other waits on data after a
  navigation have.

### The hand-back answers, built (14)

| PR                        | What                                                                                  | Answers             |
| ------------------------- | ------------------------------------------------------------------------------------- | ------------------- |
| lemmonchess333/Maiin#2693 | The simulator measures the sawtooth's options and the time fit's warm-ups             | L4 (kept), L5       |
| lemmonchess333/Maiin#2694 | The simulator measures the marathon long run's peak                                   | R17 (kept)          |
| lemmonchess333/Maiin#2695 | A light lift's stretched target, from Nuzzo 2024, and its one line                    | L11, A3             |
| lemmonchess333/Maiin#2696 | A bodyweight lift done with added load follows it                                     | L6                  |
| lemmonchess333/Maiin#2697 | A new plan's barbell lift under the bar starts as its dumbbell version                | L15                 |
| lemmonchess333/Maiin#2699 | The hinge accessory gives way to the hamstrings' ceiling; the deadlift keeps its days | L7                  |
| lemmonchess333/Maiin#2700 | A swap for the kit or an injury doesn't give a lift a third day in the week           | Found by L7's build |
| lemmonchess333/Maiin#2701 | A fitted session keeps fitting as its lifts get heavier                               | L5, Lift7           |
| lemmonchess333/Maiin#2702 | The running fitness the app works out comes from a race or a tempo                    | R1                  |
| lemmonchess333/Maiin#2703 | A race plan shows its coming weeks                                                    | R23                 |
| lemmonchess333/Maiin#2704 | "Run by feel" before a run on a hot day, with no number                               | E8                  |
| lemmonchess333/Maiin#2705 | Setup says when a new runner's race is too soon to build to                           | R14c                |
| lemmonchess333/Maiin#2706 | A planned run done on the treadmill counts as the planned run                         | The treadmill       |
| lemmonchess333/Maiin#2707 | A taper's long run and easy runs step down from what the build held                   | R8, found by R17    |

They merged in that order, each after the one before it, since most share
the plan generator and the simulator's traces.

## 2. The known defects left

The simulator pins every defect it finds in a ratchet
(`KNOWN_RULE_FAILURES` and `KNOWN_COACHING` in `liftSeason.sim`,
`runSeason.sim` and `personActions.sim`). Numbers are `simulator.md`'s
findings. With everything merged, every rule ratchet is empty: no persona
breaks a rule of the plan's own.

**Cleared by the merges and the builds:**

| Finding                                                   | Entry                           | Cleared by                                     |
| --------------------------------------------------------- | ------------------------------- | ---------------------------------------------- |
| F8 Fitted 60-minute sessions ran 61–63 minutes            | `over-time`                     | lemmonchess333/Maiin#2701 (Lift7)              |
| F10 Barbell lifts planned under the bar                   | `below-bar`                     | lemmonchess333/Maiin#2697 (L15)                |
| F11 "Last time" read the lift's other slot                | `stall:squat`                   | lemmonchess333/Maiin#2614                      |
| F13 A quality day counted only under 4:30 /km             | `not-counted`                   | lemmonchess333/Maiin#2635                      |
| F14, F21 Home read a dated run by weekday                 | `race-day-card`, `run-day-card` | lemmonchess333/Maiin#2637                      |
| F16 A plan made mid-week planned that week's earlier runs | `before-plan`                   | lemmonchess333/Maiin#2636                      |
| F17 The derived benchmark read easy runs as races         | `derived-low`, `easy-nag`       | lemmonchess333/Maiin#2702 (R1)                 |
| F20 Easier today's weights off the rack                   | `session-off-grid`              | lemmonchess333/Maiin#2620                      |
| F22 A tempo judged on the whole run                       | `verdict-slow`                  | lemmonchess333/Maiin#2633                      |
| F18 A new runner's continuous runs and early quality      | `run-walk`, `novice-quality`    | lemmonchess333/Maiin#2655, #2648               |
| F18 A marathon on one run a week                          | `one-run-week`                  | lemmonchess333/Maiin#2638                      |
| F18 The one-step taper with no long run                   | `taper-cut`, `taper-long`       | lemmonchess333/Maiin#2682, #2707, except below |
| F18 Demanding days back to back                           | `back-to-back`, in part         | lemmonchess333/Maiin#2644, except below        |
| L7 The hamstrings got 15 sets                             | not pinned                      | lemmonchess333/Maiin#2699, #2700               |

F1, F6, F7 and F19 were fixed without a ratchet entry
(lemmonchess333/Maiin#2610, #2646, #2612, #2621).

**Left, each with its reason:**

| Finding                                                  | Entry                                   | Why it stays                                                                                                                             |
| -------------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| F4 Linear steps outrun slow-gaining lifts                | `misses`                                | L4, measured: no option cuts misses and drops without costing gains, so Lift4 (6) and owner call (1) stand                               |
| F9 Light lifts wait for the person                       | `stall`                                 | Lift4 (6). A3's line now says so once (#2695); the dumbbell versions L15 builds wait the same way. Anything more is measured first (L11) |
| F12 Size plans give the quads 9 sets                     | `acsm-size:quads`                       | L16, kept: the simulator has no size model to separate the options                                                                       |
| F15 The plan doesn't start from the runner's own running | `under-dose`                            | R5, not run: it waits on the review being modelled                                                                                       |
| F18 Long runs past the single-run guard                  | `spike`                                 | R7: the race's spike is fixed by #2682; the first long run's waits on R5, and the rebound after a step-back week isn't measured          |
| F18 Weeks that jump                                      | `volume-jump`                           | R15, kept                                                                                                                                |
| F18 Long runs over half a short week                     | `long-share`                            | R16, kept                                                                                                                                |
| F18 Back to back where the week leaves no room           | `back-to-back`                          | R9: a two-day week's long run and quality, and a week whose every easy day is beside a demanding one, keep the person's days             |
| F18 A 10K's taper that still cuts over half in one step  | `taper-cut`                             | The 2+3 hybrids' 10K: its taper is one week, which Run22 leaves as it was                                                                |
| F23 A set taken lighter stays lighter                    | `stall:deadlift` (lighter-after-misses) | Open after Pgm8 (decisions.md), the owner's: it touches a Lift4 call                                                                     |

**Seen outside the ratchets:**

- The badge transaction gives up under a burst of writes (a journey's
  Sunday), and the award lands on a later write.
- The Firestore emulator logs "future update time" errors in the console.
  Seen on the emulator only.
- One marathon journey stopped advancing in week 32 on emulators that had
  run two hours of journeys. It didn't come back on fresh emulators, where
  CI runs every journey.
- The treadmill run that wasn't credited to a planned long run without a
  tap is fixed: the treadmill is a place now (#2706). Its two
  neighbours, "Track without GPS" and an unplanned treadmill run's type,
  are open after Pgm8.

## 3. Decisions

[`decisions.md`](decisions.md) has every question with what is locked
today, the evidence, the simulation and the answer. The owner delegated the
answers on 2026-10-07 under rules that keep every explicit owner decision
with the owner ([`owner-answers.md`](owner-answers.md), locked as Pgm7 in
lemmonchess333/Maiin#2604). Each answer was locked before it was built:
A1–A12 as Pgm7, the rest as Lift5, Lift6, Lift7, Run19, Run20, Run21,
Run22 and Pgm8, plus a STATUS line on PR-J-Q1. A correction restores an
existing lock's text, so it needed none.

**By status**, the 53 questions (L1–L19, R1–R25, E1–E9), once the
hand-back answers were built:

- **27 built**: L5, L6, L8, L11 (A3's line) and L15; R1, R2, R4, R8, R9,
  R10, R11 (its race-time half; the self-rated level is still to build),
  R12, R13, R14 (R14c included), R20, R21, R22 and R23; E1–E6, E8 and E9.
- **17 kept**: L1, L2, L3, L4 (measured), L7 (its hamstring defect fixed),
  L10, L12, L14, L16, L17, L18, R3, R15, R16, R17 (measured), R19 and R24.
- **9 measuring**: L9, L13, L19, R5, R6, R18 and R25 are not run yet, each
  with its reason; R7 is part measured; E7 is measured and its band
  stands, but whether to show the band's fast end as a ceiling is open.
- **None the owner's.** The eight handed back on 2026-10-10 were decided
  under Pgm8; what the merges and builds raised since is under "Open after
  Pgm8" in decisions.md, each with a recommendation.

| Question                                   | Status                                     | Lock, PR                                       |
| ------------------------------------------ | ------------------------------------------ | ---------------------------------------------- |
| L4 The sawtooth                            | Measured, kept                             | Pgm8; #2693                                    |
| L5 Fitted sessions run over (F8)           | Built                                      | Lift7 (#2688); #2701                           |
| L6 Added load on bodyweight lifts          | Built                                      | Pgm8; #2696                                    |
| L7 The hamstrings over their ceiling       | Kept, its defect fixed                     | Pgm8; #2699, #2700                             |
| L8 Curls fill the push/pull balance        | Built                                      | Lift6 (#2649); #2650                           |
| L11 A3's line                              | Built                                      | Pgm7 A3, Pgm8; #2695                           |
| L15 Barbell lifts under the bar            | Built for new plans                        | Pgm8; #2697                                    |
| R1 The derived benchmark                   | Built                                      | Pgm8; #2702                                    |
| R2 Paces with no benchmark                 | Built                                      | Run20 (1); #2643                               |
| R4 The long run's weekday                  | Built                                      | Run20 (2); #2647                               |
| R8 The taper                               | Built                                      | Run22 (#2681); #2682, #2707                    |
| R9 Demanding days back to back             | Built                                      | Run20 (3); #2644                               |
| R10 The taper's session bypassed placement | Built, a correction                        | #2642                                          |
| R11 Setup asks for no benchmark            | Race time built; self-rated level to build | adaptive paces §10.2; #2653                    |
| R12 Copy that was wrong                    | Built, a correction                        | #2641                                          |
| R13 The quality ladder started mid-way     | Built                                      | Run20 (4); #2645                               |
| R14 A new runner's quality and run-walk    | Built                                      | Run20 (5), Pgm8; #2648, #2655, #2705           |
| R17 The marathon long run's peak           | Measured, kept                             | Run17; #2694                                   |
| R20 The Monday check on a first week       | Built, a correction                        | Run19; #2651                                   |
| R21 A rebuilt week, "Re-plan from today"   | Built, a correction                        | Run19; #2669, #2670                            |
| R22 The race plan after race day           | Built                                      | PR-J; #2646                                    |
| R23 The weeks ahead                        | Built                                      | Pgm8; #2703                                    |
| E1–E6, E9 Explaining runs                  | Built                                      | Run21; #2656–#2661, #2663, #2665, #2666, #2668 |
| E8 Heat                                    | Built                                      | Pgm8; #2704                                    |

A1–A12, the owner-delegated answers locked as Pgm7: A1 keeps the plan's
1.0 counting of indirect sets; A2 keeps the fitness–fatigue
curve; A3 is built (#2695); A4 is built (#2622); A5 is built (#2607); A6
keeps Home's today card as the owner set it; A7 is built (#2638); A8 keeps
Lift4's lighter-week recipe; A9 keeps the half-counted leg miss, labelled
an assumption; A10 keeps the ramp line; A11 is built (#2675); A12 needs
nothing.

**Handed back to the owner, then decided under Pgm8** (2026-10-11, each as
decisions.md recommended):

| #    | Question                                            | Answer                                                        |
| ---- | --------------------------------------------------- | ------------------------------------------------------------- |
| L3   | 4 × 3 and 4 × 7 on Get stronger                     | Kept                                                          |
| L4   | The sawtooth                                        | Measured; Lift4 (6) and owner call (1) stand                  |
| L6   | Added load on bodyweight lifts                      | Followed, as any weight (#2696)                               |
| L11  | Light lifts that wait for the person, beyond A3     | A3's line (#2695); measure before anything more               |
| L15  | Barbell lifts under the bar in existing plans       | Dumbbell versions for new plans; existing plans as they are   |
| R1   | The derived benchmark                               | From efforts only (#2702), with setup's race time (#2653)     |
| R23  | Freeform runners' plan; the weeks ahead             | The weeks ahead on race plans (#2703); free running unchanged |
| R24  | Race predictions as ranges                          | Kept: a labelled snapshot until a way to set a range's width  |
| E8   | Heat                                                | "Run by feel" on hot days, no number (#2704)                  |
| E3a  | Phase names on run surfaces                         | Kept internal; defined only where they already show           |
| E3b  | A sheet for runs, not the "Why this run" disclosure | Kept: the disclosure, with E3's four lines                    |
| R14c | A race too soon for someone new to running          | Said at setup, never blocking (#2705)                         |
| —    | A treadmill run credited to a planned long run      | The treadmill is a place (#2706)                              |

## 4. Phase 0: the claims

On 2026-10-07 every source in the two evidence docs' ledgers was read
(the full text where it was open, otherwise the abstract or the book), and
every link `explanation-ux.md` cites was fetched:

| Doc                   | Confirmed                                         | Corrected | Unsupported | Not checkable |
| --------------------- | ------------------------------------------------- | --------- | ----------- | ------------- |
| `lifting-evidence.md` | 390                                               | 115       | 47          | 39            |
| `running-evidence.md` | 341                                               | 131       | 38          | 41            |
| `explanation-ux.md`   | 100 of 108 links read in full (2 dead, 6 blocked) |           |             |               |

Each claim now carries one marker. Counted in the docs as they stand:

| Doc                   | `[VF]` full text | `[VA]` abstract or book | `[C]` computed | `[U]` source found, claim unchecked | `[R]` not identified or checked |
| --------------------- | ---------------- | ----------------------- | -------------- | ----------------------------------- | ------------------------------- |
| `lifting-evidence.md` | 256              | 173                     | 42             | 62                                  | 9                               |
| `running-evidence.md` | 292              | 348                     | 85             | 52                                  | 7                               |
| `explanation-ux.md`   | 1                | 2                       | 1              | 14                                  | 4                               |

Each evidence doc opens with the load-bearing claims still `[U]` or `[R]`.
The pass's rule was to put no `[U]` or `[R]` number in code or copy: where
a number has no verified source, the code labels it a Tropos heuristic or
an assumption, as with the taper's 75% and 60%. Springer, journals.lww.com
and journals.physiology.org stayed blocked.

## 5. The simulator's calibration

The models are hypotheses built from the evidence docs, so where a model was
fitted to a source, agreeing with that source is not new evidence.

**Running** (running-evidence §6.1, §6.4, §6.7):

| Target                                                                    | Status                                                                                       |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Recreational, 16 weeks adding 90 minutes a week: +1.5–3 VDOT              | Met: +2.1                                                                                    |
| Well-trained, 16 weeks: about +2% of race time (+0.5–2 VDOT at 55)        | Met: +0.9                                                                                    |
| Novice, 12 weeks from 100 to 150 minutes: +1.5–3 VDOT                     | Met: +1.6                                                                                    |
| Detraining after 1, 3, 6 and 10 weeks off                                 | Met: 0%, 3.2%, 7.5%, 11.3%                                                                   |
| A strict taper's 2.6% over a relaxed one                                  | Missed, pinned: +0.5%. Fitness follows minutes, so a taper loses some                        |
| Recreational trials at about constant volume (Festa 2020: +3% in 8 weeks) | Not reproduced: the model credits volume more than intensity; the intensity variant spans it |
| The injury proportions, each by its definition                            | Not checked against a programme's exposure; the C25K result runs high                        |
| Riegel optimistic by 10 minutes for half of recreational marathoners      | Built in: Vickers & Vertosick's correction on race day                                       |

**Lifting** (lifting-evidence §4.2, §4.4):

| Target                                                    | Status                                                                           |
| --------------------------------------------------------- | -------------------------------------------------------------------------------- |
| §4.2's central rows at the reference dose                 | Fitted by construction: within 0.5% of each row at 8, 16, 26 and 52 weeks        |
| The curve's shape (Latella 2024, Steele 2023)             | Spanned, not checked: γ from 1.25 (base) to 1.5 (harsh)                          |
| Trained rates (Latella 2020)                              | Not checked                                                                      |
| Helms 2018's upper tail                                   | Not checked: it needs a bench-specific block, which no plan here runs            |
| Ahtiainen 2016's spread                                   | Not checked: the responder spread (log-SD 0.35) is an assumption                 |
| Lift4's own miss rates                                    | Reported per 100 sessions in the outcome table                                   |
| The owner's coaching anchors, at the 90th–95th percentile | Not checked: they are 52-week and two-year anchors, and the seasons run 26 weeks |
| Muscle size                                               | Not modelled                                                                     |

What the limits mean for the answers: the virtual lifter has no fatigue that
builds over weeks, so a lighter week costs it dose and buys nothing; it has
no size model; and the runner's injury hazard is Frandsen 2025's single-run
guard, so a plan that avoids spikes avoids injuries by construction. Several
answers are "kept" because of these limits, not because the options were
shown equal.

## 6. The new baseline

Main after the last merge (lemmonchess333/Maiin#2707, then the plan file's
STATUS lines in #2708), against the baseline the prompt was written on.

| Measure                        | 2026-10-06 (the prompt)                      | 2026-10-12 (main after the last merge)                                                               |
| ------------------------------ | -------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Unit suite                     | 1,075 files; 11,784 passed, 372 skipped      | 1,144 files (10 skipped); 12,775 passed, 404 skipped; 634 s                                          |
| `src/features/program`         | 124 files; 1,732 tests; 48.4 s               | 153 files (2 skipped); 2,200 passed, 14 skipped; 83 s                                                |
| Signed-in E2E on the emulators | 46 tests in 4.7 minutes                      | Not re-run as a whole; CI's journeys job runs five journeys, which pass here in 6.9 minutes          |
| A simulated week               | 2–5 ms headless; 15–20 s through the browser | about 4 ms headless (a 26-week lifting season in a tenth of a second); about 7 s through the browser |
| The measuring suite, 20 seeds  | (new)                                        | 426 s                                                                                                |
| `npm run verify`               | passed in 603 s                              | passed in 867 s                                                                                      |

## 7. Next

- **The findings open after Pgm8** (decisions.md), each the owner's, with a
  recommendation: a set taken lighter stays lighter (F23); a range that
  waits at its top with nothing said; the treadmill's two neighbours;
  removing a derived benchmark doesn't stick; warm-ups on a light dumbbell
  isolation; a barbell lift lowered under the bar; a lift whose dumbbell
  version is already in its day; a compressed plan's last build-week tempo;
  a second level gate after the filters (#2709 keeps the gate off the
  injury swaps; whether the injury picker prefers the person's level is
  open); the race cockpit at large text.
- **Still to measure:** R5 and R6 need the running baseline's review
  modelled, and R18 follows R5; L9, L13, L19 and R25 each wait on their
  reason; E7's ceiling.
- **Still to build:** R11's self-rated level; Train's day write must not
  take a person back to Train when they tap another tab while it loads
  (#2698).
- **On a device:** the rows this pass added to
  `docs/qa/pre-launch-backlog.md`.

## Appendix: where two stacks meet

From merging the Run21 PRs with the others, each resolved so in the
merges:

1. `RunSummary.tsx`: the run-walk PR (#2655) kept run-walk out of the
   inline pace verdict, and the E9 chain moved the verdict into
   `plannedRunVerdict.ts`. Keep the module call and move the exclusion
   into the module (intervals and run-walk are not judged).
2. `RunSummary.savedRunState.test.tsx`: use E9's words for the easy-run
   verdict and its null check.
3. `runSessionExplainer.ts` (#2660 against E2b and E2c): the long run in
   build says "rehearses race day" with a race-pace finish, otherwise
   whether quality sharpens around it depends on the week; the easy day's
   base line has no "aerobic". The input keeps both `racePace` and
   `weekHasQuality`.
4. `Run.recording.test.tsx`: the `useSessionPlayer` mock needs E9's fields
   (`workPortion` among them).
5. `DayActionSheet`, `ProgrammeRunSection` and `DayPeekCard`: one import of
   `runSessionPresentation` and `weekHoldsQuality`, not two statements.
6. `journeyScreens.ts`: `runWeekLabel = runStripLabel` once #2663 is on
   main.
7. `RunLaunchCard.tsx` (R2 in #2643 against E2c in #2668): both feel lines
   merge in cleanly, but E2c's lock gives a session one. Drop R2's line:
   #2679 carried the change, and #2668's merge took it (section 1).
8. `journeyRunDoc.ts`: `workPortion: null` once F22 (#2633) is on main:
   #2679 carried it, and #2676's merge took it.

The stepped taper (#2682) adds a ninth: its "Why this run" line for a taper
medium-long sits in the same taper block of `runSessionExplainer.ts` as the
Run21 PRs' changes, a few lines apart.
