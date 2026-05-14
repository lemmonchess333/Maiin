# Tropos · Programme + Run Integration — Full Implementation Spec (v4)

**Status:** Pre-implementation. All mockups committed. Awaiting build green-light.
**Branch:** `claude/improve-food-page-design-V6Voe`
**Mockup files (in repo):** `docs/program-run-mockups-v3.html` → `v7.html`
**Revision:** v4 — third batch of ChatGPT corrections. 10 implementation-precision fixes targeting type shape, ordering, edge cases, and missing surfaces (Home, Cloud Function contract, local-date semantics).

---

## What changed from v3

| # | Correction | Severity | Status |
|---|---|---|---|
| 1 | **`userOverride?: boolean` was a typo — must be `userOverride?: string`** (verified: current code uses string for template overrides at `runPlanMetadata.ts:490`) | 🔴 Bug — would break overrides | ✅ Fixed |
| 2 | Onboarding step count: spec said "11 steps" but listed 12 (0-11). Fixed to 12. | 🟡 Off-by-one | ✅ Fixed |
| 3 | **`planBuilder()` moved from P0-10 to P0-2.** It's the architectural centre — must exist before onboarding/Configure Plan/scheduler refactors. | 🔴 Ordering | ✅ Reordered |
| 4 | **NEW: Home Integration section.** Home must read same `weekSchedule`/planned sessions as Programme, or the new architecture is half-built. | 🟡 Missing surface | ✅ Added |
| 5 | Configure Plan = **full-screen modal**, not bottom sheet. Sheets for small edits only. | 🟡 UX | ✅ Changed |
| 6 | **NEW: Stress-aware Both-day pairing rules.** Don't pair Heavy Legs + Long Run by default. | 🟡 Schedule quality | ✅ Added |
| 7 | **Compressed plan needs implementation rules**, not just a label. Cap hard runs at 1/week, etc. | 🟡 Safety | ✅ Expanded |
| 8 | `freeform_extra` removed from `ScheduledRunStatus`. It's a run-document state (`planSource`), not a planned-day state. | 🟡 Type hygiene | ✅ Moved |
| 9 | **NEW: Local-date semantics.** `weekKey`/`date`/`scheduledRunId` use local calendar dates, not UTC. | 🔴 Timezone bugs | ✅ Added |
| 10 | **NEW P0-4: `completeOnboarding` Cloud Function contract check.** Function must accept/persist the new fields. | 🔴 Backend gap | ✅ Added |

**Build estimate:** ~15.25 days (was 14.25 in v3). Net +1 day for Home integration (0.5) + Cloud Function check (0.5).

---

## The North Star

> **Onboarding creates the plan. Programme edits the plan. Home glances. Run executes. Settings stores defaults.**

Five surfaces, one shared data shape.

---

## Context

Tropos is a hybrid fitness app (React 19 + TypeScript + Firebase + Capacitor). Current state: lift-first Programme, run controls in Settings, Home shows next 7 days but doesn't read concrete plan data. The data model (`ProgramState.runDays`, `ProgramState.runPlan`) supports unified hybrid planning but the UI splits configuration across three surfaces.

v4 unifies all five surfaces around a single `planBuilder()` primitive + concrete `weekSchedule` source of truth.

---

## The Decision · 4-Tab Programme

```
┌─────────────────────────────────────┐
│ Programme                       🦶 ⋯│
│ Week 3 · Hypertrophy + Base         │
├─────────────────────────────────────┤
│ [Today] [Week] [Lift]    [Run]      │  ← Segmented control
├─────────────────────────────────────┤
│ (tab-specific content)              │
└─────────────────────────────────────┘
```

| Tab | Internal | Purpose |
|---|---|---|
| **Today** | `TodayTab.tsx` | "What do I do right now?" Hero card(s), stacks doubles, win banner after completion. |
| **Week** | `ScheduleTab.tsx` | "What does my week look like?" 7-day operational list with type pills + visible `⋯` overflow + history nav. |
| **Lift** | `LiftTab.tsx` | "Show me my lifts." Current Programme preserved exactly. |
| **Run** | `RunTab.tsx` | "Show me my run plan." Race-prep / structured / freeform hub. |

The `⋯` overflow gains **"Configure Plan"** — opens the full-screen reconfiguration wizard.

---

## Onboarding + Programme Reconfiguration Alignment

### The unified architecture

```
NEW USER:
  Onboarding (12 steps) → calls planBuilder() → creates first plan
                                                  (profile + programState + weekSchedule + runDays + runPlan)

EXISTING USER (small edit):
  Programme tabs (Today / Week / Run) → edit in place

EXISTING USER (major change):
  Programme ⋯ → Configure Plan (full-screen modal) → calls planBuilder() → rebuilds plan

EXISTING USER (profile reset, rare):
  Settings → Reset profile → Full Onboarding Retake → calls planBuilder() → fresh plan
```

`planBuilder()` is the **architectural centre**. Single source of truth for plan creation. All four flows call it.

