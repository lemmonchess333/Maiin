# Panel 3: supersets in short plans (Lift22)

12 November 2026. Lift22's acceptance: printed weeks for 30 and 45 minutes
beside Lift21's, for the owner to look at before pairs are anyone's default.
Run on 48 setups: 3, 4, 5 and 6 days; 30 and 45 minutes; beginner and
intermediate; Build muscle, General fitness and Get stronger. Full gym, 80 kg,
main at `719d61ef`.

The prototype is `harness/zzLift22.scratch.test.ts.txt`. It has no production
caller. It wraps the session clock so a pair is priced as the workout screen
runs it (Lift22 call 4: one rest a round, after the second lift), and leaves
the builder's own sizer to spend the time saved on the lifts it had given up,
in the day's order. Every print is in `evidence/panel3-as-locked.txt` and
`evidence/panel3-widened.txt`.

## Result

Two versions of the pairing rule, each beside Lift21:

- **As locked:** only isolation lifts pair, never the main lift, never two
  for the same muscle (calls 2 and 3).
- **Widened:** a supporting dumbbell, cable or machine lift may also pair
  with an isolation for another muscle. Still never the main lift, never two
  for one muscle, and never a barbell lift.

| Intermediate, 45 minutes          | Lift21 | As locked | Widened |
| --------------------------------- | ------ | --------- | ------- |
| Lifts a day                       | 3.6    | 3.7       | 3.9     |
| Sets a day                        | 11.3   | 11.7      | 12.5    |
| Arm, delt, calf or ab lifts a day | 0.8    | 1.0       | 1.2     |
| Days with a pair (of 54)          | -      | 28        | 44      |
| Days that gain a lift (of 54)     | -      | 7         | 20      |

| Beginner, 45 minutes          | Lift21 | As locked | Widened |
| ----------------------------- | ------ | --------- | ------- |
| Lifts a day                   | 4.5    | 4.8       | 5.1     |
| Days that gain a lift (of 54) | -      | 17        | 33      |

At 30 minutes neither version does much: 3.1 lifts a day becomes 3.2 or 3.3
either way, for beginners and intermediates alike.

No day in either version runs past its length by more than the 5% the fit
allows (Lift21's refinement 1), no pair holds a main lift, and no pair works
one muscle twice.

## Why the locked rule buys so little

The clock prices a lift at 90 seconds to set up, 45 seconds a set, and its
rests. A pair saves only the first lift's rests, about 3 to 4 minutes for two
3-set isolations. A day gives a lift back only when it saves a whole lift's
cost, which takes two pairs, which takes four isolations at the end of the
day. A 45-minute day built by Lift21 rarely ends in more than two. So the time saved
mostly goes to a fourth set on the main lift instead.

The two days that motivated Lift22 stay as they were under the locked rule:

- **The 45-minute leg day** is still three compounds: squat, Romanian
  deadlift, hack squat. Widened, it gains a calf raise paired with the hack
  squat, 43 minutes on the clock (49 without the pair).
- **The 30-minute upper day** still has no arm work in either version. Its
  three compounds fill the time, and none of them may pair under either rule.

## What the widened rule writes

Six days, 45 minutes, Build muscle, intermediate:

```
Pull — Lat Focus      Pull-Ups 4x6-10*, Barbell Row 3x8-12, [Dumbbell Curl 3x10-15 + Face Pulls 3x10-15]
Push — Chest Focus    Bench Press 4x6-10*, Overhead Press 3x8-12, [Rope Tricep Pushdown 3x10-15 + Lateral Raise 3x12-20]
Legs — Squat Focus    Barbell Squat 3x6-10*, Romanian Deadlift 3x8-12, [Hack Squat 3x8-12 + Standing Calf Raise 3x12-20]
Pull — Row Focus      Barbell Row 3x6-10*, Lat Pulldown 3x8-12, [Dumbbell Curl 3x10-15 + Reverse Flyes 3x10-15]
Push — Shoulder Focus Overhead Press 4x6-10*, Dumbbell Bench Press 3x8-12, [Rope Tricep Pushdown 3x10-15 + Lateral Raise 3x12-20]
Legs — Deadlift Focus Deadlift 3x5-8*, Barbell Squat 3x8-12, [Seated Leg Curl 3x10-15 + Cable Crunch 3x12-20]
```

Four days, 45 minutes, the lower day that gains most:

```
Lift21   Deadlift 3x5-8*, Hack Squat 3x8-12, Seated Leg Curl 3x10-15, Leg Extension 3x10-15           46 min
Widened  Deadlift 3x5-8*, [Hack Squat 3x8-12 + Seated Leg Curl 3x10-15],
         [Cable Crunch 3x12-20 + Seated Calf Raise 3x12-20]                                           47 min (57 straight)
```

Seven days swap a lift rather than only gaining one. Each swap follows the
day's own order (Lift21 call 4): the deadlift day's leg extension gives way
to calves and abs, a 30-minute push day's second shoulder press to a triceps
lift, and a beginner's straight-arm pulldown to a rear-delt lift.

## Also measured

Letting two supporting compounds pair when one pushes and the other pulls
(the press with a row that Lift22 left undecided) adds almost nothing on top
of the widened rule: 4.0 lifts a day at 45 minutes against 3.9, and 22 days
that gain a lift against 20. Without the push-and-pull condition, the prints
paired two presses, which no programme read for the deep dive does.

## Open for the owner

1. **Widen calls 2 and 3**, so a supporting dumbbell, cable or machine lift
   may pair with an isolation for another muscle. Recommended: as locked,
   Lift22 changes 7 of 54 intermediate days and neither day it was written
   for.
2. **Whether a beginner's plan pairs** stays open from the lock. The
   beginner rows above show what it would add.
3. **30-minute days** are not helped by pairs on today's clock. Slice 5 of
   `build-plan.md`, setting the clock from saved sessions, is what could
   move them.
