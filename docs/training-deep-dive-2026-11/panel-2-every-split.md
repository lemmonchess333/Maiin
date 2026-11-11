# Panel 2: the sizing rules on every split

11 November 2026. Slice 1 of `build-plan.md`. A prototype of Lift21's rules,
with no production caller, run over 96 setups: 3, 4, 5 and 6 days; 30, 45, 60
and 75 minutes; beginner and intermediate; Build muscle, General fitness and
Get stronger. Each is printed beside what the builder gives today at main
`a199cfd7`. Full gym, 80 kg.

The prototype is `harness/zzShape.scratch.test.ts.txt`. Every print is in
`evidence/panel2-full.txt`.

## Result

| Measure, days that are not a beginner's | Today          | New                       |
| --------------------------------------- | -------------- | ------------------------- |
| Lifts prescribed at 2 sets or fewer     | 57%            | 9%, all in 30-minute days |
| Days under 70% of their time (of 216)   | 25             | 0                         |
| Sets in a 60-minute day                 | 12.7 (7 to 17) | 16.1 (13 to 19)           |

All 96 setups pass the five checks in `build-plan.md`: no day over its time
by more than 5%, no day left short while it has more to give, no lift under 3
sets for a non-beginner outside a 30-minute day, paired days within one lift,
and each kind of day holding what Lift21 call 4 says.

Fourteen beginner days at 75 minutes end at 56 to 59 minutes with their list
and their sets used up (`evidence/panel2-notes.txt`). A beginner who asks for
75 minutes is given about an hour.

## What the prototype changed in the rules

Reading the prints forced six refinements to Lift21. They go on the row as a
STATUS line with the builder's PR.

1. **A lift may take a day 5% past its length.** The clock is unchecked
   (slice 5). Without this, a 45-minute day could not hold a fourth lift.
2. **When the next lift does not fit, the lifts the day has go deeper**, first
   to last, a set at a time, to 4 sets, and only inside the day's length. A
   four-day, 45-minute upper day is three lifts at 4, 3 and 3 sets, not three
   lifts at 3 with 4 minutes unused.
3. **A 30-minute day is 3 sets on the main lift and 2 on the others**, and
   drops to two lifts when three do not fit. It is the one place a lift sits
   under 3 sets.
4. **The deadlift takes 3 sets of 5 to 8** whatever the goal's band says.
   Today's builder gives sets of 8 to 12 on General fitness.
5. **A day holds at most 18 sets, 21 from 75 minutes.** Without the cap a
   75-minute day reached 24.
6. **A beginner's supporting lifts go to 3 sets when the day has time left.**
   Their 60-minute day is 15 or 16 sets, which is what a novice programme in
   `market-lifting.md` holds.

## What to look at

- **Four days at 45 minutes has no direct arm, side-delt, calf or ab work.**
  Three compound lifts fill the time. Today's builder keeps those small lifts
  by cutting everything to 2 sets. Lift21 chose the other side of that trade;
  supersets written into short plans (not in this plan) are what would bring
  them back.
- **General fitness main lifts sit at 8 to 12**, the role table's band, which
  Lift21 keeps. Panel 1 was written by hand at 6 to 10. With heavier and
  lighter days applied only to a lift that is a main lift twice a week, no day
  in these weeks shifts.
- **The week is bigger** wherever today's is thin: six days at 60 minutes goes
  from 67 sets to about 105.

## Limits

- The lifts are fixed names. The builder's own passes (variations by level,
  kit and injury swaps, the repeat cap) are not exercised; slice 2 runs the
  sweep of injured and home-gym plans.
- Loads are stand-ins used only to price warm-up sets.
- Weekly sets per muscle are not tallied here.

## Six prints

`*` marks the day's main lift.

### 3 days, 45 min, beginner, General fitness