```typescript
// src/features/program/planBuilder.ts (NEW — built P0-2, before everything that depends on it)

export interface PlanBuilderInput {
  primaryGoal: PrimaryGoal;
  nutritionPhase: "cut" | "lean bulk" | "recomp";
  experience: ExperienceLevel;
  liftDays: number;
  preferredSplit: SplitType;
  runMode: RunMode;
  weeklyRunDays: number;
  raceGoal?: { distance: string; targetDate: string };
  equipment: Equipment[];
  injuries: Injury[];
  preserveHistory?: boolean;  // Configure Plan = true; Onboarding = false
}

export interface PlanBuilderOutput {
  programState: ProgramState;     // workouts + runDays + runPlan
  weekSchedule: ScheduleDay[];    // concrete 7-day layout
  profileUpdates: Partial<UserProfile>;
}

export function buildPlan(input: PlanBuilderInput): PlanBuilderOutput;
```

### Configure Plan vs Full Onboarding Retake

| | Configure Plan | Full Onboarding Retake |
|---|---|---|
| Trigger | Programme ⋯ → Configure Plan | Settings → Reset profile (opt-in, rare) |
| Visual | **Full-screen modal on mobile** | Full-screen onboarding flow |
| Steps | Plan-only (focus → nutrition → lifting → running → schedule preview → confirm) | Full 12-step flow incl. identity |
| Prefill | All current plan state | Most current state, "anything changed?" prompts |
| Wording | "Update your plan. Logged history stays. Upcoming sessions may be rebuilt." | "Let's refresh your profile and rebuild your plan." |

**Why full-screen modal for Configure Plan:** the wizard has 6+ steps. A bottom sheet is too cramped for that surface area.

**Smaller edits inside Programme tabs use sheets:**
- Change race date → bottom sheet
- Change run days target → bottom sheet
- Edit single day's planned session → bottom sheet
- Full plan rebuild → **full-screen modal (Configure Plan)**

### Onboarding flow (12 steps)

| Step | Section | Purpose |
|---|---|---|
| 0 | Identity | Name |
| 1 | Identity | Gender |
| 2 | Identity | Age |
| 3 | Identity | Body metrics (height, weight) |
| 4 | Plan | Training focus (`PrimaryGoal`) |
| 5 | Plan | Nutrition phase (cut / recomp / lean bulk) |
| 6 | Plan | Experience level |
| 7 | Plan | Lifting days + split |
| 8 | Plan | Running setup (mode + runs/week + race details) |
| 9 | Plan | Weekly layout preview (NEW — confirmatory) |
| 10 | Plan | Equipment + injuries |
| 11 | Plan | Review + create plan |

12 total. Identity stays (TDEE depends on it).

### Doubles UX in onboarding (step 8)

When `liftDays + weeklyRunDays > 7`, instead of blocking, show:

```
You've selected {lift} lifting days and {run} runs.
{N} day{s} will include both lifting and running.

[Looks good]
[Reduce runs]
[Reduce lifting days]
```

Copy must pluralize correctly:
- bothCount = 1 → "1 day will include both lifting and running."
- bothCount = 2 → "2 days will include both lifting and running."

### Step 9: Weekly layout preview

```
Your training week
Mon   Lift
Tue   Run
Wed   Lift
Thu   Rest
Fri   Both    ← when bothCount > 0
Sat   Lift
Sun   Rest

[Looks good — create plan]
[Try different counts]
```

**Confirmatory only.** Full day-by-day editing lives in the Week tab (existing users) or Configure Plan wizard. Not in onboarding.

---

## Footprint Icon Behaviour

Footprint top-right of Programme → `/run`. `/run` decides: planned run today → prefill; no plan → freeform setup. Existing Phase B1 logic handles this.

---

## P0 Prerequisites · Must Ship Before UI Work

11 sub-tasks. **Order matters** — `planBuilder()` is now P0-2 (was P0-10 in v3). Building it first lets onboarding, Configure Plan, and scheduler refactors consume the same primitive.

### P0-0 · `generateSchedule` must emit Both days

**Bug location:** `src/lib/scheduleUtils.ts:39-58`

```typescript
// Current — wrong (truncates silently when total > 7, never emits "both")
while (l > 0 || r > 0) { /* pushes "lift" or "run" only */ }
for (let i = 0; i < pattern.length && i < slotOrder.length; i++) { ... }
```

**Fix (with corrected counting):**

```typescript
export function generateSchedule(liftDays: number, runDays: number): ScheduleDay[] {
  const total = liftDays + runDays;
  if (total === 0) return allRest();
  if (total <= 7) return existingNoBothsLogic(liftDays, runDays);

  // total > 7: must use Both days. Each "both" consumes 1 lift AND 1 run.
  const bothCount = Math.min(total - 7, liftDays, runDays);
  const liftOnlyCount = Math.max(0, liftDays - bothCount);
  const runOnlyCount = Math.max(0, runDays - bothCount);
  const restCount = 7 - bothCount - liftOnlyCount - runOnlyCount;

  return assembleSchedule({ bothCount, liftOnlyCount, runOnlyCount, restCount });
}
```

