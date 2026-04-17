# Diagnostic — Food Ring Target vs Home Today's Energy Budget

## The observation

With one completed workout (312 kcal burn), Home and Food are showing two different daily calorie targets:

- **Home "Today's Energy":** `Base TDEE (cut) 1,583 + Workout 312 + Steps 0 = 1,895`
- **Food ring card:** `LIFT + RUN · +250 FUEL`, ring target **2,137**

Food's implied calculation: `base 1,887 + 250 scheduled = 2,137`.

Three numbers in play: Food ring 2,137, Home header 2,137, Home expanded budget 1,895.

---

## 1. Food ring target chain

- **Component:** `src/components/food/FoodHeroCard.tsx`, receives `dailyTargets: EffectiveTargets` as a prop.
- **Source in page:** `src/pages/Food.tsx:113` → `const dailyTargets = useEffectiveTargets(selectedDateObj)`.
- **Hook:** `src/hooks/useEffectiveTargets.ts`. Internally calls `useDailyTargets(date)` (line 80), subscribes to workouts + runs via Firestore `onSnapshot`, and returns `finalTarget = planned.baseTarget + effectiveBonus` (line 220).
- **Base TDEE source:** `useDailyTargets` → `profile?.targetCalories || 2200` (`useDailyTargets.ts:74`). `profile.targetCalories` is written by onboarding (`Onboarding.tsx:369`) or Settings (`Settings.tsx:164`) via `calculateTDEE` (`src/lib/tdee.ts:58`, `targetCalories = tdee + deficit` where tdee = `bmr × ACTIVITY_MULTIPLIERS[activityLevel]`).
- **Bonus source:** `effectiveBonus = Math.max(strategicBonus, Math.round(actualBurn))` (`effectiveTargets.ts:92`). `strategicBonus` = `getDayAdjustment(effectiveDayType, phase, goal).calorieAdjustment` (for `both` on `cut` = **250**). `actualBurn` = sum of `w.totalCalories` (workouts where `w.date === targetKey`) plus `r.calories` for runs on the matching date.
- **Caption:** `buildCaption(effectiveDayType, effectiveBonus)` → `LIFT + RUN · +250 FUEL` when `effectiveBonus === 250`.
- **Implied live values:** `profile.targetCalories ≈ 1,887`, `effectiveBonus = 250`, `finalTarget = 2,137`.

---

## 2. Home Today's Energy chain

**Header total and expanded budget read from different sources. They are genuinely different numbers on Home.**

- **Component:** `src/components/home/TodayEnergy.tsx`, receives two separate props:
  - `targets: DailyTargets` — drives header `/ 2,137 kcal` (line 22: `tCal = targets.finalTarget`).
  - `burn: DailyBurn` — drives the expanded breakdown (lines 97, 99, 104, 109).

- **Header source:** `src/pages/Home.tsx:56` → `const dailyTargets = useDailyTargets()` → `finalTarget = adjusted.calories = profile.targetCalories + calorieAdjustment` = **2,137**.

- **Expanded budget source:** `src/pages/Home.tsx:143-151` → `calcDailyBurn(bmr, phase, todayWorkoutCals, todayRunCals, 0)` from `src/utils/dailyBurn.ts`:
  - `tdee = Math.round(bmr * 1.2)` **(fixed 1.2 NEAT multiplier — ignores `profile.activityLevel`)**
  - `phaseAdjustedTdee = tdee + GOAL_CALORIE_OFFSET[phase]` = **1,583**
  - `dailyBudget = phaseAdjustedTdee + workoutCalories + runCalories + stepCalories` = `1,583 + 312 + 0 + 0` = **1,895**

- **Workout calories source (Home):** `src/hooks/useHomeData.ts:144-155` — **recomputed** from `durationMinutes × weightKg × 5 / 60`, **ignoring the stored `w.totalCalories` field**.

- **Workout calories source (Food):** `src/hooks/useEffectiveTargets.ts:121` — **reads the stored `w.totalCalories` field directly**.

---

## 3. `useEffectiveTargets` usage audit

- **File exists:** yes, `src/hooks/useEffectiveTargets.ts`.
- **Importers of `useEffectiveTargets`:** `src/pages/Food.tsx:41` only (FoodHeroCard only receives the type, not the hook).
- **Importers of `useDailyTargets`:** `src/pages/Home.tsx:32`, `src/hooks/useEffectiveTargets.ts:18`. Home uses it directly; useEffectiveTargets wraps it.
- **Observation:** The migration to `useEffectiveTargets` landed on Food but **not on Home**. Home is still on the unaware hook. That's why Home's header doesn't reflect the max-rule bonus — it only shows the planned strategic bonus.

---

## 4. Completed workout record

Write paths in the code (no live Firestore inspection performed):

- **`src/features/program/useProgram.ts:215-222`** (Programme → Begin Workout):
  - `date: new Date().toISOString().split("T")[0]` — **UTC** date key
  - `totalCalories: Math.round(tonnage * 0.05)` — lift-volume proxy
  - `durationMinutes: day.exercises.length * 5`
- **`src/hooks/useWorkouts.ts:93-104`** (WorkoutLogger → saveWorkout):
  - `date: workout.date` — passed in by the caller (format depends on caller)
  - `totalCalories: workout.totalCalories` = sum of per-exercise `caloriesBurned`, which default to `0` if the user didn't use the cardio inputs
- **Read filter in useEffectiveTargets:** `targetKey = format(targetDate, "yyyy-MM-dd")` — **local** date. UTC/local divergence near the day boundary can cause a miss.

Both the UTC-vs-local save/read mismatch and the `totalCalories` ≈ 0 write path are live bugs waiting to bite.

