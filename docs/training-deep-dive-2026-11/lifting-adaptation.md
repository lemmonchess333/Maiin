# Lifting adaptation: what each input changes, and whether a coach would agree

Investigator slice: lifting adaptation. Worktree a checkout of main at `a199cfd7` (main at `a199cfd7`). Read-only; nothing tracked was edited.
Every plan below is real engine output from scratch tests (`src/features/program/__tests__/zzAdapt*.scratch.test.ts`), with the data in `evidence/adapt-*.json(l)`. The grid sweep is 10,080 plans (5 goals x 3 levels x 4 lengths x 1-6 days x 4 kits x 7 injury sets).

Baseline used throughout: Build muscle, intermediate, 4 days, 60 min, full gym, 80 kg man, no injuries. `[M]` = main lift.

## 1. Verdict

- The engine adapts the exercise NAME to kit and injury, and the LOAD to level, sex and bodyweight. It does not adapt the DOSE: a swapped lift keeps its slot's sets and reps and often the original's load, so an injured or home lifter gets prescriptions no coach would write (trap bar deadlift at the deadlift's full weight for a bad back, Bulgarian split squat 4x3, bodyweight glute bridge 3x4-8, a 104 kg kettlebell swing).
- The person's own control is thin and partly broken: they can add, remove, replace and reorder, but cannot change sets or reps or pick a split, and a lift they add by hand starts at a compound's weight (Add Lateral Raise gives 3x12-20 at 32.5 kg).
- Level is two tiers in practice: beginner, and everyone else. Advanced is intermediate with heavier first guesses. A beginner who moves up keeps the beginner plan.
- Week to week the plan is static: same lifts, same sets, load or reps climb, half the sets every 4th trained week for intermediates. Missed weeks and layoffs are handled well. Light dumbbell lifts stop moving for months.
- Most of the worst output is not a locked decision. Three items are locked (sets-only refit, level change never rebuilds, two volume tiers) and need an owner call.

## 2. What changes when each input changes

Baseline week, 56 sets:

| Day              | Lifts                                                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Upper A (54 min) | Bench Press 3x4-8 @57.5 [M]; Barbell Row 3x4-8 @55 [M]; Overhead Press 3x4-8 @37.5 [M]; Lateral Raise 2x10-18 @10                                            |
| Lower A (58 min) | Barbell Squat 3x4-8 @90 [M]; Deadlift 3x4-8 @105 [M]; Hack Squat 3x6-10 @80; Cable Crunch 2x10-18; Standing Calf Raise 2x10-18                               |
| Upper B (60 min) | Overhead Press 3x8-12 [M]; Pull-Ups 3x8-12 [M]; Dumbbell Bench Press 3x10-14 @20; Dumbbell Curl 3x12-17 @6; Rope Pushdown 3x12-17 @15; Lateral Raise 2x14-20 |
| Lower B (57 min) | Deadlift 3x6-10 @105 [M]; Hack Squat 3x10-14; Seated Leg Curl 3x12-17; Cable Crunch 3x14-20; Seated Calf Raise 3x14-20                                       |

Noted for the lead, not pursued: direct chest work is 6 sets a week (bench 3 + dumbbell bench 3) while the app's tally says 12, because every overhead press set counts 1:1 toward chest (`exercises.ts:659` secondary "Upper Chest", `volumeModel.ts` `SECONDARY_SET_WEIGHT = 1.0`, ADR-0010). Direct back work is 6 sets. Deadlift is a main lift twice a week, bench once. Across the sweep's Build muscle full-gym plans the share of lifts at 2 sets or fewer is 94% at 30 min, 85% at 45, 50% at 60, 17% at 75 (intermediate).

### 2.1 Experience

| Level        | Sets | What differs from intermediate                                                                                                                                                                                                  |
| ------------ | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Beginner     | 48   | Main lifts fixed 3x8 (no range, no heavier/lighter days): Bench 35, Squat 55, Deadlift 67.5. Everything else 2 sets. Pull-Ups become Lat Pulldown 3x8. Upper A's lateral raise becomes Dumbbell Curl 2x10-15. No lighter weeks. |
| Intermediate | 56   | Baseline.                                                                                                                                                                                                                       |
| Advanced     | 56   | Same lifts, sets and reps. Barbell Curl for Dumbbell Curl. Loads up: Bench 80, Squat 120, Deadlift 140.                                                                                                                         |

Sweep: intermediate and advanced have the identical structure in 1,830 of 3,360 paired plans and the same total sets in 2,611. The differences are curl and press variants.
Coach's view: beginner is right in kind (fixed targets, simple lifts, no pull-ups). Advanced is not a programme, it is a load dial.

### 2.2 Session length (4 days, intermediate)

| Minutes | Sets | Estimated minutes per day | Shape                                                                                                                                                          |
| ------- | ---- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 30      | 26   | 37 / 33 / 32 / 28         | 3-4 lifts, every lift 2 sets. Bench 2x4-8, Row 2x4-8, OHP 2x4-8 and nothing else on Upper A. No calf or side-delt work in the week.                            |
| 45      | 36   | 43 / 41 / 38 / 45         | 4-5 lifts, every lift 2 sets.                                                                                                                                  |
| 60      | 56   | 54 / 58 / 60 / 57         | Baseline.                                                                                                                                                      |
| 75      | 66   | 75 / 62 / 62 / 57         | Upper A gains Dumbbell Curl 3x8-13 and Pushdown 3x8-13; 2-set accessories go to 3. Lower A gains 2 sets, Lower B none. Chest and back direct sets do not move. |
| 90      | 66   | same as 75                | "75+" is one option.                                                                                                                                           |

Sweep (full gym, no injury): at 30 min half of intermediate days are priced over 32 min (max 37). At 75 min 59% of intermediate days and 85% of beginner days are priced more than 10 min under the length asked for.
Coach's view: the short end cuts sets before lifts, which leaves a list of 2-set lifts. The long end has nothing to add because the role table tops out at 3 sets a lift.

### 2.3 Lift days (intermediate, 60 min)

| Days | Split (`programEngine.ts:394-417`) | Sets | What the week looks like                                                                                                                 |
| ---- | ---------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Full body                          | 12   | 6 lifts x 2 sets.                                                                                                                        |
| 2    | Full body x2                       | 26   | 6 and 7 lifts, every one 2 sets. Squat and deadlift in both sessions. Bench once (2x4-8).                                                |
| 3    | Full body x3                       | 39   | 6 lifts a day at 2-3 sets.                                                                                                               |
| 4    | Upper / Lower x2                   | 56   | Baseline.                                                                                                                                |
| 5    | Pull, Push, Legs, Upper, Lower     | 70   | No leg curl anywhere. Squat and deadlift both appear in both leg sessions.                                                               |
| 6    | Push/Pull/Legs x2                  | 72   | Pull B is 3 lifts, 8 sets, 31 min of a 60-minute budget. Push B 41 min. 3 sets of curls a week, no rear-delt work, no triceps on Push B. |
| 7    | Same as 6                          | 72   | Capped at 6.                                                                                                                             |

Coach's view: the split choice per day count is sound. The content inside 2, 5 and 6 days is not (lead's slice). The person cannot choose a split: `preferredSplit` is stored and ignored (`planBuilder.ts:163-168`, Pgm5).