|       | Day                         | Lifts | Sets | Min | Prescription                                                                                                 |
| ----- | --------------------------- | ----- | ---- | --- | ------------------------------------------------------------------------------------------------------------ |
| Today | Full Body — Squat Focus     | 4     | 10   | 42  | Barbell Squat 2x8\\_, Bench Press 2x8\\_, Lat Pulldown 4x8-12, Seated Leg Curl 2x10-15                       |
| Today | Full Body — Deadlift Focus  | 5     | 11   | 42  | Deadlift 2x8\\_, Overhead Press 2x8\\_, Barbell Row 3x8-12, Dumbbell Curl 2x10-15, Lateral Raise 2x10-15     |
| Today | Full Body — Posterior Focus | 5     | 10   | 43  | Deadlift 2x8\\*, Bench Press 2x8-12, Leg Press 2x8-12, Cable Crunch 2x10-15, Seated Calf Raise 2x10-15       |
| New   | Full Body A                 | 5     | 11   | 44  | Barbell Squat 3x8\\*, Bench Press 2x8-12, Barbell Row 2x8-12, Seated Leg Curl 2x10-15, Lateral Raise 2x10-15 |
| New   | Full Body B                 | 5     | 11   | 46  | Deadlift 3x8\\*, Overhead Press 2x8-12, Lat Pulldown 2x8-12, Leg Press 2x8-12, Rope Tricep Pushdown 2x10-15  |
| New   | Full Body C                 | 5     | 11   | 47  | Bench Press 3x8\\*, Leg Press 2x8-12, Seated Cable Row 2x8-12, Romanian Deadlift 2x8-12, Face Pulls 2x10-15  |

### 4 days, 45 min, intermediate, Build muscle

|       | Day                      | Lifts | Sets | Min | Prescription                                                                                                             |
| ----- | ------------------------ | ----- | ---- | --- | ------------------------------------------------------------------------------------------------------------------------ |
| Today | Upper — Chest & Back     | 4     | 8    | 43  | Bench Press 2x4-8\\_, Barbell Row 2x4-8\\_, Overhead Press 2x4-8\\*, Lateral Raise 2x10-18                               |
| Today | Lower — Squat Focus      | 4     | 8    | 41  | Barbell Squat 2x4-8\\_, Deadlift 2x4-8\\_, Hack Squat 2x6-10, Cable Crunch 2x10-18                                       |
| Today | Upper — Shoulders & Arms | 5     | 10   | 38  | Overhead Press 2x8-12\\_, Pull-Ups 2x8-12\\_, Dumbbell Curl 2x12-17, Rope Tricep Pushdown 2x12-17, Lateral Raise 2x14-20 |
| Today | Lower — Deadlift Focus   | 5     | 10   | 45  | Deadlift 2x6-10\\*, Hack Squat 2x10-14, Seated Leg Curl 2x12-17, Cable Crunch 2x14-20, Seated Calf Raise 2x14-20         |
| New   | Upper A                  | 3     | 10   | 45  | Bench Press 4x6-10\\*, Barbell Row 3x8-12, Dumbbell Shoulder Press 3x8-12                                                |
| New   | Lower A                  | 3     | 10   | 43  | Barbell Squat 4x6-10\\*, Romanian Deadlift 3x8-12, Leg Press 3x8-12                                                      |
| New   | Upper B                  | 3     | 11   | 43  | Overhead Press 4x6-10\\*, Pull-Ups 4x8-12, Incline Dumbbell Press 3x8-12                                                 |
| New   | Lower B                  | 3     | 11   | 43  | Deadlift 3x5-8\\*, Hack Squat 4x8-12, Seated Leg Curl 4x10-15                                                            |

### 4 days, 60 min, intermediate, Get stronger