**Verification (6 lifts + 2 runs):**
- bothCount = min(1, 6, 2) = 1
- liftOnly = 5, runOnly = 1, rest = 0
- Lift exposure = 5 + 1 = 6 ✓ | Run exposure = 1 + 1 = 2 ✓ | Total days = 7 ✓

**Stress-aware Both-day placement (priority order within `assembleSchedule`):**

When placing Both days, prefer slots where doubles pair sensibly:

```
Default Both-day pairings (sensible defaults — not enforced):
1. Easy/Recovery run + Upper-body lift  ← best
2. Easy run + Push or Pull              ← good
3. Tempo or Intervals + Upper-body      ← acceptable
4. Long run standalone                  ← preferred — avoid pairing
5. Long run + Upper-body                ← if must pair
6. Hard run + Legs                      ← avoid (recovery cost)

Place Both days in this priority order:
- Highest-priority pairings get the Both slot first
- Long runs preferentially stand alone
- If "Long + Legs" is forced, surface a soft warning in the UI:
  "Hard run + legs on one day may affect recovery"
```

This is **heuristic placement**, not full periodisation logic. v1.1+ could expand to recovery-aware AI placement.

**Acceptance:**
```typescript
const result = generateSchedule(6, 2);
const counts = countByType(result);
expect(counts.lift + counts.both).toBe(6);
expect(counts.run + counts.both).toBe(2);
expect(counts.both).toBeGreaterThanOrEqual(1);
expect(result.length).toBe(7);
```

**Estimate:** ~0.5 days.

---

### P0-1 · Finalize `ScheduledRunDay` type + `ScheduledRunStatus` enum

**Bug locations:**
- `src/features/program/programTypes.ts:140` — existing `userOverride?: string` (must keep as string)
- `freeform_extra` doesn't belong on `ScheduledRunStatus`

```typescript
// CORRECT type shape
type ScheduledRunStatus =
  | "planned"
  | "completed_exact"
  | "completed_modified"
  | "completed_late"
  | "skipped"
  | "missed"
  | "moved"
  | "race_no_show"
  | "race_completed_unlinked";
// NOTE: NO "freeform_extra" — that's a saved-run state, not a planned-day state.

type ScheduledRunDay = {
  id: string;                  // NEW — stable scheduledRunId
  weekKey: string;             // NEW — local-date Sunday-start week key
  date: string;                // NEW — YYYY-MM-DD LOCAL date
  dayIndex: number;            // 0=Sun..6=Sat (derived from date)
  templateId: string;
  userOverride?: string;       // KEEP AS STRING — template override ID (used by runPlanMetadata:490)
  plannedType: "easy" | "tempo" | "intervals" | "long" | "race";
  status: ScheduledRunStatus;
  linkedRunId?: string;
  movedFromDate?: string;
  movedToDate?: string;
};
```

**Critical: do NOT change `userOverride` to boolean.** Existing code at `src/lib/runPlanMetadata.ts:490` does:

```typescript
const resolvedId = day.userOverride ?? day.templateId;
```

A boolean would resolve to a literal `true` and break template resolution.

**Where `freeform_extra` lives now:** on the saved run document's `planMetadata.planSource`:

```typescript
type PlanSource =
  | "today_plan"      // exact match for a planned run
  | "url_template"    // launched via /run?template=...
  | "manual"          // launched without plan context
  | "rest_day"        // run on a rest day (extra)
  | "completed_day";  // run on a day that already had a completed planned session (extra)
```

`offPlan: true` already exists on `planMetadata`. Extra runs are saved with `planSource: "rest_day"` or `"completed_day"` + `offPlan: true`. No `ScheduledRunDay.status` change needed.

**Estimate:** ~0.25 days (type-only change).

---

### P0-2 · Create `planBuilder()` (architectural centre)

**Why this is P0-2 (not P0-10):** every downstream P0 depends on `planBuilder` existing. Onboarding calls it. Configure Plan calls it. runScheduler is shaped to feed into it. Building it late means refactoring multiple files twice.

**File:** `src/features/program/planBuilder.ts` (NEW)