### 2.4 Equipment

| Kit                  | Sets | What changes                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full gym             | 56   | Baseline. `barbellAtHome` has no effect, as it should.                                                                                                                                                                                                                                                                                                                                                                                             |
| Home gym             | 59   | Bench -> Dumbbell Bench 3x4-8 @20. Row -> Dumbbell Row 3x4-8 @22.5. OHP -> Dumbbell Shoulder Press 3x4-8 @12.5. Squat -> Bulgarian Split Squat 3x4-8 @22.5 [M]. Deadlift -> Dumbbell RDL 3x4-8 @27.5 [M] and again 3x6-10. Hack Squat -> Goblet Squat 3x6-10 / Bulgarian Split Squat 3x10-14. Leg Curl -> Glute Bridge 3x10-14 bodyweight. Cable Crunch -> Hanging Leg Raise 3x10-15 and 3x14-15. Calf raises -> Single-Leg Calf Raise bodyweight. |
| Home gym + barbell   | 58   | Barbell lifts stay. Hack Squat -> Front Squat 3x6-10 @67.5 on the day that already has Squat and Deadlift. Lower B becomes Deadlift 3x6-10, Barbell Squat 3x10-14, Romanian Deadlift 3x10-14.                                                                                                                                                                                                                                                      |
| Minimal / bodyweight | 59   | Identical to Home gym. Sweep: 2,440 of 2,520 paired plans are identical including loads.                                                                                                                                                                                                                                                                                                                                                           |

Coach's view: the swaps are the right family of movement. The numbers are the barbell slot's: dumbbell and unilateral lifts at 4-8, a bodyweight bridge at 10-14 for an intermediate.

### 2.5 Injuries (the five options the UI offers: `ProgrammeSettings.tsx:407-446`, `Onboarding.tsx:1899-1904`)

