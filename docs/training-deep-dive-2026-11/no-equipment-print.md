# No equipment: the printed weeks

18 November 2026. Lift4's STATUS of 9 November (the fourth equipment
choice), as built on `claude/lift4-no-equipment`. Pgm9: a change to what the
engine prescribes ships on a printed week you accept, so this pull request
stays a draft until you say yes or no.

## What to say yes or no to

1. **The No equipment weeks** in sections 1 to 3.
2. **Minimal with "A pull-up bar" off**, the answer a new Minimal plan starts
   from (section 4).
3. **The glute bridge at 8 reps or more** in Home gym and Minimal plans for
   Get stronger and Support running (section 5).

Full gym plans do not change.

## How it was made

An 80 kg man, General fitness, intermediate, 45 minutes, unless a heading
says otherwise. Each week is the real builder's (`buildPlan`), priced by the
app's own clock (`estimateSessionMinutes`), as Train shows it. `*` marks the
day's main lift; "30-60 s" is a hold, in seconds.

- **Today** is main at `6f1d1b62`: what a person with no kit gets now by
  picking "Minimal / bodyweight", which assumes dumbbells.
- **No bar** and **Bar** are this branch's No equipment plan, with "A
  pull-up bar" off and on.

The harness is `harness/zzNoEquipmentPrint.scratch.test.ts.txt`, and
`harness/noequip_print.py` lays out its output.

## A No equipment week, in short

- Floor moves only: push-ups, pike and diamond push-ups, bodyweight squats
  and lunges, glute bridges, single-leg calf raises, crunches, Russian twists
  and planks. Nothing needs a bench, a bar, a table or a chair.
- No pulling without the bar. The superman hold is the back work: 2 or 3
  sets a session, never more than 6 a week.
- Two to four days use the same splits as today. Five or six days with no
  bar run upper / lower twice plus full-body days, with no Pull day.
- With the bar: pull-ups, chin-ups and the hanging leg raise, and the usual
  split. A beginner's plan is the same with or without it, because pull-ups
  aren't given to a beginner.
- Reps: an easy bodyweight lift is never set under 8 (Get stronger
  push-ups are 4x8, not 4x5). With nothing to add load, reps climb one a
  session past the range to 30, and a hold climbs from 30 to 60 seconds.
- Sets a week against today: 2 days 25 to 32, 3 days 35 to 45, 4 days 57 to
  62, 5 days 71 to 77, 6 days 88 to 93 (no bar).

## Five things to look at before you answer

1. **Six days with a bar has a thin pull day.** Pull B ("Row Focus") is two
   lifts in 15 minutes: the superman hold as its main and pull-ups. Pull A is
   33 minutes. The bar's three lifts are all the pulling there is. The
   STATUS says the bar brings back the usual split, so that is what is
   built. The other way: keep upper / lower plus full body at five and six
   days even with a bar, with pull-ups on the upper days.
2. **A beginner's six days have short upper days**: three lifts in 27
   minutes (push-ups, pike push-ups, superman hold). Diamond push-ups are
   the only other upper floor move, and they aren't a beginner's.
