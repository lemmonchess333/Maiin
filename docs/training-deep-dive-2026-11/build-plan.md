# Build plan: the lifting session, built to its minutes

11 November 2026. What follows Lift21 (#3190) and Pgm9 (#3189). Each slice is
one PR or a short run of them, and each PR that changes what is built carries
its printed panel.

## What the owner sees, and when

| After   | On his phone                                                                                                           |
| ------- | ---------------------------------------------------------------------------------------------------------------------- |
| Slice 2 | Settings, Programme, Reset gives the new week. On the web build at once; in the iOS app with the next TestFlight build |
| Slice 4 | Train says when a day runs far past its length and offers the rebuild itself. His 12-lift Pull A is the first case     |
| Slice 5 | The minutes on each day match what his saved sessions took                                                             |

## Slices

### 1. Prove the rules on every split, in prints

STATUS 2026-11-11: done. `panel-2-every-split.md` holds the result: all 96
setups pass, and six refinements to the rules came out of reading the prints.

A pure module that sizes a day from an ordered list (`Lift21` calls 1 to 5),
with no production caller, and a harness that prints the panel: 3, 4, 5 and 6
days; 30, 45, 60 and 75 minutes; beginner and intermediate; Build muscle,
General fitness and Get stronger. Beside each print, what main builds.

Done when every print meets these, checked in the harness:

- no day over its time on the engine's clock (45-minute leg days excepted
  until slice 5, at no more than 4 minutes over);
- no day under 85% of its time while its list has lifts left;
- no lift under 3 sets for a non-beginner outside a 30-minute day;
- paired days within one lift of each other;
- each kind of day holds what call 4 says.

### 2. The builder makes those weeks

- Day lists in `programEngine.ts` rewritten as ordered slots with a place
  (main, second, support), for full body, upper/lower, push/pull/legs and the
  five-day mix.
- `roleTable.ts`: 4 sets on the main lift from 60 minutes.
- `sessionFit.ts`: lifts come off the end before sets are cut; the old order
  goes, with its tests.
- `volumeModel.ts`: `SECONDARY_SET_WEIGHT` to 0.5; the ceiling drops
  (`extraPastCeiling`, `accessoriesPastCeiling`, the hinge drop) leave the
  builder. A new ADR records it over ADR-0010.
- Day roles apply only to a lift that is a main lift twice in the week.
- The golden sweep is replaced by the panel's prints, with an under check
  beside the over check. A six-day lifter joins the simulator's personas.
- STATUS lines on Lift4, Lift9, Lift10, Lift11, Lift12 and Lift17; the lifting
  handoff and `GLOSSARY.md` updated.
- New plans only. A plan a person has is untouched.

Risks: the simulator's ratchets were fitted to the old volumes and will move;
each move is explained in the PR or the change is wrong. Injury and kit swaps
must still leave no contraindicated lift (8,640 plans in the sweep).

### 3. The defects that need no decision

From the README's step 1, as small PRs beside slice 2: an added lift's first
weight, the lower-back swaps, the bodyweight cap, one-rep ranges, the lifting
taper in the week a plan is made, lift order chosen last, and one weight for a
lift held on two days.

STATUS 2026-11-12, #2 (the lower back): the rack pull and the kettlebell
swing are off the lower-back lists; crunches, the cable crunch, the decline
sit-up and the hanging leg raise are ruled out for a sore lower back, with the
dead bug, the Pallof press and the planks in their place; a lift swapped in for
an injury starts at 70% of its seed (`INJURY_SWAP_LOAD_SHARE`); and a swap
across units (a hold for a lift counted in reps) takes numbers in its own unit.
Over 2,700 lower-back plans the heaviest hinge went from 102% of the deadlift
the same person would get to 71% (`lowerBackPlans.test.ts`). The 8-12 range for
an injury swap goes with #5, which sets rep floors by lift type in the same
place.

STATUS 2026-11-12, #1 (an added lift's first weight): every loaded catalogue
lift the bank does not list has its own factor and category
(`catalogueLoads.ts`, 70 rows), so Add exercise, Replace and a session's add or
swap start it at its own weight: for an 80 kg intermediate man a 10 kg lateral
raise (was 32.5), a 25 kg leg extension (85), a 10 kg cable fly (62.5), a 20 kg
kettlebell swing (100), and conditioning at no weight (a treadmill was 35 kg).
A built plan's accessories keep the 0.3 they had, except the reverse flyes,
which go from 16 kg a hand to 5. `catalogueLoads.test.ts` walks the catalogue,
so a lift added later without a row fails. An added lift still counts as a
main lift (`isAccessory` unset); setting it from the lift's role crosses the
command boundary and is its own change.