| Injury     | Removed -> replacement (baseline)                                                                                                                                                          | Left in that a coach would question                                                                                                                                                             | Volume                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Lower back | Barbell Row -> Chest-Supported DB Row 3x4-8 @20. OHP -> Seated DB Press 3x4-8 @12.5. Squat -> Bulgarian Split Squat 3x4-8 @22.5. Deadlift -> Trap Bar Deadlift 3x4-8 @105 and 3x6-10 @105. | Trap bar deadlift at the deadlift's own load, twice a week. Cable Crunch goes UP from 2 to 3 sets on Lower A (loaded spinal flexion). Hack Squat on both days.                                  | 56 -> 56 sets. Sweep mean +0.6. It moves; it does not drop.           |
| Shoulder   | Bench -> Chest Press Machine 3x4-8 @57.5. OHP -> Landmine Press 3x4-8 @20 and 3x8-12. Pull-Ups -> Lat Pulldown 3x8-12 @47.5.                                                               | Lateral Raise on both upper days. Back squat (bar position). At home: Lat Pulldown -> Chin-Ups in 354 slots, although Pull-Ups are named for the shoulder. Overhead dumbbell triceps extension. | 56 -> 54. Pressing sets 12 -> 12. Sweep mean 0.0.                     |
| Knee       | Squat -> Bulgarian Split Squat 3x4-8 @22.5 [M]. Hack Squat -> Hip Thrust 2x6-10 @95 (Lower A) and -> Bulgarian Split Squat 3x10-14 (Lower B).                                              | Bulgarian split squat twice a week, once as the heavy main lift. Run plan untouched (injuries are not read by `runScheduler.ts`).                                                               | Quads 9 -> 6, hamstrings 12 -> 17. Sweep mean -0.8 total, quads -1.8. |
| Elbow      | Pull-Ups -> Lat Pulldown. Curl -> Hammer Curl 3x12-17 @6.                                                                                                                                  | Fine. One inconsistency: Skull Crushers -> Overhead Cable Triceps Extension (26 slots) while the dumbbell overhead extension is named for the elbow.                                            | 56 -> 55.                                                             |
| Wrist      | Bench -> Chest Press Machine. OHP -> Dumbbell Shoulder Press 3x4-8 @12.5. Curl -> Hammer Curl.                                                                                             | Fine.                                                                                                                                                                                           | 56 -> 55.                                                             |

Sweep facts: no plan in 8,640 injured plans carries a "No safe substitute" or "needs equipment" flag, and no lift named in `CONTRAINDICATED` survives. The promises as written are kept. What the promises do not cover is load and dose (section 3, D2).

### 2.6 Goal (`primaryGoal`)

| Goal               | Sets | What changes                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------ | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Build muscle       | 56   | Baseline.                                                                                                                                                                                                                                                                                                                                                                      |
| Lose fat           | 56   | Identical to Build muscle, loads included, in all 2,016 paired plans. Locked: Lift4 (4). A coach would agree.                                                                                                                                                                                                                                                                  |
| General fitness    | 56   | Same lifts. Main lifts 3x6-10 and 3x10-14. Loads 2.5-5 kg lower.                                                                                                                                                                                                                                                                                                               |
| Get stronger       | 53   | Bench 4x3 @60, Row 4x3, OHP 2x3 (Upper A is three lifts). Squat 4x3 @92.5, Deadlift 2x3. Upper B OHP 4x7, Pull-Ups 4x7. Lower B Deadlift 4x5. Accessories 2 sets; calves and abs 2x6-10.                                                                                                                                                                                       |
| Support my running | 54   | The same four days and the same lifts with fixed low reps: Bench 3x3, Row 3x3, OHP 3x3, Squat 3x3, Deadlift 3x3 then 3x5. Curls, pushdowns and lateral raises stay. On 2 days x 45 min: Squat 2x3, Bench 2x3, Pull-Ups 3x6-10, Cable Crunch / Deadlift 2x5, OHP 2x7, Dumbbell Curl, Seated Calf Raise, Lateral Raise. Four lower-body working sets a week, no single-leg work. |

### 2.7 Sex and bodyweight (first weights, intermediate; `startingLoads.ts:58-136`, `sexFactor` at `:85`)

| Person               | Bench / Squat / Deadlift / OHP | Notes                                                                                               |
| -------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------- |
| Man 50 kg            | 37.5 / 55 / 65 / 25            |                                                                                                     |
| Man 80 kg            | 57.5 / 90 / 105 / 37.5         | Baseline.                                                                                           |
| Man 110 kg           | 82.5 / 122.5 / 145 / 52.5      | Linear in bodyweight, no cap.                                                                       |
| Woman 50 kg          | 30 / 42.5 / 50 / none          | OHP would start under the bar, so it is built as Dumbbell Shoulder Press 3x4-8 @6 (Pgm8 L15). Good. |
| Woman 80 kg          | 45 / 65 / 80 / 30              | x0.75 of the man's.                                                                                 |
| No bodyweight        | 20 / 20 / 20 / 20              | Starts from the bar (Lift4 (5)).                                                                    |
| Sex "other" or unset | as a man                       | `onboardingPlan.ts:68`, `sexFactor`.                                                                |

Pull-Ups are 3x8-12 bodyweight for every intermediate, at 50 kg or 130 kg, man or woman. Age is on the profile (`auth.tsx:231`) and reaches nothing in the lift engine.

### 2.8 Week to week