3. **Minimal or Home gym with the bar off gives an inverted row** where the
   pull-up was. An inverted row needs a bar at waist height or a table, the
   kind of row you turned down for No equipment ("who's going to pull the
   table?"). The other way: count it as needing a barbell and a rack at
   home, so the slot takes a dumbbell row.
4. **Some days end short of their 45 minutes** when the floor runs out of
   lifts (38 to 44 minutes; the two-lift day above at 15). The builder adds
   sets up to 4 a lift but cannot add lifts that don't exist.
5. **The superman cap can leave a full-body day without back work.** Over
   6 sets a week, a new plan keeps the hold where it is the day's only back
   work first and drops it from the rest.

## 1. General fitness, intermediate, 45 min

### 2 days

Today: full body, 25 sets a week. No bar: full body, 32 sets. Bar: full body, 31 sets.

|        | Day                        | Lifts | Sets | Min | Prescription                                                                                                                  |
| ------ | -------------------------- | ----- | ---- | --- | ----------------------------------------------------------------------------------------------------------------------------- |
| Today  | Full Body — Squat Focus    | 4     | 14   | 44  | Bulgarian Split Squat 4x8-12\*, Dumbbell Bench Press 4x8-12\*, Pull-Ups 3x8-12, Hanging Leg Raise 3x10-15                     |
| Today  | Full Body — Deadlift Focus | 3     | 11   | 45  | Dumbbell Romanian Deadlift 4x8-12\*, Dumbbell Shoulder Press 4x8-12\*, Dumbbell Row 3x8-12                                    |
| No bar | Full Body — Squat Focus    | 5     | 16   | 45  | Bodyweight Squat 4x8-12\*, Push-Ups 3x8-12\*, Superman Hold 3x30-60 s, Glute Bridge 3x8-12, Russian Twist 3x10-15             |
| No bar | Full Body — Deadlift Focus | 5     | 16   | 45  | Glute Bridge 4x8-12\*, Pike Push-Up 3x8-12\*, Superman Hold 3x30-60 s, Bodyweight Squat 3x8-12, Single-Leg Calf Raise 3x10-15 |
| Bar    | Full Body — Squat Focus    | 5     | 15   | 44  | Bodyweight Squat 3x8-12\*, Push-Ups 3x8-12\*, Pull-Ups 3x8-12, Glute Bridge 3x8-12, Hanging Leg Raise 3x10-15                 |
| Bar    | Full Body — Deadlift Focus | 5     | 16   | 45  | Glute Bridge 4x8-12\*, Pike Push-Up 3x8-12\*, Superman Hold 3x30-60 s, Bodyweight Squat 3x8-12, Single-Leg Calf Raise 3x10-15 |

### 3 days

Today: full body, 35 sets a week. No bar: full body, 45 sets. Bar: full body, 43 sets.

|        | Day                         | Lifts | Sets | Min | Prescription                                                                                                            |
| ------ | --------------------------- | ----- | ---- | --- | ----------------------------------------------------------------------------------------------------------------------- |
| Today  | Full Body — Squat Focus     | 4     | 12   | 46  | Bulgarian Split Squat 3x8-12\*, Dumbbell Bench Press 3x8-12\*, Pull-Ups 3x8-12, Glute Bridge 3x8-12                     |
| Today  | Full Body — Deadlift Focus  | 3     | 11   | 45  | Dumbbell Romanian Deadlift 4x8-12\*, Dumbbell Shoulder Press 4x8-12\*, Dumbbell Row 3x8-12                              |
| Today  | Full Body — Posterior Focus | 4     | 12   | 47  | Dumbbell Romanian Deadlift 3x8-12\*, Dumbbell Bench Press 3x8-12, Pull-Ups 3x8-12, Goblet Squat 3x8-12                  |
| No bar | Full Body — Squat Focus     | 5     | 16   | 45  | Bodyweight Squat 4x8-12\*, Push-Ups 3x8-12\*, Superman Hold 2x30-60 s, Glute Bridge 4x8-12, Russian Twist 3x10-15       |
| No bar | Full Body — Deadlift Focus  | 4     | 13   | 44  | Glute Bridge 4x8-12\*, Pike Push-Up 4x8-12\*, Superman Hold 2x30-60 s, Bodyweight Squat 3x8-12                          |
| No bar | Full Body — Posterior Focus | 5     | 16   | 44  | Glute Bridge 4x8-12\*, Push-Ups 4x8-12, Superman Hold 2x30-60 s, Bodyweight Squat 3x8-12, Single-Leg Calf Raise 3x10-15 |
| Bar    | Full Body — Squat Focus     | 5     | 15   | 44  | Bodyweight Squat 3x8-12\*, Push-Ups 3x8-12\*, Pull-Ups 3x8-12, Glute Bridge 3x8-12, Hanging Leg Raise 3x10-15           |
| Bar    | Full Body — Deadlift Focus  | 4     | 13   | 43  | Glute Bridge 4x8-12\*, Pike Push-Up 3x8-12\*, Superman Hold 3x30-60 s, Bodyweight Squat 3x8-12                          |
| Bar    | Full Body — Posterior Focus | 5     | 15   | 42  | Glute Bridge 3x8-12\*, Push-Ups 3x8-12, Pull-Ups 3x8-12, Bodyweight Squat 3x8-12, Single-Leg Calf Raise 3x10-15         |

### 4 days

Today: upper / lower, 57 sets a week. No bar: upper / lower, 62 sets. Bar: upper / lower, 62 sets.

|        | Day                      | Lifts | Sets | Min | Prescription                                                                                                                                     |
| ------ | ------------------------ | ----- | ---- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Today  | Upper — Chest & Back     | 4     | 12   | 47  | Dumbbell Bench Press 3x8-12\*, Dumbbell Row 3x8-12, Dumbbell Shoulder Press 3x8-12, Pull-Ups 3x8-12                                              |
| Today  | Lower — Squat Focus      | 5     | 15   | 46  | Bulgarian Split Squat 3x8-12\*, Dumbbell Romanian Deadlift 3x8-12, Goblet Squat 3x8-12, Hanging Leg Raise 3x10-15, Single-Leg Calf Raise 3x10-15 |
| Today  | Upper — Shoulders & Arms | 5     | 15   | 47  | Dumbbell Shoulder Press 3x8-12\*, Pull-Ups 3x8-12, Dumbbell Bench Press 3x8-12, Dumbbell Curl 3x10-15, Lateral Raise 3x10-15                     |
| Today  | Lower — Deadlift Focus   | 5     | 15   | 46  | Dumbbell Romanian Deadlift 3x8-12\*, Bulgarian Split Squat 3x8-12, Glute Bridge 3x8-12, Hanging Leg Raise 3x10-15, Single-Leg Calf Raise 3x10-15 |
| No bar | Upper — Chest & Back     | 4     | 14   | 45  | Push-Ups 4x8-12\*, Superman Hold 2x30-60 s, Pike Push-Up 4x8-12, Diamond Push-Ups 4x8-12                                                         |
| No bar | Lower — Squat Focus      | 5     | 16   | 44  | Bodyweight Squat 4x8-12\*, Glute Bridge 4x8-12, Bodyweight Lunge 3x8-12, Single-Leg Calf Raise 3x10-15, Superman Hold 2x30-60 s                  |
| No bar | Upper — Shoulders & Arms | 4     | 14   | 45  | Pike Push-Up 4x8-12\*, Superman Hold 2x30-60 s, Push-Ups 4x8-12, Diamond Push-Ups 4x8-12                                                         |
| No bar | Lower — Deadlift Focus   | 5     | 18   | 42  | Glute Bridge 4x8-12\*, Bodyweight Squat 4x8-12, Russian Twist 4x10-15, Single-Leg Calf Raise 3x10-15, Bodyweight Lunge 3x8-12                    |
| Bar    | Upper — Chest & Back     | 5     | 14   | 46  | Push-Ups 3x8-12\*, Superman Hold 2x30-60 s, Pike Push-Up 3x8-12, Pull-Ups 3x8-12, Diamond Push-Ups 3x8-12                                        |
| Bar    | Lower — Squat Focus      | 5     | 16   | 44  | Bodyweight Squat 4x8-12\*, Glute Bridge 4x8-12, Bodyweight Lunge 3x8-12, Single-Leg Calf Raise 3x10-15, Superman Hold 2x30-60 s                  |
| Bar    | Upper — Shoulders & Arms | 5     | 14   | 46  | Pike Push-Up 3x8-12\*, Pull-Ups 3x8-12, Push-Ups 3x8-12, Superman Hold 2x30-60 s, Diamond Push-Ups 3x8-12                                        |
| Bar    | Lower — Deadlift Focus   | 5     | 18   | 42  | Glute Bridge 4x8-12\*, Bodyweight Squat 4x8-12, Hanging Leg Raise 4x10-15, Single-Leg Calf Raise 3x10-15, Bodyweight Lunge 3x8-12                |

### 5 days

Today: push / pull / legs + upper / lower, 71 sets a week. No bar: upper / lower + full body, 77 sets. Bar: push / pull / legs + upper / lower, 74 sets.

|        | Day                      | Lifts | Sets | Min | Prescription                                                                                                                                     |
| ------ | ------------------------ | ----- | ---- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Today  | Pull — Lat Focus         | 5     | 15   | 46  | Pull-Ups 3x8-12\*, Dumbbell Row 3x8-12, Chin-Ups 3x8-12, Dumbbell Curl 3x10-15, Reverse Flyes 3x10-15                                            |
| Today  | Legs — Squat Focus       | 5     | 15   | 46  | Bulgarian Split Squat 3x8-12\*, Dumbbell Romanian Deadlift 3x8-12, Goblet Squat 3x8-12, Hanging Leg Raise 3x10-15, Single-Leg Calf Raise 3x10-15 |
| Today  | Upper — Chest & Back     | 4     | 12   | 47  | Dumbbell Bench Press 3x8-12\*, Dumbbell Row 3x8-12, Dumbbell Shoulder Press 3x8-12, Pull-Ups 3x8-12                                              |
| Today  | Push — Chest Focus       | 4     | 14   | 44  | Incline Dumbbell Press 4x8-12\*, Dumbbell Shoulder Press 4x8-12, Overhead Tricep Extension 3x10-15, Lateral Raise 3x10-15                        |
| Today  | Lower — Deadlift Focus   | 5     | 15   | 46  | Dumbbell Romanian Deadlift 3x8-12\*, Bulgarian Split Squat 3x8-12, Glute Bridge 3x8-12, Hanging Leg Raise 3x10-15, Single-Leg Calf Raise 3x10-15 |
| No bar | Lower — Deadlift Focus   | 5     | 16   | 44  | Glute Bridge 4x8-12\*, Bodyweight Squat 4x8-12, Superman Hold 2x30-60 s, Russian Twist 3x10-15, Single-Leg Calf Raise 3x10-15                    |
| No bar | Upper — Chest & Back     | 4     | 14   | 45  | Push-Ups 4x8-12\*, Superman Hold 2x30-60 s, Pike Push-Up 4x8-12, Diamond Push-Ups 4x8-12                                                         |
| No bar | Lower — Squat Focus      | 5     | 15   | 42  | Bodyweight Squat 3x8-12\*, Glute Bridge 3x8-12, Bodyweight Lunge 3x8-12, Russian Twist 3x10-15, Single-Leg Calf Raise 3x10-15                    |
| No bar | Upper — Shoulders & Arms | 4     | 14   | 45  | Pike Push-Up 4x8-12\*, Superman Hold 2x30-60 s, Push-Ups 4x8-12, Diamond Push-Ups 4x8-12                                                         |
| No bar | Full Body — Squat Focus  | 6     | 18   | 47  | Bodyweight Squat 3x8-12\*, Push-Ups 3x8-12\*, Glute Bridge 3x8-12, Crunches 3x10-15, Single-Leg Calf Raise 3x10-15, Pike Push-Up 3x8-12          |
| Bar    | Pull — Lat Focus         | 4     | 14   | 45  | Pull-Ups 4x8-12\*, Superman Hold 2x30-60 s, Chin-Ups 4x8-12, Pike Push-Up 4x8-12                                                                 |
| Bar    | Legs — Squat Focus       | 5     | 16   | 44  | Bodyweight Squat 4x8-12\*, Glute Bridge 4x8-12, Bodyweight Lunge 3x8-12, Single-Leg Calf Raise 3x10-15, Superman Hold 2x30-60 s                  |
| Bar    | Upper — Chest & Back     | 5     | 14   | 46  | Push-Ups 3x8-12\*, Superman Hold 2x30-60 s, Pike Push-Up 3x8-12, Pull-Ups 3x8-12, Diamond Push-Ups 3x8-12                                        |
| Bar    | Push — Chest Focus       | 3     | 12   | 40  | Push-Ups 4x8-12\*, Pike Push-Up 4x8-12, Diamond Push-Ups 4x8-12                                                                                  |
| Bar    | Lower — Deadlift Focus   | 5     | 18   | 42  | Glute Bridge 4x8-12\*, Bodyweight Squat 4x8-12, Hanging Leg Raise 4x10-15, Single-Leg Calf Raise 3x10-15, Bodyweight Lunge 3x8-12                |

### 6 days

Today: push / pull / legs twice, 88 sets a week. No bar: upper / lower + full body, 93 sets. Bar: push / pull / legs twice, 70 sets.

|        | Day                        | Lifts | Sets | Min | Prescription                                                                                                                                     |
| ------ | -------------------------- | ----- | ---- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Today  | Pull — Lat Focus           | 5     | 15   | 46  | Pull-Ups 3x8-12\*, Dumbbell Row 3x8-12, Chin-Ups 3x8-12, Dumbbell Curl 3x10-15, Reverse Flyes 3x10-15                                            |
| Today  | Push — Chest Focus         | 4     | 14   | 44  | Incline Dumbbell Press 4x8-12\*, Dumbbell Shoulder Press 4x8-12, Overhead Tricep Extension 3x10-15, Lateral Raise 3x10-15                        |
| Today  | Legs — Squat Focus         | 5     | 15   | 46  | Bulgarian Split Squat 3x8-12\*, Dumbbell Romanian Deadlift 3x8-12, Goblet Squat 3x8-12, Hanging Leg Raise 3x10-15, Single-Leg Calf Raise 3x10-15 |
| Today  | Pull — Row Focus           | 5     | 15   | 46  | Dumbbell Row 3x8-12\*, Pull-Ups 3x8-12, Chest-Supported Dumbbell Row 3x8-12, Dumbbell Curl 3x10-15, Reverse Flyes 3x10-15                        |
| Today  | Push — Shoulder Focus      | 4     | 14   | 44  | Arnold Press 4x8-12\*, Dumbbell Bench Press 4x8-12, Overhead Tricep Extension 3x10-15, Lateral Raise 3x10-15                                     |
| Today  | Legs — Deadlift Focus      | 5     | 15   | 46  | Dumbbell Romanian Deadlift 3x8-12\*, Bulgarian Split Squat 3x8-12, Glute Bridge 3x8-12, Goblet Squat 3x8-12, Hanging Leg Raise 3x10-15           |
| No bar | Lower — Deadlift Focus     | 5     | 16   | 44  | Glute Bridge 4x8-12\*, Bodyweight Squat 4x8-12, Superman Hold 2x30-60 s, Russian Twist 3x10-15, Single-Leg Calf Raise 3x10-15                    |
| No bar | Full Body — Squat Focus    | 6     | 18   | 47  | Bodyweight Squat 3x8-12\*, Push-Ups 3x8-12\*, Glute Bridge 3x8-12, Russian Twist 3x10-15, Single-Leg Calf Raise 3x10-15, Pike Push-Up 3x8-12     |
| No bar | Upper — Chest & Back       | 4     | 14   | 45  | Push-Ups 4x8-12\*, Superman Hold 2x30-60 s, Pike Push-Up 4x8-12, Diamond Push-Ups 4x8-12                                                         |
| No bar | Lower — Squat Focus        | 5     | 15   | 42  | Bodyweight Squat 3x8-12\*, Glute Bridge 3x8-12, Bodyweight Lunge 3x8-12, Crunches 3x10-15, Single-Leg Calf Raise 3x10-15                         |
| No bar | Upper — Shoulders & Arms   | 4     | 14   | 45  | Pike Push-Up 4x8-12\*, Superman Hold 2x30-60 s, Push-Ups 4x8-12, Diamond Push-Ups 4x8-12                                                         |
| No bar | Full Body — Deadlift Focus | 4     | 16   | 43  | Glute Bridge 4x8-12\*, Pike Push-Up 4x8-12\*, Bodyweight Squat 4x8-12, Single-Leg Calf Raise 4x10-15                                             |
| Bar    | Pull — Lat Focus           | 3     | 10   | 33  | Pull-Ups 4x8-12\*, Superman Hold 2x30-60 s, Chin-Ups 4x8-12                                                                                      |
| Bar    | Push — Chest Focus         | 3     | 12   | 40  | Push-Ups 4x8-12\*, Pike Push-Up 4x8-12, Diamond Push-Ups 4x8-12                                                                                  |
| Bar    | Legs — Squat Focus         | 5     | 16   | 44  | Bodyweight Squat 4x8-12\*, Glute Bridge 4x8-12, Bodyweight Lunge 3x8-12, Single-Leg Calf Raise 3x10-15, Superman Hold 2x30-60 s                  |
| Bar    | Pull — Row Focus           | 2     | 5    | 15  | Superman Hold 2x30-60 s\*, Pull-Ups 3x8-12                                                                                                       |
| Bar    | Push — Shoulder Focus      | 3     | 12   | 40  | Pike Push-Up 4x8-12\*, Push-Ups 4x8-12, Diamond Push-Ups 4x8-12                                                                                  |
| Bar    | Legs — Deadlift Focus      | 5     | 15   | 42  | Glute Bridge 3x8-12\*, Bodyweight Squat 3x8-12, Bodyweight Lunge 3x8-12, Hanging Leg Raise 3x10-15, Single-Leg Calf Raise 3x10-15                |

## 2. Beginners, 45 min

### Beginner, 3 days

Today: full body, 35 sets a week. No bar: full body, 39 sets. Bar: full body, 39 sets.

|        | Day                         | Lifts | Sets | Min | Prescription                                                                                                                                                 |
| ------ | --------------------------- | ----- | ---- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Today  | Full Body — Squat Focus     | 4     | 11   | 43  | Goblet Squat 3x8\*, Dumbbell Bench Press 3x8\*, Inverted Row 3x8-12, Glute Bridge 2x8-12                                                                     |
| Today  | Full Body — Deadlift Focus  | 4     | 11   | 47  | Dumbbell Romanian Deadlift 3x8\*, Dumbbell Shoulder Press 3x8\*, Dumbbell Row 3x8-12, Goblet Squat 2x8-12                                                    |
| Today  | Full Body — Posterior Focus | 6     | 13   | 47  | Dumbbell Romanian Deadlift 3x8\*, Dumbbell Bench Press 2x8-12, Inverted Row 2x8-12, Bodyweight Squat 2x8-12, Crunches 2x10-15, Single-Leg Calf Raise 2x10-15 |
| No bar | Full Body — Squat Focus     | 6     | 14   | 46  | Bodyweight Squat 3x8\*, Push-Ups 3x8\*, Superman Hold 2x30-60 s, Glute Bridge 2x8-12, Crunches 2x10-15, Single-Leg Calf Raise 2x10-15                        |
| No bar | Full Body — Deadlift Focus  | 4     | 11   | 38  | Glute Bridge 3x8\*, Pike Push-Up 3x8\*, Superman Hold 2x30-60 s, Bodyweight Squat 3x8-12                                                                     |
| No bar | Full Body — Posterior Focus | 6     | 14   | 45  | Glute Bridge 3x8\*, Push-Ups 3x8-12, Superman Hold 2x30-60 s, Bodyweight Squat 2x8-12, Crunches 2x10-15, Single-Leg Calf Raise 2x10-15                       |
| Bar    | Full Body — Squat Focus     | 6     | 14   | 46  | Bodyweight Squat 3x8\*, Push-Ups 3x8\*, Superman Hold 2x30-60 s, Glute Bridge 2x8-12, Crunches 2x10-15, Single-Leg Calf Raise 2x10-15                        |
| Bar    | Full Body — Deadlift Focus  | 4     | 11   | 38  | Glute Bridge 3x8\*, Pike Push-Up 3x8\*, Superman Hold 2x30-60 s, Bodyweight Squat 3x8-12                                                                     |
| Bar    | Full Body — Posterior Focus | 6     | 14   | 45  | Glute Bridge 3x8\*, Push-Ups 3x8-12, Superman Hold 2x30-60 s, Bodyweight Squat 2x8-12, Crunches 2x10-15, Single-Leg Calf Raise 2x10-15                       |

### Beginner, 6 days

Today: push / pull / legs twice, 78 sets a week. No bar: upper / lower + full body, 69 sets. Bar: upper / lower + full body, 72 sets.

|        | Day                        | Lifts | Sets | Min | Prescription                                                                                                                                                                 |
| ------ | -------------------------- | ----- | ---- | --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Today  | Pull — Lat Focus           | 6     | 13   | 46  | Inverted Row 3x8\*, Dumbbell Row 2x8-12, Chest-Supported Dumbbell Row 2x8-12, Dumbbell Curl 2x10-15, Hammer Curl 2x10-15, Reverse Flyes 2x10-15                              |
| Today  | Push — Chest Focus         | 6     | 13   | 47  | Incline Dumbbell Press 3x8\*, Dumbbell Shoulder Press 2x8-12, Dumbbell Bench Press 2x8-12, Tricep Kickback 2x10-15, Overhead Tricep Extension 2x10-15, Lateral Raise 2x10-15 |
| Today  | Legs — Squat Focus         | 6     | 13   | 47  | Goblet Squat 3x8\*, Dumbbell Romanian Deadlift 2x8-12, Bodyweight Squat 2x8-12, Crunches 2x10-15, Single-Leg Calf Raise 2x10-15, Glute Bridge 2x8-12                         |
| Today  | Pull — Row Focus           | 6     | 13   | 46  | Dumbbell Row 3x8\*, Inverted Row 2x8-12, Chest-Supported Dumbbell Row 2x8-12, Dumbbell Curl 2x10-15, Reverse Flyes 2x10-15, Hammer Curl 2x10-15                              |
| Today  | Push — Shoulder Focus      | 6     | 13   | 47  | Arnold Press 3x8\*, Dumbbell Bench Press 2x8-12, Dumbbell Shoulder Press 2x8-12, Tricep Kickback 2x10-15, Lateral Raise 2x10-15, Overhead Tricep Extension 2x10-15           |
| Today  | Legs — Deadlift Focus      | 6     | 13   | 47  | Dumbbell Romanian Deadlift 3x8\*, Goblet Squat 2x8-12, Glute Bridge 2x8-12, Bodyweight Squat 2x8-12, Crunches 2x10-15, Single-Leg Calf Raise 2x10-15                         |
| No bar | Lower — Deadlift Focus     | 6     | 14   | 45  | Glute Bridge 3x8\*, Bodyweight Squat 3x8-12, Superman Hold 2x30-60 s, Crunches 2x10-15, Single-Leg Calf Raise 2x10-15, Bodyweight Lunge 2x8-12                               |
| No bar | Full Body — Squat Focus    | 5     | 13   | 43  | Bodyweight Squat 3x8\*, Push-Ups 3x8\*, Glute Bridge 3x8-12, Crunches 2x10-15, Single-Leg Calf Raise 2x10-15                                                                 |
| No bar | Upper — Chest & Back       | 3     | 8    | 27  | Push-Ups 3x8\*, Superman Hold 2x30-60 s, Pike Push-Up 3x8-12                                                                                                                 |
| No bar | Lower — Squat Focus        | 5     | 14   | 44  | Bodyweight Squat 3x8\*, Glute Bridge 3x8-12, Bodyweight Lunge 3x8-12, Crunches 3x10-15, Single-Leg Calf Raise 2x10-15                                                        |
| No bar | Upper — Shoulders & Arms   | 3     | 8    | 27  | Pike Push-Up 3x8\*, Superman Hold 2x30-60 s, Push-Ups 3x8-12                                                                                                                 |
| No bar | Full Body — Deadlift Focus | 4     | 12   | 40  | Glute Bridge 3x8\*, Pike Push-Up 3x8\*, Bodyweight Squat 3x8-12, Single-Leg Calf Raise 3x10-15                                                                               |
| Bar    | Lower — Deadlift Focus     | 6     | 14   | 45  | Glute Bridge 3x8\*, Bodyweight Squat 3x8-12, Superman Hold 2x30-60 s, Crunches 2x10-15, Single-Leg Calf Raise 2x10-15, Bodyweight Lunge 2x8-12                               |
| Bar    | Full Body — Squat Focus    | 5     | 13   | 43  | Bodyweight Squat 3x8\*, Push-Ups 3x8\*, Glute Bridge 3x8-12, Crunches 2x10-15, Single-Leg Calf Raise 2x10-15                                                                 |
| Bar    | Upper — Chest & Back       | 4     | 11   | 34  | Push-Ups 3x8\*, Superman Hold 2x30-60 s, Pike Push-Up 3x8-12, Plank 3x30-60 s                                                                                                |
| Bar    | Lower — Squat Focus        | 5     | 14   | 44  | Bodyweight Squat 3x8\*, Glute Bridge 3x8-12, Bodyweight Lunge 3x8-12, Crunches 3x10-15, Single-Leg Calf Raise 2x10-15                                                        |
| Bar    | Upper — Shoulders & Arms   | 3     | 8    | 27  | Pike Push-Up 3x8\*, Superman Hold 2x30-60 s, Push-Ups 3x8-12                                                                                                                 |
| Bar    | Full Body — Deadlift Focus | 4     | 12   | 40  | Glute Bridge 3x8\*, Pike Push-Up 3x8\*, Bodyweight Squat 3x8-12, Single-Leg Calf Raise 3x10-15                                                                               |

## 3. Get stronger and Build muscle, 4 days, 60 min

The 8-rep floor shows here: Get stronger's main lifts are a fixed 8, not 5.
Pull-ups, a hard lift, keep the table's 6-10.

### Get stronger, 4 days, 60 min

Today: upper / lower, 65 sets a week. No bar: upper / lower, 64 sets. Bar: upper / lower, 72 sets.

|        | Day                      | Lifts | Sets | Min | Prescription                                                                                                                                          |
| ------ | ------------------------ | ----- | ---- | --- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Today  | Upper — Chest & Back     | 4     | 15   | 59  | Dumbbell Bench Press 4x6\*, Dumbbell Row 4x6-10, Dumbbell Shoulder Press 4x6-10, Pull-Ups 3x6-10                                                      |
| Today  | Lower — Squat Focus      | 5     | 16   | 59  | Bulgarian Split Squat 4x6\*, Dumbbell Romanian Deadlift 3x6-10, Goblet Squat 3x6-10, Single-Leg Calf Raise 3x8-12, Glute Bridge 3x6-10                |
| Today  | Upper — Shoulders & Arms | 5     | 17   | 61  | Dumbbell Shoulder Press 4x6\*, Pull-Ups 4x6-10, Dumbbell Bench Press 3x6-10, Dumbbell Curl 3x8-12, Lateral Raise 3x8-12                               |
| Today  | Lower — Deadlift Focus   | 5     | 17   | 60  | Dumbbell Romanian Deadlift 4x6\*, Bulgarian Split Squat 4x6-10, Glute Bridge 3x6-10, Hanging Leg Raise 3x8-12, Single-Leg Calf Raise 3x8-12           |
| No bar | Upper — Chest & Back     | 4     | 14   | 45  | Push-Ups 4x8\*, Superman Hold 2x30-60 s, Pike Push-Up 4x8-12, Diamond Push-Ups 4x8-12                                                                 |
| No bar | Lower — Squat Focus      | 6     | 18   | 55  | Bodyweight Squat 4x8\*, Glute Bridge 3x8-12, Bodyweight Lunge 3x8-12, Russian Twist 3x8-12, Single-Leg Calf Raise 3x8-12, Superman Hold 2x30-60 s     |
| No bar | Upper — Shoulders & Arms | 4     | 14   | 45  | Pike Push-Up 4x8\*, Superman Hold 2x30-60 s, Push-Ups 4x8-12, Diamond Push-Ups 4x8-12                                                                 |
| No bar | Lower — Deadlift Focus   | 5     | 18   | 54  | Glute Bridge 4x8\*, Bodyweight Squat 4x8-12, Russian Twist 4x8-12, Single-Leg Calf Raise 3x8-12, Bodyweight Lunge 3x8-12                              |
| Bar    | Upper — Chest & Back     | 5     | 18   | 58  | Push-Ups 4x8\*, Superman Hold 2x30-60 s, Pike Push-Up 4x8-12, Pull-Ups 4x6-10, Diamond Push-Ups 4x8-12                                                |
| Bar    | Lower — Squat Focus      | 6     | 18   | 55  | Bodyweight Squat 4x8\*, Glute Bridge 3x8-12, Bodyweight Lunge 3x8-12, Hanging Leg Raise 3x8-12, Single-Leg Calf Raise 3x8-12, Superman Hold 2x30-60 s |
| Bar    | Upper — Shoulders & Arms | 5     | 18   | 58  | Pike Push-Up 4x8\*, Pull-Ups 4x6-10, Push-Ups 4x8-12, Superman Hold 2x30-60 s, Diamond Push-Ups 4x8-12                                                |
| Bar    | Lower — Deadlift Focus   | 5     | 18   | 54  | Glute Bridge 4x8\*, Bodyweight Squat 4x8-12, Hanging Leg Raise 4x8-12, Single-Leg Calf Raise 3x8-12, Bodyweight Lunge 3x8-12                          |

### Build muscle, 4 days, 60 min

Today: upper / lower, 65 sets a week. No bar: upper / lower, 64 sets. Bar: upper / lower, 72 sets.

|        | Day                      | Lifts | Sets | Min | Prescription                                                                                                                                               |
| ------ | ------------------------ | ----- | ---- | --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Today  | Upper — Chest & Back     | 4     | 15   | 58  | Dumbbell Bench Press 4x6-10\*, Dumbbell Row 4x8-12, Dumbbell Shoulder Press 4x8-12, Pull-Ups 3x8-12                                                        |
| Today  | Lower — Squat Focus      | 5     | 16   | 58  | Bulgarian Split Squat 4x6-10\*, Dumbbell Romanian Deadlift 3x8-12, Goblet Squat 3x8-12, Single-Leg Calf Raise 3x12-15, Glute Bridge 3x8-12                 |
| Today  | Upper — Shoulders & Arms | 5     | 17   | 60  | Dumbbell Shoulder Press 4x6-10\*, Pull-Ups 4x8-12, Dumbbell Bench Press 3x8-12, Dumbbell Curl 3x10-15, Lateral Raise 3x12-20                               |
| Today  | Lower — Deadlift Focus   | 5     | 17   | 59  | Dumbbell Romanian Deadlift 4x6-10\*, Bulgarian Split Squat 4x8-12, Glute Bridge 3x8-12, Hanging Leg Raise 3x12-15, Single-Leg Calf Raise 3x12-15           |
| No bar | Upper — Chest & Back     | 4     | 14   | 45  | Push-Ups 4x8-12\*, Superman Hold 2x30-60 s, Pike Push-Up 4x8-12, Diamond Push-Ups 4x8-12                                                                   |
| No bar | Lower — Squat Focus      | 6     | 18   | 55  | Bodyweight Squat 4x8-12\*, Glute Bridge 3x8-12, Bodyweight Lunge 3x8-12, Russian Twist 3x12-15, Single-Leg Calf Raise 3x12-15, Superman Hold 2x30-60 s     |
| No bar | Upper — Shoulders & Arms | 4     | 14   | 45  | Pike Push-Up 4x8-12\*, Superman Hold 2x30-60 s, Push-Ups 4x8-12, Diamond Push-Ups 4x8-12                                                                   |
| No bar | Lower — Deadlift Focus   | 5     | 18   | 54  | Glute Bridge 4x8-12\*, Bodyweight Squat 4x8-12, Russian Twist 4x12-15, Single-Leg Calf Raise 3x12-15, Bodyweight Lunge 3x8-12                              |
| Bar    | Upper — Chest & Back     | 5     | 18   | 58  | Push-Ups 4x8-12\*, Superman Hold 2x30-60 s, Pike Push-Up 4x8-12, Pull-Ups 4x8-12, Diamond Push-Ups 4x8-12                                                  |
| Bar    | Lower — Squat Focus      | 6     | 18   | 55  | Bodyweight Squat 4x8-12\*, Glute Bridge 3x8-12, Bodyweight Lunge 3x8-12, Hanging Leg Raise 3x12-15, Single-Leg Calf Raise 3x12-15, Superman Hold 2x30-60 s |
| Bar    | Upper — Shoulders & Arms | 5     | 18   | 58  | Pike Push-Up 4x8-12\*, Pull-Ups 4x8-12, Push-Ups 4x8-12, Superman Hold 2x30-60 s, Diamond Push-Ups 4x8-12                                                  |
| Bar    | Lower — Deadlift Focus   | 5     | 18   | 54  | Glute Bridge 4x8-12\*, Bodyweight Squat 4x8-12, Hanging Leg Raise 4x12-15, Single-Leg Calf Raise 3x12-15, Bodyweight Lunge 3x8-12                          |

## 4. Minimal with the bar off

A new Minimal plan starts with "A pull-up bar" off (Lift4 STATUS). The days,
sets and minutes stay the same. Pull-ups become inverted rows, chin-ups a
chest-supported dumbbell row, and the hanging leg raise a Russian twist. The
same swaps happen at 2, 3 and 5 days.

An existing Minimal or Home gym plan was never asked, which counts as yes
(Pgm5), so it keeps its pull-ups. Home gym starts with the bar on. If
someone turns it off, a Home gym plan changes exactly as Minimal does here.

### Minimal, 4 days, no bar

|       | Day                      | Lifts | Sets | Min | Prescription                                                                                                                                     |
| ----- | ------------------------ | ----- | ---- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Today | Upper — Chest & Back     | 4     | 12   | 47  | Dumbbell Bench Press 3x8-12\*, Dumbbell Row 3x8-12, Dumbbell Shoulder Press 3x8-12, Pull-Ups 3x8-12                                              |
| Today | Lower — Squat Focus      | 5     | 15   | 46  | Bulgarian Split Squat 3x8-12\*, Dumbbell Romanian Deadlift 3x8-12, Goblet Squat 3x8-12, Hanging Leg Raise 3x10-15, Single-Leg Calf Raise 3x10-15 |
| Today | Upper — Shoulders & Arms | 5     | 15   | 47  | Dumbbell Shoulder Press 3x8-12\*, Pull-Ups 3x8-12, Dumbbell Bench Press 3x8-12, Dumbbell Curl 3x10-15, Lateral Raise 3x10-15                     |
| Today | Lower — Deadlift Focus   | 5     | 15   | 46  | Dumbbell Romanian Deadlift 3x8-12\*, Bulgarian Split Squat 3x8-12, Glute Bridge 3x8-12, Hanging Leg Raise 3x10-15, Single-Leg Calf Raise 3x10-15 |
| New   | Upper — Chest & Back     | 4     | 12   | 47  | Dumbbell Bench Press 3x8-12\*, Dumbbell Row 3x8-12, Dumbbell Shoulder Press 3x8-12, Inverted Row 3x8-12                                          |
| New   | Lower — Squat Focus      | 5     | 15   | 46  | Bulgarian Split Squat 3x8-12\*, Dumbbell Romanian Deadlift 3x8-12, Goblet Squat 3x8-12, Russian Twist 3x10-15, Single-Leg Calf Raise 3x10-15     |
| New   | Upper — Shoulders & Arms | 5     | 15   | 47  | Dumbbell Shoulder Press 3x8-12\*, Inverted Row 3x8-12, Dumbbell Bench Press 3x8-12, Dumbbell Curl 3x10-15, Lateral Raise 3x10-15                 |
| New   | Lower — Deadlift Focus   | 5     | 15   | 46  | Dumbbell Romanian Deadlift 3x8-12\*, Bulgarian Split Squat 3x8-12, Glute Bridge 3x8-12, Russian Twist 3x10-15, Single-Leg Calf Raise 3x10-15     |

### Minimal, 6 days, no bar

|       | Day                   | Lifts | Sets | Min | Prescription                                                                                                                                     |
| ----- | --------------------- | ----- | ---- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Today | Pull — Lat Focus      | 5     | 15   | 46  | Pull-Ups 3x8-12\*, Dumbbell Row 3x8-12, Chin-Ups 3x8-12, Dumbbell Curl 3x10-15, Reverse Flyes 3x10-15                                            |
| Today | Push — Chest Focus    | 4     | 14   | 44  | Incline Dumbbell Press 4x8-12\*, Dumbbell Shoulder Press 4x8-12, Overhead Tricep Extension 3x10-15, Lateral Raise 3x10-15                        |
| Today | Legs — Squat Focus    | 5     | 15   | 46  | Bulgarian Split Squat 3x8-12\*, Dumbbell Romanian Deadlift 3x8-12, Goblet Squat 3x8-12, Hanging Leg Raise 3x10-15, Single-Leg Calf Raise 3x10-15 |
| Today | Pull — Row Focus      | 5     | 15   | 46  | Dumbbell Row 3x8-12\*, Pull-Ups 3x8-12, Chest-Supported Dumbbell Row 3x8-12, Dumbbell Curl 3x10-15, Reverse Flyes 3x10-15                        |
| Today | Push — Shoulder Focus | 4     | 14   | 44  | Arnold Press 4x8-12\*, Dumbbell Bench Press 4x8-12, Overhead Tricep Extension 3x10-15, Lateral Raise 3x10-15                                     |
| Today | Legs — Deadlift Focus | 5     | 15   | 46  | Dumbbell Romanian Deadlift 3x8-12\*, Bulgarian Split Squat 3x8-12, Glute Bridge 3x8-12, Goblet Squat 3x8-12, Hanging Leg Raise 3x10-15           |
| New   | Pull — Lat Focus      | 5     | 15   | 46  | Inverted Row 3x8-12\*, Dumbbell Row 3x8-12, Chest-Supported Dumbbell Row 3x8-12, Dumbbell Curl 3x10-15, Reverse Flyes 3x10-15                    |
| New   | Push — Chest Focus    | 4     | 14   | 44  | Incline Dumbbell Press 4x8-12\*, Dumbbell Shoulder Press 4x8-12, Overhead Tricep Extension 3x10-15, Lateral Raise 3x10-15                        |
| New   | Legs — Squat Focus    | 5     | 15   | 46  | Bulgarian Split Squat 3x8-12\*, Dumbbell Romanian Deadlift 3x8-12, Goblet Squat 3x8-12, Russian Twist 3x10-15, Single-Leg Calf Raise 3x10-15     |
| New   | Pull — Row Focus      | 5     | 15   | 46  | Dumbbell Row 3x8-12\*, Inverted Row 3x8-12, Chest-Supported Dumbbell Row 3x8-12, Dumbbell Curl 3x10-15, Reverse Flyes 3x10-15                    |
| New   | Push — Shoulder Focus | 4     | 14   | 44  | Arnold Press 4x8-12\*, Dumbbell Bench Press 4x8-12, Overhead Tricep Extension 3x10-15, Lateral Raise 3x10-15                                     |
| New   | Legs — Deadlift Focus | 5     | 15   | 46  | Dumbbell Romanian Deadlift 3x8-12\*, Bulgarian Split Squat 3x8-12, Glute Bridge 3x8-12, Goblet Squat 3x8-12, Russian Twist 3x10-15               |

## 5. The glute bridge's 8-rep floor in Home gym and Minimal

With the bar on, or never asked, Home gym and Minimal plans change in one
place: in Get stronger and Support running, the glute bridge goes from 3x6-10
to 3x8-12. Minimal's week is the same.

### Home gym, Get stronger, 4 days, 60 min, with the bar

|       | Day                      | Lifts | Sets | Min | Prescription                                                                                                                                |
| ----- | ------------------------ | ----- | ---- | --- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Today | Upper — Chest & Back     | 4     | 15   | 59  | Dumbbell Bench Press 4x6\*, Dumbbell Row 4x6-10, Dumbbell Shoulder Press 4x6-10, Pull-Ups 3x6-10                                            |
| Today | Lower — Squat Focus      | 5     | 16   | 59  | Bulgarian Split Squat 4x6\*, Dumbbell Romanian Deadlift 3x6-10, Goblet Squat 3x6-10, Single-Leg Calf Raise 3x8-12, Glute Bridge 3x6-10      |
| Today | Upper — Shoulders & Arms | 5     | 17   | 61  | Dumbbell Shoulder Press 4x6\*, Pull-Ups 4x6-10, Dumbbell Bench Press 3x6-10, Dumbbell Curl 3x8-12, Lateral Raise 3x8-12                     |
| Today | Lower — Deadlift Focus   | 5     | 17   | 60  | Dumbbell Romanian Deadlift 4x6\*, Bulgarian Split Squat 4x6-10, Glute Bridge 3x6-10, Hanging Leg Raise 3x8-12, Single-Leg Calf Raise 3x8-12 |
| New   | Upper — Chest & Back     | 4     | 15   | 59  | Dumbbell Bench Press 4x6\*, Dumbbell Row 4x6-10, Dumbbell Shoulder Press 4x6-10, Pull-Ups 3x6-10                                            |
| New   | Lower — Squat Focus      | 5     | 16   | 59  | Bulgarian Split Squat 4x6\*, Dumbbell Romanian Deadlift 3x6-10, Goblet Squat 3x6-10, Single-Leg Calf Raise 3x8-12, Glute Bridge 3x8-12      |
| New   | Upper — Shoulders & Arms | 5     | 17   | 61  | Dumbbell Shoulder Press 4x6\*, Pull-Ups 4x6-10, Dumbbell Bench Press 3x6-10, Dumbbell Curl 3x8-12, Lateral Raise 3x8-12                     |
| New   | Lower — Deadlift Focus   | 5     | 17   | 60  | Dumbbell Romanian Deadlift 4x6\*, Bulgarian Split Squat 4x6-10, Glute Bridge 3x8-12, Hanging Leg Raise 3x8-12, Single-Leg Calf Raise 3x8-12 |

## What else moves

- **Plan-sweep golden snapshot** (`planSweep.golden.test.ts.snap`): 16 setups
  (3 to 6 days, Home gym and Minimal, Get stronger and Support running), 28
  lines, all the glute bridge from 3x6-10 to 3x8-12. Nothing else.
- **Simulator traces**: none move, lifting or running; no `KNOWN_COACHING`
  entry changes. Two 26-week No equipment people are new
  (`noEquipment.sim.test.ts`).
- **Full gym**: no output changes.