```typescript
import { generateSchedule } from "@/lib/scheduleUtils";
import { generateRacePlan, scheduleStructuredWeek } from "./runScheduler";
import { generateLiftProgramme } from "./programEngine";

export function buildPlan(input: PlanBuilderInput): PlanBuilderOutput {
  // 1. Build concrete weekSchedule (uses fixed generateSchedule from P0-0)
  const weekSchedule = generateSchedule(input.liftDays, input.weeklyRunDays);

  // 2. Build lift programme (existing engine, untouched)
  const workouts = generateLiftProgramme({
    daysPerWeek: input.liftDays,
    split: input.preferredSplit,
    experience: input.experience,
    primaryGoal: input.primaryGoal,
    equipment: input.equipment,
    injuries: input.injuries,
  });

  // 3. Build run schedule from weekSchedule (uses runScheduler with P0-3 fix)
  let runDays: ScheduledRunDay[] = [];
  let runPlan: RunPlan | undefined;

  if (input.runMode === "race_prep" && input.raceGoal) {
    const racePlan = generateRacePlan({
      distance: input.raceGoal.distance,
      targetDate: input.raceGoal.targetDate,  // local-date string
      weekSchedule,
      weeklyRunDays: input.weeklyRunDays,
      compressed: shouldCompress(input.raceGoal),
    });
    runDays = racePlan.weeks[0];
    runPlan = { mode: "race_prep", raceGoal: input.raceGoal, totalWeeks: racePlan.totalWeeks, currentWeek: 0 };
  } else if (input.runMode === "structured") {
    runDays = scheduleStructuredWeek({ weekSchedule });
    runPlan = { mode: "structured" };
  }
  // freeform → runDays empty, runPlan undefined

  return {
    programState: { workouts, runDays, runPlan, /* ... */ },
    weekSchedule,
    profileUpdates: {
      primaryGoal: input.primaryGoal,
      runMode: input.runMode,
      weeklyRunDaysTarget: input.weeklyRunDays,
      raceGoal: input.raceGoal,
      /* ... */
    },
  };
}
```

**Acceptance:** A test that creates a 4 lift + 2 run race-prep plan via `buildPlan()` produces:
- weekSchedule with 4 lift, 2 run, 0 both (no doubles needed), 1 rest
- programState.workouts with 4 lift days
- programState.runDays with 2 entries, each having `id`, `date`, `weekKey`, `templateId`, `status: "planned"`
- programState.runPlan with mode/raceGoal/totalWeeks/currentWeek
- profileUpdates including runMode, raceGoal, weeklyRunDaysTarget

**Estimate:** ~0.75 days.

---

### P0-3 · `runScheduler` uses `weekSchedule` (Both-aware)

**Bug location:** `src/features/program/runScheduler.ts:54, 148`

Drive scheduling from `weekSchedule` instead of constructing from `liftDays + 7-cap`:

```typescript
const runEligibleDays = weekSchedule.filter(d => d.type === "run" || d.type === "both");
```

`generateRacePlan` and `scheduleStructuredWeek` both take `weekSchedule` as input. No more `7 - liftDayCount` cap.

**Also includes compressed-plan behaviour:**

```typescript
interface RacePlanInput {
  distance: string;
  targetDate: string;       // local-date YYYY-MM-DD
  weekSchedule: ScheduleDay[];
  weeklyRunDays: number;
  compressed?: boolean;
}
```

When `compressed === true`:
- Cap hard-run sessions at 1/week
- Long run progression: max 10% week-over-week (vs 15% for standard)
- Skip the build-phase intervals if weeks < 4
- Replace base weeks with easy aerobic if compressed below `config.minWeeks`
- Final week always = race week (1 shakeout + race)

**Acceptance:** A 4-week 10K plan (compressed, minWeeks=6) generates:
- Week 1: 2 easy + 1 mid-distance long
- Week 2: 2 easy + 1 long (slightly longer)
- Week 3: 1 easy + 1 conservative tempo + 1 long
- Week 4: 1 shakeout + 1 easy + race

No interval block. No aggressive mileage jump. Long run capped under target distance.

**Estimate:** ~1.0 day.

---

### P0-4 · `completeOnboarding` Cloud Function contract check (NEW)

**Source:** `functions/index.js` — `completeOnboarding` Cloud Function

Currently accepts `{ profileData, programState }` and writes them via Admin SDK. With v4 additions (`weekSchedule`, new `runDays` shape, `scheduledRunId`, status enum), the function must:

