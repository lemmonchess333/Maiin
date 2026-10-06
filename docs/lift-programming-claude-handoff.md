# Tropos lifting-programming evidence handoff for Claude Code

> Target baseline: remote origin/main at
> a69a9d655424ca4c27e8315bcbffe340f1085748, audited on 2026-08-07.
> Re-fetch the intended branch and record its SHA before relying on any
> current-state claim below.

## Purpose

Use the supplied lifting sources to improve Tropos's programming experience
without turning books, study averages, or a coach's sample routine into an
opaque universal algorithm.

This document gives Claude Code:

- evidence principles that plausibly transfer to a broad fitness product;
- the current remote-main architecture and intentional product behavior;
- the remaining correctness work that must not be obscured by new theory;
- a bounded, testable workflow for future programming changes.

It is not approval to rewrite stored programmes, diagnose readiness or injury,
or open a pull request.

## Important repository status

Do not merge the old divergent lift feature branch into main. The earlier lift
work was already squash-merged: the tree at local feature commit
feeadb497de44ec8d667ce0c53c36a7353103741 matches the GitHub-authored main
commit ec0296d3. Remote main contains further work after that merge. This
handoff therefore targets the remote SHA above, not the old feature branch.

## Read before making a change

1. Fetch the actual target branch and compare its SHA with this document.
2. Read AGENTS.md, CLAUDE.md, and the dual-scheduling ADR.
3. Read the lifting evaluation and the volume-currency and command-boundary
   ADRs: docs/proposals/lifting-v8-evaluation.md, docs/adr/0010-volume-currency.md,
   and docs/adr/0011-command-boundary-scope.md.
4. Trace the real caller, persistent field, server owner, and tests for the
   proposed change. Existing remote behavior is authoritative until an owner
   chooses otherwise.
5. Make one bounded product decision before editing. Do not perform a broad
   book-driven rewrite.

Lifts are split-ordered; runs are date-pinned. Preserve that distinction.

## Product guardrails

- Adherence is first: equipment, available time and days, confidence,
  preference, current capacity, and concurrent running are programming inputs.
- Training age changes complexity and autonomy more than it changes blanket
  dose. Do not equate advanced status with endless volume or risky exercise
  selection.
- A saved programme, exercise identity, calibrated load, history, or schedule
  must not change invisibly.
- Use plain coaching language. Do not present a heuristic, book protocol, or
  research average as individual certainty.
- Pain and medical concerns are boundaries, not inputs to a diagnostic engine.
  Offer conservative choices or escalation guidance, not rehabilitation or a
  readiness diagnosis.
- Changes must respect both light and heavy users of the system: a novice,
  a returning lifter, an experienced lifter, a runner who lifts, and someone
  with a history-bearing programme all need safe behavior.

## Evidence ledger and source provenance

The books are evidence inputs, not assets to commit or redistribute. Their
transferable concepts are stronger where they agree across sources than where
one author specifies an exact routine or number.

| Source                                                                                                                        | Best product use                                                         | Key limitation                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Vladimir Zatsiorsky, William Kraemer, Andrew Fry, Science and Practice of Strength Training, 3rd ed. (2021)                   | Strength specificity, stable anchors, monitoring and recovery concepts   | Athlete/strength context; not a consumer prescription for percentages, velocity, or power work. |
| Steven Fleck, William Kraemer, Designing Resistance Training Programs (1987 Human Kinetics edition)                           | Needs analysis, gradual exposure, equipment and time constraints         | Historical framing, not modern numeric dose.                                                    |
| Eric Helms, Andrea Valdez, Andy Morgan, The Muscle and Strength Pyramid: Training, 2nd ed. (2019 Spanish adaptation supplied) | Adherence hierarchy, stage-aware progression and deloads                 | Practical coaching heuristics, not a generator specification.                                   |
| Mike Israetel, James Hoffmann, Melissa Davis, Jared Feather, Scientific Principles of Hypertrophy Training (2021 EPUB)        | Hypertrophy trade-offs, fatigue awareness, controlled variation          | Advanced physique focus; do not implement personal MEV, MAV, or MRV calculations.               |
| Brad Schoenfeld, Science and Development of Muscle Hypertrophy, 2nd ed. (2021)                                                | Effort, selection, rest, volume/frequency trade-offs, concurrent context | Broad ranges and individualization; no single optimal split or deload.                          |

The supplied editions were read on 2026-08-07 from temporary local attachment
caches. PDF review combined text extraction with visual spot checks. EPUB review
used its ZIP, OPF, NCX, and XHTML structure. The cache data below permits
reproducible source identification without copying the books into the repo.

| Source                   | Cache ID / format |      Bytes | SHA-256                                                          |
| ------------------------ | ----------------- | ---------: | ---------------------------------------------------------------- |
| Zatsiorsky, Kraemer, Fry | 4A1cTo / PDF      | 17,385,808 | 3EFE90ECF7BAC3503F66B269FB04151C7BE81138B50413BA86B50626DE83285F |
| Fleck, Kraemer           | Le4kFj / PDF      | 45,936,612 | 84B3129A05118DB27C5622262127C7EE23F029BC8859E0FFF0763F169E69A9F2 |
| Helms, Valdez, Morgan    | Erbyh8 / PDF      | 16,200,369 | B28331113AB19D21ED54176E9629A09F672E6C7920901B59EFDA092AD80FE535 |
| Israetel et al.          | oiyexp / EPUB     |  1,545,751 | 7E509AB447D01C21AB449E00198CA92192C45B5C8FB10F818F75DFC26828163B |
| Schoenfeld               | q2nfE8 / PDF      |  8,620,715 | 05B86DF883117C01489928B87F74E19A0360E42C17CE98AF0666FD412C0F4DEF |

### Transferable evidence principles

- Start from a needs analysis: goals, equipment, time, schedule, experience,
  preferences, and other training determine whether a plan is usable. Fleck
  and Kraemer, Chapter 3; Helms et al., pages 33-45.
- Keep enough work stable to learn and compare; variation should solve access,
  pain, fatigue, staleness, plateau, or a planned transition rather than
  calendar novelty. Zatsiorsky et al., Chapters 1 and 5; Israetel et al.,
  Chapters 2 and 5.
- Progress conservatively from observed work. Load, reps, sets, effort, rest,
  and density are distinct signals. Do not reduce prescription to a universal
  percentage of one-repetition maximum. Zatsiorsky et al., Chapter 4.
- Goal and training age alter intent, complexity, and choices. They do not
  establish exact personal volume landmarks. Helms et al., pages 53-103 and
  116-167; Schoenfeld, Chapter 4.
- Frequency primarily distributes tolerable work. Split choice should fit
  schedule and recovery rather than be marketed as universally superior.
  Schoenfeld, Chapter 4.
- Failure, RPE, and RIR are useful uncertain tools, not mandatory defaults or
  interchangeable clinical measurements. Schoenfeld, Chapter 4; Helms et al.,
  pages 116-167.
- Deloads and recovery reductions are useful tools, but no source makes a
  fixed 3:1 or four-week cadence universal. Helms et al.; Schoenfeld, Chapters
  6 and 8.
- Concurrent lifting and running requires visible trade-offs, not a promise of
  an interference diagnosis. Zatsiorsky et al., Chapter 11; Schoenfeld,
  Chapter 8.

### Applied lifting design rules

This is the self-contained, paraphrased source synthesis Claude should use
instead of reopening the books. It translates the shared lessons into product
behaviour; it does not authorize a new universal generator or any author's
sample programme.