| Event                | What the engine does                                                                                                                                                              | Evidence                                                                                                              |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Ordinary week        | Same lifts, same sets (`resetToBaseSets`, `programEngine.ts:2771`). Load or reps climb per lift from what was logged. No volume ramp, no exercise rotation.                       | Scratch: 56 sets in weeks 1-3, 5-7, 9. Traces: sets/days line constant.                                               |
| Lighter week         | Every 4th TRAINED week, intermediates and advanced on 3+ days: half the sets (rounded up), same weights. 56 -> 36. None for beginners or 1-2 day plans.                           | `programEngine.ts:2750-2758`, `:3043-3049`; scratch `phases`.                                                         |
| Missed week          | Week number holds; no lighter week is spent on a week nobody trained; session order carries over.                                                                                 | `advanceWeek` `programEngine.ts:2926-2941`; trace `layoff-keeps-weights` w9-w12.                                      |
| Layoff               | From 14 days a Welcome back sheet; easing back is the person's choice: loads -10% (-20% after 8 weeks), one set fewer for the first week, each lift climbs back a step a session. | `liftLayoff.ts:28-40`, `easeBackIn` `programEngine.ts:3242`; scratch: Bench 57.5 -> 52.5 / 45, Squat 90 -> 80 / 72.5. |
| Two misses on a lift | 10% lighter, then a step back up each session.                                                                                                                                    | Traces (`LOWERED`).                                                                                                   |
| Level                | Suggested from history, never changed for the person.                                                                                                                             | `experienceDetection.ts:1-80`.                                                                                        |
| Rough day            | "Easier today": one set fewer per lift, 85% loads, plan untouched.                                                                                                                | Scratch: Upper B 17 sets -> 11, OHP 37.5 -> 32.5.                                                                     |

26-week traces (`__traces__/*.txt`): novice man squat plan 62.5 -> 85 kg, 18 steps; intermediate size plans move one or two 2.5 kg steps in 26 weeks with reps climbing in between (e.g. `layoff-keeps-weights` squat 105x7 -> 107.5x10), 6 lighter weeks of 26. A coach would call the intermediate block flat but defensible. The dumbbell beginner is not (D10).

### 2.9 The person's own control

| Action                                | Available                                                                                                                                            | Survives a settings save (same day count) | Survives a rollover                                                                                      | Survives a lift-days change                                                                 |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Replace a lift                        | Yes (`useProgram.ts:3134`)                                                                                                                           | Yes                                       | Yes                                                                                                      | Mostly no. 4 -> 5 days kept the replaced bench in one of two bench slots; 4 -> 3 kept none. |
| Add a lift                            | Yes (`:3012`)                                                                                                                                        | Yes                                       | Yes                                                                                                      | No                                                                                          |
| Remove a lift                         | Yes (`:2967`)                                                                                                                                        | Yes                                       | Yes                                                                                                      | No (it comes back)                                                                          |
| Reorder                               | Yes (`:2891`)                                                                                                                                        | Yes                                       | Yes, but see D11                                                                                         | No                                                                                          |
| Change sets or reps of a planned lift | No. `updateExercise` was deleted from the client (`useProgram.ts:2348-2361`); the server command remains with no caller (`programCommands.js:1386`). | n/a                                       | A set count written without `baseSets` reverts at rollover (scratch: 5 -> 3; `programTypes.ts:137-146`). | n/a                                                                                         |
| Choose a split                        | No (Pgm5)                                                                                                                                            |                                           |                                                                                                          |                                                                                             |

The lift-days dialog says the edits will go ("Any exercises you've added, removed, or reordered will be reset to the new plan", `programmeChanges.ts:337-339`). That is honest.

## 3. Defects, most serious first

### D1. A lift the person adds or swaps in starts at a compound's weight. Breaks trust.