1. Accept the new fields in the payload schema
2. Validate them (don't reject silently)
3. Persist them in the correct paths:
   - `users/{uid}.weekSchedule` ← new
   - `users/{uid}.runMode` ← already saved
   - `users/{uid}.raceGoal` ← already saved
   - `users/{uid}/programState/current.runDays` ← shape change
   - `users/{uid}/programState/current.runPlan` ← already saved

**Why this is P0:** without it, frontend onboarding succeeds but Firestore strips the new fields. Silent data loss. Discovered only when the user reaches Programme and finds an empty Week tab.

**Acceptance:**
```
New race-prep user completes onboarding. Firestore document inspection shows:
- users/{uid}.weekSchedule = [{day: 0, type: "rest"}, ...]
- users/{uid}/programState/current.runDays[0].id matches local scheduledRunId
- runDays[0].weekKey, runDays[0].date are local-date strings (not UTC)
- runPlan.totalWeeks > 0
```

**Estimate:** ~0.5 days.

---

### P0-5 · Update onboarding to use `planBuilder` (covers doubles, weekSchedule save, retake prefill)

Single P0 consolidating v3's P0-6, P0-7, P0-8, P0-10:

**Files:** `src/pages/Onboarding.tsx`

**Changes:**

1. **Drop the doubles blocker** (line 349):
   ```typescript
   canAdvance[9] =
     runFrequency === "none" ||
     (validateDoublesViable(daysPerWeek, weeklyRunDays) &&
      (runMode !== "race_prep" || raceTargetDate !== ""));
   ```
   Add doubles UX (multi-day-aware copy):
   ```typescript
   const bothCount = Math.max(0, daysPerWeek + weeklyRunDays - 7);
   const dayText = bothCount === 1 ? "1 day" : `${bothCount} days`;
   // "X day(s) will include both lifting and running."
   ```

2. **Add weekly-layout-preview step** (new step 9 in the 12-step flow). Confirmatory only — shows the `weekSchedule` from `planBuilder()`.

3. **Save path uses `planBuilder()`** (replaces inline lift programme generation):
   ```typescript
   const planOutput = buildPlan({
     primaryGoal,
     nutritionPhase: goal,
     experience,
     liftDays: daysPerWeek,
     preferredSplit,
     runMode,
     weeklyRunDays,
     raceGoal: runMode === "race_prep" ? { distance: raceDistance, targetDate: raceTargetDate } : undefined,
     equipment,
     injuries,
   });

   await completeOnboarding({
     profileData: { ...profileData, ...planOutput.profileUpdates, weekSchedule: planOutput.weekSchedule },
     programState: planOutput.programState,
   });
   ```

4. **Retake prefill** (line 269-292): add missing fields:
   ```typescript
   if (profile.runMode) setRunMode(profile.runMode);
   if (profile.weeklyRunDaysTarget) setWeeklyRunDays(profile.weeklyRunDaysTarget);
   if (profile.raceGoal?.distance) setRaceDistance(profile.raceGoal.distance);
   if (profile.raceGoal?.targetDate) setRaceTargetDate(profile.raceGoal.targetDate);
   ```

5. **Reword "training days per week"** → "Lifting days per week" (step 7), making it unambiguous.

**Existing-user backfill for `weekSchedule`:** On first Programme open for users without a persisted `weekSchedule`, derive via `generateSchedule(weeklyWorkoutsTarget, weeklyRunDaysTarget)` and persist.

**Acceptance:**
- New user picks 6 lifts + 2 runs in step 8 → step 9 preview shows 1 "Both" day
- Retake user re-enters with race_prep state → all race fields prefilled
- Firestore document after onboarding has `weekSchedule` array

**Estimate:** ~1.0 day.

---

### P0-6 · Update Run.tsx, RunSummary.tsx, RunCTACard.tsx, runPlanMetadata.ts for `scheduledRunId`

(Same as v3 P0-3.)

**Files:**
- `src/components/home/RunCTACard.tsx:21-32` — build `?scheduledRunId=...&source=home`
- `src/pages/Run.tsx` — parse `?scheduledRunId`, resolve from `programState.runDays`, prefill, preserve in `planMetadata`
- `src/pages/RunSummary.tsx` — `shouldCompleteRunDay` matches by `scheduledRunId`
- `src/lib/runPlanMetadata.ts` — extend `planMetadata` shape with `scheduledRunId`

**Back-compat:** `?template=` fallback for one release.

**Estimate:** ~1.0 day.

---

### P0-7 · Extract `useProgrammeScheduleEditor()` hook

(Same as v3 P0-4.)

**File:** `src/features/program/useProgrammeScheduleEditor.ts` (NEW)

**Estimate:** ~0.5 days.

---

### P0-8 · Migrate `TrainingSection` → Programme + Settings deep-link

(Same as v3 P0-5.)

**Files:** `src/components/settings/TrainingSection.tsx`, Programme tabs

5 controls migrated to Programme. Settings keeps defaults. Deep-link banner added.

**Estimate:** ~1.0 day.

---

### P0-9 · Build Configure Plan wizard (full-screen modal)

**Visual:** **Full-screen modal on mobile** (not bottom sheet). Same visual language as onboarding but plan-only steps. Calls `planBuilder({ ...input, preserveHistory: true })`.

**Steps:**
1. Training focus
2. Nutrition phase
3. Lifting days + split
4. Running setup
5. Weekly layout preview
6. Confirm rebuild (with explicit destruction warnings)

**Confirmation copy:**
```
Update your plan
This will:
  ✓ Update your weekly schedule
  ✓ Regenerate upcoming planned runs
  ✓ Keep all logged workouts and runs in History
  ⚠ Cancel any in-flight race-prep block (if changing race goal)

[Continue] [Cancel]
```

**Estimate:** ~1.0 day.

---

### Related cleanup · Rename "Goal" → nutrition phase

Move "Cut / Lean Bulk / Recomp" from ProgramSettingsPanel → Food/Nutrition surface.

**Estimate:** ~0.25 days.

---

## Local-Date Semantics (Critical)

**All schedule dates use local calendar dates, not UTC.**

```typescript
// Correct
const today = new Date();
const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
// → "2026-05-14" (local)

// WRONG (don't do this)
const date = new Date().toISOString().split('T')[0];
// → "2026-05-13" if user is in PST after 4pm — silently rolls back a day
```

**Why:** UTC timestamps cause:
- Late-night runs (after 4pm PST = next day UTC) get attributed to the wrong calendar day
- Sunday/Monday boundary errors for users in non-UTC timezones
- Race dates appear off by one for some users
- Adherence calculations drift

**Apply to:**
- `weekKey` (Sunday-start: derive from local `Date.getDay()`)
- `date` on `ScheduledRunDay`
- `scheduledRunId` (derived from local date)
- `raceGoal.targetDate` (already local in current code)

**Helper:** add `src/lib/dateHelpers.ts` exporting:
```typescript
export function localDateString(d: Date = new Date()): string;
export function localWeekKey(d: Date = new Date()): string;  // Sunday-start
export function localDayIndex(d: Date = new Date()): number;  // 0=Sun..6=Sat
```

Use these everywhere instead of ad-hoc date math.

---

## Home Integration (NEW)

Home is the first daily touchpoint. With the new architecture, Home **must read the same `weekSchedule`** that Programme reads. Otherwise Home shows "No activity logged" on a future planned-run day — undermining the whole unified system.

### Acceptance criteria

1. **`Home.tsx` reads `profile.weekSchedule`** (post-P0-5 backfill ensures this exists for all users)
2. **`WeekStrip.tsx`** colours next 7 days by `weekSchedule[i].type` (Lift / Run / Both / Rest)
3. **`DayPeekCard.tsx`** for a future day shows **planned sessions**, not "No activity logged":
   ```
   Sat 16 May · Run day
   Planned: Long Run · 10 km
   [Plan]   ← opens Programme Week tab at that date
   ```
4. **Today's run CTA** routes with `scheduledRunId`:
   ```
   /run?scheduledRunId=runday_2026-05-13_tempo&source=home
   ```
5. **Future-day tap** opens `/program?tab=week&date=YYYY-MM-DD` — does NOT start execution
6. **Past missed day** shows:
   ```
   Sat 16 May · Run day
   Missed: Tempo Run
   [Log manually] [Mark skipped]
   ```
7. **Completed day** shows the actual result:
   ```
   Sat 16 May · Run day
   Completed: 10.2 km · 58:40
   ```

### Files affected

- `src/pages/Home.tsx` — extend `useEffect` that builds schedule to read `profile.weekSchedule`
- `src/components/home/DayPeekCard.tsx` — planned-item rendering with status states
- `src/components/home/RunCTACard.tsx` — already covered by P0-6 (`scheduledRunId` routing)
- `src/components/home/WeekStrip.tsx` — Already supports lift/run/both/rest marker colours; verify it consumes `weekSchedule` directly

### Estimate

**~0.5 days.** Most of the data plumbing already exists in Home — this is about wiring `weekSchedule` (and `runDays`) into the day-peek and CTA rendering.

---

## Tab Specifications

(Same as v3 — see `docs/program-run-mockups-v7.html` for visual.)

- **Today** — single modality / doubles / rest / completion states
- **Week** — 7-day operational list with **visible `⋯` overflow** on rows
- **Lift** — current Programme preserved + optional coral doubles dot
- **Run** — race-prep / structured / no-plan / archived-race states

Overflow `⋯` (Programme top right) adds **"Configure Plan"** entry → full-screen modal.

---

## Race-Prep Compressed Plans

```typescript
totalWeeks = Math.ceil(diffToRace / 7);  // local-date diff
const compressed = totalWeeks < config.minWeeks;
```

**Compressed plan rules (P0-3 `runScheduler` implements):**

| Rule | Why |
|---|---|
| Cap hard runs at **1 per week** (tempo OR intervals, not both) | Reduce stress accumulation |
| Long run progression capped at **10%** week-over-week (vs 15% standard) | Avoid injury from aggressive jumps |
| **Skip the intervals block** if compressed below `minWeeks - 4` | No room for speed development |
| **Replace base weeks with easy aerobic** if compressed below 50% of minWeeks | Conservative volume building |
| Final week always = race week (1 shakeout + race) | Preserve taper integrity |

**UI label:**
```
🎯 10K · 11 Jun · Compressed
Week 1 of 4 · we'll keep this conservative
```

Honest framing. Don't pretend it's a full build.

**Hard floor:** 2 weeks. Below that, decline.

---

## Race Strip Indicator (adapts to plan length)

| Plan length | Indicator |
|---|---|
| 1-7 weeks | Continuous progress bar |
| 8-16 weeks | Discrete dots |
| 17+ weeks | Three-segment phase bar |

---

## Race Complete → Archived Card

| Time since race | Display |
|---|---|
| 0-14 days | Full celebration race strip |
| 14+ days | Small "Last race" card (preserved) |
| User dismisses / starts new plan | Removed |

---

## "Just Go for a Run" Placement

| Context | Copy | Visual |
|---|---|---|
| Today · planned run | "Just go for a run" | Ghost button |
| Today · rest day | "Just go for a run anyway" | Solid secondary |
| Today · completed | "+ Add another run today" | Coral text-link |
| Run · no plan | "Or just go for a run" | Ghost button |
| Run · plan settings | "Freeform — run when you like" | Radio option |

---

## Scheduler Adherence Rules

| Saved run | Effect on planned run |
|---|---|
| Exact template + matching `scheduledRunId` | Completes (`completed_exact`) |
| Same type, different template | **Does NOT auto-complete.** Mismatch reconciliation UX (save-time) |
| Run on rest day | Saved with `planSource: "rest_day"`, `offPlan: true`. No completion. |
| Run on completed day | Saved with `planSource: "completed_day"`, `offPlan: true`. No duplicate. |
| Invalid run | Cannot complete planned |
| User reconciles | `completed_modified` |

**Note:** `freeform_extra` is **NOT** on `ScheduledRunDay.status`. It lives on the saved run document's `planMetadata.planSource` + `offPlan: true`.

---

## Build Phasing · ~15.25 Days

| Phase | Work | Days |
|---|---|---|
| **P0-0** | `generateSchedule` emits Both days (fixed pseudocode + stress-aware placement) | 0.5 |
| **P0-1** | Finalize `ScheduledRunDay` type + `ScheduledRunStatus` enum (keep `userOverride: string`; remove `freeform_extra`) | 0.25 |
| **P0-2** | **Create `planBuilder()`** — architectural centre | 0.75 |
| **P0-3** | `runScheduler` uses `weekSchedule` + compressed-plan rules | 1.0 |
| **P0-4** | `completeOnboarding` Cloud Function contract check + persistence | 0.5 |
| **P0-5** | Onboarding refactor (planBuilder + doubles UX + retake prefill + weekly preview step) | 1.0 |
| **P0-6** | Update Run.tsx, RunSummary, RunCTACard, runPlanMetadata for `scheduledRunId` | 1.0 |
| **P0-7** | Extract `useProgrammeScheduleEditor()` hook | 0.5 |
| **P0-8** | Migrate TrainingSection → Programme + Settings deep-link | 1.0 |
| **P0-9** | Configure Plan wizard (full-screen modal) | 1.0 |
| **P1-1** | Segmented control on Program.tsx (Today / Week / Lift / Run) | 0.5 |
| **P1-2** | TodayTab with single / doubles / rest / completion states | 1.25 |
| **P1-3** | ScheduleTab (Week) with 7-day list + visible `⋯` menus + history nav | 1.5 |
| **P1-4** | **Home integration** (DayPeekCard planned items + WeekStrip + CTA routing) | 0.5 |
| **P2-1** | RunTab with race strip + compressed-plan support | 1.25 |
| **P2-2** | Rename Goal → nutrition phase | 0.25 |
| **P3-1** | Mismatch reconciliation UX (save-time) | 0.5 |
| **P3-2** | Race elapsed (archived after 14d) + completion celebration + race-no-show | 0.75 |

**Total: ~15.25 days.**

**Critical build order:** P0-0 → P0-1 → P0-2 (planBuilder) → everything else can parallelize once these foundations exist. P0-4 (Cloud Function) can run in parallel with P0-2 since it's backend.

---

## Out of Scope (Explicit)

1. `PlannedTrainingItem` unified abstraction — v2
2. Lift workouts moving to date-indexed — v2
3. Cross-modal periodisation engine — v2
4. Cycling / swimming / mobility modalities — v2
5. Adaptive scheduling (auto-move missed runs) — v1.1+
6. Race-prep + lift deload sync — v2
7. AM/PM ordering UI for doubles — v1.1
8. Apple Watch / HealthKit / Live Activities — separate native track
9. **Full recovery-aware Both-day placement AI** — v1.1 (v1.0 has heuristic defaults only)
10. **Eager backfill Cloud Function for existing users** — v1.0 uses lazy backfill on first Programme open

---

## Code References

| File | Purpose | Changes |
|---|---|---|
| `src/pages/Program.tsx` | Programme page (1015 lines) | Add view state, segmented control, render tabs, "Configure Plan" overflow entry |
| `src/pages/Home.tsx` | Home page | **P1-4:** read `weekSchedule`, wire planned items into DayPeekCard, route via `scheduledRunId` |
| `src/pages/Onboarding.tsx` | Onboarding (1100+ lines) | **P0-5:** doubles UX, weekly preview step, `planBuilder()` integration, retake prefill |
| `src/components/program/DayStepper.tsx` | Circular stepper | Preserve as-is |
| `src/components/home/WeekStrip.tsx` | Home week strip | **P1-4:** verify reads `weekSchedule` directly |
| `src/components/home/DayPeekCard.tsx` | Home day peek | **P1-4:** show planned items + status states |
| `src/components/home/RunCTACard.tsx` | Home run CTA | **P0-6:** route by `scheduledRunId` |
| `src/lib/scheduleUtils.ts` | Schedule generator | **P0-0:** emit Both days (corrected counting) + stress-aware pairing |
| `src/lib/dateHelpers.ts` | **NEW** | Local-date helpers — `localDateString`, `localWeekKey`, `localDayIndex` |
| `src/features/program/runScheduler.ts` | Run plan generator | **P0-3:** drive from `weekSchedule` + compressed-plan rules |
| `src/features/program/programTypes.ts` | Type definitions | **P0-1:** `ScheduledRunDay` shape (id/weekKey/date, keep `userOverride: string`), `ScheduledRunStatus` enum (no `freeform_extra`) |
| `src/features/program/useProgram.ts` | Programme state hook | Read scheduled run data; emit `scheduledRunId` on creation |
| `src/features/program/planBuilder.ts` | **NEW** (P0-2) | Single source of truth for plan creation |
| `src/features/program/useProgrammeScheduleEditor.ts` | **NEW** (P0-7) | Extracted schedule-editor hook |
| `src/components/program/ConfigurePlanModal.tsx` | **NEW** (P0-9) | Full-screen reconfiguration wizard |
| `src/pages/Run.tsx` | Run execution | **P0-6:** parse `scheduledRunId`, resolve, preserve in `planMetadata` |
| `src/pages/RunSummary.tsx` | Run summary + save | **P0-6:** complete exact scheduled instance via `scheduledRunId` |
| `src/lib/runPlanMetadata.ts` | Phase B1 metadata | **P0-6:** extend with `scheduledRunId` |
| `src/components/settings/TrainingSection.tsx` | Settings training | **P0-8:** strip active plan controls; deep-link banner; remove "Edit programme" |
| `src/components/program/ProgramSettingsPanel.tsx` | Programme settings | Move cut/recomp/lean bulk to Food |
| `functions/index.js` | `completeOnboarding` Cloud Function | **P0-4:** accept/persist new fields (weekSchedule, runDays shape, etc.) |
| `src/components/run/RunSetupModal.tsx` | /run setup | No changes |

---

## Open Questions for Final Review

1. **`weekSchedule` backfill timing** — lazy on first Programme open vs eager Cloud Function. **My pick: lazy.**
2. **Hard floor for race-prep duration** — 2 weeks. Confirmed.
3. **Configure Plan in-week changes** — apply to this week vs next. **My pick: this week unless explicit "Start fresh week" opt-in.**
4. **Mismatch reconciliation timing** — save-time prompt. Confirmed.
5. **Weekly layout preview editing in onboarding** — confirmatory only. Confirmed.
6. **Configure Plan destruction warnings** — explicit confirm for race-prep changes. Confirmed.
7. **Equipment changes in Configure Plan** — trigger lift regen. **My pick: yes.**
8. **One-shot Coachmark on new tabs post-migration** — for users with `runMode !== 'freeform'`. **My pick: yes.**
9. **Stress-aware Both-day pairing** — defaults only in v1.0 (heuristics, no recovery-aware AI). v1.1+ can expand.
10. **Cloud Function migration strategy** — deploy P0-4 before frontend P0-5 ships to TestFlight, OR feature-flag the new fields so old function continues working until updated. **My pick: deploy CF first** (backend is decoupled; deploy in advance, then frontend rolls out).

---

## Decisions Already Made (Don't Relitigate)

- 4-tab Programme (Today / Week / Lift / Run)
- Footprint icon → `/run` (smart shortcut)
- `/run` setup preserved as-is
- "Just go for a run" placement is contextual
- Scheduler fix uses `weekSchedule` as source of truth
- `scheduledRunId` is the routing primitive
- `userOverride` stays as `string` (template override ID — verified)
- `freeform_extra` is run-document state, not scheduled-day state
- Local-date semantics for all schedule fields (not UTC)
- Race-prep durations 2-26 weeks; compressed plans have conservative rules
- Race complete archives after 14 days
- Visible `⋯` overflow menus
- `useProgrammeScheduleEditor()` extracted before consumers
- `planBuilder()` is the architectural centre — built before consumers (P0-2)
- **Onboarding creates the plan; Programme edits the plan; Home glances; Run executes; Settings stores defaults**
- Configure Plan = full-screen modal (not bottom sheet)
- Settings keeps defaults only
- Onboarding stays at 12 steps (identity stays; nutrition phase + weekly preview steps added)
- Cloud Function contract verified before frontend ships
- Stress-aware Both-day pairing in v1.0 (heuristics, not AI)

---

**End of spec v4.**

This spec is paste-ready for ChatGPT final sign-off OR ready to hand to Claude for build-out. 9 P0 sub-tasks (was 11 in v3 — consolidated onboarding) must land before any UI is built.