| Decision                            | Evidence-informed Tropos behaviour                                                                                                                                                                                                                                                                                                                        | Do not encode                                                                                                                                        |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Establish the starting point        | Treat a first plan as a conservative hypothesis built from goal, available days/time, equipment, confidence, preferences, other training, and any trustworthy completed history. Collect a new input only when it changes a visible plan choice. Saved history outranks cold-start assumptions.                                                           | A demographic field, desired goal, or one estimated max as a complete capacity or readiness model.                                                   |
| Choose and retain exercises         | Apply selection precedence: safety/injury boundary and available equipment, required movement role/coverage, current identity/history/calibration, stated preference, then variety. Keep a stable anchor long enough to learn and compare. Explain every replacement and use the existing identity/load boundary so history transfers only when truthful. | Calendar novelty, a cosmetic swap, or relabelling history/load onto a materially different, cross-category, bodyweight/loaded, or rep-unit exercise. |
| Represent the dose                  | Model each working prescription as exercise, sets, reps or seconds, load/resistance, effort cue, rest, order, and meaningful modification. Volume totals are an audit and planning aid, not the whole stimulus. Timed holds remain seconds from generation through history and progression.                                                               | One universal volume number, tonnage alone, or repetition-shaped logic for a time-based movement.                                                    |
| Judge a completed session           | Treat performance as comparable only for the same exercise identity/instance, rep unit, and calibrated-load context. Warm-ups, missing/incomplete work, unsafe substitutions, pain boundaries, and fresh/uncalibrated movements are hold/calibration states, not progression, recovery, PR, or volume evidence.                                           | Treating every logged row as equivalent evidence or using a warm-up/partial session to escalate dose.                                                |
| Progress from observed work         | Use the smallest explainable response justified by eligible completed work: progress, hold, reduce, recover, or deliberately reselect. A noisy or incomplete session should not trigger a confident escalation. Do not change more than one prescription dimension per response unless a named recipe deliberately composes them.                         | Calendar-only load jumps, forced progression after a modified session, or variation as the default response to a single bad day.                     |
| Use effort feedback                 | Let RPE/RIR or an equivalent effort signal refine a prescription when the person can use it. Show that it is an estimate and accept missing or low-confidence feedback without treating it as failure.                                                                                                                                                    | Failure-by-default, a clinical readiness score, or assuming reported RIR is exact across people and exercises.                                       |
| Allocate work and frequency         | Use frequency to distribute tolerable work across the person's actual week. Make a declared strength or muscle priority visible in the allocation and in what is deprioritized, while preserving recovery and session-time constraints.                                                                                                                   | A claim that one split, frequency, or every-muscle-at-once maximum volume is universally superior.                                                   |
| Manage fatigue and deloading        | Treat the current calendar shape as a starting heuristic and completed work/repeated regression/user feedback as reasons to review it. When reducing work, state whether sets, reps, load, exercise stress, or schedule changed and give a bounded path back. An untrained week cannot manufacture training stimulus.                                     | A fixed deload cadence as physiology, an MRV diagnosis, or copy that promises a load reduction when the actual recipe changes something else.        |
| Scale complexity by experience      | Let training age chiefly change exercise complexity, optional effort/autonomy, and how much explanation/control the person receives. Keep a simple, legible route for all tiers.                                                                                                                                                                          | Automatic volume inflation, advanced methods, daily maxes, or technical movements merely because a user is labelled advanced.                        |
| Coordinate lifting with running     | Surface the competition for leg stress, time, and recovery. If a hard run and a hard lift conflict, show the trade-off and offer a choice consistent with the user's stated priority.                                                                                                                                                                     | A silent deletion, catch-up session, fixed separation rule, or an interference/injury diagnosis.                                                     |
| Explain changes and preserve agency | Before a material change, show what changes, why, expected trade-off, and how to keep, modify, or reverse it. Saved programme identity, calibrated load, completion truth, and history remain the default.                                                                                                                                                | A book-driven rewrite of an existing plan with no user-visible decision or rollback path.                                                            |

The underlying synthesis is consistent with needs analysis and gradual exposure
(Fleck and Kraemer), specificity and monitoring (Zatsiorsky, Kraemer, and
Fry), adherence and staged progression (Helms, Valdez, and Morgan), fatigue
and controlled variation (Israetel and colleagues), and effort,
volume/frequency, and concurrent-training trade-offs (Schoenfeld). The
chapter/page references in the preceding principles are the traceable source
locations for a proposal.

### Conservative response ladder

For a future progression, recovery, or variation feature, prefer this
decision order:

1. Preserve the recorded session truth and determine whether the completed
   data are usable for a decision.
2. Check an explicit constraint: available equipment/time, user modification,
   pain boundary, concurrent hard running, or an active recovery/block state.
3. If the person completed the intended work with a trustworthy positive
   signal, make at most the bounded progression the current policy permits.
4. If the signal is uncertain, hold the prescription and invite a user review;
   do not manufacture a regression or advancement.
5. If there is repeated, explainable shortfall, reduce the relevant stress or
   offer recovery/replanning before changing exercise identity.
6. Change identity only for a named reason and through the safe
   load/history-reset or transfer rule. Persist, explain, and test the result.

This is a product decision hierarchy, not a diagnostic or individualized
physiology model.