- Experience: Train > Add exercise > Lateral Raise shows "3 x 12-20 · 32.5 kg" for an 80 kg intermediate man. The same lift in the generated plan is 10 kg.
- Evidence (scratch `zzAdaptAddReplace`, `adapt-addreplace.json`), 80 kg intermediate man, Add: Lateral Raise 32.5 kg, Front Raise 35, Dumbbell Flyes 55, Cable Fly 55, Pec Deck 55, Face Pulls 52.5, Reverse Flyes 52.5 (dumbbells), Leg Extension 85, Lunges 3x6-10 @85 (dumbbells), Hip Abduction 100, Cable Glute Kickback 100, Kettlebell Swing 100, Turkish Get-Up 36. Replace: Bench -> Cable Fly 62.5, OHP -> Lateral Raise 40, Lateral Raise (10 kg) -> Cable Lateral Raise 32.5, Leg Curl (27.5) -> Glute-Ham Raise 90, Deadlift -> Kettlebell Swing 112, Squat -> Lunges 95. A 60 kg beginner woman gets Lateral Raise 12.5 kg, Lunges 3x8 @32.5.
- Scope: 60 of the 105 loaded catalogue lifts are not in `exerciseBank` and so have no load factor (`adapt-bank.json`). All four entry points share it: Train Add (`useProgram.ts:3020`), Train Replace (`:3145`), session Add (`sessionAdd.ts:44-48`), Swap for today (`sessionSwap.ts:45`). In a session the last-lifted weight wins when there is one.
- Root cause: `startingWeightForExercise` scales the movement category's main-lift seed by `loadFactorFor`, which returns 1 for a lift the bank does not list (`variationBank.ts:642-649`). The 0.3 fallback applies only when `isAccessory === true` (`startingLoads.ts:266-269`), and `addedExerciseWeight` (`:307-325`) and `weightAfterExerciseSwap` (`:335-381`) pass `undefined`. The comment at `:158-172` describes these exact numbers ("35 kg dumbbell lateral raise, 52.5 kg face pull, 85 kg leg extension") as fixed; the fix covered the generator's path only. The tests check bank lifts only (`startingLoads.test.ts:721-750`).
- Fix: give every loaded catalogue lift a load factor (a column on the catalogue or the bank), and pin it with a test that walks the whole catalogue ("no isolation seeds above 40% of its category's main lift; no dumbbell or kettlebell lift above the rack"). Stopgap: treat `mechanic === "isolation"` as the 0.3 case in both functions. That fixes raises and flyes but not lunges, swings or get-ups.
- Size: S for the stopgap, M for the table. No lock in the way (Lift5 covers the sets and reps, not the weight).
- Related: an added lift has `isAccessory` undefined, so it counts as a main lift everywhere the engine asks (never cut by the time fit, protected in the short-session trims). Set the flag from the lift's role when it is added.
- STATUS 2026-11-12: the table built (`catalogueLoads.ts`); see `build-plan.md`, slice 3. The `isAccessory` flag is not yet set on an add.

### D2. Injury swaps change the lift and keep the load and the prescription. Breaks trust.

- Experience: someone who ticks "Lower back: Avoids heavy loads on your spine" gets a trap bar deadlift at the weight their deadlift would have been, for the same heavy sets.
- Evidence (sweep, 1,440 lower-back plans; `scripts/sweep2.py` and the block after it):
  - Trap Bar Deadlift in 688 of the 720 full-gym and home+barbell plans, at 100-107.5 kg for the 80 kg intermediate (deadlift seed x 1.0), including fixed 2-4 x 3 and 4 x 5. Baseline: 3x4-8 @105 and 3x6-10 @105 in one week.
  - Kettlebell Swing as the main lift at 100-108 kg (intermediate) and 132-144 kg (advanced) in 40 home-gym plans. Example: Build muscle, intermediate, 3 days, 30 min, home gym: "Kettlebell Swing 2x6-10 @104 [M]".
  - Rack Pull 2-3 x 8-14 @152.5-165 kg in 17 knee + lower-back plans (advanced, home + barbell), in the slot a leg curl held.
  - Cable Crunch, Crunches or Hanging Leg Raise in 1,300 of 1,440 plans. In the baseline the cable crunch gains a set. The file's own header cites McGill (`injurySubstitutions.ts:14-21`).
  - Knee: Bulgarian Split Squat 3x3 @22.5 [M] (Get stronger, 4 days) and 2x3 (Support my running, 2 days). It is the most common lift in knee plans (2,376 slots).
  - Home gym + lower back: "Glute Bridge 3x4-8 @0 [M]" and "3x6-10 @0 [M]" as the day's main lift.
- Volume: it moves rather than drops (table 2.5). The tally's lower-back line falls by 4.6 sets only because the trap bar deadlift credits no lower back (`exercises.ts:1636-1641`).
- Root cause: (a) the substitute's load is the original's times a factor that is 1.0 for the trap bar and 1.15 for the rack pull (`variationBank.ts:317`, `:335`), and D1's missing factor for the kettlebell swing; (b) a substitute takes the slot's role numbers (`represcribeSwapped`, `represcribe.ts:260-281`; new plans swap before the role table, `programEngine.ts:1821-1826`), and the role table knows three roles and nothing about whether a lift can be loaded for 3 reps (`roleTable.ts:34-58`, `exerciseRole.ts`); (c) `CONTRAINDICATED` lists no trunk-flexion lift for the lower back (`injurySubstitutions.ts:118-164`); (d) the substitution table offers the rack pull and the kettlebell swing as lower-back-safe (`:182-190`, `:221-225`, `:347-351`).
- Fix: 1. An injury swap starts lighter than the lift it replaces (for example 70% of the mapped load) and takes a moderate range (8-12) whatever the slot, for its first block. 2. Remove rack pull and kettlebell swing from the lower-back lists; add cable crunch, crunches, hanging leg raise and decline sit-up to the lower-back set with plank, dead bug, side plank and Pallof press as substitutes (all in the catalogue). 3. A rep floor by lift type: unilateral and dumbbell lifts never under 6, easy bodyweight lifts never under 8 (the second half is already locked, see D4). 4. Add a sweep assertion on load: no lower-back plan holds a hinge above X% of the uninjured deadlift seed.
- Size: M. In the way: Lift4 (11) says "every lift the promises name is covered", which this keeps. The trap bar as the deadlift's first substitute is the table's own choice, not a lock row.
- STATUS 2026-11-12: fixes 1 (the load half), 2 and 4 built; see `build-plan.md`, slice 3. The 8-12 range and fix 3 go with D5.
- STATUS 2026-11-12, later: the 8-12 range and fix 3's dumbbell and one-leg half built with D5.