|       | Day                      | Lifts | Sets | Min | Prescription                                                                                                                                    |
| ----- | ------------------------ | ----- | ---- | --- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Today | Upper — Chest & Back     | 3     | 10   | 52  | Bench Press 4x3\\_, Barbell Row 4x3\\_, Overhead Press 2x3\\*                                                                                   |
| Today | Lower — Squat Focus      | 5     | 12   | 58  | Barbell Squat 4x3\\_, Deadlift 2x3\\_, Hack Squat 2x6-10, Cable Crunch 2x6-10, Standing Calf Raise 2x6-10                                       |
| Today | Upper — Shoulders & Arms | 6     | 16   | 60  | Overhead Press 4x7\\_, Pull-Ups 4x7\\_, Dumbbell Bench Press 2x8-12, Dumbbell Curl 2x10-14, Rope Tricep Pushdown 2x10-14, Lateral Raise 2x10-14 |
| Today | Lower — Deadlift Focus   | 5     | 15   | 59  | Deadlift 4x5\\*, Hack Squat 3x8-12, Seated Leg Curl 3x10-14, Cable Crunch 3x10-14, Seated Calf Raise 2x10-14                                    |
| New   | Upper A                  | 4     | 14   | 60  | Bench Press 4x5\\*, Barbell Row 4x6-10, Dumbbell Shoulder Press 3x6-10, Lat Pulldown 3x6-10                                                     |
| New   | Lower A                  | 5     | 16   | 61  | Barbell Squat 4x5\\*, Romanian Deadlift 3x6-10, Leg Press 3x6-10, Seated Leg Curl 3x8-12, Standing Calf Raise 3x8-12                            |
| New   | Upper B                  | 5     | 16   | 61  | Overhead Press 4x5\\*, Pull-Ups 3x6-10, Incline Dumbbell Press 3x6-10, Seated Cable Row 3x6-10, Face Pulls 3x8-12                               |
| New   | Lower B                  | 5     | 16   | 60  | Deadlift 3x5\\*, Hack Squat 3x6-10, Seated Leg Curl 4x8-12, Seated Calf Raise 3x8-12, Cable Crunch 3x8-12                                       |

### 5 days, 60 min, intermediate, Build muscle

|       | Day                  | Lifts | Sets | Min | Prescription                                                                                                                                                     |
| ----- | -------------------- | ----- | ---- | --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Today | Pull — Lat Focus     | 6     | 15   | 60  | Pull-Ups 3x4-8\\_, Barbell Row 3x4-8\\_, Lat Pulldown 3x6-10, Dumbbell Curl 2x8-13, Cable Curl 2x8-13, Lateral Raise 2x10-18                                     |
| Today | Push — Chest Focus   | 6     | 15   | 60  | Bench Press 3x4-8\\_, Overhead Press 3x4-8\\_, Dumbbell Bench Press 3x6-10, Rope Tricep Pushdown 2x8-13, Overhead Tricep Extension 2x8-13, Lateral Raise 2x10-18 |
| Today | Legs — Squat Focus   | 5     | 13   | 58  | Barbell Squat 3x6-10\\_, Deadlift 3x6-10\\_, Hack Squat 3x8-12, Cable Crunch 2x12-20, Standing Calf Raise 2x12-20                                                |
| Today | Upper — Chest & Back | 4     | 12   | 50  | Bench Press 3x8-12\\_, Barbell Row 3x8-12\\_, Overhead Press 3x8-12\\*, Dumbbell Curl 3x12-17                                                                    |
| Today | Lower — Squat Focus  | 5     | 15   | 60  | Barbell Squat 3x8-12\\_, Deadlift 3x6-10\\_, Hack Squat 3x10-14, Cable Crunch 3x14-20, Standing Calf Raise 3x14-20                                               |
| New   | Push A               | 5     | 16   | 59  | Bench Press 4x6-10\\*, Dumbbell Shoulder Press 3x8-12, Incline Dumbbell Press 3x8-12, Lateral Raise 3x12-20, Rope Tricep Pushdown 3x10-15                        |
| New   | Pull A               | 5     | 17   | 60  | Pull-Ups 4x6-10\\*, Barbell Row 3x8-12, Lat Pulldown 3x8-12, Face Pulls 4x10-15, Dumbbell Curl 3x10-15                                                           |
| New   | Legs A               | 5     | 16   | 60  | Barbell Squat 4x6-10\\*, Romanian Deadlift 3x8-12, Leg Press 3x8-12, Seated Leg Curl 3x10-15, Standing Calf Raise 3x12-20                                        |
| New   | Upper B              | 5     | 16   | 59  | Overhead Press 4x6-10\\*, Pull-Ups 3x8-12, Incline Dumbbell Press 3x8-12, Seated Cable Row 3x8-12, Face Pulls 3x10-15                                            |
| New   | Lower B              | 5     | 16   | 60  | Deadlift 3x5-8\\*, Hack Squat 4x8-12, Seated Leg Curl 3x10-15, Seated Calf Raise 3x12-20, Cable Crunch 3x12-20                                                   |

### 6 days, 45 min, intermediate, General fitness

