# The training-engine pass: final report

The report [`docs/agents/training-engine-prompt.md`](../agents/training-engine-prompt.md)
asks for at its end ("DONE MEANS"): the PRs shipped, the known defects
left, the decisions, Phase 0's claims, the simulator's calibration and the
new baseline. Written 2026-10-10. The answers themselves, with their evidence
and measurements, are in [`decisions.md`](decisions.md); the simulator is
described in `simulator.md` on its branch (lemmonchess333/Maiin#2619).

## Where it stands

- **74 PRs** (numbers here are lemmonchess333/Maiin's). 3 are merged; 71
  are open as drafts for the owner to merge.
- **CI.** By 23:41 UTC on 2026-10-10, every check was green on all 71
  open heads, and none conflicted with main. The last four (#2601, #2675,
  #2680, #2682) were pushed that evening.
- **Two PRs went red on 2026-10-10, and both are fixed.** In
  lemmonchess333/Maiin#2680, a comment named the report the measuring suite
  writes. That file exists only where the suite has run, so the dead-path
  check failed every unit job. In lemmonchess333/Maiin#2675, the nightly job
  installed Playwright itself, which the install guard from
  lemmonchess333/Maiin#2652 refuses. The shared script now takes the
  browsers a job names.

## 1. The PRs shipped

### Merged (3)

| PR                        | What                                                         |
| ------------------------- | ------------------------------------------------------------ |
| lemmonchess333/Maiin#2608 | Move the weekly rollover into a pure module the effects call |
| lemmonchess333/Maiin#2646 | After race day the race plan waits for the race's own ending |
| lemmonchess333/Maiin#2652 | ci: clear dpkg's lock between Playwright install attempts    |

### Merging the rest

- **A lock goes in before the PR that builds on it.** Pgm7
  (lemmonchess333/Maiin#2604) goes first: it holds the owner's delegation
  that the other answers rest on.
- **A PR that stacks on another says so at the top of its body**, and shows
  the other's diff until that one merges. The longest chains:
  - the simulator: #2613, then #2617, #2619 and #2680, on the seams;
  - the journeys: #2676 (on #2609 and #2672), then #2679 (on the Run21 PRs);
  - the stepped taper: #2682 on #2644, which is on #2642.
- **Where two stacks meet**, eight resolutions need thought. They are listed
  at the end of this report.
- **The simulator's ratchets.** Each known defect is an entry in a ratchet,
  and each fix takes its entry out. A fix that merges before the simulator
  has no entry to take out, so whichever of the two merges second removes
  the entry and regenerates the traces. Section 2 says which PR clears which
  entry.

### Locks (8)

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

## 2. The known defects left

The simulator pins every defect it finds in a ratchet
(`KNOWN_RULE_FAILURES` and `KNOWN_COACHING` in `liftSeason.sim`,
`runSeason.sim` and `personActions.sim`). Numbers are `simulator.md`'s
findings.

**Cleared by an open PR once it merges:**

| Finding                                                   | Entry                           | Cleared by                              |
| --------------------------------------------------------- | ------------------------------- | --------------------------------------- |
| F11 "Last time" read the lift's other slot                | `stall:squat`                   | lemmonchess333/Maiin#2614               |
| F13 A quality day counted only under 4:30 /km             | `not-counted`                   | lemmonchess333/Maiin#2635               |
| F14, F21 Home read a dated run by weekday                 | `race-day-card`, `run-day-card` | lemmonchess333/Maiin#2637               |
| F16 A plan made mid-week planned that week's earlier runs | `before-plan`                   | lemmonchess333/Maiin#2636               |
| F20 Easier today's weights off the rack                   | `session-off-grid`              | lemmonchess333/Maiin#2620               |
| F22 A tempo judged on the whole run                       | `verdict-slow`                  | lemmonchess333/Maiin#2633               |
| F18 A new runner's continuous runs and early quality      | `run-walk`, `novice-quality`    | lemmonchess333/Maiin#2655, #2648        |
| F18 A marathon on one run a week                          | `one-run-week`                  | lemmonchess333/Maiin#2638               |
| F18 The one-step taper with no long run                   | `taper-cut`, `taper-long`       | lemmonchess333/Maiin#2682, except below |
| F18 Demanding days back to back                           | `back-to-back`, in part         | lemmonchess333/Maiin#2644, except below |

F1, F6, F7 and F19 were fixed without a ratchet entry
(lemmonchess333/Maiin#2610, #2646 (merged), #2612, #2621).

**Left, each with its reason:**

| Finding                                                  | Entry                     | Why it stays                                                                                                                                                       |
| -------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F4 Linear steps outrun slow-gaining lifts                | `misses`                  | L4, the owner's: every option changes Lift4 (6) or owner call (1)                                                                                                  |
| F8 Fitted 60-minute sessions run 61–63                   | `over-time`               | L5, not run: the options change how the time fit prices a session, and they are written first                                                                      |
| F9 Light lifts wait for the person                       | `stall`                   | Lift4 (6). A3's one line is answered and not built: it waits on the stretched ceiling's maths being checked against Nuzzo 2024. Anything more is the owner's (L11) |
| F10 Barbell lifts planned under the bar                  | `below-bar`               | L15, the owner's: Lift4 (2) allows no automatic swap                                                                                                               |
| F12 Size plans give the quads 9 sets                     | `acsm-size:quads`         | L16, kept: the simulator has no size model to separate the options                                                                                                 |
| F15 The plan doesn't start from the runner's own running | `under-dose`              | R5, not run: it waits on the review being modelled                                                                                                                 |
| F17 The derived benchmark reads easy runs as races       | `derived-low`, `easy-nag` | R1, the owner's (adaptive paces §10.2). Setup's optional race time (lemmonchess333/Maiin#2653) gives a runner the way round it                                     |
| F18 Long runs past the single-run guard                  | `spike`                   | R7: the race's spike is fixed by #2682; the first long run's waits on R5, and the rebound after a step-back week isn't measured                                    |
| F18 Weeks that jump                                      | `volume-jump`             | R15, kept                                                                                                                                                          |
| F18 Long runs over half a short week                     | `long-share`              | R16, kept                                                                                                                                                          |
| F18 Back to back where the week leaves no room           | `back-to-back`            | R9: a two-day week's long run and quality, and a week whose every easy day is beside a demanding one, keep the person's days                                       |
| F18 The new-runner marathoner's taper                    | `taper-cut`               | They run once a week, skip both 25 km runs and come back to the taper detrained, so its share is taken of their base long run                                      |
| L7 The hamstrings get 15 sets                            | not pinned                | Open against Lift4 (5)'s ceiling: its fix takes sets off the hinge work, not the deadlift off a day                                                                |

**Seen outside the ratchets:**

- The badge transaction gives up under a burst of writes (a journey's
  Sunday), and the award lands on a later write.
- The Firestore emulator logs "future update time" errors in the console.
  Seen on the emulator only.
- One marathon journey stopped advancing in week 32 on emulators that had
  run two hours of journeys. It didn't come back on fresh emulators, where
  CI runs every journey.
- A planned long run done on a treadmill isn't credited without the
  summary's "Mark scheduled run complete" tap, because the type picker
  treats "Treadmill" as a run type rather than a place. Brought to the owner
  as an observation (lemmonchess333/Maiin#2676).

## 3. Decisions

[`decisions.md`](decisions.md) has every question with what is locked
today, the evidence, the simulation and the answer. The owner delegated the
answers on 2026-10-07 under rules that keep every explicit owner decision
with the owner ([`owner-answers.md`](owner-answers.md), locked as Pgm7 in
lemmonchess333/Maiin#2604). Each answer was locked before it was built:
A1–A12 as Pgm7, the rest as Lift5, Lift6, Run19, Run20, Run21 and Run22,
plus a STATUS line on PR-J-Q1. A correction restores an existing lock's
text, so it needed none.

**By status**, the 53 questions (L1–L19, R1–R25, E1–E9):

- **20 built**: L8; R2, R4, R8, R9, R10, R11 (its race-time half; the
  self-rated level is still to build), R12, R13, R14, R20, R21 and R22;
  E1–E6 and E9.
- **1 answered and not built**: L11's A3 line, which waits on the maths
  check in section 2.
- **13 kept**: L1, L2, L7, L10, L12, L14, L16, L17, L18, R3, R15, R16 and
  R19.
- **11 measuring**: L5, L9, L13, L19, R5, R6, R17, R18 and R25 are not run
  yet, each with its reason; R7 is part measured; E7 is measured and its
  band stands, but whether to show the band's fast end as a ceiling is
  open.
- **8 the owner's**: L3, L4, L6, L15, R1, R23, R24 and E8. L11 beyond A3,
  and E3's and R14's owner parts, are the owner's too.

| Question                                   | Status                                     | Lock, PR                                       |
| ------------------------------------------ | ------------------------------------------ | ---------------------------------------------- |
| L8 Curls fill the push/pull balance        | Built                                      | Lift6 (#2649); #2650                           |
| R2 Paces with no benchmark                 | Built                                      | Run20 (1); #2643                               |
| R4 The long run's weekday                  | Built                                      | Run20 (2); #2647                               |
| R8 The taper                               | Built                                      | Run22 (#2681); #2682                           |
| R9 Demanding days back to back             | Built                                      | Run20 (3); #2644                               |
| R10 The taper's session bypassed placement | Built, a correction                        | #2642                                          |
| R11 Setup asks for no benchmark            | Race time built; self-rated level to build | adaptive paces §10.2; #2653                    |
| R12 Copy that was wrong                    | Built, a correction                        | #2641                                          |
| R13 The quality ladder started mid-way     | Built                                      | Run20 (4); #2645                               |
| R14 A new runner's quality and run-walk    | Built                                      | Run20 (5); #2648, #2655                        |
| R20 The Monday check on a first week       | Built, a correction                        | Run19; #2651                                   |
| R21 A rebuilt week, "Re-plan from today"   | Built, a correction                        | Run19; #2669, #2670                            |
| R22 The race plan after race day           | Built, merged                              | PR-J; #2646                                    |
| E1–E6, E9 Explaining runs                  | Built                                      | Run21; #2656–#2661, #2663, #2665, #2666, #2668 |

A1–A12, the owner-delegated answers locked as Pgm7: A1 keeps the plan's
1.0 counting of indirect sets; A2 keeps the fitness–fatigue
curve; A3 is the line above; A4 is built (#2622); A5 is built (#2607); A6
keeps Home's today card as the owner set it; A7 is built (#2638); A8 keeps
Lift4's lighter-week recipe; A9 keeps the half-counted leg miss, labelled
an assumption; A10 keeps the ramp line; A11 is built (#2675); A12 needs
nothing.

**Handed back to the owner**, each with a recommendation in decisions.md:

| #    | Question                                            | Why it's the owner's                                             |
| ---- | --------------------------------------------------- | ---------------------------------------------------------------- |
| L3   | 4 × 3 and 4 × 7 on Get stronger                     | Lift4 (5)'s heavier and lighter days                             |
| L4   | The sawtooth                                        | Lift4 (6); owner call (1)                                        |
| L6   | Added load on bodyweight lifts                      | Lift4 (1)'s change, pinned in its tests                          |
| L11  | Light lifts that wait for the person, beyond A3     | Lift4 (6): no automatic big step, no "try X kg"                  |
| L15  | Barbell lifts under the bar in existing plans       | Lift4 (2): no automatic swaps                                    |
| R1   | The derived benchmark                               | Adaptive paces §10.2; RUN-EV-08                                  |
| R23  | Freeform runners' plan; the weeks ahead             | Run9                                                             |
| R24  | Race predictions as ranges                          | The running handoff's non-adoption of a source-derived predictor |
| E8   | Heat                                                | A safety claim                                                   |
| E3a  | Phase names on run surfaces                         | Run9f keeps base, build and peak internal                        |
| E3b  | A sheet for runs, not the "Why this run" disclosure | The design guide's note on Lift4 (3)                             |
| R14c | A race too soon for someone new to running          | A claim about readiness                                          |
| —    | A treadmill run credited to a planned long run      | The type picker's model of a run (section 2)                     |

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

| Measure                        | 2026-10-06 (the prompt)                      | 2026-10-10                                                                                                                                                                                                                                                                        |
| ------------------------------ | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit suite                     | 1,075 files; 11,784 passed, 372 skipped      | Each open PR runs on its own tree. The stepped taper's (main with #2642, #2644 and #2682): 1,091 files; 11,874 passed, 392 skipped. The simulator's (#2680, in CI): 1,105 files; 12,083 passed, 398 skipped. Run20 and Run21 with the journeys (#2679): 1,087 files, 12,106 tests |
| `src/features/program`         | 124 files; 1,732 tests; 48.4 s               | main: 124 files, 1,748 tests; the stepped taper's tree: 125 files, 1,761 tests (61–66 s with start-up)                                                                                                                                                                            |
| Signed-in E2E on the emulators | 46 tests in 4.7 minutes                      | Not re-run as a whole; CI's new journeys job runs four journeys in 5.2 minutes (the job 7 min 38 s)                                                                                                                                                                               |
| A simulated week               | 2–5 ms headless; 15–20 s through the browser | about 4 ms headless (a 26-week lifting season in a tenth of a second); about 7 s through the browser in a journey                                                                                                                                                                 |
| The measuring suite, 20 seeds  | (new)                                        | 426 s                                                                                                                                                                                                                                                                             |
| `npm run verify`               | passed in 603 s                              | Not re-run: no single tree holds the 71 open PRs                                                                                                                                                                                                                                  |

## 7. Next

- Merge in the order above; after each fix lands with the simulator, take
  its ratchet entry out.
- Measure R17 once #2682 is on main, with the option to compare against
  Run17 written first; then R18 after R5 and R13.
- Build A3's line once the stretched ceiling's maths is checked against
  Nuzzo 2024; fix L7's hamstring ceiling on the hinge work.
- R5 and R6 need the running baseline's review modelled; L5 needs its
  time-fit options written.
- The owner's questions in section 3.

## Appendix: where two stacks meet

From merging the Run21 PRs with the others (the resolution each needs):

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
   merge in cleanly, but E2c's lock gives a session one. Drop R2's line;
   lemmonchess333/Maiin#2679 carries the change.
8. `journeyRunDoc.ts`: `workPortion: null` once F22 (#2633) is on main;
   #2679 carries it.

The stepped taper (#2682) adds a ninth: its "Why this run" line for a taper
medium-long sits in the same taper block of `runSessionExplainer.ts` as the
Run21 PRs' changes, a few lines apart.