STATUS 2026-11-12, #3 (first weights uncapped by bodyweight): a first weight
is scaled from no more than 90 kg of bodyweight, 70 kg for a woman
(`SEED_BODYWEIGHT_CAP_KG`). A 150 kg beginner man's first squat goes from 105 kg
to 62.5. No floor: a light lifter's light start corrects itself, and the plan
follows the weight lifted from the first session. Building pull-ups as a lat
pulldown above a bodyweight line is left for the level and kit work it belongs
with.

STATUS 2026-11-12, #13 ("Lighten leg sessions" where it changes nothing): setup
and Run plan offer the switch only where a yes takes a set, and say how many: "4
fewer leg sets a week, at the same weights" (`raceLegTrimCut`), where they said
"a third fewer" of plans whose two-set leg lifts lose none. The stored answer is
kept either way.

STATUS 2026-11-12, #14 (one lift, two weights): parked, not built. One
strength per lift (a session moves every day that holds the lift, each day's
weight from its own rep target) loops when the lift is truly weaker on one
day: the owner's squat is 85 kg × 10 on Pull A and 60 kg × 6 on Legs A, after
deadlifts, so each day's session would pull the other up and down. Two weights
can be right; what is unexplained is Legs A's fall to 47.5 kg, below the 60 kg
lifted there, which needs the stored plan (`README.md` 2.1, item 3).

STATUS 2026-11-12, #7 (the lift order chosen too early): tried, not shipped.
Moving `orderForAdjacency` after the time fit breaks the six-day rotation
(Pull, Push, Legs, Push, Pull, Legs, where `programEngine.test.ts` holds the
two halves equal) and moves the simulator's coaching findings both ways: the
owner's marathon loses its chest-coverage finding and gains a barbell row
stall, the advanced man gains overhead press misses, the hybrid lighter week
trades its deadlift and RDL stalls for a leg curl stall. It changes what is
built, so it goes to the owner as a printed panel, perhaps with the order
limited to rotations of the builders' week.

STATUS 2026-11-12, #11 (a reorder costs sets at the rollover): the cause has
moved. Lift22 pairs a 30 or 45 minute plan's last lifts, and moving one of a
pair to the front breaks the pair, so the day prices the two apart and the
rollover read that as warm-ups that grew: over 256 plans and every single
move, 10 moves took a set for good (a 45 minute Pull day's curl moved first,
13 sets to 12). The rollover now judges and re-fits each day with its pairs
together (`withPairsTogether`), so none; a day its weights outgrew is cut as
before. The warm-up case the deep dive found (a 60 minute day's lateral raise
first) no longer cuts at all since #1 gave the raise its own weight.

### 4. A kept plan that has outgrown its time

When a day prices at more than 125% of the session length, Train shows one
line with the day's real minutes and two choices: rebuild the plan for the
length, or keep the day as it is. A mockup comes first (DESIGN_GUIDE, pictures
before code). This is the deep dive's decision 5, taken as "ask".

STATUS 2026-11-12: built. The owner chose B from three mockups
(`docs/visual-audit/lift-day-outgrown-2026-11-12/options-a-b-c.webp`): a
notice under the day's card, not a row at the top of the list (A hid Start
workout) or a line inside the card (C). It shows on a day still to train,
in a plan fitted to a length, once the day prices past 125% of it
(`outgrownDay.ts`). "Rebuild for 45 min" asks first, then builds the lift
days again from the saved setup (`rebuildLiftDays` in `planBuilder.ts`) and
saves through `configurePlan` as the lift plan editor does
(`liftPlanRebuild.ts`, now shared by both). The week number, the history,
the lighter week and each day done or skipped this week stay
(`keepWeekProgress`), and a lift the person has trained keeps its weight
where the new day holds it. "Keep this day" is remembered on the device
for that day as it stands (`keptLongDays.ts`): adding a lift, or a new
length, brings the notice back. A plan from before plans were fitted to a
length still trims at Start and gets no notice.

### 5. The clock

Compare the estimator with saved sessions' durations and set its constants
from them (45 s a set, 60 s a warm-up set, 90 s a lift, the rests). Until then
no set is cut for a few minutes on leg days.

### 6. Running

Not part of Lift21. The marathon long run (decision 9) and starting from the
runner's own week (decision 10) come to the owner as printed seasons for his
own race, beside what main plans, before either changes.

## Lift22: supersets in short plans

STATUS 2026-11-12: built after panel 3 (`panel-3-supersets.md`) and the
owner's two calls the same day: calls 2 and 3 widened, and Train draws a
pair as its own block (B). New plans only.

## Not in this plan

Sets that rise through a block, a priority muscle, the split as a choice, the combined week (hybrid) and the watch.
Each is in the README's steps 2 to 5 and waits for its own decision.