|       | Day                   | Lifts | Sets | Min | Prescription                                                                                                                                  |
| ----- | --------------------- | ----- | ---- | --- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Today | Pull — Lat Focus      | 3     | 8    | 36  | Pull-Ups 3x6-10\\_, Barbell Row 3x6-10\\_, Dumbbell Curl 2x8-13                                                                               |
| Today | Push — Chest Focus    | 4     | 9    | 42  | Bench Press 3x6-10\\_, Overhead Press 2x6-10\\_, Dumbbell Bench Press 2x6-10, Overhead Tricep Extension 2x8-13                                |
| Today | Legs — Squat Focus    | 4     | 8    | 41  | Barbell Squat 2x6-10\\_, Deadlift 2x6-10\\_, Hack Squat 2x6-10, Cable Crunch 2x8-13                                                           |
| Today | Pull — Row Focus      | 3     | 8    | 31  | Barbell Row 3x10-14\\*, Lat Pulldown 3x10-14, Seated Cable Row 2x10-14                                                                        |
| Today | Push — Shoulder Focus | 5     | 12   | 44  | Overhead Press 3x10-14\\*, Dumbbell Bench Press 3x10-14, Dumbbell Shoulder Press 2x10-14, Rope Tricep Pushdown 2x12-17, Lateral Raise 2x12-17 |
| Today | Legs — Deadlift Focus | 5     | 10   | 44  | Deadlift 2x8-12\\_, Barbell Squat 2x10-14\\_, Seated Leg Curl 2x12-17, Hack Squat 2x10-14, Seated Calf Raise 2x12-17                          |
| New   | Push A                | 4     | 13   | 45  | Bench Press 3x8-12\\*, Dumbbell Shoulder Press 3x8-12, Lateral Raise 4x10-15, Rope Tricep Pushdown 3x10-15                                    |
| New   | Pull A                | 4     | 13   | 45  | Pull-Ups 3x8-12\\*, Barbell Row 3x8-12, Face Pulls 4x10-15, Dumbbell Curl 3x10-15                                                             |
| New   | Legs A                | 4     | 12   | 46  | Barbell Squat 3x8-12\\*, Romanian Deadlift 3x8-12, Leg Press 3x8-12, Standing Calf Raise 3x10-15                                              |
| New   | Push B                | 4     | 13   | 44  | Overhead Press 4x8-12\\*, Dumbbell Bench Press 3x8-12, Cable Lateral Raise 3x10-15, Overhead Tricep Extension 3x10-15                         |
| New   | Pull B                | 4     | 13   | 45  | Barbell Row 3x8-12\\*, Lat Pulldown 4x8-12, Reverse Flyes 3x10-15, Hammer Curl 3x10-15                                                        |
| New   | Legs B                | 3     | 11   | 43  | Deadlift 3x5-8\\*, Hack Squat 4x8-12, Seated Leg Curl 4x10-15                                                                                 |

### 6 days, 60 min, intermediate, General fitness