---

## 5. TDEE source audit

Four separate base-TDEE paths:

| Path | Used by | Formula | Reads |
|---|---|---|---|
| `calculateTDEE` (`src/lib/tdee.ts`) | Onboarding + Settings **writes** `profile.targetCalories` | `bmr × ACTIVITY_MULTIPLIERS[activityLevel] + deficit` | `profile.activityLevel` |
| `useDailyTargets.baseTarget` | Food ring (via useEffectiveTargets), Home header | `profile.targetCalories \|\| 2200` | stored field |
| `calcDailyBurn` (`src/utils/dailyBurn.ts`) | Home "Today's budget" expanded line | `bmr × 1.2 + goal_offset` (**fixed NEAT 1.2**) | `profile.weightKg/heightCm/age/sex`, ignores `activityLevel` |
| `calculateAdaptiveTDEE` (`src/lib/adaptiveTDEE.ts`) | TodayEnergy "Adaptive TDEE" row when present | Weight-trend-based estimate | bodyweight history |

Where each number on your screen reads from:

- **Food ring 2,137** = `useDailyTargets.baseTarget` + `useEffectiveTargets.effectiveBonus` = `profile.targetCalories (1,887)` + `250`
- **Home header 2,137** = `useDailyTargets.finalTarget` = `profile.targetCalories (1,887)` + `activityBonus (250)`
- **Home expanded 1,895** = `calcDailyBurn.dailyBudget` = `bmr × 1.2 − 500 + todayWorkoutCals (312)` = `1,583 + 312`

---

## 6. Diagnosis summary

**Why Food ring and Home expanded budget differ by ~304 kcal.**
Two independent TDEE calculations with different NEAT multipliers. Onboarding stored `profile.targetCalories` using the user-chosen activity level (most likely "Light" at 1.375, given the 304 delta: `bmr ≈ 1,737 × (1.375 − 1.2) ≈ 304`). Home's "Today's budget" throws that away and recomputes with a hardcoded 1.2. **Single fix**: `calcDailyBurn` should either read `profile.targetCalories` (like the rest of the app) or accept the activity multiplier from the profile.

**Why Food ring and Home header show the same 2,137.**
Coincidence in this specific state. Both read `profile.targetCalories` + day-type adjustment. Food's number happens to equal Home's only because `effectiveBonus == strategicBonus == 250` right now (the max rule didn't fire — actualBurn is reading as ≤ 250). If the saved workout had `totalCalories > 250`, Food's ring would jump to `1,887 + actualBurn` while Home's header would stay at `2,137`. The agreement is fragile — they're not reading the same source; they're reading different sources that both happen to land on 2,137 today.

**Why the caption still says `+250 FUEL` despite a completed 312 kcal workout.**
The max rule is correct in isolation (covered by tests); the bug is upstream in `actualBurn`. Two plausible causes, both live:

1. **The saved workout's `totalCalories` field is ≤ 250** (most likely: `Math.round(tonnage × 0.05)` from useProgram.ts with a low-tonnage session, or `sum of per-exercise caloriesBurned` = 0 from WorkoutLogger when cardio inputs weren't filled). Home still shows 312 because Home *recomputes* from `durationMinutes × weightKg × 5 / 60` and ignores the stored field entirely.
2. **UTC/local date mismatch**: useProgram saves `date: new Date().toISOString().split("T")[0]` (UTC) while useEffectiveTargets filters with `format(targetDate, "yyyy-MM-dd")` (local). Near midnight boundaries this misses the workout entirely.

**Which single fix reconciles all three numbers — or are multiple needed?**
**Multiple.** Three distinct bugs, three distinct fixes:

- **A.** Unify Home's "Today's budget" computation to read `profile.targetCalories` (or pass `activityLevel` into `calcDailyBurn`). Closes the 304 kcal base gap.
- **B.** Unify workout-calorie reads: either Home should read `w.totalCalories` (like Food), or Food should recompute (like Home). One stored field, one consumer. Fixes the 312-vs-actualBurn divergence.
- **C.** Fix the workout save path to guarantee `totalCalories` is correct (useProgram's `tonnage × 0.05` is probably too low for most sessions; WorkoutLogger's sum of `caloriesBurned` relies on user input that often isn't entered). Pick a single canonical formula and use it in both save paths.
- **D (bonus).** Align the date key format across save and read — `format(new Date(), "yyyy-MM-dd")` (local) everywhere, or Timestamp-based filtering.

**Halt conditions triggered (per the original spec):**

- **"More than two separate TDEE calculation paths"** — **YES**. There are 3 active plus an adaptive one (4 total).
- **`useEffectiveTargets` exists but is used nowhere** — partially: it's used only on Food. Home never migrated.

---

## Other observations (not part of the brief, flagged not fixed)

- `useProgram.ts:191` uses `new Date().toISOString().split("T")[0]` for the `date` field — UTC-based. Everywhere else reads with local-timezone date. Timezone bug.
- `useHomeData.ts:144-155` recomputes workout calories from duration, ignoring the canonical field. Any time Home and Food show the same workout, they show different calorie counts for it.
- `AdaptiveTDEECard` writes both `aiCalorieAdjustment` and `targetCalories` simultaneously, but `aiCalorieAdjustment` is then **read nowhere** in target computation (grep confirmed). The field is orphaned — set but never consumed for calorie target math.
- `adaptiveTDEE` is computed in the Home render tree but not currently passed to `<TodayEnergy adaptiveTDEE={...} />` (the prop is declared but absent from the JSX at `Home.tsx:411`). So the "Adaptive TDEE" row in the expanded card never shows even when the feature is active.

Diagnosis complete. No fixes applied.