### D3. Changing session length on a plan the person has does not fit the new length. Breaks trust.

- Experience: Settings, 60 -> 30 minutes, Save. The dialog says "Your sets are refitted to sessions of about 30 minutes" (`programmeChanges.ts:340-347`). The plan's days are then priced at 43, 48, 47 and 45 minutes.
- Evidence (scratch `zzAdaptTime`, `adapt-time.json`): 60 -> 30 keeps 40 sets (a new 30-minute plan has 26; its days are 37/33/32/28). 60 -> 45 gives 43/48/47/45. 60 -> 75 gives 60 sets where a new plan has 66 (Upper A stays at 56 min of 75). 60 -> 30 -> 60 returns 57 sets, not 56.
- Root cause: the re-fit moves sets only and never drops a lift (`sessionFit.ts:396-422`, `fitDay` with no guard), with a floor of 2 sets a lift, so 5-6 lifts cannot go under about 45 minutes. `planBuilder.ts:517-530`.
- Fix: when the re-fit cannot reach the length, say so and offer the choice in the same dialog: "Keep my lifts (about 45 min)" or "Rebuild for 30 min (drops N lifts)". Or let the re-fit drop lifts in the generator's own order and keep them restorable, as an equipment swap is (`swappedFrom`).
- Size: S for the honest copy and the choice, M for a restorable drop. In the way: Lift4 (5) "re-fits the plan the person has, sets only".

### D4. "Minimal / bodyweight" is the home-gym plan. Breaks trust.

- Experience: setup's card reads "Minimal / bodyweight: Bodyweight and limited equipment" with a bodyweight squat drawn on it (`Onboarding.tsx:1757-1761`). The plan is Dumbbell Bench Press 3x4-8 @20, Dumbbell Row @22.5, Pull-Ups 3x8-12, Hanging Leg Raise, Bulgarian Split Squat @22.5.
- Evidence: 2,440 of 2,520 paired home/minimal plans are identical including loads. `matchTemplate.ts:287-290`: the two tiers differ by "Kettlebell" only.
- Status: the owner already decided the fix on 2026-11-09 (Lift4 STATUS: a fourth "No equipment" preset, Minimal renamed, a pull-up bar switch, easy bodyweight lifts never under 8 reps; "Implementation: #3107"). None of it is on this main: `no_equipment`, `pullUpBar`, `EASY_BODYWEIGHT_EXERCISE_IDS` appear nowhere in `src/` or `functions/`. Build it; do not re-decide it.
- Size: M (specified).

### D5. Kit swaps keep the barbell's rep numbers. Hurts quality.

- Experience: a home lifter's heavy day is Bulgarian Split Squat 3x4-8, Dumbbell RDL 3x4-8 @27.5 (55 kg total for someone whose deadlift seed is 105), Dumbbell Shoulder Press 3x4-8 @12.5.
- Evidence (sweep): Bulgarian split squat has a rep floor of 5 or lower in 3,776 of 10,080 plans, fixed triples in 1,280 slots; Dumbbell RDL at 5 in 1,840 slots; Glute Bridge at 3-5 bodyweight in 608 plans; Push-Ups at 3-5 in 240 plans. Also "Hanging Leg Raise 3x14-15": a one-rep range, from the pump day's +2 meeting the bodyweight cap of 15 (`programEngine.ts:237-238`).
- Root cause: as D2 (b). The day's heavier/lighter shift and the goal's fixed targets apply to the slot, not the lift.
- Fix: the rep floor by lift type from D2, applied in `applyRoleTable` and `represcribeWorkouts` (and the server mirror `functions/lib/represcribe.js`).
- Size: M. No lock in the way; the 2026-11-09 STATUS already asks for the bodyweight half.
- STATUS 2026-11-12: the dumbbell and one-leg floor built, client and server, and a range the ceiling squeezed to one rep ("14-15") starts lower; the bodyweight half is #3107's. See `build-plan.md`, slice 3, #5.

### D6. The person cannot set sets or reps, or choose a split. Hurts quality.

- Experience: the owner's "They can choose themselves" holds for which lifts, not how much. A person who wants 4 sets of bench has no control for it; extra sets done in a session are logged and the plan stays at 3.
- Evidence: table 2.9. `applySessionSets` follows the weight lifted, never the set count (`programEngine.ts:2584-2660`).
- Fix: a per-lift editor on Train (sets, rep range), writing `sets` and `baseSets` together through the existing `updateExercise` command (it needs `baseSets`, `repRangeMax` and `baseReps` in its patch). The time estimate on the day card already shows the cost. A split choice is a bigger call (section 5).
- Size: M. In the way: Lift4 (5) "time decides the volume", Pgm5 "the split is shown, not chosen".

