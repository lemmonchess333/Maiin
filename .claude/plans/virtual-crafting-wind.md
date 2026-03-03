# Phase 2 Deployment & Integration Plan

## Context
The server-side performance engine, run templates, and AI macro logic are all written but not yet wired up end-to-end. This plan covers deploying Cloud Functions, relocating dormant Pro features to Settings, building a goal-driven run scheduling engine, and a QA pass for edge cases.

---

## Task 1: Deploy Cloud Functions

### Prerequisite
- User provides Firebase project ID for `.firebaserc`

### Steps

1. **Create `.firebaserc`** at repo root (user provides project ID)
   ```json
   { "projects": { "default": "<PROJECT_ID>" } }
   ```

2. **Fix `functions/index.js`** — remove 10 stray triple-backtick lines (markdown artifacts at lines 19, 91, 135, 171, 183, 216, 228, 261, 273, 307) that will cause SyntaxError at deploy

3. **Install function dependencies**
   ```bash
   cd functions && npm install
   ```

4. **Deploy**
   ```bash
   firebase deploy --only functions
   ```
   This deploys 6 functions defined in `functions/index.js`:
   - `analyzeFood` (HTTPS callable — Vertex AI)
   - `computePerformanceWeek` (manual callable)
   - `weeklyPerformanceRollup` (scheduled Sun 23:15 UTC)
   - `dailyPerformanceRefresh` (scheduled daily 02:10 UTC)
   - `onWorkoutCreated` (Firestore trigger)
   - `onRunCreated` (Firestore trigger)

### Files
- **Create:** `.firebaserc`
- **Modify:** `functions/index.js` (remove 10 stray backtick lines)
- **Read-only:** `functions/performanceEngine.js`, `firebase.json`

### Verification
- `firebase functions:list` shows all 6 functions
- Log a test workout → check Firestore `users/{uid}/performance/{weekKey}` populates
- Check Cloud Scheduler shows the two cron jobs

---

## Task 2: Move AdaptiveSummary Pro Features to Settings

### Problem
`AdaptiveSummary.tsx` (692 lines) contains plateau detection + "Apply Suggestion" + AI macro adjustments but is not rendered anywhere. The useful Pro features should live in Settings.

### Steps

1. **Extract utilities** from `AdaptiveSummary.tsx` into `src/lib/plateauDetection.ts`
   - Move `detectPlateau()` (~lines 79-134)
   - Move `calculateAdaptiveMacros()` (~lines 147-172)
   - Move `detectFatigue()` (~lines 174-220)
   - Move phase config constants (~lines 34-67)
   - Export all as named exports

2. **Add "AI Adjustments" section to `src/pages/Settings.tsx`**
   - Position after "TDEE Calculator" section (~line 449)
   - Pro-gated: show lock icon + "Upgrade to Pro" for free users
   - For Pro users, show:
     - Current phase display (read from `profile.program.currentPhase`)
     - Plateau status indicator (using `detectPlateau()` with data from `usePerformanceWeeks`)
     - "Apply Suggestion" button when `plateau.calorieAdjust !== 0`
       - On click: calls `updateProfile()` to adjust `targetCalories` by `plateau.calorieAdjust`
     - AI macro targets display (protein/carbs/fat) from `calculateAdaptiveMacros()`

3. **Leave `AdaptiveSummary.tsx` in place** — don't delete yet, clean up later

### Files
- **Create:** `src/lib/plateauDetection.ts`
- **Modify:** `src/pages/Settings.tsx` (add ~80 lines for new section)
- **Read-only:** `src/components/AdaptiveSummary.tsx` (source of extracted logic)

### Verification
- Build passes
- Settings page renders the new section
- Free users see lock icon, Pro users see plateau status + apply button

---

## Task 3: Goal-Driven Run Scheduling Engine

### Problem
Runs are completely independent from the lifting program. No `weeklyRunDaysTarget` exists. The CTA just says "Start a run" with no intelligence about what type of run to do or why.