|       | Day                   | Lifts | Sets | Min | Prescription                                                                                                                                                                    |
| ----- | --------------------- | ----- | ---- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Today | Pull — Lat Focus      | 3     | 8    | 37  | Pull-Ups 3x6-10\\_, Barbell Row 3x6-10\\_, Lat Pulldown 2x6-10                                                                                                                  |
| Today | Push — Chest Focus    | 6     | 14   | 57  | Bench Press 3x6-10\\_, Overhead Press 3x6-10\\_, Dumbbell Bench Press 2x6-10, Rope Tricep Pushdown 2x8-13, Overhead Tricep Extension 2x8-13, Lateral Raise 2x8-13               |
| Today | Legs — Squat Focus    | 5     | 13   | 58  | Barbell Squat 3x6-10\\_, Deadlift 3x6-10\\_, Hack Squat 3x6-10, Cable Crunch 2x8-13, Standing Calf Raise 2x8-13                                                                 |
| Today | Pull — Row Focus      | 3     | 7    | 28  | Barbell Row 3x10-14\\*, Lat Pulldown 2x10-14, Seated Cable Row 2x10-14                                                                                                          |
| Today | Push — Shoulder Focus | 4     | 11   | 39  | Overhead Press 3x10-14\\*, Dumbbell Bench Press 2x10-14, Dumbbell Shoulder Press 3x10-14, Lateral Raise 3x12-17                                                                 |
| Today | Legs — Deadlift Focus | 6     | 14   | 58  | Deadlift 3x8-12\\_, Barbell Squat 3x10-14\\_, Seated Leg Curl 2x12-17, Hack Squat 2x10-14, Cable Crunch 2x12-17, Seated Calf Raise 2x12-17                                      |
| New   | Push A                | 5     | 17   | 59  | Bench Press 4x8-12\\*, Dumbbell Shoulder Press 4x8-12, Incline Dumbbell Press 3x8-12, Lateral Raise 3x10-15, Rope Tricep Pushdown 3x10-15                                       |
| New   | Pull A                | 5     | 17   | 59  | Pull-Ups 4x8-12\\*, Barbell Row 4x8-12, Lat Pulldown 3x8-12, Face Pulls 3x10-15, Dumbbell Curl 3x10-15                                                                          |
| New   | Legs A                | 5     | 17   | 60  | Barbell Squat 4x8-12\\*, Romanian Deadlift 4x8-12, Leg Press 3x8-12, Seated Leg Curl 3x10-15, Standing Calf Raise 3x10-15                                                       |
| New   | Push B                | 6     | 19   | 62  | Overhead Press 4x8-12\\*, Dumbbell Bench Press 3x8-12, Chest Press Machine 3x8-12, Cable Lateral Raise 3x10-15, Overhead Tricep Extension 3x10-15, Rope Tricep Pushdown 3x10-15 |
| New   | Pull B                | 6     | 19   | 63  | Barbell Row 4x8-12\\*, Lat Pulldown 3x8-12, Seated Cable Row 3x8-12, Reverse Flyes 3x10-15, Hammer Curl 3x10-15, Dumbbell Curl 3x10-15                                          |
| New   | Legs B                | 5     | 16   | 60  | Deadlift 3x5-8\\*, Hack Squat 4x8-12, Seated Leg Curl 3x10-15, Seated Calf Raise 3x10-15, Cable Crunch 3x10-15                                                                  |

## Every setup