### D7. Moving up a level keeps the beginner's plan. Hurts quality.

- Experience: a beginner accepts "you look intermediate". Main lifts become 3x4-8 and 3x8-12. Everything else stays at 2 sets and the lat pulldown stays; the week is 48 sets where a new intermediate plan is 56. Nothing says a fuller plan exists except Reset, which also restarts the week count.
- Evidence: scratch `zzAdaptEdits`, "beginner->intermediate:save" against "intermediate:fresh".
- Root cause: by design. `planBuilder.ts:402-407`, `:536-552`; Lift4 (12): "it never rebuilds ... there is no 'Update my exercises too'".
- Fix: on a level change, offer once "Update supporting work to your new level (2 -> 3 sets)", sets only, no swaps. That is a re-fit, not a rebuild.
- Size: S. In the way: Lift4 (12).

### D8. First weights scale with bodyweight without limit. Hurts quality.

- Experience: a 150 kg man who says he is a beginner is given Barbell Squat 3x8 @105 and Deadlift 3x8 @127.5 on day one. A 130 kg intermediate gets Squat 145, Deadlift 172.5 and Pull-Ups 2x10-14.
- Evidence: scratch `zzAdaptHeavy`, `adapt-heavy.txt`.
- Root cause: `startingWeightForCategory` is bodyweight x multiple x sex factor with no cap (`startingLoads.ts:125-136`).
- Fix: cap the bodyweight the seed reads (for example 90 kg for men, 70 kg for women) and floor it too. Build Pull-Ups as Lat Pulldown above a bodyweight line, as the beginner rule already does.
- Size: S. No lock (Lift4 (5) says only that starting weights are estimated).
- STATUS 2026-11-12: the cap built (90 kg, 70 kg for a woman); no floor; pull-ups above a bodyweight line not yet. See `build-plan.md`, slice 3.

### D9. "Support my running" is the size plan with low reps. Hurts quality.

- Evidence: table 2.6. 820 of 2,016 paired running/hypertrophy plans have the identical exercise list. I did not trace why the rest differ; I found no builder branch that picks lifts for the running goal.
- Root cause: goals are "dials on one engine" (Lift4 (4)); the dial moves reps (`roleTable.ts:50-54`) and nothing else.
- Status: known (lifting-engine-audit 6.3 item 13, decisions L13: "Measuring ... Not run yet"). Still open.
- Fix: a runner's template rule set: lower body first, one single-leg lift, calves loaded heavy, no arm isolation until the legs and trunk have their sets.
- Size: M-L. In the way: Lift4 (4) only in spirit.

### D10. Dumbbell lifts stop progressing. Hurts quality.

- Evidence: committed trace `__traces__/dumbbell-beginner.txt`: Goblet Squat is "12.5 x 15 x 2" from week 8 to week 26, 15 holds in 22 sessions, plan 12.5 -> 12.5 kg. Same for Dumbbell RDL and Dumbbell Shoulder Press (5 -> 5 kg).
- Root cause: a step over 15% is never taken automatically (`loadSteps.ts:52`, Lift4 (6)); 12.5 -> 15 kg is 20%.
- Status: known and kept (F9, decisions L11). For home lifters this is most of the plan, so I would reopen it: after N sessions at the stretched top, prescribe the next pair at the bottom of the range.
- Size: S. In the way: Lift4 (6), Pgm7 A3.

### D11. A reorder can cost sets at the next rollover. Polish.

- Evidence (scratch `zzAdaptRollover`): on Upper B, moving Lateral Raise to first takes the day's price from 3,585 s to 3,645 s (the warm-up ramp goes to whichever lift is first for a muscle, `warmupRamp.ts:236-257`). The next rollover reads that as "warm-ups outgrew the fit" and cuts Dumbbell Curl 3 -> 2 and Pushdown 3 -> 2 for good (`baseSets` moves). 1 of 16 single moves in the baseline plan.
- Root cause: `warmupsOutgrewFit` cannot tell a reorder from a load change (`sessionFit.ts:195-203`); `advanceWeek` `programEngine.ts:3077-3084`.
- Fix: stamp the fitted order or price on the day and re-fit only when loads grew.
- Size: S. Lift7 stands.

### D12. Smaller items. Polish.