### Approach
Build a full run scheduling engine that supports three modes:
- **Race prep** — user picks a goal (10K, half marathon, marathon) + target date → engine generates a periodized multi-week plan
- **Structured running** — user wants regular runs but no race goal → engine auto-distributes run types across the week
- **Freeform** — user just wants to run whenever, no scheduling → current behavior

### Steps

#### 3a. Onboarding: running feature opt-in + goal selection

**`src/pages/Onboarding.tsx`** — add a step after athlete type:
- "Do you want scheduled running?" → Yes / No
  - **No** → `runMode: 'freeform'` → skip rest, current behavior preserved
  - **Yes** → follow-up questions:
    - "Are you preparing for a race?" → Yes / No
      - **Yes** → select distance (5K / 10K / Half Marathon / Marathon) + target date
        - `runMode: 'race_prep'`, `raceGoal: { distance, targetDate }`
      - **No** → "How many run days per week?" (1-5 slider)
        - `runMode: 'structured'`, `weeklyRunDaysTarget: N`

Save to profile: `runMode`, `weeklyRunDaysTarget`, `raceGoal?`

#### 3b. Add run fields to profile

**`src/lib/auth.tsx`** — extend `UserProfile`:
```ts
runMode?: 'freeform' | 'structured' | 'race_prep';
weeklyRunDaysTarget?: number;
raceGoal?: {
  distance: '5k' | '10k' | 'half' | 'marathon';
  targetDate: string; // ISO date
};
```

#### 3c. Build run plan engine

**Create `src/features/program/runScheduler.ts`**:

```ts
interface ScheduledRunDay {
  dayIndex: number;      // 0=Sun, 6=Sat
  templateId: string;    // from RUN_TEMPLATES
  type: string;          // easy, tempo, intervals, long
  completed: boolean;
  userOverride?: string; // user swapped to a different template
}

// Structured mode: auto-distribute around lift days
function scheduleStructuredWeek(
  liftDayCount: number,
  runDaysTarget: number,
  weekNumber: number
): ScheduledRunDay[]

// Race prep mode: generate a periodized plan
function generateRacePlan(
  distance: '5k' | '10k' | 'half' | 'marathon',
  targetDate: string,
  liftDayCount: number
): { totalWeeks: number; weeks: ScheduledRunDay[][] }
```

**Structured mode logic:**
- Fill lift days first (e.g. Mon/Tue/Thu/Fri for upper/lower)
- Remaining slots get runs:
  - 1 long run (prefer weekend)
  - 1 quality run (tempo on even weeks, intervals on odd weeks)
  - Remaining: easy runs
- Uses `RUN_TEMPLATES` from `src/lib/workoutTemplates.ts`

**Race prep logic:**
- Calculate weeks until race
- Divide into phases: base (40%), build (35%), taper (15%), race week (10%)
- Base phase: mostly easy + 1 long, building distance
- Build phase: add tempo + intervals, long run grows to peak
- Taper: reduce volume 40%, keep 1 quality session
- Distance-specific targets (e.g., marathon long run peaks at 32km, 10K peaks at 12km)

#### 3d. Extend program state with run days

**`src/features/program/programTypes.ts`** — add to `ProgramState`:
```ts
runDays?: ScheduledRunDay[];
runPlan?: {
  mode: 'structured' | 'race_prep';
  raceGoal?: { distance: string; targetDate: string };
  totalWeeks?: number;
  currentWeek?: number;
};
```

**`src/features/program/useProgram.ts`**:
- Call `scheduleStructuredWeek()` or load race plan week during `loadProgram()`
- Add `completeRunDay(dayIndex)` method
- Add `overrideRunDay(dayIndex, templateId)` for user customization
- Persist `runDays` + `runPlan` to Firestore

#### 3e. Wire up NextActionCard for run days

**`src/pages/Home.tsx`** `NextActionCard`:
- Check `programState.runDays` for today's day index
- If today is a scheduled run day and not completed, show the specific run template:
  - Template name (e.g. "Long 10K", "5x1K Intervals")
  - Run icon + accent color from `THEME.running`
  - "Start" button → navigates to `/run?template=<templateId>`