STATUS 2026-10-05 (owner decision): a load the person logs is the plan's
load. A loaded lift's next prescription starts from the weight actually
lifted, heavier or lighter and by any margin; success is the target reps at
that weight, and the progression steps run from it, their size keyed on it.
A miss still counts, but the plan never cuts below the load lifted: the
third miss in a row puts the rep target (a weighted hold's duration) back to
its base and records the stall in `plateauCount`. That replaces the 5%
(double) and 1 kg (linear) load cuts, and the weighted-hold clause of the
LIFT-EV-01 close-out below ("weighted holds deliberately keep cutting load").
Bodyweight movements keep their rep or second decrement, and deload weeks
are unchanged. With auto-progression off the plan still takes the load
lifted, without a step. Held weeks, the easier and shortened session
variants, bodyweight movements and a set saved with no load keep the
prescription. This reverses the Lift2 lock, which read a lighter session as
a user modification to hold under steps 2 and 4 above, and its four-step
bound on a heavier one; do not re-derive either from this ladder. Code:
`liftedLoad` and `applyProgression` in
`src/features/program/programEngine.ts`, the only copy since Lift4 build
step 3 retired the server's (below).

STATUS 2026-10-05 (Lift4 (7), build step 3, second release): the third-miss
rule above is replaced. A miss counts only at the weight the plan asked for
(`sessionOutcome` in `sessionSets.ts`), and the first holds, silently. The
second in a row lowers a loaded lift 10% on its step grid, by at least one
step, with the rep target kept; the lift then climbs back a step for each
session that is not a miss, to the weight it came down from, and the usual
rules resume there. Its next session shows one line, "Down from 100 kg: two
sessions under 5 reps". One record on the exercise, `lowered`, carries both,
tagged with the exercise it lowered so a swap can't take it to another.
Bodyweight lifts come down a rep and bodyweight holds five seconds, as
before; a weighted hold comes down in load again, as the LIFT-EV-01
close-out had it. Code: `countMiss` and `applySessionSets` in
`programEngine.ts`.

STATUS 2026-10-05 (Lift4 (6), build step 3, third release): steps follow the
equipment (`loadSteps.ts`). A barbell steps 2.5 kg, or 1.25 kg with "I have
small plates", which replaced Microloading and its 1 kg a session and starts
off; dumbbells go to the next pair (kilos to 10 kg, then 2.5 kg), a machine or
cable stack 2.5 kg, a kettlebell the next bell. Every set at a fixed target is
a step; a range steps at its top, as before. The lean-bulk bonus and the
light-lift microplate step (`movementClass.ts`) are gone. A step of more than
about 15% is never taken on its own: the target climbs a rep a session past
the range instead, up to the reps at which the next weight for the range's
bottom is the same effort by Epley, and reps past the range's top never count
toward a miss. When the person lifts a heavier weight, the plan follows it and
the reps start from the bottom again. Off-grid weights round once (schema v5),
and the server's settings validator takes `smallPlates` while still accepting
an older app's `microloading`.

STATUS 2026-10-05 (Lift4 (3) and (7), build step 3, fourth release): ranges
are shown. A lift that climbs reps before it adds weight reads as its range
("3 sets × 8–12 reps", "30–45s"), on Train, in the session and in
onboarding's preview; a fixed target reads alone ("3 sets × 5 reps"), even
where generation stamped a range on it, and a target that has climbed past
its range shows how far ("12–18"). `prescribedRepRange` in `programEngine.ts`
is the one reading. A climbing lift's miss is judged at the bottom of its
range, so reps it has climbed, inside the range or past it, are never a bar.
Which lifts climb a range and which hold a fixed target for a new plan is
step 4's generator.

STATUS 2026-10-05 (Lift4 (5), build step 4, first part): a new plan's sets,
reps and progression come from each lift's role (`roleTable.ts`): main lifts,
other compounds and isolations, by goal, with a beginner column (fixed main
lifts on three sets, two sets of everything else) and four sets on a strength
main lift from intermediate up. A range climbs; a fixed target steps. The
heavier and lighter days stay for intermediates as they were, two reps either
side of the table, so a Build muscle main lift runs 4–8 on a heavier day and
8–12 on a lighter one. A session the table takes past 18 working sets sheds
accessory sets, isolations first, down to two (`fitSessionsToBudget`).
Starting loads are estimated for the main lifts' bottom (`mainRepAnchor`). A
block re-prescribes from the same table on the server (`roleTable.js`, pinned
by `roleTable.cross.test.ts`), and its copy reads the lifter's level. Get
stronger and Support my running share every target, as do Build muscle and
Lose fat, so a block between them changes nothing and says so. A lift an
equipment or injury swap brings in still keeps its slot's numbers; giving it
its own role's numbers, and fitting the plan to the session length, are the
next parts of step 4.

STATUS 2026-10-05 (Lift4 (5), build step 4, second part): plans fit the
session length. A new plan's sessions are cut to the minutes the person has
(`sessionFit.ts`; an hour when the question was never answered), priced with
the app's own estimator, which now counts the warm-up sets the session puts
before each body part's first loaded lift and the rest its timer runs: the
person's fixed rest, or the plan's by role and reps. A plan built for 30
minutes rests less. What doesn't fit goes in this order: isolations' sets to
two, other compounds' sets to two, isolations, main lifts' sets to two, other
compounds. A muscle's last direct lift in the week stays while anything else
can give way, and a main lift is never dropped. The weekly bands are only a
ceiling now, in two tiers (a beginner's are two thirds of everyone else's):
the floor-chasing top-up (`balanceWeeklyVolume`) retired, and the push/pull
balancer adds only inside what a session fits. A settings save that changes
the session length re-fits the plan's sets and nothing else. The plan records
the length it was fitted to (`programState.sessionMinutes`, on the server's
allow-list), and Start trims only a plan from before this. The question on
the days step and the settings control come next.

STATUS 2026-10-05 (Lift4 (5), build step 4, third part): onboarding's days
step asks about how long a session is (30, 45, 60 or 75+ minutes) beside the
lift days, and Lift plan settings edits it in the same place; the separate
"Usual time for lifting" section retired. The Weekly volume card judges each
muscle against what the days and time can fit (`weeklyVolumeTargets`: the
floor, or what a fresh plan for the same days, focus, level and length gives
the muscle, where that is less), with a beginner's lower ceiling.

STATUS 2026-10-05 (Lift4 (5), build step 4, fourth part): an unknown level is
a beginner's everywhere: `toExperience` and its server copies, an omitted
level in `generateProgram`, a stored value outside the three, and the level
onboarding shows before one is picked. The builders still pick at the
intermediate tier (`BUILDER_TIER`) and the complexity gate re-points what a
beginner can't be offered, so a known level's plan is unchanged. With no
bodyweight a new plan starts from the bar: a barbell lift at 20 kg and any
other loaded lift at the estimate for a 60 kg beginner, not the builders'
fixed loads; a plan the person already has keeps the loads it shows. The time
fit prices each loaded lift's warm-up at the heavier of its load and an 80 kg
intermediate's estimate for it, so a plan started at the bar still fits once
its lifts carry a full ramp, and the volume card's reference plan prices the
same as the person's.

STATUS 2026-10-05 (Lift4 (5), build step 4, fifth part): every muscle twice a
week on a plan of two or more days, as far as the time and the ceilings
allow. A muscle is worked on a day when a lift counts sets toward it, as the
volume model counts them (ADR-0010), so the compounds give every big muscle
its two days; the side delts, calves and abs, which nothing else reaches, get
a lift on each day short of one (`weeklyFrequency.ts`), the week's own where
it has one. Those added lifts are extras to the time fit: they go after the
lifts whose muscles keep two days and before the plan's own, they never count
as a muscle's direct work, and a day that loses one is fitted again without
it, so no set stays cut for it. A main lift never gives a set for one. The
table is a ceiling: an added lift that leaves a muscle over its ceiling once
the week is balanced goes (a lateral raise counts toward the upper back too,
so a week whose rows fill that ceiling keeps the side delts on one day), and
the fat-loss band's lower ceiling, which goes with its volume multiplier in
step 4's retirements, holds Lose fat plans to that for now. Measured on Build
muscle for intermediate and advanced lifters: every muscle on two days at 75
minutes on 2 to 6 days, and at 60 minutes on 4 to 6.

STATUS 2026-10-05 (Lift4 (11), build step 4, sixth part): every lift the
injury promises name is covered. The swaps read `CONTRAINDICATED`
(`injurySubstitutions.ts`), which lists, from each option's words, the lifts
it promises to change, the generator's included; the hand-written templates'
annotations were the index before, and missed the back squat, front squat and
standing press for a lower back, the hack and front squats for a knee, the
Arnold press, barbell bench and dips for a shoulder, and the dips, dumbbell
curl, skull crusher and overhead extension for an elbow. The templates are
deleted with it. A substitute must be safe for every injury the person has,
not only its original's, and none is offered for an injury it is itself
named for, so the next save swaps nothing more. Home gyms gained safe options
(the incline dumbbell press and push-ups for overhead pressing, inverted and
dumbbell rows for pull-ups, a second hammer curl, the kickback, the glute
bridge), and the inverted row now stands in for any vertical pull a home gym
can't do safely, not only a beginner's. With a sore elbow at home a push day
with two triceps slots still keeps one it can't do, flagged, since the
kickback is the only safe triceps lift without a cable.

STATUS 2026-10-05 (Lift4 (5) and (11), build step 4, seventh part): a new
plan's equipment and injury swaps happen inside the generator, after the
identity passes and the twice-a-week lifts and before the role table, so the
lifts swapped in get their own role's numbers and the time fit prices the
lifts the person will do (a home gym's dumbbell bench keeps the sets the
barbell's warm-ups cost it). Every caller passes the person's limits, which
fixes a reset, and a first plan built with none saved, that ignored both and
gave a knee-injured person the squat back. In a plan the person already has,
a lift a swap brings in takes its role's reps, range and progression on its
day, its load moved down to more reps (never up), and no more sets than its
slot had (`represcribeSwapped`).

STATUS 2026-10-05 (Lift4 (11), build step 4, eighth part): removing a
limitation brings the original lifts back as part of saving. Each equipment
or injury swap records the lift it replaced (`swappedFrom` on the exercise,
the first one through a second swap, carried by both exercise builders and
through a regenerate), and a save puts it back once the person's injuries
no longer name it and their equipment has it, unless the day holds it
already (`restoreSwappedLifts`). It comes back with its role's numbers on
its day and a fresh load and history, as any swap's.

STATUS 2026-10-05 (Lift4 (11), build step 4, ninth part): beside the three
equipment setups, an optional "What do you have?" list. Onboarding asks for a
barbell and a rack (beside a home gym or a minimal setup) and small plates
(the new plan's "I have small plates"); Lift plan settings asks for the
barbell beside the setups, through the save, and keeps small plates in
Advanced, where it saves at once. A barbell and a rack (`barbellAtHome` on
the profile: rules, server sanitizer and registry) lets the swaps keep and
pick barbell lifts at home, and a save that adds it brings the barbell lifts
the setup swapped out back. The home gym's own copy still names only what it
gives without one.

STATUS 2026-10-05 (Lift4 (13), build step 4, tenth part): the weekly
rollover no longer changes a plan's sets by itself. Retired: the accessory
set wave (an accessory ran one set below, at and one above its anchor across
the cycle; every week now starts from the anchor, the weekly reset that
stays), the adjustment rule (two or more stalled lifts added accessory sets
for a recovered lifter, cut them for a strained one, and the second time
swapped the stalled accessories; `adjustmentRule.ts` is deleted, and with it
the rollover's read of the performance document and the block's amnesty,
which only held that rule back), and the fatigue shave (every lift's sets
×0.9 once three lifts had a miss standing, which at two to five sets changed
nothing). Misses are the lowering rule's (build step 3); lighter weeks stay
on the calendar until step 5. A lifter who hits every target now holds 66
sets a week through the cycle, 44 in its lighter week, where the wave ran
52, 66 and 80 (`volumeProgressionOverTime.test.ts`). `fatigueScore`,
`plateauResponses` and the block's `amnestyWeeksLeft` stay on stored plans,
which the server's allow-list admits; nothing reads them.

STATUS 2026-10-05 (Lift4 (2) and (13), build step 4, eleventh part): the
engine never swaps a lift on its own. Retired: the untrained-accessory
rotation (at each new cycle, an accessory with no logged sets moved to
another variation; it also re-ran on every untrained rollover into such a
week) and the plateau swaps at rebuild (a lift stalled three times was
re-picked when the plan was next built, `makeExercise` for accessories and
`applyExperienceAwarePlateauPicks` for mains, zeroing its history).
`pickExercise` keeps the current lift when the level allows it and otherwise
gives the primary; the variation roles that ranked a stall's replacement
(technique, weak point, size) and the rotation's load anchor
(`rotationAnchor`) go with them. Advanced variations come in when the person
picks one; the rules sheet (step 6) says a variation often gets a stuck lift
moving.

STATUS 2026-10-05 (Lift4 (4) and (13), build step 4, twelfth part): a cut
or a bulk no longer changes the lifting. Retired: the nutrition nudges on
the builders' sets (×0.9 on a cut, ×1.12 on a lean bulk), which the role
table had already overwritten everywhere but the week's ordering, and with
them the generator's nutrition-goal argument. Lose fat's weekly bands are
Build muscle's (6 to 14 became 12 to 20), so a Lose fat plan is now the same
plan as Build muscle's at every day count and setup in the golden sweep, and
the Weekly volume card judges it the same way; the cut is in the nutrition
targets. The goal profiles the server mirrors are unchanged.

STATUS 2026-10-05 (Lift4 (3) and (13), build step 4, thirteenth part): "Go
easier today" is recommended for one reason only, a hard run yesterday
before a session that loads the same legs. Retired: its two guessed reasons,
a muscle "still recovering" by the calendar model (`computeMuscleRecovery`,
which History's recovery view keeps) and the weekly performance score's
deload flag. The easier session itself is unchanged and stays one tap away
in the session chooser. With this, step 4's retirements are done; the
automatic whole-body lighter week and the per-muscle "Eased this week" cut
share one trigger (`recoveryTrigger.ts`) and retire with step 5's lighter
weeks.

STATUS 2026-10-05 (Lift4 (7), (8) and (9), build step 5, first part): one
lighter-week recipe for everyone, half the working sets, rounded up, at the
same weights and reps, from the plan's own sets (`applyDeload`, and the
server's `deloadEngine.js` for "Apply" on Train, pinned together). The
calendar's lighter week, every 4th trained week as before, now comes only
to intermediate and advanced lifters on three or more lift days
(`lighterWeeksScheduled`, `weekPrescription.ts`), never straight after
another (a manual one included), and a lighter week's sessions can raise a
weight but never lower it. Miss counts start again once a lighter week is
over. The by-level recipes (a beginner's one set fewer at 85% of the
weight; everyone else's one set fewer two reps lower) and the stashes that
undid them are gone; old stashes still restore. "Why this session" names
the cycle only when lighter weeks come, and the level suggestion's copy
says what a level changes. Easier today keeps its own 85%
(`deloadWeight`).

STATUS 2026-10-05 (Lift4 (13), build step 5, second part): the automatic
whole-body lighter week (two regressing sessions on more than half the
trained muscles) and the per-muscle recovery session ("Eased this week":
half the sets and reps for a regressing muscle, with a banner and its
undo) are retired, with `recoveryTrigger.ts`, `RecoveryReductionBanner`
and `undoRecoveryReduction`. A lighter week now comes only on the calendar
(above) or when the person takes one. Train's advice is the lighter-week
suggestion, then "Go easier today".

STATUS 2026-10-06 (Lift4 (4) and (9), build step 5, third part): "Take a
lighter week" is in Train's More options, whenever the person wants one:
one at a time and never two in a row, counted in trained weeks, as the
calendar's are (the rollover marks a trained lighter week in `weekHistory`;
`lighterWeekAllowed`, and the server's `applyDeloadWeek` refuses the same).
The suggestion card, now "Consider a lighter week", shows only when the
week's load came from running (`loadFromRunning`), its running half left
for the running grill; a lifting week gets no early offer. The plan says
"lighter week" wherever it names one: Train's week label ("Week 3 of 4 ·
Lighter week"), the banner, its toasts, the effort cue and Food's day
label. A plan the calendar gives no lighter weeks (a beginner's, an unknown
level's, one or two lift days) counts its weeks without a cycle ("Week 7 ·
Build muscle"), on Train and on the finish screen. The Performance Index
keeps its "Deload" band and insight copy, which describe the measured
load, not the plan's week.

STATUS 2026-10-06 (Lift4 (3) and (9), build step 5, fourth part): with a
race plan the calendar's lighter week falls on the run plan's step-back
week (`isRunStepBackWeek` in `runPlanTiming.ts`, which the scheduler's ramp
now reads for its cutbacks too, so the two can't part), rather than every
4th trained lift week; who gets lighter weeks and one at a time are
unchanged. The rollover works out the run week first and hands
`advanceWeek` where the race block lands (`raceBlockWeek`). Train's week
row and the finish screen count a race plan's weeks in the race block and
name them by the run plan's phases ("Week 7 of 16 · Build", "Week 14 of 16
· Taper"), at every level; "Why this session" names the week before a
step-back as the last full one. A week from the history is named by its
own number and its own lighter mark. The race's final weeks, the week
after it and the leg-session rules follow in the running link (step 5d).

STATUS 2026-10-06 (Lift4 (11), build step 5, fifth part): the Welcome back
sheet is the one way back in after a break. It is offered from two weeks
away (it was one), and asks "Ease back in" or "Keep my old weights", with
easing back put first from three weeks. Easing back is a plan change on
the person's yes (`easeBackIn`): every loaded lift 10% lighter on its own
steps, or 20% after more than eight weeks away, by at least one step, and
climbing back a step a session to where it was (the drop's `lowered`
record, marked shown, so no line explains a choice the person made); a
bodyweight lift or hold as much shorter; one set fewer in the first week
back, kept through a week with no training in it; the miss counts reset.
`easingBack` on the plan counts the return's two weeks down by trained
weeks, and no calendar lighter week, nor one taken from Train in the first
week, comes inside them, as the precedence table says. It is a document
write like the rollover (ADR-0011's update): the load steps read equipment
the server has no copy of. The old "Start easier" route to the session
chooser is gone; "Easier today" stays on it for one-off days.

STATUS 2026-10-06 (Lift4 (11), build step 5, sixth part): each exercise in
a session has a menu beside its name, with "Swap for today" (offered until
a set of it is done) and "Skip". A swapped exercise takes the slot for the
session: the planned sets and reps, the weight it was last lifted at or a
start from the planned lift's (`swappedForToday`), and rows from its own
last sets; "Back to …" undoes it. Skipping keeps the sets done and sets
the rest aside, out of the counts and the cursor's way, until "Don't
skip". Finish asks once, before the save, whether to keep today's swaps
that have a set done: kept, a swap takes the planned lift's place in the
same slot, with today's sets as its first session; not kept, the plan's
lift stays as it was, since the swap's sets say nothing about it
(`applySessionProgression`). A kept swap is the person's choice, so it
carries no `swappedFrom`. Deleting the session puts the planned lift
back, and a correction replays the swap.

STATUS 2026-10-06 (Lift4 (7) and (14), build step 5, seventh part): each
saved session records whether a long or hard run (`isHardRun`) finished
in the 24 hours before it started (`afterHardRun` on the workout and its
stored progression, from `useHardRunBefore` on Train). A miss on a lift
that loads the legs (`loadsTheLegs`) in such a session counts half, so it
takes two of them to count as one miss; a correction replays the same
count. Everything else about misses is unchanged.

STATUS 2026-10-06 (Lift4 (10), build step 5, eighth part): with a race
plan, the race's final weeks are lighter for every level, whether or not
the week before was trained (`raceLiftWeek`, kept on the plan as
`raceWeek`). The last two weeks before the race, whatever the run plan's
taper, and the week after it have half the sets at the same weights. Race
week keeps the week's first session, its sets halved and each leg lift at
half its weight (stashed, so the week after gives it back), and skips the
others. They win over a calendar lighter week and over the weeks back
after a break without stacking on either, and the calendar's count starts
again after them: the week after the race takes the next multiple of 4.
The week after comes from the lifting's own mark that the week left was
race week, because logging the race moves the run plan into its recovery
at once. Train names them in the run plan's words ("Week 15 of 16 ·
Taper", "Race", then "Recovery"; a 5K or 10K's last build week reads
"Lighter week"), the banner and "Why this session" say what each is for,
and race week's names the day to lift by, three days before the race. That
day is copy, not a rule: nothing stops a later session. Known limit: the
week strip shows race week's skipped days as planned until each day comes,
as it does any skipped session (the future-day rule in
`trainingResolver.ts`).

### Contemporary evidence checkpoints

| Source                                                                                                             | Safe product implication                                                                           | Limitation                                                                |
| ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| [Ramos-Campo et al., split versus full-body resistance training (2024)](https://pubmed.ncbi.nlm.nih.gov/38595233/) | When work is comparable, let frequency, recovery, preference, and schedule determine split choice. | It does not validate every Tropos split or prescribe volume.              |
| [Robinson et al., estimated proximity to failure (2024)](https://pubmed.ncbi.nlm.nih.gov/38970765/)                | Preserve effort as one useful signal; do not require failure or fixed RIR by default.              | Intervention-level RIR estimates do not identify an individual's optimum. |
| [Huiberts, Wüst, and van der Zwaard, concurrent training (2024)](https://pubmed.ncbi.nlm.nih.gov/37847373/)        | Surface lifting/running trade-offs as context-dependent choices.                                   | Evidence remains incomplete for hypertrophy and highly trained people.    |

## Current remote-main architecture

| Concern                  | Primary paths                                                                                                                                           | Current meaning                                                                                                                                                                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Persisted programme      | src/features/program/programTypes.ts                                                                                                                    | ProgramState holds the rolling lift state; ProgramExercise holds stable instance identity, prescription, rep unit/range, progression state, and history.                                                                                                         |
| Plan construction        | src/features/program/planBuilder.ts and programEngine.ts                                                                                                | buildPlan composes profile, schedule, lift programme, and run plan. It preserves any existing same-day-count plan on content edits; cold start, a day-count rebuild and an explicit reset run the procedural generator, which builds every new plan (Lift4 (5)). |
| Templates and selection  | templates (no longer start plans), matchTemplate (the injury and equipment filters), variationBank, startingLoads, injurySubstitutions, experienceModel | Exercise identity, equipment fit, calibrated load, and history preservation are high-risk boundaries.                                                                                                                                                            |
| Volume and recovery      | volumeModel, muscleTaxonomy, overlapModel, adjustmentRule                                                                                               | The system uses auditable muscle accounting and recovery/overlap controls. Internal MRV-style labels are product heuristics, not a diagnosis or measured personal physiology.                                                                                    |
| Block lifecycle          | trainingBlock, represcribe, useProgram, server command reducers                                                                                         | An active block temporarily owns the lift prescription and is reversibly released through the command boundary.                                                                                                                                                  |
| Commands and persistence | programCommandClient, commandOutbox, useProgram, functions/index.js, functions/lib/programCommands.js                                                   | Most interactive programme mutations now use optimistic command application, durable outbox handling, rejection rollback, and authoritative refetch.                                                                                                             |
| Session and progression  | WorkoutSession, useProgram, programEngine, sessionCompletion, workoutCompletion                                                                         | Completion, effort, progression, history, and persistence must stay semantically aligned; progression runs only in the client, inside the completion transaction.                                                                                                |

## Current remote-main behavior to preserve

### Vocabulary that must not be conflated

| Concept                       | Durable owner                                                           | Allowed product meaning                                                                            | Must not substitute for                                                                           |
| ----------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Nutrition phase               | Goal/profile state                                                      | Cut, recomp, or lean-bulk context that may influence the plan.                                     | Standing lifting focus, active block, or recovery status.                                         |
| Standing lifting focus        | primaryGoal/programme configuration                                     | The long-lived strength, hypertrophy, fat-loss, general, or running-support intent.                | A nutrition phase or an automatically active specialization block.                                |
| Active block focus            | Training-block state and command lifecycle                              | A temporary, reversible prescription emphasis with recorded start/release history.                 | A permanent goal change, diagnosis, or stale saved snapshot.                                      |
| Lifecycle and recovery status | Programme lifecycle fields, deload/recovery state, and typed view model | A truthful explanation of the current plan/recovery action when the underlying recipe supports it. | A generic Hypertrophy label, nutrition phase, or evidence of personal fatigue physiology.         |
| Experience tier               | Profile/programme experience model                                      | Complexity, coaching autonomy, and appropriate exercise/effort options.                            | A fixed ability score, a personal volume landmark, or permission for automatic high-risk methods. |

### Goals, splits, and tiering

- Goal is the nutrition phase: cut, lean bulk, or recomp. Primary goal is the
  lifting stimulus: strength, hypertrophy, fat loss, general, or running.
  Never conflate the two.
- Current procedural split policy is frequency-led: one, two, and three lift
  days use full body; four uses upper/lower; five uses PPL plus upper/lower;
  six uses PPL twice. Zero means a run-only configuration. A preferred split is
  not a license to violate this generated baseline.
- Strength mains use a 5-7 band with 8-12 accessories. Hypertrophy, general,
  and fat-loss use 8-12 mains with 12-15 accessories. Running support uses
  4-6 mains with 10-12 accessories and reduced lift volume. These are current
  Tropos base policies, not book-mandated universal prescriptions. For
  intermediate and advanced plans, automatic day roles can shift final
  rep targets by plus or minus two; treat the bands as anchors, not every
  final row's exact output.
  STATUS 2026-10-05: a new plan's bands are the Lift4 role table's now; see
  the build step 4 STATUS under the conservative response ladder.
- Beginner, intermediate, and advanced tiers gate complexity and coaching
  autonomy. Advanced work may use more appropriate variants and RPE; that does
  not mean an indiscriminate volume increase.

### Prescription, volume, and lifecycle

- A fresh plan opens at its base shape. For trained weeks, the calendar cadence
  is a starting policy: accessory shape moves around base minus one, base, and
  base plus one, while recovery signals can override the calendar.
- The current every-fourth-trained-week deload is a Tropos heuristic, not a
  book-mandated cadence. Treat any revision as an explicit product decision.
- An untrained week can advance the calendar anchor, but must not archive
  fictional training or advance mesocycle/deload work as if the user trained.
  Lift week keys protect pure-lifter rollover semantics.
- User-approved prescription edits outrank generated defaults. Update the
  lifecycle anchor read at rollover, such as baseSets, or persist an explicit
  override so a later week cannot silently erase an edit. A missed or partial
  lift must not create catch-up sets, compressed split scheduling, or
  accelerated progression; resume the ordinary sequence/dose or offer an
  explicit rest/replan choice.
- The volume model now uses one-to-one primary and secondary credit with
  per-exercise deduplication, fine-muscle attribution, canonical display
  rollups, and a 14-group judgement layer. Its bands are transparent heuristic
  priors, not individualized MEV/MAV/MRV claims.
- The generator accounts for direct calf and side-delt work and avoids
  double-counting one physical set inside a canonical bucket. Preserve this
  accounting when changing exercise data or volume policy.
- The recovery rule can react to repeated regression by reducing
  muscle-local work or escalating to a whole-programme deload, while
  persisting recoveringMuscles. It must remain explainable as a conservative
  Tropos heuristic, not a personal MRV measurement or medical judgement.
- Before changing recovery or block behavior, record one precedence table for
  manual deload, local/whole-programme recovery, calendar shaping, and block
  pace. Do not silently stack reductions from multiple owners in one week.
  The table must identify the source of user copy, what is reversible, and
  whether completed work is immutable.
- Training blocks are not merely metadata. Starting a block applies a
  sanctioned focus-and-pace prescription transform; release restores the
  standing focus without resetting the current truthful loads or erasing
  history. Block history records what happened.
- A focus-changing block retains days, exercise identities/instance IDs,
  history, and truthful current calibration. It may re-prescribe non-seconds
  target/range/progression and safely reduce load when a higher target needs
  it; target-specific failure counters reset. Timed holds are not
  repetition-represcribed. Release applies the standing focus forward rather
  than restoring a stale snapshot. A same-focus/full block must not cause a
  hidden prescription change, and easing copy must name the exact recipe
  effect before confirmation.
- A permanent primary-goal change with unchanged lift-day count still preserves
  existing workouts. Do not mistake the temporary block re-prescription path
  for a decision to silently rebuild every saved programme.

### Lighter-week precedence (Lift4, 2026-10-05)

The precedence table asked for above, for the system the owner locked as
Lift4 (plan file row Lift4). Its code lands in build step 5; until then the
current owners run as this document describes. It lists every way the plan
gets lighter, which wins when two meet, where the person's copy comes from,
and what can be undone. Completed sessions are never changed: a lightening
applies only to sessions not yet done.

| Owner, in precedence order                                                                                                                  | What it changes                                                                                                                                                    | When it meets another                                                                                                                          | Copy                                                            | Undo                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------- |
| Race weeks: the last two weeks before a race, race week, and the week after                                                                 | Half the working sets at the same weights; race week is one short session at least three days before the race, nothing heavy for the legs; the week after is light | Wins over every other week-level lightening. The calendar lighter week doesn't run inside it, and its count restarts after the race            | The run plan's own phase name on the week                       | None; a heavier weight lifted still moves the plan up               |
| Coming back after a break ("Ease back in" in the Welcome back sheet)                                                                        | Loads 10% lower after 3–8 weeks away, 20% after longer, one set fewer in the first week; then each lift climbs back a step a session to where it was               | Yields to race weeks. Replaces a calendar lighter week due in its first two weeks: the break was the rest                                      | The Welcome back sheet, where the person chose it               | "Keep my old weights" in the sheet; the plan follows what is lifted |
| A lighter week the person takes ("Take a lighter week")                                                                                     | Half the working sets at the same weights for the rest of that week                                                                                                | Yields to the two above. Counts as the calendar lighter week and restarts its count                                                            | "Lighter week" on the week                                      | Within the week                                                     |
| The calendar lighter week: intermediates and up on 3+ lift days, every 4th trained week; with a race plan, on the run plan's step-back week | Half the working sets at the same weights                                                                                                                          | Yields to all of the above. Never two lighter weeks in a row outside a race period                                                             | "Lighter week" on the week; the week before, "Why this session" | None; a heavier weight lifted still moves the plan up               |
| Race build leg trim, agreed at race setup                                                                                                   | Leg sets down by a third through the build, at the same weights                                                                                                    | Inside any lighter week the lighter-week recipe applies to the base sets instead, so the two never stack                                       | "Race build" on the week                                        | The race-setup answer, changeable in the run plan settings          |
| A lift's drop after two misses in a row                                                                                                     | That lift 10% lighter, by at least one step, then back up a step a session                                                                                         | A miss doesn't count inside a lighter week, race weeks or an Easier today session; miss counts reset after any lighter week and after a return | One line on that lift's next session                            | Type the old weight; the plan follows                               |
| Easier today, one session                                                                                                                   | One set fewer and loads × 0.85 for that session                                                                                                                    | Can run inside any of the above. Never moves the plan down                                                                                     | The session's own label                                         | Not needed: one session                                             |
| Block pace (Lighter, Easing back in)                                                                                                        | The short session offered first; easing holds progression for the block's first two weeks                                                                          | Runs alongside; a lighter week inside a block applies as normal                                                                                | The block's consequence line                                    | End the block                                                       |

One week-level lightening runs at a time, in the order above, and never two
in a row outside a race period. The numbers to restore are saved once, by
the first lightening, and a later one never overwrites them (today a second
deload in a row overwrites the first one's stash, so the prescription from
before them is never restored). A lift's drop is per lift and starts only
once a week-level lightening has ended. Lift4 (13) retires four reduction
owners outright, so none appears here: the muscle-local recovery reduction
("Eased this week"), the whole-body escalation, the adjustment rule and the
fatigue shave.

### Command and mutation boundary

- The canonical program-command transport is a bare command object. The server
  tolerates the historical wrapped form only for rollout compatibility. Keep
  the sender contract bare.
- ProgramState/sanitizer key parity is mechanically protected, including
  plateauResponses. Every new persistent ProgramState field must be represented
  at each required normalization, validation, sanitizer, reducer, migration,
  and transaction boundary.
- New interactive mutations should use the command path. Existing direct
  snapshot writes are deliberate exceptions, including workout-completion
  full-state batches, lift/run rollover, run regeneration/realignment, and
  the current reorder-rejection fallback. A new direct snapshot write needs a
  named owner, an explicit precedence/conflict reason, and tests showing no
  hidden-field loss.
- The server's progression copy, `functions/lib/progressionEngine.js`, ran
  only inside the `logExercise` command, which no client had sent since
  progression moved to the finish (`applySessionProgression` inside
  `commitWorkoutCompletion`). Classified for Lift4 at build step 0 and
  retired at the start of build step 3 (2026-10-05): the command, that copy
  and the easing-block hold's server copy (`progressionHold.js`) are gone
  with their parity tests, so the client engine is the only copy the
  progression changes touch. ADR-0008 records it.

## Status ledger

### Resolved at the target SHA

| Item                      | Current result                                                                                                  | Preserve                                                                                                 |
| ------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Command envelope          | The client sends the bare command shape; the callable accepts the legacy wrapper only for compatibility.        | Do not reintroduce a required wrapper or fork command serialization.                                     |
| Plateau-state persistence | plateauResponses is sanitizer-allowed and ProgramState/sanitizer parity is tested.                              | Extend parity whenever durable programme state grows.                                                    |
| Block focus lifecycle     | Start/release are server-owned command transforms with reversible focus handling.                               | Preserve exercise identity, history, and truthful current load through block changes.                    |
| Split and volume upgrades | Low-frequency full-body policy, goal-aware rep bands, 1:1 volume currency, and muscle taxonomy are implemented. | Treat their numbers as current product policy subject to explicit change, not as accidental boilerplate. |
| Run-support lifting       | Running primary goal has a strength-oriented, lower-volume lift prescription.                                   | Coordinate with the running plan rather than overwrite it.                                               |

### Open correctness work

Issue IDs make the work list durable across Claude sessions. (Renamed from
`LIFT-0x` at integration — this repo's 2026-07-10 programme audit already
uses that vocabulary for unrelated issues.) Re-verify each
one at the target SHA before changing it: **ready correction** means the
documented behaviour can be repaired without choosing a new product policy;
**owner decision** means Claude must obtain/record a decision first.

STATUS 2026-08-09 (integration re-audit, base `52c2f02`): LIFT-EV-02
CONFIRMED open — `planBuilder.ts` still falls back to
`currentPhase: "Hypertrophy"` for a fresh build (~line 537-540).
LIFT-EV-03 RESOLVED in the integrating PR (#1886): both deload paths
already shared the tier-split recipe (`programEngine.applyDeload` ↔
`functions/lib/deloadEngine.js`, backlog #8), so the defect had narrowed
to the copy — `DeloadBanner`'s active state now derives its sentence from
the experience tier (beginner/unknown: "lighter weights"; post-novice:
"at the same weights"), with a four-tier mutation-safe test matrix;
residue: the stale `−1 set, ×0.85` recipe comment at
`functions/lib/programCommands.js:1520` (comment-only, left for the next
functions-touching PR). LIFT-EV-07 CONFIRMED present —
`startingLoads.ts:75` still applies `sex === "female" ? 0.75 : 1`,
documented in-file; the owner decision remains open. LIFT-EV-01, -04,
-05, -06, -08 were NOT re-verified in this pass — trace before acting.

STATUS 2026-08-09, owner-decision session (PR #1886): LIFT-EV-02
DECIDED and RESOLVED — the phase label derives from the primary goal.
Implementation honors the engine's real vocabulary: `planBuilder` now
initializes `currentPhase: "progression"` (the value rollover already
writes; "Hypertrophy" only ever survived week 1), and Home's header
renders `primaryGoalLabel(primaryGoal)` with the deload lifecycle state
overriding — a strength plan can no longer read "Hypertrophy phase" in
any week. LIFT-EV-07 DECIDED — RETAIN AND FENCE: the 0.75 female
starting-load factor stays (removing it would RAISE first-session seed
loads for female users — a safety regression), bounded in writing to
cold-start seeding only; it must never expand into sex-based
programming and is superseded the moment any real capacity signal
exists for the user. Full unit suite green after both changes.

STATUS 2026-10-03: LIFT-EV-02's label still derives from the primary
goal, now in Settings' words. Train's week row (`liftWeekLabel`) uses
`focusLabel` with or without a block ("Week 3 of 4 · Build muscle"),
where it said "Hypertrophy" outside a block and "Build muscle" inside
one, beside a block picker offering "Build muscle". `primaryGoalLabel`
had no other display use left and is gone.

STATUS 2026-08-09 (second batch, owner delegated the choice):
LIFT-EV-05 DECIDED, implementation owed — automatic protective
reductions stay, but they must be SURFACED: a banner (DeloadBanner
pattern) with honest copy that does not cite MRV/landmark science the
engine doesn't implement, plus a one-tap undo restoring the
undiminished prescription. LIFT-EV-06 DECIDED, implementation owed —
a same-frequency primary-goal change offers a visible keep-or-
represcribe choice reusing the existing training-block transform;
never silently automatic in either direction. Neither is shipped;
each is a bounded feature PR with its own design surface.

STATUS 2026-08-09, later same session — BOTH SHIPPED (PR #1886).
LIFT-EV-05 RESOLVED: `RecoveryReductionBanner` (Program page, next to
the deload banner) names the halved muscles with factual trigger/change
copy and no physiology claims; `revertRecoverySession` is the pure
inverse (restores sets/reps from the stash, drops `preDeloadReps`);
`undoRecoveryReduction` persists it via the standing ADR-0011
document-write path. Reversal semantics as decided: `recoveringMuscles`
is KEPT on undo, so the refractory guard holds and the trigger cannot
re-fire for the same muscles next rollover. Known residue, deliberate:
the whole-body escalation still writes no discriminator — it remains
indistinguishable from a calendar deload in state, and the deload
banner covers its visibility; adding a marker field was judged not
worth the sanitizer/type surface until someone needs the attribution.
LIFT-EV-06 RESOLVED: `focusChangedSameFrequency` in ProgrammeSettings
gates a two-action confirm ("Save and update sessions" via
`represcribeWorkouts`, or "Save, keep current sessions"); neither is
default. Undo semantics as specified: the transform is invertible by
re-application, so changing the focus back re-offers the choice in the
opposite direction — no snapshot kept. Note the client-side seam adds
a prescription-writing path through `configurePlan` (the legacy
full-document exception); if the command boundary ever closes over
configurePlan, this belongs in a `represcribeFocus` command reusing
the existing `functions/lib/represcribe.js` mirror.

STATUS 2026-10-05 (Lift4 owner call (3), build step 5): LIFT-EV-05 is
REVERSED. The automatic protective reductions are retired rather than
surfaced: the per-muscle recovery session ("Eased this week", with its
banner and undo) and the whole-body lighter week it escalated to are gone
with `recoveryTrigger.ts`. A lift that keeps missing is lowered by the
progression rule (two misses, 10% lighter), and a lighter week comes on the
calendar or from Train. `recoveringMuscles` stays declared and unread; the
rollover drops a stored one.

STATUS 2026-08-09, merge-cascade close-out (PR #1888, merged to main):
LIFT-EV-01 RESOLVED — all four consecutiveFailures decrement sites
(double/linear × bodyweight/weighted, client programEngine + server
progressionEngine mirror) gained the seconds branch: bodyweight timed
holds shorten by HOLD_STEP_SECONDS to a named MIN_HOLD_SECONDS floor
(10s); weighted holds deliberately keep cutting load at held duration.
Client and server changed in one commit; the ~124k-case
applyProgression cross test enforces the mirror.

| ID / state                        | Issue                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Required outcome                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| LIFT-EV-01 — P1, ready correction | Timed-hold repeated failure is still repetition-shaped in the client and server progression mirrors. First trace: programEngine, progressionEngine, and their cross/engine tests.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Define a seconds-specific decrement and floor; test linear and double paths, range caps/floors, history, labels, and client/server parity.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| LIFT-EV-02 — P1, ready correction | A fresh build still initializes currentPhase to Hypertrophy regardless of primary goal. First trace: planBuilder, programme types/labels, and plan-builder/migration consumers.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Separate goal, block focus, nutrition phase, and lifecycle status, or render a typed neutral view model. Audit every consumer so a strength plan cannot receive a false label.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| LIFT-EV-03 — P1, ready correction | Manual-deload copy promises lighter weights even when the selected recipe may hold load and reduce sets/reps. First trace: DeloadBanner and the client/server deload recipes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Derive copy from the active recipe or use truthful neutral language. Test beginner, intermediate, advanced, and timed-hold views.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| LIFT-EV-04 — P1, owner decision   | The command boundary is intentionally incomplete because retained full-snapshot writes can race command or lifecycle writers. First trace: useProgram, program-command client/outbox, and server command lifecycle.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Document each exception's owner and precedence; test client command applied, queued, rejected, and refetched paths plus stale-device/outbox interleavings.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| LIFT-EV-05 — P1, owner decision   | Two-session regression is internally labelled MRV and can automatically reduce a local muscle or escalate to a whole-programme deload. First trace: programEngine, easierToday/recovery helpers, and recovery-trigger tests.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Make the trigger, user copy, recovery choice, and reversal semantics explicitly reviewable; preserve recoveringMuscles and test local/whole-body, trained/untrained, and client/server paths. Do not claim individual physiology.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| LIFT-EV-06 — P2, owner decision   | A same-frequency permanent goal change does not offer a user-visible prescription rebuild decision. First trace: planBuilder, Programme Settings, and existing plan/history preservation tests.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Decide whether to offer it. If approved, specify identity, calibrated load, history, active-session, migration, and undo semantics before code.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| LIFT-EV-07 — P2, owner decision   | Starting-load logic currently applies a sex-based 0.75 factor for female users while all other values use the default factor. First trace: startingLoads and its tests.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Make retention, revision, or removal an explicit calibration/fairness/safety decision. Never silently change saved loads, and do not expand this into deterministic sex-based programming.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| LIFT-EV-08 — P2, owner decision   | The first fresh plan's base shape is a product default, not demonstrated individual capacity. First trace: planBuilder, programEngine, and onboarding/template entry paths.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | If changing it, collect only explainable, consented inputs and retain safe no-data fallbacks. Do not infer a personalized volume landmark from one signal.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| LIFT-EV-09 — P1, owner decision   | MEASURED 2026-08-11, not inferred. One of `shouldRecommendDeload`'s three branches cannot fire for any real user. Driving `scorePerformance` from aggregates across 345,600 realistic weeks: the recovery branch hits 13,242 times, the sustained-overreach branch 33,973, and `PI >= 70 && adherence < 50` — commented "High load with poor adherence (burning out)" — ZERO. It is self-defeating: workout adherence dominates `adherenceScore` (`min(sessions/target, 1.2) * 100`), so the high load the branch requires drives adherence UP. Six lifts plus five runs on 1200 kcal against a 2500 target scores 73; the floor with protein missed too is 61; the gate is 50. Related and pinned alongside: logging NO food scores adherence 100, better than diligently logging a bad week, because `computeAdherenceScore` omits absent factors rather than penalising them. First trace: `src/lib/__tests__/deloadTriggerReachability.test.ts` (both engine copies), `functions/lib/perfScoring.js`.                                  | Decide whether the branch should be retuned, re-keyed, or removed — all three are defensible and none is mine to pick. Note the applied rule says deloads key off "completed work/repeated regression/user feedback", and the non-adoptions bar "evidence of personal fatigue physiology"; a nutrition-logging proxy is neither, which is an argument for removal rather than a lower threshold. The gap is bounded: the sustained branch catches the same persistently-hammering athlete one week later. If the scoring changes instead, the pinned floor tells you when the branch wakes up — it is recorded as a measurement, NOT asserted as never-fires, precisely so it cannot be locked in. STATUS 2026-08-11 — the bounded-gap argument above is now WEAKER, and the decision should be made against this. PR #1955 changed the sustained branch to fire on the TRANSITION into overreach rather than on the state, because a rolling-baseline PI holds a steadily-improving athlete above the line permanently (a 2.8%/week improver drew a recommendation 25 weeks out of 26 — `deloadNagLoop.test.ts`). The persistently-hammering athlete this row leans on is therefore still caught, but ONCE, at the crossing, instead of every week while they keep hammering. That removes the repetition the mitigation implicitly relied on, and it strengthens the argument for REMOVING the adherence branch rather than retuning it: the fuelling signal it was reaching for now has no other weekly voice. Nothing here is decided — the three options are still all defensible and still not mine to pick. |
| LIFT-EV-10 — P1, owner decision   | MEASURED 2026-08-11. A week containing only ONE discipline caps at half the load score, whatever was done in it — `computeLiftLoadScore` returns 0 for zero sessions and the halves are weighted 0.5/0.5. On a recomp goal with perfect recovery and adherence, 70 km and 110 km of running with no lifting BOTH score PI 68, band "moderate". Three consequences: the score saturates and stops distinguishing those weeks; the copy is wrong ("moderate" → `getVerbState` "cruising" → "Steady" on the Home hero); and no deload can ever be offered, since both live triggers gate on PI >= 80 and the ceiling is 68 on a recomp, 58 on a lean bulk — where the goal-aware weighting tilts load TOWARD the missing discipline. This is NOT the run-only user segment GLOSSARY.md rules out as a chosen non-goal; it is a supported hybrid user having a single-discipline WEEK (marathon peak block, injury, travel), and the PI is a weekly score. First trace: `src/lib/__tests__/singleDisciplineWeek.test.ts` (both engine copies). | Decide whether the load weighting should renormalise onto the trained discipline when the other has no sessions. That would fix all three and make the engine internally consistent — its two halves currently use OPPOSITE conventions for missing data, load scoring absence as zero while adherence omits it — but it also raises the PI of every athlete who skips a discipline for a week, which is a training-policy call. The pinned tests are calibrated for this: applying the renormalisation fails 10 of the 16, so its full blast radius is visible immediately rather than only the intended effect.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

## Evidence-informed decision queue

| Priority | Candidate decision                                           | Guardrail                                                                                                                          |
| -------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| P1       | Make tier policy legible in product copy and tests.          | Preserve complexity/autonomy framing; do not blanket-gate volume.                                                                  |
| P1       | Improve the observed-performance progression loop.           | Never progress after unsafe substitution, pain boundary, missing completion data, or unusable effort data.                         |
| P1       | Finish command/direct-write ownership boundaries.            | Do not half-migrate fields or treat parity as a substitute for live concurrency behavior.                                          |
| P1       | Improve the block-end review.                                | Offer bounded choices such as continue, release, adjust, or easier week; do not auto-diagnose fatigue or silently rewrite history. |
| P2       | Improve transparent volume review.                           | Surface understandable bands and uncertainty; do not claim exact personal landmarks or use opaque physiology scores.               |
| P2       | Improve run/lift coordination advice.                        | Flag trade-offs and offer choices; never silently delete, stack, or weekday-pin lifts.                                             |
| P2       | Add optional session-quality guidance.                       | Keep rest, order, ROM, tempo, and effort cues plain-language and non-punitive.                                                     |
| P3       | Add outcome instrumentation before advanced personalization. | Every recorded signal must support a visible user decision and have an honest no-data fallback.                                    |

## Explicit non-adoptions

Do not add the following merely because they appear in a source:

- universal weekly set targets, muscle frequency, automatic weekly set
  additions, or exact personal volume landmarks;
- a new universal fixed deload cadence. The current every-fourth-trained-week
  Tropos policy is a heuristic requiring explicit review, not a source mandate;
- failure-by-default, AMRAP testing, daily maxes, test-day maxes, competition
  peaking, percent-of-one-repetition-max programming, velocity training, or
  power-athlete monitoring as ordinary defaults;
- new mandatory DUP, PPL, six-day lifting, weekday-pinned lifts, or automatic
  calendar-driven exercise rotation beyond the current limited, tier-aware
  day-role variation;
- BFR, bands/chains, flywheels, eccentric overload, drop sets, rest-pause,
  supersets, partial-ROM work, or other advanced methods as regular defaults;
- new deterministic programming from sex, age, genetics, or assumed response.
  The existing sex-based starting-load factor is a separately documented
  active cold-start heuristic needing explicit review, not a justification to
  generalize sex-based rules;
- rehabilitation, medical clearance, injury prediction, or an overtraining
  diagnosis; or
- silent rewrites of saved prescriptions, historical loads, or exercise
  identity.

## Claude Code implementation contract

Before code, record the following for one bounded slice:

| Field                   | Required content                                                                                               |
| ----------------------- | -------------------------------------------------------------------------------------------------------------- |
| Evidence principle      | Paraphrase plus book chapter/page or review reference.                                                         |
| Current behavior        | Exact target SHA, paths, fields, caller, and affected users.                                                   |
| Product decision        | What Tropos will intentionally do.                                                                             |
| Non-goal                | What the source says that Tropos will not import.                                                              |
| Ownership and migration | Persistent fields, client/server owners, normalization, sanitizer, reducer, migration, and concurrency impact. |
| User journey            | Entry UI to stored/refetched state to next session or week.                                                    |
| Validation              | Tests and concrete visible scenarios, including a negative or mutation check where practical.                  |

Any new measurement or personalization signal needs a user-visible purpose,
consent and no-data fallback, a durable owner, and proof that it cannot
silently alter an existing saved prescription.

Completion is fail-closed:

1. State the target SHA, owner decision, non-goals, and rollback/migration plan.
2. Trace the real user path: UI, hook/client, persistence or server reducer,
   refetch/rollover, and next session/week.
3. Update all crossed boundaries together: types, normalization, validation,
   sanitizer, reducer, migration, copy, and tests.
4. Include a real caller/component or cross-boundary regression, not only a
   new helper test.
5. Verify saved and refetched state plus the relevant lifecycle transition.
6. Run focused tests, npm run verify, and git diff --check. Confirm no source
   assets or temporary extracts are staged.

## Required verification matrix

Apply the relevant parts of this matrix to every lift-programming change.

| Dimension             | Minimum cases                                                                      |
| --------------------- | ---------------------------------------------------------------------------------- |
| Tier                  | beginner, intermediate, advanced, unknown/legacy where relevant                    |
| Primary goal          | strength, hypertrophy, fat loss, general, running                                  |
| Lift frequency        | zero through six requested days where affected                                     |
| Nutrition phase       | cut, recomp, lean bulk when prescription changes                                   |
| Equipment/constraints | full gym, home/minimal, substitution/injury-boundary paths                         |
| Programme history     | fresh, template-derived, regenerated, and history-bearing                          |
| Identity/load         | same movement, same-category variation, cross-category, bodyweight/loaded boundary |
| Prescription          | main/accessory, reps, seconds, range, rest, baseSets                               |
| Failure               | first, second, third failure; weighted/bodyweight/timed-hold client/server parity  |
| Lifecycle             | trained and untrained weeks, deload, recovery, start/release/end block             |
| Scheduling            | split order, schedule edit/override, week-wrap adjacency, date-pinned runs         |
| Session flow          | warm-up, working sets, effort timing, completion, PR/history effects               |
| Persistence           | normalization, migration, callable validation/sanitizer/reducer, state parity      |
| Concurrency           | queued/rejected/refetched command and retained direct-save interleavings           |

Start with the relevant engine, plan-builder, experience, volume, overlap,
variation, starting-load, migration, command-envelope, command-parity, server
sanitizer, Programme Settings, and WorkoutSession tests. Add a genuine session
integration test when changing logging, warm-ups, PRs, effort capture, timed
holds, or completion behavior.

## Owner decisions still needed

1. Should a permanent primary-goal change offer a visible re-prescription
   option when lift frequency is unchanged?
2. Which direct snapshot writes remain exceptions, and what conflict policy
   protects them against command and lifecycle writers?
3. Which lifecycle concept belongs in user-visible phase copy, separate from
   nutrition, primary goal, and training-block focus?
4. Should a block-end review ask a short recovery question, and which choices
   are recommendations versus automatic action?
5. How should transparent volume review evolve without creating a false
   personal-volume algorithm?
6. What run/lift priority information is worth collecting before offering
   scheduling or recovery advice?
7. Should repeated regression remain an automatic recovery action, and what
   user-visible review/undo language keeps its MRV-style label honest?
8. Should the existing sex-based starting-load factor be retained, revised, or
   removed, and what calibration, fairness, and saved-load transition policy
   supports that decision?

## Final instruction

Use evidence to improve the questions Tropos asks, the choices it presents,
and the safety and clarity of its decisions. Preserve history, identity, load,
schedule, local-date semantics, and honest completion state. Prefer a small
end-to-end improvement with real-path tests over a large theory-driven rewrite.