- Swap notes show another injury's reason: "Seated DB Press (lower_back): Neutral grip keeps the wrist aligned", "Bulgarian Split Squat (lower_back): ... less compressive shear at the knee", "Dumbbell Shoulder Press (wrist): Angled path removes impingement arc" (`adapt-onefactor.json`). The rationale is stored per substitute, not per injury (`injurySubstitutions.ts:75-93`).
- Shoulder and elbow inconsistencies in table 2.5 (chin-ups, overhead cable extension).
- Advanced equals intermediate (table 2.1). Locked by Lift4 (5) "two tiers". Owner call.
- Focus change with "Save and update sessions" moves reps and not sets: Get stronger main lifts come out 3x3 where a new plan has 4x3 (`represcribeWorkouts`; scratch `goalStrengthRepresc`).
- A lift with no logged history is re-seeded on every settings save (`planBuilder.ts:566-571`, `startingLoads.ts:459-467`), so a replaced lift's ratio-scaled weight is lost if the person saves settings before lifting it.
- "Other" and unset sex take the man's multiples.
- Home + barbell assumes a trap bar (its catalogue equipment is "Barbell").

## 4. What already works and must not be broken

- Split by day count (full body to 3, upper/lower at 4, PPL+UL at 5, PPL x2 at 6, cap at 6).
- Beginner rules: fixed targets, 2-set supporting work, no pull-ups, no heavier/lighter days, no scheduled lighter weeks.
- Under-the-bar rule: a barbell lift that would start below 20 kg is built as its dumbbell version (woman 50 kg OHP; curls).
- Injury coverage as promised: zero contraindicated lifts and zero unresolved flags in 8,640 injured plans; removing an injury brings the original lifts back (`restoreSwappedLifts`).
- Content edits survive: replace, add, remove and reorder all held through saves of equipment, injuries, level, goal and length, and through the rollover (scratch `zzAdaptEdits`). The lift-days dialog tells the truth about what it resets.
- Missed weeks hold the block position; a lighter week is never spent on an untrained week; session order carries over.
- Layoff: one way in, the person chooses, loads come down 10 or 20% and climb back a step a session.
- Two misses lower a lift 10% and it climbs back; the plan follows the weight actually lifted.
- "Lose fat" lifts as Build muscle.
- The lighter week restores weights and reps on exit and resets miss counts.

## 5. Owner calls needed

1. Injury dose. (a) Keep name-only swaps. (b) A swapped-in lift starts lighter and at a moderate range, and lower back also swaps trunk-flexion work. (c) As (b), plus fewer sets for the affected area for the first weeks. Recommend (b): it fixes every example in D2 and needs no new concept on screen.
2. Session length on an existing plan (Lift4 (5)). (a) Sets only, as now, with honest copy. (b) Ask: keep my lifts, or rebuild for the new length. (c) Always drop lifts to fit. Recommend (b).
3. Level change (Lift4 (12)). (a) As now. (b) Offer the sets update once, no swaps. (c) Offer a full rebuild. Recommend (b).
4. Sets and reps editing (Lift4 (5)). (a) None. (b) Per-lift sets and range on Train, the day's minutes shown as the cost. Recommend (b); it is the plain reading of "they can choose themselves".
5. Split choice (Pgm5). (a) Engine chooses. (b) Offer the two or three splits that fit the day count. Recommend (a) for now: fix the content inside each split first (lead's slice), then revisit.
6. Advanced tier (Lift4 (5)). (a) Keep two tiers and say so in the level picker. (b) A third tier with a fourth set on main lifts and a higher ceiling. Recommend (a) until the session shape is fixed.
7. Light dumbbell stall (Lift4 (6), L11). (a) Wait for the person. (b) After N sessions at the stretched top, prescribe the next pair. Recommend (b) with N = 3.
8. Build #3107 (already decided 2026-11-09). No call needed; it is unbuilt.

## 6. Not verified

- Anything on a device or in the UI: I read components for copy and wiring and ran no app. The Add/Replace weights are the functions' output for the arguments the client passes (`useProgram.ts:3018-3021`, `:3145-3149`), not a screenshot.
- The server's copies (`functions/lib/represcribe.js`, `programCommands.js`) were read, not run. The cross tests that pin them were not run.
- Progression across weeks was read from the committed traces and from `advanceWeek` driven with every day marked done; I did not simulate logged sets myself.
- Whether "Short on time?" offers the set-count trim (`buildExpressSession`, whose "30" option priced at 45 min in my run) or the priced one (`buildTimeBudgetSession`, 24 min, 2 lifts) in each case: both are wired in `ExpressSessionSheet.tsx`; not traced.
- Injuries and the run plan: only that `runScheduler.ts` never reads `injuries`.
- Whether #3107 exists as an open PR; only that its code is not on this main.
- Circuits, supersets, saved routines, training blocks' pace option, lb kit, race-week lifting: not examined.
- Clinical correctness of each substitution beyond a coach's read of the printed week.

Scratch tests (git-ignored, left in place): `zzAdaptOneFactor`, `zzAdaptEdits`, `zzAdaptRollover`, `zzAdaptAddReplace`, `zzAdaptSweep` (about 60 s; vitest reports a timeout after the files are written), `zzAdaptTime`, `zzAdaptHeavy`. Python summaries: `harness/{show,sweep1,sweep2,showsweep}.py`.