| Days | Min | Level        | Goal            | Today: sets a week | New: sets a week | Today: lifts a day, min | New: lifts a day, min | Today: lifts at 2 sets | New: checks |
| ---- | --- | ------------ | --------------- | ------------------ | ---------------- | ----------------------- | --------------------- | ---------------------- | ----------- |
| 3    | 30  | beginner     | Build muscle    | 22                 | 27               | 3-4, 23-29              | 3, 29-30              | 100%                   | pass        |
| 3    | 30  | beginner     | General fitness | 22                 | 27               | 3-4, 23-29              | 3, 29-30              | 100%                   | pass        |
| 3    | 30  | beginner     | Get stronger    | 20                 | 22               | 3, 25-29                | 3, 29-30              | 89%                    | pass        |
| 3    | 30  | intermediate | Build muscle    | 18                 | 21               | 3, 25-28                | 2-3, 25-30            | 100%                   | pass        |
| 3    | 30  | intermediate | General fitness | 22                 | 23               | 3-4, 27-29              | 3, 29-30              | 100%                   | pass        |
| 3    | 30  | intermediate | Get stronger    | 18                 | 20               | 3, 25-28                | 2-3, 25-30            | 100%                   | pass        |
| 3    | 45  | beginner     | Build muscle    | 32                 | 33               | 4-5, 42-45              | 5, 44-47              | 86%                    | pass        |
| 3    | 45  | beginner     | General fitness | 31                 | 33               | 4-5, 42-43              | 5, 44-47              | 86%                    | pass        |
| 3    | 45  | beginner     | Get stronger    | 28                 | 29               | 4-5, 42-45              | 4, 45                 | 100%                   | pass        |
| 3    | 45  | intermediate | Build muscle    | 28                 | 31               | 4-5, 41-45              | 3, 43-45              | 100%                   | pass        |
| 3    | 45  | intermediate | General fitness | 28                 | 32               | 4-5, 39-43              | 3, 43-44              | 100%                   | pass        |
| 3    | 45  | intermediate | Get stronger    | 28                 | 30               | 4-5, 42-45              | 3, 44-45              | 100%                   | pass        |
| 3    | 60  | beginner     | Build muscle    | 42                 | 46               | 6, 56-58                | 6, 59-60              | 67%                    | pass        |
| 3    | 60  | beginner     | General fitness | 40                 | 46               | 5-6, 50-58              | 6, 59-60              | 65%                    | pass        |
| 3    | 60  | beginner     | Get stronger    | 36                 | 41               | 5-6, 51-58              | 6, 59-60              | 88%                    | pass        |
| 3    | 60  | intermediate | Build muscle    | 39                 | 43               | 6, 58-59                | 4-5, 58-60            | 83%                    | pass        |
| 3    | 60  | intermediate | General fitness | 42                 | 46               | 6, 58-59                | 4-5, 59-62            | 67%                    | pass        |
| 3    | 60  | intermediate | Get stronger    | 38                 | 42               | 6, 58-59                | 4-5, 60-61            | 89%                    | pass        |
| 3    | 75  | beginner     | Build muscle    | 46                 | 54               | 6, 56-66                | 6, 63-67              | 61%                    | pass        |
| 3    | 75  | beginner     | General fitness | 42                 | 54               | 5-6, 50-64              | 6, 63-67              | 59%                    | pass        |
| 3    | 75  | beginner     | Get stronger    | 40                 | 54               | 5-6, 55-66              | 6, 68-72              | 65%                    | pass        |
| 3    | 75  | intermediate | Build muscle    | 53                 | 58               | 6-7, 71-73              | 6, 74-76              | 21%                    | pass        |
| 3    | 75  | intermediate | General fitness | 53                 | 60               | 6-7, 65-73              | 6, 74-75              | 21%                    | pass        |
| 3    | 75  | intermediate | Get stronger    | 49                 | 58               | 5-6, 66-73              | 6, 75-79              | 41%                    | pass        |
| 4    | 30  | beginner     | Build muscle    | 30                 | 35               | 3-4, 24-30              | 3-4, 29-31            | 100%                   | pass        |
| 4    | 30  | beginner     | General fitness | 30                 | 35               | 3-4, 24-30              | 3-4, 29-31            | 100%                   | pass        |
| 4    | 30  | beginner     | Get stronger    | 26                 | 30               | 3-4, 25-29              | 3, 29-30              | 100%                   | pass        |
| 4    | 30  | intermediate | Build muscle    | 26                 | 29               | 3-4, 25-31              | 3, 28-31              | 100%                   | pass        |
| 4    | 30  | intermediate | General fitness | 28                 | 31               | 3-4, 26-31              | 3-4, 28-31            | 100%                   | pass        |
| 4    | 30  | intermediate | Get stronger    | 26                 | 28               | 3-4, 25-31              | 2-3, 26-30            | 100%                   | pass        |
| 4    | 45  | beginner     | Build muscle    | 39                 | 46               | 4-5, 38-44              | 5, 43-46              | 83%                    | pass        |
| 4    | 45  | beginner     | General fitness | 39                 | 46               | 4-5, 38-44              | 5, 43-46              | 83%                    | pass        |
| 4    | 45  | beginner     | Get stronger    | 32                 | 43               | 3-5, 32-42              | 4-5, 45-47            | 100%                   | pass        |
| 4    | 45  | intermediate | Build muscle    | 36                 | 42               | 4-5, 38-45              | 3, 43-45              | 100%                   | pass        |
| 4    | 45  | intermediate | General fitness | 36                 | 46               | 4-5, 37-43              | 3-4, 43-46            | 100%                   | pass        |
| 4    | 45  | intermediate | Get stronger    | 36                 | 41               | 4-5, 38-45              | 3, 43-44              | 100%                   | pass        |
| 4    | 60  | beginner     | Build muscle    | 48                 | 65               | 4-6, 43-54              | 6-7, 58-60            | 60%                    | pass        |
| 4    | 60  | beginner     | General fitness | 50                 | 65               | 5-6, 46-54              | 6-7, 58-60            | 62%                    | pass        |
| 4    | 60  | beginner     | Get stronger    | 42                 | 60               | 4-5, 42-56              | 6-7, 58-60            | 53%                    | pass        |
| 4    | 60  | intermediate | Build muscle    | 56                 | 64               | 4-6, 54-60              | 5, 59-62              | 20%                    | pass        |
| 4    | 60  | intermediate | General fitness | 56                 | 66               | 4-6, 54-59              | 5, 59-60              | 20%                    | pass        |
| 4    | 60  | intermediate | Get stronger    | 53                 | 62               | 3-6, 52-60              | 4-5, 60-61            | 53%                    | pass        |
| 4    | 75  | beginner     | Build muscle    | 48                 | 78               | 5, 46-51                | 6-7, 62-71            | 60%                    | pass        |
| 4    | 75  | beginner     | General fitness | 48                 | 78               | 5, 46-51                | 6-7, 62-71            | 60%                    | pass        |
| 4    | 75  | beginner     | Get stronger    | 42                 | 78               | 3-5, 35-56              | 6-7, 66-75            | 53%                    | pass        |
| 4    | 75  | intermediate | Build muscle    | 66                 | 84               | 5-6, 57-75              | 6-7, 71-78            | 0%                     | pass        |
| 4    | 75  | intermediate | General fitness | 61                 | 86               | 5-6, 55-64              | 6-7, 71-78            | 10%                    | pass        |
| 4    | 75  | intermediate | Get stronger    | 62                 | 80               | 4-6, 59-68              | 6, 72-74              | 25%                    | pass        |
| 5    | 30  | beginner     | Build muscle    | 36                 | 44               | 3-4, 21-28              | 3-4, 29-31            | 88%                    | pass        |
| 5    | 30  | beginner     | General fitness | 36                 | 44               | 3-4, 21-28              | 3-4, 29-31            | 88%                    | pass        |
| 5    | 30  | beginner     | Get stronger    | 33                 | 40               | 3-4, 22-29              | 3, 29-30              | 94%                    | pass        |
| 5    | 30  | intermediate | Build muscle    | 32                 | 39               | 3, 25-30                | 3, 28-30              | 87%                    | pass        |
| 5    | 30  | intermediate | General fitness | 32                 | 42               | 3, 24-30                | 3-4, 29-31            | 87%                    | pass        |
| 5    | 30  | intermediate | Get stronger    | 32                 | 38               | 3, 25-30                | 3, 29-30              | 93%                    | pass        |
| 5    | 45  | beginner     | Build muscle    | 52                 | 59               | 4-5, 37-44              | 5-6, 43-47            | 74%                    | pass        |
| 5    | 45  | beginner     | General fitness | 51                 | 59               | 4-5, 37-44              | 5-6, 43-47            | 78%                    | pass        |
| 5    | 45  | beginner     | Get stronger    | 45                 | 54               | 4-5, 40-41              | 4-5, 44-47            | 86%                    | pass        |
| 5    | 45  | intermediate | Build muscle    | 44                 | 56               | 4, 39-44                | 3-4, 43-46            | 80%                    | pass        |
| 5    | 45  | intermediate | General fitness | 50                 | 61               | 4-5, 44-45              | 3-4, 43-46            | 83%                    | pass        |
| 5    | 45  | intermediate | Get stronger    | 44                 | 56               | 4, 39-44                | 3-4, 44-47            | 90%                    | pass        |
| 5    | 60  | beginner     | Build muscle    | 55                 | 85               | 3-6, 30-51              | 6-7, 58-60            | 50%                    | pass        |
| 5    | 60  | beginner     | General fitness | 50                 | 85               | 3-5, 30-51              | 6-7, 58-60            | 50%                    | pass        |
| 5    | 60  | beginner     | Get stronger    | 49                 | 79               | 3-5, 27-56              | 6-7, 58-60            | 55%                    | pass        |
| 5    | 60  | intermediate | Build muscle    | 70                 | 81               | 4-6, 50-60              | 5, 59-60              | 31%                    | pass        |
| 5    | 60  | intermediate | General fitness | 67                 | 84               | 3-6, 41-60              | 5, 59-60              | 21%                    | pass        |
| 5    | 60  | intermediate | Get stronger    | 65                 | 80               | 4-5, 53-60              | 5, 59-61              | 54%                    | pass        |
| 5    | 75  | beginner     | Build muscle    | 55                 | 93               | 3-6, 30-51              | 6-7, 58-70            | 50%                    | pass        |
| 5    | 75  | beginner     | General fitness | 50                 | 93               | 3-5, 30-51              | 6-7, 58-70            | 50%                    | pass        |
| 5    | 75  | beginner     | Get stronger    | 46                 | 93               | 3-5, 27-56              | 6-7, 61-73            | 44%                    | pass        |
| 5    | 75  | intermediate | Build muscle    | 76                 | 106              | 4-6, 50-64              | 6-7, 71-78            | 8%                     | pass        |
| 5    | 75  | intermediate | General fitness | 67                 | 106              | 3-6, 41-61              | 6-7, 69-75            | 9%                     | pass        |
| 5    | 75  | intermediate | Get stronger    | 73                 | 103              | 3-6, 47-67              | 6, 72-74              | 32%                    | pass        |
| 6    | 30  | beginner     | Build muscle    | 45                 | 55               | 3-4, 21-28              | 3-4, 29-30            | 86%                    | pass        |
| 6    | 30  | beginner     | General fitness | 41                 | 55               | 3-4, 20-26              | 3-4, 29-30            | 84%                    | pass        |
| 6    | 30  | beginner     | Get stronger    | 40                 | 50               | 3-4, 23-29              | 3-4, 29-30            | 89%                    | pass        |
| 6    | 30  | intermediate | Build muscle    | 42                 | 48               | 3-4, 26-30              | 3, 29-30              | 90%                    | pass        |
| 6    | 30  | intermediate | General fitness | 42                 | 51               | 3-4, 25-30              | 3-4, 29-31            | 90%                    | pass        |
| 6    | 30  | intermediate | Get stronger    | 41                 | 47               | 3-4, 26-28              | 3, 29-30              | 95%                    | pass        |
| 6    | 45  | beginner     | Build muscle    | 51                 | 73               | 3-5, 25-44              | 5-6, 43-47            | 78%                    | pass        |
| 6    | 45  | beginner     | General fitness | 51                 | 73               | 3-5, 25-44              | 5-6, 43-47            | 78%                    | pass        |
| 6    | 45  | beginner     | Get stronger    | 46                 | 69               | 3-4, 26-41              | 4-6, 44-47            | 81%                    | pass        |
| 6    | 45  | intermediate | Build muscle    | 56                 | 69               | 3-5, 34-44              | 3-4, 43-46            | 67%                    | pass        |
| 6    | 45  | intermediate | General fitness | 55                 | 75               | 3-5, 31-44              | 3-4, 43-46            | 71%                    | pass        |
| 6    | 45  | intermediate | Get stronger    | 53                 | 69               | 3-5, 28-45              | 3-4, 44-47            | 83%                    | pass        |
| 6    | 60  | beginner     | Build muscle    | 55                 | 105              | 3-5, 25-51              | 6, 56-60              | 61%                    | pass        |
| 6    | 60  | beginner     | General fitness | 53                 | 105              | 3-5, 25-51              | 6, 56-60              | 59%                    | pass        |
| 6    | 60  | beginner     | Get stronger    | 51                 | 100              | 3-5, 26-56              | 6, 59-60              | 57%                    | pass        |
| 6    | 60  | intermediate | Build muscle    | 72                 | 99               | 3-6, 31-60              | 5, 59-60              | 33%                    | pass        |
| 6    | 60  | intermediate | General fitness | 67                 | 105              | 3-6, 28-58              | 5-6, 59-63            | 52%                    | pass        |
| 6    | 60  | intermediate | Get stronger    | 63                 | 98               | 3-5, 28-60              | 5, 59-61              | 60%                    | pass        |
| 6    | 75  | beginner     | Build muscle    | 55                 | 108              | 3-5, 25-51              | 6, 56-62              | 61%                    | pass        |
| 6    | 75  | beginner     | General fitness | 53                 | 108              | 3-5, 25-51              | 6, 56-62              | 59%                    | pass        |
| 6    | 75  | beginner     | Get stronger    | 51                 | 108              | 3-5, 26-56              | 6, 59-66              | 57%                    | pass        |
| 6    | 75  | intermediate | Build muscle    | 79                 | 126              | 3-6, 31-69              | 6, 70-75              | 7%                     | pass        |
| 6    | 75  | intermediate | General fitness | 71                 | 126              | 3-6, 31-67              | 6, 67-72              | 16%                    | pass        |
| 6    | 75  | intermediate | Get stronger    | 72                 | 125              | 3-6, 28-68              | 6, 71-73              | 35%                    | pass        |
