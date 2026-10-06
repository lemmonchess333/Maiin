# Tropos lifting engine audit

Repo `/home/user/Maiin`, branch `claude/tender-hypatia-qvawvs`, HEAD `55c195a`, audited 2026-10-06.
Read-only audit. Every behavioural claim marked **measured** comes from code run in vitest (scratch harnesses, listed in §8). Other claims cite file:line.

> Point-in-time: line numbers and measurements describe `55c195a`. Re-trace a
> claim against the current tree before acting on it. Index and corrections:
> [README.md](README.md).

Raw outputs, in this folder:

- `measurements/lifting-plans.md`: 12 generated plans, the full per-day tables. (The JSON twin was not kept.)
- `measurements/lifting-sim-summary.md`: the week-by-week simulation summary. The full log (`sim-detail.md`, 1,449 lines) was not kept; rerun the harness to regenerate it.
- `measurements/lifting-probes.md`, `measurements/lifting-probes2.md`, `measurements/lifting-probes3.md`, `measurements/lifting-probes4.md`: targeted probes.
- `harnesses/lifting-*.test.ts.txt`: the harnesses that produced them (rerunnable, see §8).

---

## 0. Summary

**The engine can be simulated today.** Every stage that decides what a lifter is prescribed is a pure function. These are plan build, session rows, progression at Finish, week rollover, lighter weeks, ease-back, race weeks, represcription and the server command reducers. A loop of about 150 lines (§2) drives the real code week by week in vitest with no Firestore. I ran it for 7 personas over 20–52 weeks. The glue has to reproduce four pieces of logic that are inlined or module-private:

- marking the day done (inside `commitWorkoutCompletion`)
- assembling the `SessionProgression` (inside `useProgram.completeWorkoutDay` and `WorkoutSession`)
- the two rollover loops
- the run side's `nextRunWeek` / `regenerateRacePlan`, which are private to `useProgram.ts`

Extract those first.

**Lift4 is mostly built as written.** Its retirements are complete. The real gaps are below.

**Gaps against Lift4:**

- **(12) A level change does not change how main lifts progress.**
  - A beginner plan saved as intermediate keeps fixed 3×8 linear mains, 2-set accessories and no heavier/lighter days (measured).
  - The level reaches the plan only through lighter weeks, the RPE-row default and a future rebuild.
- **(6) Bodyweight mains on a fixed target never progress.** Pull-ups are a Get stronger / Support my running main for intermediates and up.
  - A lifter who hits 4×7 every session stays at 4×7 forever (measured).
  - Added load is ignored.
- **(7) Miss counts reset after a break only if the person picks "Ease back in".** "Keep my old weights" keeps a standing miss.
- **(9) A lighter week taken from Train does not restart the calendar count.** The handoff's precedence table says it should.
  - Measured: taken in week 2, the calendar one still comes in week 4.
- **(3) The Performance tab still renders PI "Lifting suggestions"**, e.g. "Reduce working sets by 30–40%…" (`performanceEngine.ts:396-429`, `PerformanceTab.tsx:579`). This contradicts "no suggestion cards" and the lighter-week recipe.
- **(5) Train's Replace and Add don't take the new lift's role numbers.** Only equipment and injury swaps do.
- **(4) The running goal reads "Improve running" in the UI** (`programLabels.ts:58`); the lock says "Support my running".
- **(12) A block's represcription assigns heavier/lighter days by current day index.** After the order carries over, a block start or release puts the heavy/pump days on different days than generation did. The "inverse" property breaks.

**Programming quality: what a strength coach would object to, all measured on generated plans.**

_Get stronger 4-day:_

- Squat and bench are main lifts once a week; deadlift and overhead press twice.
- The role table's "4 × 5" becomes 4×3 on heavier days and 4×7 on lighter days. Only the hinge keeps 4×5.

_Intermediate fixed-target progression:_

- Fixed targets add 2.5 kg every successful session, per exercise instance. Deadlift has two instances, so up to 5 kg a week.
- The result is a sawtooth: 24 ten-percent drops across 6 main lifts in 52 weeks in the S1 simulation.

_Short Build muscle sessions:_

- They are starved: 45 min × 4 days gives 38 working sets a week, with most muscles under 10.
- 30 min × 4 days gives 28 sets. Upper A is 3 barbell mains × 2 sets plus about 10 warm-up sets.
- Cause: the time model's 3-minute rests on 4–6-rep "heavier day" mains, 4 warm-up sets per barbell main, and 90 s setup per exercise.

_The push/pull balancer and the volume ceilings:_

- The balancer pads biceps curls (curls count as "pull"), so a beginner gets a 4-set curl.
- Triceps run over the ceiling in the 4-day Get stronger plans and the 5–6-day Build muscle plans (16/14, 21/20, 24/20).

_Divergence and small lifts:_

- The same lift in two slots with different progression types diverges. In the beginner 3-day plan the bench main reaches 62.5 kg × 8 while the bench accessory sits at 45 kg × 12, which is about 15 reps in reserve.
- Light dumbbell and barbell-curl lifts can't step automatically (step > 15%). Their targets stretch past the range (a 10 kg lateral raise reached 24 reps in S2) and wait for a person nobody prompts.

_Light trainers:_ with 2 of 4 sessions a week, every calendar lighter week lands on the same two sessions.

**What the engine is not.**

- There is no %1RM, e1RM- or RPE-driven loading, prescribed top set, peaking, AMRAP or test week, or powerlifting or powerbuilding mode.
- There is no per-lift priority, weak-point or specialization logic, and no accumulation → intensification → peak blocks.
- Periodisation is daily undulation (±2 reps) plus a lighter week every 4th trained week.
- "Advanced" changes only starting loads, the RPE row default and which variations can be picked. A 5-day advanced plan is identical to the intermediate one apart from loads (measured).

**Open LIFT-EV rows at HEAD:**

- EV-08: open, untouched.
- EV-09: open, still unreachable at `performanceEngine.ts:304` / `perfScoring.js:205`.
- EV-10: open, no renormalisation at `performanceEngine.ts:492-505`.
- EV-07: decided "retain and fence"; the factor is still live at `startingLoads.ts:76`.
- EV-04: settled in practice by ADR-0011 and pinned by `saveProgramSites.test.ts`, but the row was never updated.
- EV-01, -02, -03, -05 (reversed by Lift4) and -06: closed.

---

## 1. Pipeline map

Legend:

- **P**: pure function.
- **FS**: touches Firestore.
- **CMD**: through the command boundary: the `applyProgramCommand` callable plus an optimistic client updater and `commandOutbox`.
- **CF**: a Cloud Function.
- **DOC**: a whole-document client write (`saveProgram` → `commitProgramTransition`, Firestore transaction with `mergeChangedFields`).

### 1.1 Onboarding → plan build

| Stage          | Function(s)                                                             | Kind                              | In → out                                                                                                                                                                                |
| -------------- | ----------------------------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Draft → plan   | `buildOnboardingPlan` `src/lib/onboardingPlan.ts:14`                    | P                                 | onboarding draft (goal, days, sessionMinutes, equipment, barbellAtHome, smallPlates, experience, bodyweight, sex, injuries, run answers) + nutrition phase + date → `PlanBuilderOutput` |
| Orchestrator   | `buildPlan` `planBuilder.ts:759`                                        | P (no clock: `currentDate` input) | → `{programState, weekSchedule, profileUpdates}`; `validatePlanOutput` `:670`                                                                                                           |
| Week shape     | `buildWeekSchedule` → `planWeekSchedule` (`scheduleUtils`)              | P                                 | lift/run/rest per weekday                                                                                                                                                               |
| Lift programme | `buildLiftProgram` `planBuilder.ts:312`                                 | P                                 | new plan or day-count change → `generateProgram`; same day count → **preserve** branch (content edit)                                                                                   |
| Generator      | `generateProgram` `programEngine.ts:1620`                               | P                                 | see pass order below                                                                                                                                                                    |
| Persist        | Onboarding.tsx:618 → `completeOnboarding` CF (`functions/index.js:688`) | CF                                | `validatePlanPayload.js`, `programStateSanitizer.js` (top-level key allow-list only), write                                                                                             |

**`generateProgram` pass order** (`programEngine.ts:1620-1980`):

1. `chooseSplit` (`:357`): 1–3 days full body, 4 upper/lower, 5 PPL + upper/lower, 6 PPL ×2, 7 clamps to 6.
2. The builders (`buildFullBody` `:624`, `buildUpperLower` `:823`, `buildPPL` `:1006`, `buildLegsB` `:1194`). Each picks the category primary at the intermediate tier (`BUILDER_TIER` `:437`). Slots are flagged `isAccessory`, and fixed calf and side-delt slots are added.
3. `alignExistingTo`: carries a saved plan's lifts by day name and movement.
4. `orderForAdjacency` (`overlapModel.ts:419`): reads the week shape.
5. `carryExistingAccessories`, then `dedupeDayExercises` (`:1274`), then `applyOverlapCaps` (at most 2 hinge sessions a week and 1 per session).
6. `applyComplexityGate` (`experienceModel.ts:194`), then `capRepeatedLifts` (at most 2 exposures of a lift a week).
7. `addTwiceWeeklyLifts` (`weeklyFrequency.ts:95`): every muscle on 2 days.
8. The injury and equipment filters (`matchTemplate.ts:132`, `:250`, `restoreSwappedLifts` `:57`).
9. `applyRoleTable` (`:1421` ← `roleTable.ts:78`), then `applyDayRoles` (`:1388`): ±2 reps on heavier and lighter days for intermediate and up.
10. `seedStartingLoads` (`startingLoads.ts:339`; Epley rep-scaling; `sexFactor` 0.75 `:76`; from the bar with no bodyweight).
11. `fitSessionsToTime` (`sessionFit.ts:267`): priced by `estimateSessionSeconds` (`expressSession.ts:151`); ceiling 18 sets.
12. `balanceWeekVolume` (`:1455`): reconcile → `balancePushPull` → reconcile, looped with `extraPastCeiling`.
13. Final stamp: `baseSets`, and `repRangeMax` from the role span.

Pure throughout, except `generateInstanceId` (`programTypes.ts:976`, `crypto.randomUUID`), so instance ids are non-deterministic.

**Preserve-branch extras** in `buildLiftProgram`:

