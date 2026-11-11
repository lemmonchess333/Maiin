---
Status: accepted
---

# Weekly bands judge a plan; they do not shape it

## Context

ADR-0010 published a weekly band per muscle and then made the generator
obey it: a reconciler trimmed sets down to each ceiling
(`reconcileToLandmarks`), a balancer added pulling sets until the week pulled
as much as it pressed (`balancePushPull`), and, where every slot was already
at its floor, a new plan let whole lifts go (Lift10, Lift12, with Lift17's
three-lift floor under them). Beside those ran the time fit (Lift4 (5),
Lift9, Lift11), which cut sets to two on every lift before it gave up a
lift.

The training deep dive of November 2026 measured what the two produced
together, over every split:

- 57% of the lifts in an intermediate's plan sat at two sets or fewer;
- a 60-minute day held 11 to 17 sets, where the programmes and apps read
  for the same hour hold 15 to 20;
- 25 of 216 days priced under 70% of the length the person had given;
- paired days of one week priced 57, 37 and 28 minutes;
- a six-day Build muscle week had 3 direct sets for the biceps and none for
  the rear delts, their bands met through rows counted one for one.

The owner's report was the same thing from the other side: many exercises,
two sets each.

Lift21 (owner-delegated, 2026-11-11) decides the shape: **time sets how many
lifts a day holds, and every lift it holds keeps its sets.** A band cannot
also shape that week. Trimming to a ceiling is what produced the two-set
lifts, and adding sets to meet a balance is what pushed a day past its
length.

## Decision

1. **No pass adds or removes a set or a lift to meet a band**, in a new plan
   or in a re-fit of one the person has. `reconcileToLandmarks`,
   `balancePushPull`, `balanceWeekVolume` and the ceiling drops
   (`extraPastCeiling`, `hingeAccessoryPastCeiling`,
   `accessoriesPastCeiling`) are removed. A day is sized by
   `sizeSessionsToTime` and re-fitted by `refitSessionsToTime`
   (`sessionFit.ts`), which share one rule for the sets a lift takes by its
   place in its day.

2. **What the balancer protected is authored instead.** Pulling keeps up
   with pressing (D-LIFT-3) through the builders' lists and the order each
   day gives lifts up in (`KEEP_RANKS`), and through one placement rule: a
   day's first pull takes its first press's sets. `sessionSizing.test.ts`
   holds it over the panel: no week without a pull, and compound pulling at
   0.7 of compound pressing or more from 45 minutes.

3. **The bands still judge.** The Weekly volume card reads each muscle
   against its band, widened at both ends to what a first plan of the same
   answers holds (`weeklyVolumeTargets`). So a plan the person has not
   touched never reads low or high, and what they add past both does.

4. **The counting stays one for one** (`SECONDARY_SET_WEIGHT = 1.0`), as
   ADR-0010's addendum of 2026-10-07 left it. Lift21's call 6 asks for an
   indirect set to count half in the plan's own tally. That is not built
   here: the bands are published for the one-for-one count, and nobody
   publishes per-muscle bands for the half count (the same addendum says
   why). It stays open, with the measurement below as its starting point.

## The measurement

The plan sweep (`planSweep.golden.test.ts`: 90 configurations, an
intermediate's hour-long sessions), before and after:

|                                          | Before | After |
| ---------------------------------------- | ------ | ----- |
| Configurations with a muscle over a band | 26     | 52    |
| Readings over a ceiling                  | 88     | 259   |
| Readings under a floor                   | 409    | 287   |

The readings over are fed by indirect sets: the triceps from presses, the
biceps, lats and rear delts from rows, the hamstrings from squats. A
six-day General fitness week at an hour reads 30 for the triceps at one for
one, of which 7 are sets of a triceps lift.

The panel (`sessionSizing.test.ts`: 2 to 6 days, 30 to 75 minutes, three
levels, three goals) holds the other side: no day over its length by more
than the fit's tolerance, none past beginner under 85% of it, and no lift
past beginner under three sets outside a half-hour day.

## Consequences

- **A built week can read over a band.** The D-VOL bound in the plan sweep
  moves from 26 to 52 on purpose, with this ADR in its history. It measures
  the gap between the bands and the week. It comes down when the bands are
  re-read for another count, never by cutting sets.
- **The small muscles lose direct work in short plans.** Time takes lifts
  from the end of a day's order, where the calf raise, the ab lift and the
  lateral raise sit. From the panel, an intermediate's direct slots a week:
  at 45 minutes no plan holds an ab lift and most hold no calf raise; a
  two- or three-day week holds none of the three under 75 minutes. Lift22
  (pairing a short day's last lifts as supersets) is the decision that
  brings them back.
- **A re-fit and a new plan come out alike again**, by one rule. A session
  length changed and changed back returns the sets it started with.
- **Day roles stop shifting reps in a built plan.** A role shifted a whole
  day two reps either side of the role table, which is where a pump day's
  12 to 17 curls came from. Every built session is moderate now. A plan
  built before keeps the roles it has.

## What this does not decide

- The count an indirect set takes in the plan's tally (Lift21 call 6).
- A plan the person already has whose day runs far past its length: it is
  re-fitted by sets alone, down to two, and never loses a lift (Lift7,
  Lift15). The deep dive's decision 5 is whether to offer a rebuild.