- If both a lift workout and run are scheduled today, show lift first with run as secondary

#### 3f. Pre-fill RunSetupModal

**`src/pages/Run.tsx`**: Read `template` from query params
**`src/components/run/RunSetupModal.tsx`**: If `templateId` provided, look up `RUN_TEMPLATES`, pre-select activity type and populate intervals/target/distance config

#### 3g. Settings: run schedule management

**`src/pages/Settings.tsx`** — new "Run Schedule" section:
- Show current mode (Freeform / Structured / Race Prep)
- Button to change mode (reopens run onboarding questions)
- If structured/race prep:
  - Calendar-style week view showing each day's assigned run
  - Tap a day → dropdown to swap the run template (user override)
  - Race prep: show "Week 3 of 12 — Build Phase" progress indicator
  - Race prep: show target date + countdown

### Files
- **Create:** `src/features/program/runScheduler.ts`
- **Modify:** `src/lib/auth.tsx`, `src/pages/Onboarding.tsx`, `src/pages/Settings.tsx`, `src/features/program/programTypes.ts`, `src/features/program/useProgram.ts`, `src/pages/Home.tsx`, `src/pages/Run.tsx`, `src/components/run/RunSetupModal.tsx`
- **Reuse:** `src/lib/workoutTemplates.ts` (existing `RUN_TEMPLATES` and `RunTemplate` type)

### Verification
- Onboarding: Runner → "preparing for 10K in 8 weeks" → generates 8-week plan
- Onboarding: Lifter → "yes to running, 3 days/week, no race" → structured auto-fill
- Onboarding: anyone → "no scheduled running" → freeform, current behavior
- Home: NextActionCard shows "Long 10K" on the right day
- Tapping "Start" pre-fills RunSetupModal with correct template + intervals
- Settings: week view visible, user can swap a day's run type, change persists
- Completing a run marks the scheduled day as done

---

## Task 4: Polish & QA Pass

### Edge case fixes

1. **`src/features/program/programEngine.ts` `chooseSplit()`** (line 60):
   - Clamp `weeklyTarget` to 0-6 range
   - 0 lift days → return empty workout array (run-only athlete)
   - 7+ → cap at 6 (PPL)

2. **`src/pages/Onboarding.tsx`**:
   - Make `weeklyWorkoutsTarget` user-selectable (currently hardcoded to 4)
   - Add validation: total lift + run days <= 7
   - Make `weeklyMealsTarget` user-selectable (currently hardcoded to 10)

3. **Schedule persistence**: Verify `programState` with `runDays` and `runPlan` round-trips correctly through Firestore

4. **Race prep edge cases**:
   - Target date in the past → show warning, offer to reset
   - Target date < 3 weeks away → compressed taper-only plan
   - 0 lift days + 7 run days → all-run schedule

### End-to-end test checklist

- [ ] Fresh sign-up → onboarding collects athlete type, stats, goals, lift days, run preferences
- [ ] Home page shows correct NextActionCard (lift or run depending on the day)
- [ ] Complete a lift workout → marks day done, triggers `onWorkoutCreated` Cloud Function
- [ ] Complete a run → marks run day done, triggers `onRunCreated` Cloud Function
- [ ] `performance/{weekKey}` doc appears in Firestore after workout/run
- [ ] History → Performance tab shows PI chart with data
- [ ] Settings → change run days → schedule regenerates
- [ ] Settings → override a run type → persists across sessions
- [ ] Settings → AI Adjustments shows plateau status for Pro users
- [ ] Edge: set 0 lift days, 3 run days → no crash, run-only schedule
- [ ] Edge: set 6 lift days, 0 run days → full PPL, no run days
- [ ] Edge: set 4 lift + 5 run → clamped to 4+3=7 total
- [ ] Edge: race prep with past date → warning displayed
- [ ] Freeform mode → no schedule UI, just "Start a Run" as before

### Verification
- `npm run build` passes
- Manual walkthrough of the full checklist
- No console errors during flows