- `applyComplexityGate` only when building (`previousExperience === undefined`).
- `restoreSwappedLifts`, then injury and equipment filters, then `represcribeSwapped` (`represcribe.ts:167`).
- `refitWeek` on a session-length change.
- `seedStartingLoads` with `unloadedOnly`.
- `keepWeekLighter` (`:481`).
- `raceLegTrimNow` (`:523`).

### 1.2 What Train shows

| Stage                 | Function(s)                                                                                                                                                                                                                                                           | Kind                                     |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Up next               | `nextUpIndex` `nextUpCursor.ts:21` (override, else first not done/skipped)                                                                                                                                                                                            | P                                        |
| Exercise row          | `ExerciseRowSummary` (sets × `formatRepTarget` `repTarget.ts:9` ← `prescribedRepRange` `programEngine.ts:299` · load · "Last:" every counted set via `lastSetsByExercise` `lastSets.ts:29`), `LoweredLine` (once, `afterLoweredLine` `programEngine.ts:2389`)         | P view; Last: reads saved workouts (FS)  |
| Week label / rules    | `liftWeekLabel` `src/lib/liftWeekLabel.ts:63`, `liftSessionPurpose` `src/lib/liftSessionPurpose.ts:226` ("Why this session"), `liftRules` `src/lib/liftRules.ts:83` (ⓘ sheet; numbers from engine constants)                                                          | P                                        |
| Session variant       | full / `buildExpressSession` (`expressSession.ts`) / `buildEasierSession` `easierToday.ts:73` (one set fewer, ×0.85) / `buildTimeBudgetSession` `liftTimeBudget.ts` (only plans without `sessionMinutes`) — chosen in `Program.tsx:1844-1870`                         | P (execution copy, stored day untouched) |
| Session rows          | `buildInitialSetLogs` `warmupRamp.ts:125` (ramp before first loaded lift per body part, +85%×2 when reps ≤ 6), `startingSetRows` `setStartValues.ts:15` (each set from last time's set), rest `restSecondsFor` `restTime.ts:47`, cue `effortCueFor` `effortCue.ts:44` | P (+ lastSets FS read)                   |
| Prescription captured | `WorkoutSession.tsx:305-326` (`sessionExercise`, `progressionBaseline` = stored exercises sans `sessionProgression`)                                                                                                                                                  | P inside component state                 |

### 1.3 Logging → Finish → progression

| Stage              | Function(s)                                                                                                                                                                                                                                                                                                                                             | Kind                                                         | In → out                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------- |
| Completion payload | `toCompletionSetLogs` `warmupRamp.ts:164` (warm-ups out; type + RPE kept); `afterHardRun` from `useHardRunBefore` (`useEasierTodayRecommendation.ts:24`, reads runs)                                                                                                                                                                                    | P / FS read                                                  | `LoggedSet[][]`                     |
| Finish             | `useProgram.completeWorkoutDay` `useProgram.ts:1462` → builds `SessionProgression` (`:1514-1530`), optimistic `applySessionProgression`, then `completeLift` `src/lib/liftCompletion.ts`                                                                                                                                                                | client                                                       |                                     |
| Transaction        | `commitWorkoutCompletion` `src/lib/workoutCompletion.ts:153`: checks week, block and day identity; `applySessionProgression`; marks the day done (`completed`, `completedWorkoutId`, clears a matching `nextWorkoutOverride`); writes workout + programState in ONE Firestore transaction; offline → `queueWorkoutCompletion` replays the same function | FS (client transaction, deliberate whole-doc exception)      |                                     |
| Progression        | `applySessionProgression` `sessionCompletion.ts:48` → per exercise by `instanceId`: swaps (kept/not), lighter-week or easier-today early exit (up never down `:104-117`), block hold (`isProgressionHeld` `trainingBlock.ts:330`), auto-progression off; else `applySessionSets` `programEngine.ts:2316` (leg miss ×0.5 after hard run `:125-130`)      | P                                                            | ProgramState → ProgramState         |
| Session read       | `readSessionSets` `sessionSets.ts:59` (followed weight = most sets, heavier on tie; planned number at most) → `sessionOutcome` `:103` (step / miss / hold)                                                                                                                                                                                              | P                                                            |                                     |
| Step / climb       | `applyProgression` `programEngine.ts:1993`: `liftedLoad` (`:1983`, plan follows the weight lifted); double: target = weakest set + 1 up to `repRangeMax`, then `stepOrStretch`; linear: step when every set reaches target; RPE ≥ 9.5 holds (`:199`)                                                                                                    | P (stamps `new Date()` `:2003`, overwritten by session date) |                                     |
| Steps              | `loadGridFor` / `automaticStepUp` (≤15%) / `stretchedRepCeiling` (Epley-equal reps) `loadSteps.ts:113-148`                                                                                                                                                                                                                                              | P                                                            |                                     |
| Miss / drop        | `countMiss` `programEngine.ts:2256`: 2 in a row (`MISSES_BEFORE_LOWERING` `loadSteps.ts:39`) → `loweredLoad` 10% by ≥1 step, `lowered` record; bodyweight −1 rep / hold −5 s                                                                                                                                                                            | P                                                            |                                     |
| Climb back         | `applySessionSets` `:2346-2368`: a step per non-miss session up to `lowered.from`                                                                                                                                                                                                                                                                       | P                                                            |                                     |
| Correction         | `correctSavedWorkout` `src/lib/workoutCorrection.ts:100` replays `applySessionProgression` from the baseline when `sessionStillInPlan`                                                                                                                                                                                                                  | FS transaction                                               |                                     |
| Delete             | `deleteLoggedSession` `src/lib/sessionDelete.ts:75` → `planWithoutSession` `workoutCompletion.ts:106`                                                                                                                                                                                                                                                   | FS transaction                                               |                                     |
| Server triggers    | `onWorkoutCreated` (lastActiveAt, challenges, PI recompute)                                                                                                                                                                                                                                                                                             | CF                                                           | never touches the lift prescription |

### 1.4 Week rollover, lighter weeks, layoff, race link

| Stage              | Function(s)                                                                                                                                                                                                          | Kind                                                         |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Who rolls          | `weekRolloverAnchor` `programMaintenance.ts:22`: run side when `runMode≠freeform` and runDays exist, else lift side (`liftWeekKey`)                                                                                  | P                                                            |
| Lift-only rollover | `useProgram.ts:1350-1410` effect: while `liftWeekKey < localWeekKey()` (≤12 iterations) `advanceWeek(rolling, profile.experience, nextKey)` → `saveProgram`                                                          | DOC (waits for `finishOutstanding` `:488` and open sessions) |
| Run-side rollover  | `useProgram.ts:1188-1335`: `nextRunWeek` (`:384`, **private**; `regenerateRacePlan` `:251` **private**) first, then `advanceWeek(rolling, exp, key, raceBlockWeek(runs.runPlan), {raceLegTrim})` unless `liftsAhead` | DOC                                                          |
| Manual next week   | `advanceToNextWeek` `:1685` (all days done/skipped; stamps next week's key)                                                                                                                                          | DOC                                                          |
| Engine             | `advanceWeek` `programEngine.ts:2506`                                                                                                                                                                                | P (`Date.now()` for `updatedAt`)                             |

**What `advanceWeek` does:**

- **Trained or not.** `weekWasTrained = any completed`.
  - `weekNumber` advances only on trained weeks and caps at 52 → 1 (the Lift1 lock: `liftWeekKey` is time, `weekNumber` is block position).
  - The archive of the last 8 weeks takes trained weeks only.
- **Race final weeks.** `raceLiftWeek` (`weekPrescription.ts:147`) decides taper, race and after. After the race, the count is ceilinged to the next multiple of 4.
- **Miss counts.** They reset after a lighter week.
- **Lighter week.** One applies when it is a race week, or when the week was trained and all of these hold:
  - the week before wasn't one
  - no ease-back weeks remain
  - `calendarLighterWeek` (`:182`) says so: every 4th week, or the run plan's step-back week with a race
  - `lighterWeeksScheduled` (`:51`): intermediate or advanced on ≥ 3 lift days

  The recipe is `applyDeload(resetToBaseSets())` (`:2463`): half the sets, same weights.

- **First week back.** `oneSetFewer`.
- **Race build.** `withRaceLegTrim` (`:2733`): a third off leg lifts, never below 2.
- **Order carries over.** `nextUpIndex` rotates the session not reached to the front.
- **Race week.** `raceWeekSession` (`:2763`): the first session only, legs at half weight (stashed in `preDeloadWeight`), the others skipped.

**Other lighter-week and race paths:**

| Stage                            | Function(s)                                                                                                                                                                                                                  | Kind                                     |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Take a lighter week              | `sendDeloadCommand("applyDeloadWeek")` `useProgram.ts:3043` → `applyDeloadWeekCommand` `functions/lib/programCommands.js:1692` → `applyDeloadToWorkouts` `functions/lib/deloadEngine.js` (+ run swaps from `planDeloadWeek`) | CMD + CF (server-authoritative, refetch) |
| Lighter-week guard               | `lighterWeekAllowed` `weekPrescription.ts:83` (client) / server same                                                                                                                                                         | P                                        |
| Layoff                           | `assessLiftReturn` `liftLayoff.ts:98` (reads saved workouts): Welcome back ≥14 days, ease first when "detrained" (≥21), 20% when >56 days                                                                                    | P (+FS read)                             |
| Ease back in                     | `easeBackIn` `programEngine.ts:2805` via `useProgram.ts:1764` (`saveProgram` updater)                                                                                                                                        | DOC (ADR-0011 ninth writer)              |
| Race rest                        | `raceRestSkips` `raceRest.ts:42` → effect `useProgram.ts:1415-1453` sends `skipWorkoutDay`                                                                                                                                   | P → CMD                                  |
| Heavy legs before a long/key run | note only (`liftSessionPurpose`)                                                                                                                                                                                             | P                                        |

### 1.5 Blocks, represcription, goal / level / settings changes

| Stage                    | Function(s)                                                                                                                                                                                                                                                                                                                                           | Kind       |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Block start / release    | `startTrainingBlock` `useProgram.ts:3247` / `releaseTrainingBlock` `:3315` → server `startTrainingBlock` `programCommands.js:1468` / `releaseTrainingBlock` `:1531` → `represcribeWorkouts` (`functions/lib/represcribe.js` + `roleTable.js`); same focus → no change                                                                                 | CMD + CF   |
| Represcribe              | `represcribeWorkouts` `represcribe.ts:98`: rep targets, range and progression from `roleRepsFor`; day roles by **day index**; `scaleLoadForReps` `:77` (Epley, never up); sets untouched                                                                                                                                                              | P          |
| Settings save            | `ProgrammeSettings.tsx` → `buildPlan({existingState, preserveHistory:true, previousExperience, previousSessionMinutes})`; same-frequency goal change asks "update sessions" → client `represcribeWorkouts` (`ProgrammeSettings.tsx:701`) → `configurePlan` CF (`functions/index.js:937`: validate, sanitize, server transaction `mergeChangedFields`) | P + CF     |
| Level change             | content edit: preserve branch; no represcription anywhere (§4 (12))                                                                                                                                                                                                                                                                                   | —          |
| Reset / day-count change | `generateProgram` with the saved workouts (carry by name/movement)                                                                                                                                                                                                                                                                                    | P + CF/DOC |
| Exercise edits           | `addExercises` `programCommands.js:1964` (3×10 linear 0 kg), `replaceExercise` `:1993` (keeps the old slot's sets, reps, range and progression; client sends calibrated load), remove/restore/update/reorder                                                                                                                                          | CMD + CF   |
| Swap for today / Skip    | `swappedForToday` `sessionSwap.ts:36`, `keptSwap` `:82` (applied at Finish)                                                                                                                                                                                                                                                                           | P          |
| Level suggestion         | `detectExperienceSuggestion` `experienceDetection.ts:272` → card copy `ExperienceSuggestionCard.tsx:122-150`                                                                                                                                                                                                                                          | P          |

---

## 2. Simulation seam

### 2.1 What runs in plain Node / vitest with no Firestore

Pure and directly callable:

- **Plan build:** `buildOnboardingPlan`, `buildPlan`, `generateProgram` and everything under it.
- **Read path:** `normalizeProgramState`, `migrateProgramState`.
- **Session rows:** `nextUpIndex`, `buildInitialSetLogs`, `toCompletionSetLogs`, `startingSetRows`, `lastSetsByExercise`, the express, easier and time-budget session builders.
- **Progression:** `readSessionSets`, `sessionOutcome`, `applySessionProgression`, `applySessionSets`, `applyProgression`.
- **Week engine:** `advanceWeek`, `applyDeload`, `resetToBaseSets`, `oneSetFewer`, `withRaceLegTrim`, `raceWeekSession`, `easeBackIn`, `raceBlockWeek`, `raceLiftWeek`, `isRaceBuildWeek`, `calendarLighterWeek`, `lighterWeekAllowed`, `raceRestSkips`.
- **Represcription and swaps:** `represcribeWorkouts`, `represcribeSwapped`, `keptSwap`, `swappedForToday`.
- **Records:** `planWithoutSession`, `assessLiftReturn`, `detectExperienceSuggestion`.
- **Volume and copy:** `weeklyVolumeByJudgementMuscle`, `daysPerMuscle`, `weeklyVolumeTargets`, `liftRules`, `liftSessionPurpose`.
- **Run side:** `generateRacePlanV2`, `scheduleRecoveryWeekV2`, `scheduleStructuredWeekV2`.

**The server reducers too.** `functions/lib/programCommands.js` `applyProgramCommand({state, profile, command, now})` is pure CommonJS and loads in vitest via `createRequire` (the cross tests already do this).

Measured (`measurements/lifting-probes3.md`):

- `applyDeloadWeek` on a generated plan gives exactly the client `applyDeload` sets.
- `startTrainingBlock` represcribes a strength plan to hypertrophy: bench 4×3@60 becomes 4×4–8@57.5. The 4 sets are kept, because represcription never touches sets.
- Command ids must match `/^[A-Za-z0-9_-]{16,128}$/` (`programCommands.js:166`).

### 2.2 The smallest loop (as built in `harnesses/lifting-sim.test.ts.txt`)

```text
state = normalizeProgramState(buildOnboardingPlan(draft, nutritionPhase, startDate).programState)
for week in 1..N:
  [optional person actions: easeBackIn(state, share) | server applyProgramCommand(applyDeloadWeek / start|releaseTrainingBlock / skipWorkoutDay)]
  repeat sessionsThisWeek:
    idx  = nextUpIndex(state);  day = state.workouts[idx]
    rows = buildInitialSetLogs(day.exercises)        // (+ startingSetRows(rows, ex, lastSets) for top-set lifters)
    rows = lifterModel.fill(rows, day.exercises, week) // reps/weights/RPE, completed:true
    logs = toCompletionSetLogs(rows)
    state = applySessionProgression(state, idx, {completionId, date,
              prescription:{dayName, exercises: day.exercises, progressionBaseline: day.exercises},
              setLogs: logs, sessionVariant?, afterHardRun?})
    state = markDayDone(state, idx, completionId)     // copy of commitWorkoutCompletion's 10 lines
  state = advanceWeek(state, experience, nextWeekKey, raceBlockWeekOrNull, {raceLegTrim})
```

**Must be controlled or stubbed:**

1. **Clock.**
   - `applyProgression` (`:2003`) and `recorded` (`:2412`) stamp `new Date()`; `applySessionProgression` overwrites the last record with the session date.
   - `advanceWeek` and `easeBackIn` stamp `Date.now()`.
   - Use `vi.useFakeTimers({toFake:["Date"]})` + `setSystemTime` per session (done in the PoC).
2. **Instance ids.** `generateInstanceId` is `crypto.randomUUID`, so two builds differ (measured `measurements/lifting-probes2.md`). Key the sim on (dayName, slot) or mock the generator for reproducible snapshots.
3. **History reads.** These are Firestore reads in the app; keep a sim-side session log:
   - "Last:" / `startingSetRows` need saved workouts.
   - `assessLiftReturn` needs workout dates.
   - `afterHardRun` needs runs.
   - Race-plan regeneration needs `fetchRecentLayoff`.

**Logic to extract** (it lives inline or private today, and the PoC re-implements it, which is a drift risk):

| Piece                                 | Where                                                                                                     | Note                                                                                       |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| mark-day-done                         | `workoutCompletion.ts:213-227` (inside the transaction) and the optimistic copy `useProgram.ts:1480-1495` | two inline copies already                                                                  |
| SessionProgression assembly           | `useProgram.ts:1514-1530`, `WorkoutSession.tsx:305-326` (`sessionExercise`)                               |                                                                                            |
| lift-only rollover loop               | `useProgram.ts:1350-1410`                                                                                 |                                                                                            |
| run-side rollover loop + `liftsAhead` | `useProgram.ts:1188-1335`                                                                                 |                                                                                            |
| `nextRunWeek`, `regenerateRacePlan`   | `useProgram.ts:384`, `:251` (module-private, in a hook file that imports Firebase)                        | needed for any race persona; the PoC fed `advanceWeek` a hand-made `raceBlockWeek` instead |
| `advanceToNextWeek` gate              | `useProgram.ts:1685`                                                                                      |                                                                                            |

### 2.3 Behaviour that lives only server-side, with its parity pin

| Behaviour                                                                                                                        | Server code                                                                                                                                                                                                                 | Client copy                                                 | Pin                                                                                                              |
| -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| "Take a lighter week" recipe + guards + undo                                                                                     | `functions/lib/deloadEngine.js`, `programCommands.js:1692` (`applyDeloadWeekCommand`), `:1786` (revert)                                                                                                                     | `applyDeload` `programEngine.ts:2463`, `lighterWeekAllowed` | `deloadEngine.cross.test.ts`                                                                                     |
| Block start/release represcription                                                                                               | `functions/lib/represcribe.js`, `functions/lib/roleTable.js`, `programCommands.js:1468/1531`                                                                                                                                | `represcribe.ts`, `roleTable.ts`                            | `represcribe.cross.test.ts`, `roleTable.cross.test.ts`                                                           |
| All command reducers (skip/restore/next/exercise add/replace/update/remove/reorder, settings incl. `smallPlates`, run-day edits) | `programCommands.js`                                                                                                                                                                                                        | optimistic updaters in `useProgram.ts`                      | `programCommands.cross.test.ts`, `programCommandEnvelope.cross.test.ts`, `programExerciseBuilder.cross.test.ts`  |
| Plan validation / sanitizer (onboarding, configurePlan)                                                                          | `validatePlanPayload.js`, `programStateSanitizer.js` (top-level key allow-list), `stateTransition.js` (`mergeChangedFields`)                                                                                                | `validatePlanOutput`, `stateTransition.ts`                  | `validatePlanPayload.cross.test.ts`; `functions/__tests__/programStateKeyParity.test.js`; `trustedState.test.ts` |
| Saved set projection                                                                                                             | `workoutSetRecord.js`                                                                                                                                                                                                       | `workoutSetRecord.ts`                                       | `workoutSetRecord.cross.test.ts`                                                                                 |
| Performance Index (only PI copy, the running lighter-week card and PI "Lifting suggestions" read it now)                         | `perfScoring.js`                                                                                                                                                                                                            | `performanceEngine.ts`                                      | `performanceEngineParity.cross.test.ts`                                                                          |
| Server progression copy                                                                                                          | **retired** (`progressionEngine.js`, `progressionHold.js` deleted; ADR-0008 update 2026-10-05). `completeWorkoutDay` command reducer remains (`programCommands.js:2107`, marks done, no progression) and no client sends it | client `applyProgression` only                              | n/a                                                                                                              |

### 2.4 Proof-of-concept results

**What was run.** The real engine, unmodified (`harnesses/lifting-sim.test.ts.txt`), driven through `buildOnboardingPlan` → per session `applySessionProgression` → `advanceWeek`. Personas are all 80 kg male, full gym.

**Lifter model.**

- Each instance has a true e1RM (Epley) that grows g%/week.
- Each set is done at min(target, Epley reps − ⌊set/2⌋), never more than the target.
- "Calibrated" lifters lift their RIR-2 weight at the first exposure (the plan follows it); "compliant" ones lift the seed.
- They pick up the next weight when a target has stretched past its range.

Cells read `sets×target@load-lifted outcome (best logged e1RM / true e1RM)`.

**S1 — intermediate, 4 days, Get stronger, 60 min, calibrated, +0.5%/wk, 52 weeks.**

| lift (instance) | wk1                | wk7                  | wk15                 | wk25               | wk39                 | wk51                 |
| --------------- | ------------------ | -------------------- | -------------------- | ------------------ | -------------------- | -------------------- |
| bench 4×3       | 85 step (94/100)   | 92.5 miss (102/103)  | 95 miss (105/107)    | 95 step (105/113)  | 107.5 miss (118/121) | 112.5 step (124/128) |
| squat 4×3       | 120 step (132/140) | 127.5 miss (140/144) | 127.5 step (140/150) | 125 step (138/158) | 150 miss (165/169)   | 155 step (171/180)   |
| deadlift 3×3    | 145 (160/170)      | 155 miss             | 152.5                | 167.5              | 182.5 miss           | 180 (198/218)        |
| deadlift 4×5    | 137.5              | 147.5 miss           | 152.5 miss           | 152.5              | 172.5 miss           | 170 (198/218)        |
| OHP 4×7         | 47.5               | 50                   | 55 miss              | 57.5 miss          | 55                   | 62.5 (77/80)         |

- **Sawtooth.** The bench detail runs 85 → 87.5 → 90 (miss) → 90 (lighter week) → 90 → 92.5 (miss) → 92.5 (miss) → 82.5 (lighter week) → 82.5 → 85 → 87.5 → … (`sim-detail.md`).
- **Drops.** 24 ten-percent lowerings in 52 weeks across 6 main instances.
- **Miss rates.** Bench 11/52, squat 7/52, OHP 16–20/52.
- **Tracking.** The mean logged e1RM / true e1RM is 0.93–0.95 in normal weeks.
- **Answer to "+10 kg bench in 16 weeks".** Yes for this lifter: the working triple goes 85 → 95 kg by week 15–17. But only because the model's 1RM rose 8%. The engine tracks capacity; it does not create it (see caveats).

**S2 — the same lifter on Build muscle, 52 weeks.**

- The bench "heavier day" range (4–8) holds at 82.5 kg for about 18 weeks while the reps climb 4 → 8. Then 85, 87.5, … and 97.5 kg at week 51, against a true 1RM of 128.
- No misses on the mains; the 3 drops were all on isolations. Logged e1RM / true is 0.91–0.94 on the mains.
- The lateral-raise target stretched to 24 reps at 10 kg, because 12.5 kg is a +25% step that is never taken automatically.

**S3 — beginner, 3 days, Build muscle, compliant (lifts the seed), +1.5%/wk.**

- The bench main (3×8 fixed) went 35 → 62.5 kg by week 25.
- The bench in the compound slot (2×8–12 double, same lift, same week) went 35 → 45 kg × 12. The two copies diverge; the second sits about 15 reps in reserve.
- OHP missed 11/26 sessions.

**S4 — the same as S1 but compliant (lifts the seed).**

- The seeds are far below a real intermediate: bench seed 60 kg against a 100 kg 1RM.
- Linear +2.5 kg a week means the bench reaches its real working weight only around weeks 19–25.
- The first-set hint ("Feels easy? Add weight") is the only correction path.

**S5 — light trainer, 2 of 4 sessions a week.**

- Each session comes round every 2 weeks, as expected.
- **But every calendar lighter week landed on the same pair.** The Lower B 4×5 deadlift was a lighter session at weeks 4, 8, 12, 16, 20 and 24, every second exposure, while Upper A and Lower A never had one.

**S6 — 4-week layoff, then Ease back in 10% at week 15.**

- The plan comes back at 2×8@75 (from 82.5) and climbs back a step a session to 82.5 by week 19.
- The miss counts reset.

**S7 — Support my running, 3 days, 45 min, 16-week half-marathon block, leg trim yes.**

- Lighter weeks fell on 4, 8, 12 (the run plan's step-back weeks), 14–15 (taper), 16 (race: one session, squat at half weight, 2 sessions skipped) and 17 (after).
- That is 5 lighter weeks in the last 6.
- The leg trim changed nothing, because the 45-min plan's leg lifts already have 2 sets (`raceLegSets(2)=2`).
- After the race the week number jumped 17 → 20, the next multiple of 4.

**Caveats for the ultracode sim:**

1. **There is no adaptation model.** Capacity grows independently of the plan, so the PoC measures tracking (does the prescribed load follow the lifter), not efficacy. Answering "does this plan add 10 kg" needs a stimulus → adaptation model: dose-response on hard sets and effort, intensity, frequency, training age, fatigue and detraining. Its parameters must be stated priors.
2. **Fatigue across sets is a crude constant.**
3. **No RPE, swaps or easier days.**
4. **Race personas need `nextRunWeek`** extracted, or reimplemented as in the PoC.

Recommended metrics:

- e1RM and working-load trajectories per main lift
- load / capacity tracking ratio
- step, hold and miss rates, and drops per 100 sessions
- share of lighter sessions per session (catches the S5 artefact)
- achieved weekly hard sets per muscle and days per muscle
- minutes per session
- invariants: no loaded lift at 0 kg, sets ≥ 1, `baseSets` restored after every lighter week, weekNumber cycle, no NaN

---

## 3. Existing sweeps and multi-week tests

| Test                                                                                                   | What it drives                                                                                                                                                                                                                           | Span                                                                                                                                                                                              | What it asserts                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `planSweep.golden.test.ts`                                                                             | `buildPlan` over 6 days × 3 equipment × 5 goals (90 configs), intermediate, 80 kg male, session length omitted ⇒ 60 min                                                                                                                  | 1 generated week                                                                                                                                                                                  | snapshot of every prescription + judged volume flags; D-VOL ratchet ≤ 43 configs over a ceiling (and > 0); D-ACC (arm/core always accessories); D-CAT inference defects pinned. No beginner/advanced, no 30/45/75 min, no injuries, no progression          |
| `generatorAudit.test.ts`                                                                               | `generateProgram(days, undefined, goal, CTX)` for 4 goals × 6 days — **no `experience` argument ⇒ beginner tier, no time fit, no week schedule**                                                                                         | 1 week                                                                                                                                                                                            | ≤ 2 exposures of a lift/week; hinge kept; no arms/pressing on lower days; hamstring coverage; no 0 kg loaded lifts (also via buildPlan); one load per lift; variation-scaled seeds; rep ceilings; ≤ 18 sets/session; determinism; template regenerate carry |
| `volumeProgressionOverTime.test.ts`                                                                    | 4-day hypertrophy intermediate, no loadCtx, no session length; every exercise `applyProgression(e, e.reps, e.weight, true)` (bypasses `applySessionSets` / `applySessionProgression` / set reading); `advanceWeek(state,"intermediate")` | 24 weeks                                                                                                                                                                                          | weekly sets cycle [66,66,66,44] repeating; mains 24 (16 in lighter weeks); week 24 = week 4; accessories climb ≥ 12% by week 18 with identity intact                                                                                                        |
| `persistedWeekProgression.test.ts`                                                                     | RUN side: race plan regenerated weekly, `weeks[0]` persisted                                                                                                                                                                             | up to 26 weeks                                                                                                                                                                                    | run blocks progress (not lifting)                                                                                                                                                                                                                           |
| `progressionUserLoad.test.ts`                                                                          | `applyProgression`, `applySessionProgression` on hand-built bench/pull-up rows                                                                                                                                                           | ≤ 4 sessions per case (39 cases)                                                                                                                                                                  | plan follows load lifted; 2nd miss −10%; small plates; auto-progression off; held week; easier/lighter only up; lowered line once; migration keeps lowered plans                                                                                            |
| `rangelessDoubleProgression.test.ts`                                                                   | migration-added and template range-less doubles                                                                                                                                                                                          | 12 compliant sessions                                                                                                                                                                             | targets climb; ceilings; holds unchanged; authored ranges untouched                                                                                                                                                                                         |
| `programEngine.test.ts`                                                                                | engine units + small loops                                                                                                                                                                                                               | 13-week bodyweight emulation (`:377`), 9-week no-compounding (`:1054`), 12-week absence (`:1492`), order carry-over, lighter-week rules (`:1277-1392`), day roles, overlap caps, regenerate carry | as titled                                                                                                                                                                                                                                                   |
| `sessionSets.test.ts`, `easeBack.test.ts`                                                              | climb back after a drop / ease back                                                                                                                                                                                                      | 5–6 sessions                                                                                                                                                                                      |                                                                                                                                                                                                                                                             |
| `raceLighterWeeks`, `raceFinalWeeks`, `raceLegTrim`, `raceRest` tests                                  | `advanceWeek` with `raceBlockWeek`                                                                                                                                                                                                       | per-week transitions over a block                                                                                                                                                                 | step-back placement, taper/race/after, trim, rest days                                                                                                                                                                                                      |
| `trainingDecisionJourneys.test.ts` (lib)                                                               | real `commitWorkoutCompletion` + `correctSavedWorkout` against the Firestore fake (ADR-0009), one `advanceWeek`                                                                                                                          | 1–2 weeks                                                                                                                                                                                         | variants, corrections, cut-short sessions, RPE hold                                                                                                                                                                                                         |
| `deloadNagLoop.test.ts`, `deloadTriggerReachability.test.ts`, `singleDisciplineWeek.test.ts` (lib)     | Performance Index                                                                                                                                                                                                                        | 26 weeks / 345,600 synthetic weeks                                                                                                                                                                | PI behaviour (EV-09/EV-10 measurements)                                                                                                                                                                                                                     |
| property tests `generateRacePlanV2.property`, `runModeMaterialization.property`, `racePlanSafetySweep` | run side                                                                                                                                                                                                                                 |                                                                                                                                                                                                   |                                                                                                                                                                                                                                                             |

**There is no reusable multi-week lifting helper.** Each test hand-rolls its loop: `simulate()` in `volumeProgressionOverTime`, the emulations in `programEngine.test.ts`. None of them goes through the session reading (`readSessionSets`) and `applySessionProgression` together with `advanceWeek` over more than a few weeks. None models a lifter's capacity, or lifters who miss, skip, travel or calibrate. `src/test/sessionFixtures.ts` only builds saved run and workout documents.

---

## 4. Lift4 conformance

Verdicts:

- **I**: implemented as written.
- **P**: partial.
- **D**: implemented differently.
- **U**: unimplemented.

| Clause                                                                                                                                                                                                                                                                                                                    | Where                                                                                                                                                                                                                                                                                          | Pinned by                                                                                                                                                                                                                                        | Verdict / notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (1) Coach that follows you: next session from the weight lifted, any margin                                                                                                                                                                                                                                               | `liftedLoad` `programEngine.ts:1983`; `applyProgression` `:2071-2074`; hold path `applySessionSets` `:2375-2381`                                                                                                                                                                               | `progressionUserLoad.test.ts` (heavier/lighter describes)                                                                                                                                                                                        | **I**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| (2) Engine adds weight/reps, lowers after 2 misses, runs lighter and race weeks; never swaps or suggests on its own                                                                                                                                                                                                       | `countMiss` `:2256`; `advanceWeek` `:2506`; carried variation kept `makeExercise` `:470-482`; rotation/plateau-swap code deleted (no `rotateUntrainedAccessories`, `applyExperienceAwarePlateauPicks`, `adjustmentRule` in source)                                                             | `programEngine.test.ts` "a new cycle keeps every lift" (`:443`), "keeps every lift… through a stalled week" (`:1436`)                                                                                                                            | **I**. Identity passes (dedupe, overlap caps, repeat cap, complexity gate) still re-point lifts, but only when a plan is (re)built on a yes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| (3) Silent by default; label lighter/race weeks; one lowered line; first-guess hint; ranges shown; set rows from last time; rules on one sheet; no stall/suggestion cards; Easier today only after a hard run                                                                                                             | `LoweredLine.tsx`; `firstGuide.ts:219,234`; `formatRepTarget`; `startingSetRows`; `liftRules.ts:83`; `shouldSuggestDeload` `deloadSuggestVisibility.ts:54`; easierToday hard-run reason                                                                                                        | `liftRules.test.ts`, `ExerciseRowSummary.test.tsx`, `setStartValues.test.ts`, `sessionSets.test.ts` lowered cases, `deloadSuggestVisibility.test.ts`, `easierToday.test.ts`                                                                      | **P**: the Performance tab (History → Performance, technical fold) still renders PI **"Lifting suggestions"** from `generatePlanAdjustments` `performanceEngine.ts:396-429` → `PerformanceTab.tsx:579-600`: "Reduce working sets by 30–40% or drop accessory work", "Maintain intensity but consider reducing total volume 10–15%", "Focus on progressive overload — small weight jumps or extra set". These are suggestions, they contradict the lighter-week recipe (half the sets) and (13) (no added sets). The PI insight bullet "Consider a deload week" (`:345`) was kept deliberately per the handoff STATUS 2026-10-06                                                                                                                |
| (4) Four goals as dials on one engine; Lose fat = Build muscle + cut; one set of goal names; beginner-centred defaults                                                                                                                                                                                                    | `tableGoal` `roleTable.ts:70-74`; bands `volumeModel.ts:514-516`; onboarding defaults hypertrophy / 4 days / 60 min / full gym (`Onboarding.tsx:192-205`)                                                                                                                                      | `roleTable.test.ts` "builds Lose fat as Build muscle"; `fatLossPrescription.test.ts`; measured: fat_loss plan ≡ hypertrophy plan (`measurements/lifting-probes2.md`)                                                                             | **D (naming)**: `goalLabel("running")` = **"Improve running"** (`programLabels.ts:58-59`, onboarding and settings); the lock and every code comment say "Support my running". `GOAL_PROFILES` still carries a distinct `fat_loss` row with `mainProgression:"linear"` (`programEngine.ts:132-139`), but the role table overwrites it, so it's dead weight                                                                                                                                                                                                                                                                                                                                                                                      |
| (5) One generator; every muscle 2×/week; role on every exercise; session length 30/45/60/75+ with time fit; sets and ranges by role; heavier/lighter days for intermediates; straight sets; effort cue; 85%×2 warm-up; rest by role; first-guess loads, unknown = beginner, bar without bodyweight, pull-up swap unloaded | `onboardingPlan.ts`; `weeklyFrequency.ts`; `exerciseRole.ts:21` (derived, not stored); `sessionFit.ts`; `roleTable.ts:34-104`; `applyDayRoles` `:1388`; `effortCue.ts:44`; `warmupRamp.ts:59`; `restTime.ts:15`; `startingLoads.ts:339`; `toExperience` `experienceModel.ts:152`               | `roleTable.test`, `sessionFit.test`, `weeklyFrequency.test`, `restTime.test`, `warmupRamp.test`, `effortCue.test`, `startingLoads.test`, `exerciseRole.test`, `generatorAudit`, `planSweep.golden`, `beginnerCapacity.test`, `calfCoverage.test` | **P** (gaps below)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| (6) Fixed vs range rule; all working sets count; equipment steps (2.5 / 1.25 small plates / DB pair / stack); odd weights round once; >15% never automatic; no lean-bulk bonus; RPE 9.5 holds                                                                                                                             | `applyProgression` `:2122-2253`; `readSessionSets` `sessionSets.ts:59`; `loadSteps.ts`; v5 `roundOntoGrid` `migrations.ts:487-488`; `RPE_HOLD_THRESHOLD` `:199`                                                                                                                                | `loadSteps.test`, `sessionSets.test`, `programEngine.test` "progression scheme per exercise type" (`:1110-1275`), `progressionUserLoad.test`, `migrations.test`                                                                                  | **P**: **bodyweight lifts on a fixed target never progress** (below)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| (7) Miss = session total under target × sets at plan weight; first holds; two → −10% by ≥1 step + one line; step back up per session; resets after lighter week / break / ship; leg miss after hard run counts half; bodyweight in reps/seconds                                                                           | `sessionOutcome` `sessionSets.ts:103`; `countMiss` `:2256`; climb back `:2346-2368`; reset in `advanceWeek` `:2590-2597`; v5 `resetMissCount` `migrations.ts:287`; `sessionCompletion.ts:125-130`                                                                                              | `sessionSets.test.ts` (`:116-160`, `:344-456`), `afterHardRun.test.ts`, `programEngine.test` "starts the miss counts again" (`:1375`), `migrations.test`                                                                                         | **P**: "reset … after a break" happens only through `easeBackIn` (`programEngine.ts:2805-2822`). "Keep my old weights" (`LiftReturnSheet.tsx:81-95`) only dismisses, and an untrained gap doesn't reset `consecutiveFailures`. A lifter who missed once before a 3-week break and misses on return is lowered 10% at once                                                                                                                                                                                                                                                                                                                                                                                                                      |
| (8) Cut-short sets count (step needs ≥2 sets all at target); Easier today and lighter week only move up                                                                                                                                                                                                                   | `sessionOutcome` (`needed = min(2, sets)`); `sessionCompletion.ts:104-117`                                                                                                                                                                                                                     | `sessionSets.test` "holds on one set of a plan with more"; `progressionUserLoad.test` (`:492-524`); `trainingDecisionJourneys.test`                                                                                                              | **I**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| (9) Every 4th trained week, intermediate+ on ≥3 days; half sets same weights; one at a time, never two in a row, missed not owed; Take a lighter week any time; no early lifting offer; with a race on the step-back week                                                                                                 | `lighterWeeksScheduled` `weekPrescription.ts:51`; `calendarLighterWeek` `:182`; `applyDeload` `:2463` + `deloadEngine.js`; guards `advanceWeek` `:2633-2639`, `lighterWeekAllowed` `:83`, server `:1692-1716`; `shouldSuggestDeload`                                                           | `programEngine.test` lighter weeks (`:1277-1392`), `deloadEngine.cross.test`, `raceLighterWeeks.test`, `deloadSuggestVisibility.test`                                                                                                            | **I** to the lock's text; **D** to the handoff precedence table, which says a lighter week taken from Train "counts as the calendar lighter week and restarts its count". Measured (`measurements/lifting-probes4.md`): taken in week 2, the calendar one still comes in week 4. Also the S5 artefact: for a 2-of-4-sessions lifter every calendar lighter week falls on the same two sessions                                                                                                                                                                                                                                                                                                                                                 |
| (10) Race: leg trim question (yes default for Support my running); −⅓ leg sets through build until the lighter weeks; last 2 weeks lighter; race week one short session ≥3 days out, legs light; week after light; heavy legs before long/key run is a flagged note; no-race runners keep day-after rules                 | `raceLegSets` `:2724`, `withRaceLegTrim` `:2733`, `isRaceBuildWeek` `weekPrescription.ts:165`, `raceLiftWeek` `:147`, `raceWeekSession` `:2763`, `raceRestSkips` + effect `useProgram.ts:1415`, `onboardingPlan.ts:61-67`, `raceLegTrimNow` `planBuilder.ts:523`                               | `raceLegTrim.test`, `raceFinalWeeks.test`, `raceRest.test`, `raceLighterWeeks.test`, `useHardRunBefore.test`, `liftSessionPurposeNextDay.test`                                                                                                   | **I** (incl. STATUS 2026-10-06 rest-day enforcement and trim-until-lighter-weeks). Observations: the trim is a no-op on 2-set leg lifts (`raceLegSets(2)=2`; every leg lift in the 45-min Support my running plan P5 has 2 sets); a 16-week half block gives 5 lighter weeks in the last 6 (S7)                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| (11) Order carries over (and every weekday view follows); Welcome back ≥2 weeks, ease first ≥3, 10%/20%, set fewer, climb back, counts reset; equipment presets + "what do you have?"; injuries cover every named lift; removing a limitation restores lifts; Swap for today / Skip; Finish asks to keep                  | `advanceWeek` `:2669-2672`; ADR-0002 update; `assessLiftReturn` `liftLayoff.ts:98`; `easeBackIn` `:2805`; `CONTRAINDICATED` `injurySubstitutions.ts:118`; `restoreSwappedLifts` `matchTemplate.ts:57`; `sessionSwap.ts`; `applySessionProgression` swap branch `sessionCompletion.ts:74-79`    | `programEngine.test` (`:557-667`), `easeBack.test`, `liftLayoff.test`, `injuryCoverage/injuryReswap/equipmentReswap/equipmentCopy.test`, `sessionSwapCompletion.test` (lib)                                                                      | **I**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| (12) Blocks 4/8/12; same-focus block changes nothing; level change sets how mains progress, lighter weeks and what a rebuild picks, never rebuilds; suggestion stays a suggestion                                                                                                                                         | `BlockDurationWeeks`; `programCommands.js:1503-1513`, `useProgram.ts:3285-3296`; `buildLiftProgram` preserve `planBuilder.ts:327-372`; `ExperienceSuggestionCard.tsx:122-150`                                                                                                                  | `trainingBlock.test`, `represcribe.test/.cross`, `experienceModel.test`, `planBuilder.test`                                                                                                                                                      | **P**. (a) **Level change doesn't set how main lifts progress** on an existing plan. Measured (`measurements/lifting-probes.md` a′): beginner → intermediate keeps `3×8 linear` mains, 2-set accessories and no heavier/lighter days. Only lighter weeks (read live), the RPE-row default and the next rebuild follow; the card copy describes exactly that narrower behaviour. (b) `represcribeWorkouts` assigns heavy/pump by **day index** (`represcribe.ts:98-107`). After the order carries over, a block's start or release re-labels which days are heavy (probe c: Upper — Chest & Back's bench 3×3 → 3×7, Lower — Deadlift Focus 3×5 → 3×3, with an Epley load cut). Not idempotent across rotations, so release isn't a true inverse |
| (13) Retirements (accessory wave, adjustment rule, fatigue shave, automatic whole-body lighter week, cut/bulk nudges, untrained rotation, plateau swap, Easier today's guessed reasons, per-muscle "Eased this week")                                                                                                     | all deleted; inert fields kept (`fatigueScore`, `plateauResponses`, `amnestyWeeksLeft`; `recoveringMuscles` dropped at rollover `:2678-2686`)                                                                                                                                                  | `volumeProgressionOverTime.test`, `programEngine.test` "a week of misses leaves next week's sets alone" (`:516`), `easierToday.test`                                                                                                             | **I**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| (14) Delete puts the plan back when nothing moved on; `afterHardRun` recorded; holds > 100 s                                                                                                                                                                                                                              | `planWithoutSession` `workoutCompletion.ts:106` via `sessionDelete.ts:126`; `useProgram.ts:1531,1579`; `setValidation.ts:24`                                                                                                                                                                   | `sessionDeletePlan.test.ts`, `afterHardRun.test`, `setValidation.test` "completes a hold past 100 seconds", `WorkoutSessionCompletion.test.tsx:182`                                                                                              | **I**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| STATUS 2026-10-06                                                                                                                                                                                                                                                                                                         | race rest days via `skipWorkoutDay` (`raceRest.ts`, `useProgram.ts:1415`); trim until the lighter weeks (`isRaceBuildWeek`); miss = session total; rebuild inside a lighter week stays lighter (`keepWeekLighter` `planBuilder.ts:481`); swap picks one exercise (`ExercisePicker pickAction`) | `raceRest.test`, `raceLegTrim.test` (`:137`), `sessionSets.test`, `planBuilder.test`                                                                                                                                                             | **I**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

**Clause (5) gaps in detail:**

- **Train's "Replace" keeps the old slot's prescription.** `replaceExercise` (`programCommands.js:1993-2079`, client `useProgram.ts:2943-3010`) carries the old slot's sets, reps, range and progression type. Replacing a fixed 3×5 main with a lateral raise yields a 3×5 linear raise. Swap for today does the same. The lock's text doesn't cover Replace, but it is inconsistent with equipment and injury swaps, which do take role numbers.
- **"Add exercise" ignores the role table.** It builds 3×10, linear, 0 kg, with no range (`programCommands.js:1964-1991`). Only equipment and injury swaps get their role's numbers (`represcribeSwapped`).
- **The push/pull balancer pads curls.** It counts biceps curls as pull (`PULL_CATEGORIES` `volumeModel.ts:969-973`) and adds sets to the cheapest pull accessory, usually the curl. Measured: the beginner 3-day plan's Barbell Curl is 4×10–15, and the beginner 4-day Upper A has a 4-set curl, against the role table's "two sets elsewhere" for beginners.
- **"Every muscle twice a week" yields to time first.**
  - 45-min Build muscle 4-day: side delts, calves and abs on 1 day.
  - 30-min 2-day general: quads, hamstrings, lats and rear delts on 1 day; calves and side delts absent.
  - 45-min Support my running: no side-delt work.

  The lock allows "as far as the time and the ceilings allow", but the time model (§6) makes this the common case at 30–45 min.

- **The Weekly volume card's "what fits" reference ignores the person's setup.** It is built by `generateProgram` with no `limits` (`volumeTargets.ts:29-37`), so it is a full-gym, no-injury plan even for a home-gym user.

**Clause (6) gap in detail.** On the linear path a bodyweight lift with no `repRangeMax` climbs only on a 2-rep overshoot (`programEngine.ts:2199-2219`). `liftedLoad` returns null for bodyweight lifts, so added load is never followed. Role-table fixed targets have no range, so this hits pull-ups as a main lift for Get stronger and Support my running, intermediate and up (e.g. P2 "Pull-Ups 4×7", X3, X6).

Measured (`measurements/lifting-probes2.md`):

- 10 sessions at exactly 4×7: still 4×7.
- +1 rep on every set: still 4×7.
- 9 on every set: 4×8, then frozen.
- Logged at +10 kg: the plan stays at 0 kg.

The rules sheet tells the person "When every set hits its target, the weight goes up a step." For a bodyweight fixed target, nothing goes up.

**Doc amendments the lock listed:**

- Done: ADR-0002, ADR-0008 and ADR-0012.
- Partly done: ADR-0011 has only the `easeBackIn` update; there is no note on `deloadEngine.js` / `represcribe.js` / the sanitizer allow-list going live first.
- Not done: the LIFT-EV ledger (EV-08 and EV-09 have no Lift4 STATUS).

---

## 5. What the engine offers

**Goals** (`PrimaryGoal`):

- `hypertrophy` "Build muscle": the default.
- `strength` "Get stronger".
- `general` "General fitness".
- `running` "Improve running": the lock calls it "Support my running".
- `fat_loss` "Lose fat": the same plan as Build muscle; the cut is in nutrition only.

**Levels:**

- beginner, intermediate, advanced.
- An unknown or empty value counts as beginner (`toExperience`).
- Builders pick at intermediate, and the complexity gate re-points what a beginner can't do.

**Lift days:** 0–6 (7 clamps to 6). The split by days is 1–3 full body, 4 upper/lower, 5 PPL + upper/lower, 6 PPL ×2.

**Session lengths:** 30, 45, 60 or 75+ (`SESSION_MINUTES_OPTIONS`). The default is 60. A stored 30–120 is honoured as-is.

**Equipment:**

- `full_gym`.
- `home_gym`: dumbbells, bodyweight, kettlebell.
- `minimal`: dumbbells, bodyweight.
- Optional `barbellAtHome` (barbell + rack) and `smallPlates` (1.25 kg barbell steps).

**Injuries:** `lower_back`, `shoulder`, `knee`, `elbow`, `wrist`. Each contraindicated lift has a substitute (`CONTRAINDICATED` `injurySubstitutions.ts:118`, `INJURY_SUBSTITUTIONS`).

**Catalogue** (`src/lib/exercises.ts`):

- 152 exercises; 68 tagged `mechanic:"isolation"`.
- By equipment: barbell 32, dumbbells 30, machine 30, cable 18, bodyweight 35, kettlebell 2, other 5 (ab wheel, battle ropes, box, jump rope, pool).
- The generator's **variation bank** has 9 categories (`variationBank.ts`). Primary\* is marked; [t] = technical, [a] = advanced, [bwf] = bodyweight floor:
  - horizontal push: bench\*, incline bench, DB bench, incline DB, close-grip [t], floor press [a], push-ups
  - vertical push: OHP\*, DB shoulder press, Arnold [t], landmine [t]
  - horizontal pull: barbell row\*, DB row, T-bar, seated row, chest-supported DB row [t], Pendlay [a], inverted row
  - vertical pull: pull-ups\* [bwf], lat pulldown, chin-ups [bwf], single-arm pulldown [t], straight-arm pulldown
  - knee: squat\*, front squat [t], leg press, hack squat, Bulgarian [t], goblet, bodyweight squat
  - hip: deadlift\*, RDL [t], hip thrust, sumo [t], trap bar [t], seated leg curl, rack pull [a], DB RDL, glute bridge, Nordic [t]
  - biceps: 6 curls
  - triceps: pushdown\* + 4
  - core: cable crunch\* + 5
- Calves and side delts are named slots: standing and seated calf raise, lateral raise.
- **"Main"** is a role, not a lift list: a compound in a non-accessory slot (`exerciseRole`).
  - In practice the mains are bench, squat, deadlift, OHP, barbell row, pull-ups, lat pulldown (beginners) and DB equivalents at home.
  - Upper/lower also makes the OHP on Upper A a main, the second vertical push.

### Role table, by goal × level

`roleTable.ts:34-56`, sets `:93-101`. Undulation applies ±2 reps for intermediate and advanced (`applyDayRoles`):

- The first half of the week is heavier (−2) and the back half lighter (+2). An odd middle day stays at the base.
- Floors: 3 reps for mains, 6 for accessories. Ceiling: 20 reps, 15 for bodyweight lifts.
- A hip-dominant main is never +2.
- The span is kept: `repRangeMax` = reps + span.

| Goal                    | Level     | Main                                                  | Other compound        | Isolation                                           | Progression              |
| ----------------------- | --------- | ----------------------------------------------------- | --------------------- | --------------------------------------------------- | ------------------------ |
| Build muscle / Lose fat | beginner  | 3×8 fixed                                             | 2×8–12                | 2×10–15 (calves/side delts/abs 2×12–20)             | main linear; rest double |
|                         | int / adv | 3×6–10 → heavier 4–8, lighter 8–12 (hinge stays 6–10) | 3×8–12 → 6–10 / 10–14 | 3×10–15 → 8–13 / 12–17; 12–20 group → 10–18 / 14–20 | all double               |
| Get stronger            | beginner  | 3×5 fixed                                             | 2×6–10                | 2×8–12                                              | main linear              |
|                         | int / adv | **4×5 fixed → heavier 4×3, lighter 4×7** (hinge 4×5)  | 3×6–10 → 6–10 / 8–12  | 3×8–12 → 6–10 / 10–14                               | main linear              |
| General fitness         | beginner  | 3×8 fixed                                             | 2×8–12                | 2×10–15                                             |                          |
|                         | int / adv | 3×8–12 → 6–10 / 10–14                                 | 3×8–12                | 3×10–15                                             | double                   |
| Support my running      | beginner  | 3×5 fixed                                             | 2×6–10                | 2×8–12                                              |                          |
|                         | int / adv | 3×5 fixed → 3×3 / 3×7 (hinge 3×5)                     | 3×6–10                | 3×8–12                                              | main linear              |

Time-fit cuts apply after the table. Order: isolations' sets to 2, compounds' sets to 2, drop isolations, mains' sets to 2, drop compounds. A main is never dropped and never goes below 2 sets. The ceiling is 18 sets a session.

### Everything else, by goal × level

**Effort cue** (`effortCue.ts`):

- Mains and free-weight compounds: "Finish with 2 reps to spare".
- Isolations, and machine or cable compounds in a supporting slot: last set "OK to go to your limit".
- Core: none.
- Lighter week: "keep everything comfortably easy".

**Rest** (`restTime.ts`):

| Role          | Standard | 30-min plans |
| ------------- | -------- | ------------ |
| Main ≤ 6 reps | 180 s    | 120 s        |
| Other main    | 150 s    | 90 s         |
| Compound      | 120 s    | 90 s         |
| Isolation     | 75 s     | 60 s         |

A fixed rest from Workout preferences overrides these.

**Weekly sets per muscle:**

- A ceiling only; floors are not chased.
- Generic bands (mv / low / high): hypertrophy and fat loss 5/12/20, strength 4/8/14, general 4/8/16, running 3/6/14.
- Per-group judged bands for front, side and rear delts, lats, upper and lower back, abs, glutes and calves (`volumeModel.ts:691-746`).
- Beginners get two-thirds.
- Counted at 1:1 (ADR-0010).

**Frequency:** the target is 2 days per muscle (`WEEKLY_FREQUENCY`), "as far as time allows". No lift appears more than 2× a week, and there are at most 2 hinge sessions a week.

**Steps:**

- Barbell 2.5 kg, or 1.25 kg with small plates.
- Dumbbells go to the next pair: 1 kg steps up to 10 kg, then 2.5 kg.
- Machine and cable stacks 2.5 kg; kettlebells 2 kg, then 4 kg.
- A step over 15% of the weight is never automatic: the target stretches to the Epley-equal rep ceiling.

**Lighter weeks:**

- Intermediate and advanced on ≥ 3 lift days get one every 4th trained week (with a race, on the run plan's step-back weeks).
- Beginners and 1–2-day plans get none.
- Anyone can take one: half the sets at the same weights.

**Not present:**

- **%1RM loading.** None (explicit non-adoption, handoff "Explicit non-adoptions").
- **e1RM.** Used only in seeding (`repScaledSeed`), represcription (`scaleLoadForReps`), the stretched ceiling, PRs and history, and level detection. It never sets a working load from a max.
- **RPE/RIR-driven loading.** None. The effort row is optional (on by default for advanced only), and only RPE ≥ 9.5 does anything: it holds the step.
- **Top sets.** Not prescribed. Logged top sets and back-offs are tolerated: the plan follows the most-sets weight.
- **Peaking, test week, AMRAP.** None.
- **Powerlifting or powerbuilding mode.** None. "Get stronger" is the closest, and it trains squat and bench once a week on 4 days (§6).
- **Per-lift priority, weak points, specialization.** None. The variation roles for weak points were retired in Lift4 build step 4. Block `anchorExerciseIds` feed only the block review (`blockReviewViewModel.ts:170`). The volume model notes it has no per-muscle priority input.
- **Block periodization.**
  - Training blocks of 4, 8 or 12 weeks change only the focus (rep targets via represcription) and the pace (lighter / easing; easing holds progression for 2 weeks).
  - There is no accumulation → intensification → peak.
  - `weekPrescription.ts:19-29`: "That is the whole periodisation: no intensity ramp and no volume modifier".

**What "advanced" changes over intermediate:**

1. Starting loads, about +35% via `BW_MULTIPLE` (`startingLoads.ts:50-74`).
2. The RPE row shows by default (`showsRpeByDefault`).
3. [a] variations can be offered, but builders pick at intermediate, so only when the person picks one.

Nothing else: the same role table, sets, undulation, ceilings and lighter weeks. Measured: the advanced 5-day Build muscle plan (P4) and the intermediate one (X2) are identical apart from loads (bench 80 vs 57.5, squat 120 vs 90). Advanced is never suggested automatically.

---

## 6. Programming quality: generated plans

All plans come from `buildPlan` (the onboarding path), 80 kg male, Monday 2026-03-09. Full per-day tables (exercise, equipment, role, sets × reps, load, progression, rest, warm-ups, cue) are in `measurements/lifting-plans.md`.

### 6.1 Per-plan summary

Columns: split, exercises per day, working sets per day, estimated minutes per day, total working sets per week.

| Plan                                                                   | Split             | Ex/day      | Sets/day          | Est. min/day   | Sets/wk |
| ---------------------------------------------------------------------- | ----------------- | ----------- | ----------------- | -------------- | ------- |
| P1 beginner 3d Build muscle 60 min                                     | full body         | 6/6/6       | 14/16/14          | 57/59/56       | 44      |
| P2 intermediate 4d Get stronger 60                                     | upper/lower       | 3/4/6/5     | 12/11/17/14       | 60/53/60/57    | 54      |
| P3 intermediate 4d Build muscle 45                                     | upper/lower       | 3/3/6/5     | 8/8/12/10         | 45/41/45/45    | 38      |
| P4 advanced 5d Build muscle 75                                         | PPL + upper/lower | 6/6/5/5/5   | 17/16/15/14/15    | 64/64/62/58/60 | 77      |
| P5 intermediate 3d Support running 45 (half-marathon prep, 3 run days) | full body         | 4/4/5       | 8/8/10            | 42/37/45       | 26      |
| P6 beginner 2d General 30, minimal (DB + bodyweight)                   | full body         | 4/4         | 8/8               | 27/30          | 16      |
| X1 intermediate 3d Get stronger 60                                     | full body         | 4/5/6       | 13/13/13          | 59/59/59       | 39      |
| X5 intermediate 4d Build muscle 30                                     | upper/lower       | 3/3/5/3     | 6/6/10/6          | 31/28/30/25    | 28      |
| X4 intermediate 6d Build muscle 75                                     | PPL ×2            | 5/6/5/4/5/6 | 13/16/15/10/14/18 | 52–69          | 86      |

**Rep targets and rests** (a sample; every row is in `measurements/lifting-plans.md`):

- **P1:** mains 3×8 fixed, rest 150 s; compounds 2×8–12, 120 s; isolations 2×10–15 or 12–20, 75 s.
- **P2:** mains 4×3 (180 s) on Upper A and Lower A; 4×7 (150 s) on Upper B (OHP, pull-ups); Lower B deadlift 4×5; isolations 6–10 or 10–14.
- **P3:**
  - Upper A: bench 3×4–8, row 3×4–8, OHP 2×4–8 (all 180 s). Lower A: squat 3×4–8, deadlift 3×4–8, hack squat 2×6–10.
  - Upper B: OHP and pull-ups 2×8–12.
  - Isolations 12–17 / 14–20.
- **P5:** bench 2×3, squat 2×3, deadlift 2×5 twice, OHP 2×5, front squat 2×8–12, leg curl 2×6–10.
- **P6:** DB bench, goblet squat, DB shoulder press, DB RDL each 2×8 fixed (90 s); DB row and inverted row 2×8–12; curls and crunches 2×10–15.

### 6.2 Weekly hard sets per judged muscle (1:1), days per week in [ ]

**OVER** = above the plan's own ceiling. u = under the band's low (floors are no longer targets, shown for reference).

| Muscle      | P1                 | P2                 | P3       | P4                 | P5      | P6      |
| ----------- | ------------------ | ------------------ | -------- | ------------------ | ------- | ------- |
| Chest       | 8 [3]              | 14 [2]             | 9 [2] u  | 17 [2]             | 4 [2] u | 4 [2] u |
| Front delts | 8 [3]              | 14 [2]             | 9 [2]    | 17 [2]             | 4 [2]   | 4 [2]   |
| Side delts  | 4 [2] u            | 2 [1] u            | 2 [1] u  | 6 [2] u            | **0**   | **0**   |
| Rear delts  | 7 [3]              | 8 [2]              | 5 [2] u  | 12 [2]             | 6 [3]   | 2 [1] u |
| Triceps     | 8 [3]              | **16 [2] OVER 14** | 11 [2] u | **21 [2] OVER 20** | 4 [2] u | 4 [2] u |
| Lats        | 7 [3]              | 8 [2]              | 5 [2] u  | 12 [2]             | 6 [3]   | 2 [1] u |
| Upper back  | 12 [3]             | 13 [4]             | 10 [4]   | 18 [5]             | 6 [2]   | 6 [2]   |
| Lower back  | 6 [2]              | 7 [2]              | 5 [2]    | 6 [2]              | 4 [2]   | 2 [1]   |
| Biceps      | 11 [3]             | 11 [2]             | 7 [2] u  | 20 [2]             | 8 [3]   | 6 [2]   |
| Quads       | 7 [3] u            | 9 [2]              | 7 [2] u  | 12 [2]             | 4 [2] u | 2 [1] u |
| Hamstrings  | **15 [3] OVER 13** | 13 [2]             | 10 [2] u | 12 [2]             | 8 [3]   | 2 [1] u |
| Glutes      | 13 [3]             | 16 [2]             | 12 [2]   | 18 [2]             | 8 [3]   | 4 [2] u |
| Calves      | 4 [2] u            | 4 [1] u            | 4 [1] u  | 6 [2] u            | 4 [2]   | **0**   |
| Abs         | 4 [2]              | 5 [2]              | 2 [1] u  | 6 [2]              | 2 [1]   | 2 [1]   |

**Main-lift exposures per week** (as a main / all exposures):

| Plan                          | Bench                 | Squat                   | Deadlift  | OHP   |
| ----------------------------- | --------------------- | ----------------------- | --------- | ----- |
| P1                            | 1 / 2                 | 1 / 2                   | 2 / 2     | 1 / 1 |
| P2                            | 1 / 1 (+ DB bench)    | 1 / 1 (+ hack squat ×2) | **2 / 2** | 2 / 2 |
| P3                            | 1 / 1                 | 1 / 1                   | 2         | 2     |
| P4                            | 2                     | 2                       | 2         | 2     |
| P5                            | 1                     | 1 (+ front squat)       | 2         | 1     |
| X1 (3d Get stronger)          | 1 / 2                 | 1 / 2                   | 2         | 1     |
| X3 (advanced 4d Get stronger) | 1                     | 1                       | 2         | 2     |
| X4 (6d Build muscle)          | **1** (+ DB bench ×2) | 2                       | 2         | 2     |

### 6.3 What a strength coach would object to

1. **Get stronger trains the competition lifts least.** On 4 days (P2, X3 advanced, X6 home), squat and bench are mains once a week (4×3) while deadlift (3×3 on the squat day + 4×5 on Lower B) and OHP (4×3 + 4×7) are mains twice.
   - The cause is the upper/lower builder: Upper B leads with the vertical push, and its horizontal push is an accessory DB bench. Lower B has no squat, only a hack squat (`programEngine.ts:823-1003`).
   - A strength or powerlifting coach would want squat and bench 2–3× a week and deadlift 1–2×.
2. **"4 × 5" doesn't exist for bench and squat.** Undulation turns every intermediate Get stronger main into 4×3 (heavier day) or 4×7 (lighter day). Only a hinge main on a lighter day stays at 5.
   - OHP and pull-ups at 4×7 fixed are an odd strength prescription.
   - Heavier-day isolations fall to 6–10 (cable crunch 3×6–10, standing calf raise 3×6–10 in X3).
3. **Fixed-target linear progression for intermediates is too steep.** +2.5 kg on every successful session, per instance; deadlift has 2 instances, so +5 kg a week.
   - The 10% drop then turns progress into a sawtooth: S1 had 24 drops in 52 weeks, and OHP missed 16–20 of 52 sessions.
   - OHP's step is 6.7% at 37.5 kg, and 12.5% for a 60 kg woman's 20 kg seed. That is still under the 15% automatic cap.
4. **Short Build muscle sessions hold too few working sets.**
   - P3 at 45 min has 8 working sets on Upper A and Lower A and 38 a week; most muscles sit at 5–11 sets.
   - X5 at 30 min: 6 working sets and about 10 warm-up sets on Upper A, 28 working sets a week.
   - The pricing (`expressSession.ts:121-125`, `:151-165`): 45 s per set + rest, 60 s per warm-up set, 90 s setup per exercise. Heavier-day hypertrophy mains at 4–6 reps get 180 s rests and a 4-set ramp (bar, 50%, 70%, 85%) priced at an 80 kg intermediate's loads even when the person is at the bar (`sessionFit.ts:97-122`).
   - A hypertrophy coach would run 6–12 reps at about 2 minutes and fit roughly 12–16 sets into 45 minutes.
5. **Bodyweight mains don't progress.** Pull-ups 4×7 (P2, X3, X6) stay at 4×7 for a compliant lifter, and weighted pull-ups aren't followed (§4 (6)).
6. **Beginner hinge load.** The beginner full body has the deadlift 3×8 fixed, twice a week (P1 days B and C), plus barbell row and squat on day B. Hamstrings reach 15 against the beginner ceiling of 13.
   - Most novice programs pull 1×5–3×5 once or twice a week.
   - The time-fit ordering leaves the 8-rep deadlift as a main lift on both days.
7. **Curls are padded as "pull".** The beginner gets a 4-set barbell curl (P1 day 2) because `balancePushPull` counts `arms_biceps` as pull. Curls do nothing for the shoulder-health rationale (D-LIFT-3).
8. **Ceilings are exceeded where only mains feed a muscle.** Triceps 16 / 14 (Get stronger), 21 / 20 (5-day), 24 / 20 (6-day; Biceps 23 and Upper back 20 also over). The reconciler can't cut mains, and 1:1 secondary credit from every press lands on the triceps.
9. **The same lift diverges across two slots.** The beginner 3-day bench (main 3×8 linear and compound 2×8–12 double) reaches 62.5 × 8 vs 45 × 12 by week 25 (S3), and the second copy is junk volume. The same pattern applies to squat (main + compound) and to Lower A / Lower B deadlifts at different targets.
10. **Small lifts never step on their own.**
    - Steps above 15% are never automatic: barbell curl 10→12.5→15→17.5 (+25 / 20 / 16.7%), DB lateral raise 10→12.5 (+25%), DB shoulder press 12.5→15 (+20%), and beginner DB bench and goblet at 12.5–17.5 kg (P6).
    - Targets stretch past the range: the lateral raise reached 3×24 by week 25 (S2), the barbell curl 3×17.
    - The plan is silent by design, so nothing tells the person to pick up the heavier weight. For a dumbbells-only beginner (P6) most lifts are in this zone.
11. **Lighter weeks for light trainers.** A 2-of-4-sessions lifter gets a lighter session on every second exposure of the same two sessions and never on the other two (S5).
12. **Race build.** On a 45-min plan the leg trim does nothing (2 sets are its floor). A 16-week half block makes 5 of the final 6 weeks lighter (S7).
13. **Support my running.** P5 squats once a week, 2×3, plus a front squat at 2×8–12; deadlifts 2×5 twice; 26 working sets a week; quads 4 sets. The evidence the code itself cites (Llanos-Lagos 2024: heavy loading for running economy) points to about 2 heavy lower-body exposures a week with 3–4 sets.
14. **Rest.** Adequate for heavy sets at 60–75 minutes (180 s for ≤6 reps). At 30 minutes heavy triples get 120 s, which is short but defensible.
15. **Seeds for a compliant intermediate are very conservative.** The bench seed is 60 kg against a 100 kg 1RM (S4). They converge only through linear +2.5 kg a week (about 16 weeks) unless the person overrides. The first-set hint is the only nudge.

---

## 7. LIFT-EV ledger at HEAD (re-verified against code)

| Row                                          | Doc status                | HEAD reality                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EV-01 hold failure is rep-shaped             | resolved 2026-08-09       | **Closed.** `countMiss` uses −5 s with a 10 s floor for holds (`programEngine.ts:2266-2290`); the weighted hold comes down in load (Lift4). The server mirror was retired                                                                                                                                                                                                          |
| EV-02 fresh plan labelled Hypertrophy        | resolved                  | **Closed.** `currentPhase:"progression"` (`planBuilder.ts:792-795`); labels come from the focus                                                                                                                                                                                                                                                                                    |
| EV-03 deload copy promises lighter weights   | resolved                  | **Closed.** One recipe; the banner says "Half the sets… at the same weights" (`DeloadBanner.tsx:120-134`)                                                                                                                                                                                                                                                                          |
| EV-04 command boundary incomplete            | owner decision            | **Decided in practice** by ADR-0011: stop at 24 writers. Nine document writers are named and pinned by `saveProgramSites.test.ts`; outbox and interleaving tests exist (`commandOutbox.test`, `useProgramCommandBoundary.test`). The ledger row was never updated. Residual: the completion transaction, the rollovers and `easeBackIn` are last-write-wins with field-level merge |
| EV-05 automatic protective reductions        | reversed (Lift4 (13))     | **Closed.** `recoveryTrigger.ts`, the banner and its undo are gone; `recoveringMuscles` is dropped at rollover                                                                                                                                                                                                                                                                     |
| EV-06 same-frequency goal change             | resolved                  | **Closed.** The confirm calls `represcribeWorkouts` (`ProgrammeSettings.tsx:699-705`). Still a client-side represcription through `configurePlan`                                                                                                                                                                                                                                  |
| EV-07 female ×0.75 seed                      | decided: retain and fence | **Still live**: `sexFactor` at `startingLoads.ts:76-78`. With "the plan follows the weight lifted" it matters only until the first session. Treat as a standing policy, not open work                                                                                                                                                                                              |
| EV-08 base shape is a default, not capacity  | owner decision            | **Open.** No STATUS. Lift4 changed the base shape (role table × time fit) but still collects no capacity input beyond level, days, length and bodyweight. Lift4 listed this row for amendment; not done                                                                                                                                                                            |
| EV-09 unreachable PI adherence branch        | owner decision            | **Open.** Still at `performanceEngine.ts:303-304` and `functions/lib/perfScoring.js:205`. Lower stakes now: PI no longer schedules lifting lighter weeks. It still drives the running "Consider a lighter week" card, the PI copy and the "Lifting suggestions" panel                                                                                                              |
| EV-10 single-discipline week caps PI at half | owner decision            | **Open.** No renormalisation (`performanceEngine.ts:492-505`, `computeLiftLoadScore` `:75-86`)                                                                                                                                                                                                                                                                                     |

---

## 8. Scratch harnesses (reproduce)

All live in `harnesses/` in this folder, saved as `.txt` so no toolchain
picks them up.

**To run one:**

1. Copy it to `src/features/program/__tests__/zz_scratch_lift_audit.test.ts` (drop the `.txt`).
2. Run `SIM_OUT_DIR=/tmp/tropos-sim npx vitest run src/features/program/__tests__/zz_scratch_lift_audit.test.ts`.
3. Delete the copy.

They write their output to `$SIM_OUT_DIR` (default `/tmp/tropos-sim`; create
it first). They re-implement mark-day-done and the rollover inline — the drift
risk ADR-0008 warns about — so treat them as seeds, not as the simulator.

| Harness                                 | What it does                                                                                                                                                                                       |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `harnesses/lifting-plans.test.ts.txt`   | 12 personas through `buildPlan`: per-day tables, judged volume, frequency, exposures, catalogue and bank stats → `measurements/lifting-plans.md`                                                   |
| `harnesses/lifting-sim.test.ts.txt`     | The week-by-week PoC (S1–S7) → `sim-detail.md` (not kept), `measurements/lifting-sim-summary.md`. Reusable as the seed of the ultracode simulator: persona config, lifter model, real engine calls |
| `harnesses/lifting-probes.test.ts.txt`  | Level change on a preserved plan; goal change keep vs update; represcription after rotation → `measurements/lifting-probes.md`                                                                     |
| `harnesses/lifting-probes2.test.ts.txt` | Fixed-target bodyweight freeze; instance-id determinism; fat_loss vs hypertrophy equality; 1-day plans → `measurements/lifting-probes2.md`                                                         |
| `harnesses/lifting-probes3.test.ts.txt` | Server `applyProgramCommand` (applyDeloadWeek, startTrainingBlock) from vitest via `createRequire`; `raceRestSkips` → `measurements/lifting-probes3.md`                                            |
| `harnesses/lifting-probes4.test.ts.txt` | A manual lighter week vs the calendar count → `measurements/lifting-probes4.md`                                                                                                                    |
