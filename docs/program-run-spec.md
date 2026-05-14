# Tropos · Programme + Run Integration — Full Implementation Spec (v3)

**Status:** Pre-implementation. All mockups committed. Awaiting build green-light.
**Branch:** `claude/improve-food-page-design-V6Voe`
**Mockup files (in repo):** `docs/program-run-mockups-v3.html` → `v7.html`
**Revision:** v3 — incorporates ChatGPT's second external review covering onboarding + reconfiguration alignment. Fixes counting bug in P0-0 pseudocode.

---

## What changed from v2

Two batches of corrections:

### Onboarding integration (v2 missed this entirely)

| # | Correction | Status |
|---|---|---|
| 1 | Onboarding belongs in this spec — first-time version of plan configuration | ✅ New section added |
| 2 | Counting bug in P0-0 pseudocode — `runOnlyCount = runDays` is wrong, should be `runDays - bothCount` | ✅ Fixed |
| 3 | **NEW P0-6:** Onboarding's `daysPerWeek + weeklyRunDays ≤ 7` blocks Both days — contradicts v7 architecture | ✅ Added |
| 4 | **NEW P0-7:** Onboarding saves counts only, not concrete `weekSchedule` | ✅ Added |
| 5 | **NEW P0-8:** Retake mode doesn't prefill `runMode`/`weeklyRunDays`/`raceDistance`/`raceTargetDate` — data loss risk for race-prep users | ✅ Added |
| 6 | **NEW P0-9:** Programme reconfiguration should live in Programme (Configure Plan), not Settings → onboarding retake hack | ✅ Added |
| 7 | **NEW P0-10:** Onboarding creates lift-first programState; should call shared plan builder so `runDays`/`runPlan` seed immediately | ✅ Added |
| 8 | New "Onboarding + Programme Reconfiguration Alignment" section explaining the unified architecture | ✅ Added |

### v2 carryover (still applies)

All 10 v2 corrections remain:

| # | Correction | Status |
|---|---|---|
| 1 | P0-0 (`generateSchedule` emits Both) | ✅ Fixed pseudocode now correct |
| 2 | `scheduledRunId` scope | ✅ Run.tsx changes in P0-3 |
| 3 | Footprint icon smart shortcut | ✅ Wording fixed |
| 4 | "Schedule" → "Week" tab label | ✅ Renamed |
| 5 | Visible `⋯` overflow menus | ✅ Added |
| 6 | Compressed race plans | ✅ Honest labelling |
| 7 | Archived race card after 14d | ✅ Doesn't disappear |
| 8 | Today default logic | ✅ Persist after first launch |
| 9 | `useProgrammeScheduleEditor()` hook | ✅ Extract first |
| 10 | Build estimate realism | ✅ Updated again to ~14.25 days |

**Total build estimate:** ~14.25 days (was 10.75 in v2, 7 in v1).

---

## The North Star

> **Onboarding creates the plan. Programme edits the plan. Settings only stores defaults.**

If we miss this, the app has three different plan-config systems (onboarding, Settings, Programme) — exactly the fragmentation v7 is trying to remove.

---

## Context

Tropos is a hybrid fitness app (React 19 + TypeScript + Firebase + Capacitor). Currently lift-first, with running bolted on. The data model (`ProgramState.runDays`, `ProgramState.runPlan`) already unifies lift + run planning, but the UI splits configuration across:

- **Onboarding** (12 steps, creates first plan)
- **Settings TrainingSection** (active plan controls — weekly schedule, run mode, race goal, overrides)
- **Programme** (lift-only DayStepper)

We're collapsing this into:

- **Onboarding** = creates the first plan (with concrete `weekSchedule` from day 1)
- **Programme** = manages the active plan via tabs (Today / Week / Lift / Run) + Configure Plan wizard for major edits
- **Settings** = defaults only (rest timer, audio, units, shoes, privacy, notifications)

---

## The Decision · 4-Tab Programme

Replace the current single-view Programme page with a tabbed interface:

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

| Tab | Internal component | Purpose |
|---|---|---|
| **Today** | `TodayTab.tsx` | "What do I do right now?" Hero card(s). Stacks doubles. Win banner after completion. |
| **Week** | `ScheduleTab.tsx` | "What does my week look like?" 7-day operational list with type pills + visible `⋯` overflow + history nav. |
| **Lift** | `LiftTab.tsx` | "Show me my lifts." Current Programme behaviour preserved exactly. |
| **Run** | `RunTab.tsx` | "Show me my run plan." Race-prep / structured / freeform hub. |

The overflow menu (top right `⋯` of Programme) gains a new entry: **"Configure Plan"** — opens the reconfiguration wizard. This replaces the current "Edit programme" button in Settings.

### Tab default logic

| Trigger | Behaviour |
|---|---|
| First launch post-migration | **Today** for everyone |
| Subsequent launches | Persist last selected via `localStorage.setItem("program-tab", selectedTab)` |
| Deep link (e.g. `/program?tab=run`) | Honour the link |

---

## Onboarding + Programme Reconfiguration Alignment

**The unified architecture:**

```
NEW USER:
  Onboarding → calls planBuilder() → creates first plan
                                      (profile + programState + weekSchedule + runDays + runPlan)

EXISTING USER (small edit):
  Programme tabs (Today / Week / Run) → edit in place

EXISTING USER (major change):
  Programme ⋯ → Configure Plan → calls planBuilder() → rebuilds plan
                                                       (keeps history; updates upcoming)

EXISTING USER (profile reset):
  Settings → Reset profile → full onboarding retake (rare; opt-in)
```

**Shared primitive:** a single `planBuilder()` function — called by both onboarding AND Configure Plan. Same shape in, same shape out. No drift.

```typescript
// New: src/features/program/planBuilder.ts
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
  // Pre-existing data (Configure Plan only — preserves history):
  preserveHistory?: boolean;
}

export interface PlanBuilderOutput {
  programState: ProgramState;     // workouts, runDays, runPlan
  weekSchedule: ScheduleDay[];    // concrete 7-day layout
  profileUpdates: Partial<UserProfile>;
}

export function buildPlan(input: PlanBuilderInput): PlanBuilderOutput;
```

### Configure Plan vs Full Onboarding Retake

Two distinct flows for two distinct intents.

| | Configure Plan | Full Onboarding Retake |
|---|---|---|
| Trigger | Programme ⋯ → Configure Plan | Settings → Reset profile (opt-in, rare) |
| Audience | Existing user adjusting plan | Major life event (injury, equipment change) |
| Steps | Plan-only (training focus → lifting → running → schedule preview → confirm) | Full 11-step flow including identity refresh |
| Identity refresh | No — skips name / gender / age / body metrics | Yes — explicitly invites updates |
| Prefill | All current plan state | Most current state, with explicit "anything changed?" prompts |
| Wording | "Update your plan. Logged workouts and runs stay in History. Upcoming sessions may be rebuilt." | "Let's refresh your profile and rebuild your plan." |
| Visual treatment | Bottom sheet (vaul drawer), not full-screen | Full-screen onboarding flow |
| Existing implementation | NEW (uses `planBuilder` + reused onboarding components) | Cleaned-up retake mode (`{ retake: true }`) — kept |

**Critical:** Configure Plan opens with explicit destruction warnings:

```
Update your plan
This will:
  ✓ Update your weekly schedule
  ✓ Regenerate upcoming planned runs
  ✓ Keep all logged workouts and runs in History
  ⚠ Cancel any in-flight race-prep block (if changing race goal)

[Continue] [Cancel]
```

### New onboarding flow (11 steps)

Identity steps **stay** (TDEE needs them). Plan-configuration steps update.

| Step | Section | Purpose | Notes |
|---|---|---|---|
| 0 | Identity | Name | Existing |
| 1 | Identity | Gender | Existing |
| 2 | Identity | Age | Existing |
| 3 | Identity | Body metrics (height, weight) | Existing |
| 4 | Plan | Training focus (`PrimaryGoal`: muscle / strength / fat loss / general / running) | Existing; now correctly named |
| 5 | Plan | **Nutrition phase** (cut / recomp / lean bulk) | Existing but disambiguated — was the misleading "Goal" |
| 6 | Plan | Experience level | Existing |
| 7 | Plan | **Lifting days** (1-6) + split style | Reworded from "Training days per week" to be unambiguous |
| 8 | Plan | **Running setup** — mode (no run / freeform / structured / race prep) → if structured: runs/week → if race prep: distance + date + runs/week | Existing structure, drops Both-day blocker (P0-6) |
| 9 | Plan | **Weekly layout preview** (NEW) — confirmatory only | Shows the generated `weekSchedule` before commit |
| 10 | Plan | Equipment + injuries | Existing |
| 11 | Plan | Review + create plan | Existing |

**Step 8 doubles handling (P0-6):**

When `liftDays + weeklyRunDays > 7`, instead of blocking, show:

```
You've selected 6 lifting days and 2 runs.
2 days will include both lifting and running.

[Looks good]
[Reduce runs]
[Reduce lifting days]
```

Multiple Both days handled correctly (not just "1 day will include both").

**Step 9 (new — weekly layout preview):**

```
Your training week
Mon   Lift
Tue   Run
Wed   Lift
Thu   Rest
Fri   Both
Sat   Lift
Sun   Rest

[Looks good — create plan]
[Try different counts]
```

**Confirmatory only** in onboarding. Full day-by-day editing lives in the Week tab (existing users) or Configure Plan wizard. Don't make first-time users learn the toggle mechanic in step 9 of 11.

---

## Footprint Icon Behaviour

| Before | After |
|---|---|
| Top-right of Programme. Tap → `/run` (ad-hoc setup). | **Same route, smarter target.** Tap → `/run`. `/run` decides: planned run today → prefill; no plan → freeform setup. |

Footprint = execution shortcut. Plan navigation lives in tabs.

---

## P0 Prerequisites · Must Ship Before UI Work

11 sub-tasks across two batches: scheduler/routing fixes (P0-0 through P0-5) + onboarding/reconfiguration fixes (P0-6 through P0-10). All verified bugs or architectural prerequisites.

### P0-0 · `generateSchedule` must support Both days (FIXED pseudocode)

**Bug location:** `src/lib/scheduleUtils.ts:39-58`

```typescript
// Current — wrong
while (l > 0 || r > 0) {
  if (l > 0) { pattern.push("lift"); l--; }
  if (r > 0) { pattern.push("run"); r--; }
}
for (let i = 0; i < pattern.length && i < slotOrder.length; i++) {
  schedule[slotOrder[i]].type = pattern[i];   // never "both"
}
```

Two problems:
1. Pattern array only contains `"lift"` or `"run"` — never `"both"`
2. Loop terminates at `i < slotOrder.length` (7) — if `pattern.length > 7`, **excess sessions are silently dropped**

**Failure example:** `generateSchedule(6, 2)` requests 8 sessions, gets 7 days populated, one session vanishes.

**CORRECTED fix (v2 had a counting bug — both must consume one lift AND one run):**

```typescript
export function generateSchedule(liftDays: number, runDays: number): ScheduleDay[] {
  const total = liftDays + runDays;
  if (total === 0) return allRest();
  if (total <= 7) return existingNoBothsLogic(liftDays, runDays);

  // total > 7 — must use Both days to fit in 7 slots
  // Each "both" consumes exactly 1 lift AND 1 run
  const bothCount = Math.min(total - 7, liftDays, runDays);
  const liftOnlyCount = Math.max(0, liftDays - bothCount);
  const runOnlyCount = Math.max(0, runDays - bothCount);  // ← FIXED: was just `runDays`
  const restCount = 7 - bothCount - liftOnlyCount - runOnlyCount;

  // Place "both" on highest-priority slots first (Mon/Wed/Fri for hybrid)
  // Then lift-only, then run-only, then rest
  return assembleSchedule({ bothCount, liftOnlyCount, runOnlyCount, restCount });
}
```

**Verification with `generateSchedule(6, 2)`:**
- bothCount = min(8 - 7, 6, 2) = 1
- liftOnly = 6 - 1 = 5
- runOnly = 2 - 1 = 1
- rest = 7 - 1 - 5 - 1 = 0
- Lift exposure = liftOnly + bothCount = 5 + 1 = **6** ✓
- Run exposure = runOnly + bothCount = 1 + 1 = **2** ✓
- Total days = 7 ✓

**Edge case `generateSchedule(0, 8)`:**
- bothCount = min(1, 0, 8) = 0 — can't create Both (no lift to pair with run)
- The function should cap individual modalities at 7 at the input layer (UI validation prevents this state)

**Acceptance test:**
```typescript
const result = generateSchedule(6, 2);
const counts = countByType(result);
expect(counts.lift + counts.both).toBe(6);  // lift exposure
expect(counts.run + counts.both).toBe(2);   // run exposure
expect(counts.both).toBeGreaterThanOrEqual(1);
expect(result.length).toBe(7);  // no truncation
```

**Estimate:** ~0.5 days.

---

### P0-1 · `runScheduler` must use `weekSchedule` (not exclude lift days)

**Bug location:** `src/features/program/runScheduler.ts:54, 148`

```typescript
// Current — wrong
const clampedRun = Math.max(1, Math.min(7 - clampedLift, runDaysTarget));
if (!liftDays.has(d)) available.push(d);
```

The scheduler caps run days at `7 - liftDayCount` AND excludes lift days. Cannot produce doubles.

**Fix:** Drive scheduling from `weekSchedule` directly:

```typescript
const runEligibleDays = weekSchedule.filter(d => d.type === "run" || d.type === "both");
const liftEligibleDays = weekSchedule.filter(d => d.type === "lift" || d.type === "both");
```

**Acceptance:** A user with `weekSchedule = [Mon: both, Wed: lift, Sat: run]` gets a `ScheduledRunDay` on Monday alongside their Monday lift.

**Estimate:** ~1.0 day.

---

### P0-2 · Add `scheduledRunId` + `weekKey` + `date` to `ScheduledRunDay`

**Bug location:** `src/features/program/programTypes.ts`

```typescript
type ScheduledRunStatus =
  | "planned"
  | "completed_exact"
  | "completed_modified"
  | "completed_late"
  | "skipped"
  | "missed"
  | "moved"
  | "freeform_extra"
  | "race_no_show"
  | "race_completed_unlinked";

type ScheduledRunDay = {
  id: string;              // NEW — stable scheduledRunId
  weekKey: string;         // NEW — Sunday-start week key
  date: string;            // NEW — YYYY-MM-DD calendar anchor
  dayIndex: number;        // existing (derived from date)
  templateId: string;
  plannedType: "easy" | "tempo" | "intervals" | "long" | "race";
  status: ScheduledRunStatus;
  linkedRunId?: string;
  movedFromDate?: string;
  movedToDate?: string;
  userOverride?: boolean;
};
```

**Critical rule:** Preserve `id` on move; update `date` + `dayIndex`; record `movedFromDate`.

**Backfill:** Lazy on first read. `id = "runday_" + weekKey + "_" + dayIndex + "_" + templateId`. Same pattern as existing `runDays` hydration.

**Estimate:** ~0.75 days.

---

### P0-3 · Update Run.tsx, RunSummary.tsx, RunCTACard.tsx, runPlanMetadata.ts to use `scheduledRunId`

**Files affected:**
- `src/components/home/RunCTACard.tsx:21-32` — build `?scheduledRunId=` URL using `todayRun.id`
- `src/pages/Run.tsx` — parse `?scheduledRunId`, resolve from `programState.runDays`, prefill, preserve in `planMetadata`
- `src/pages/RunSummary.tsx` — `shouldCompleteRunDay` matches `scheduledRunId`, completes exact instance
- `src/lib/runPlanMetadata.ts` — extend `planMetadata` shape with `scheduledRunId`

**Back-compat:** Keep `?template=` fallback for one release.

**Acceptance:** Two tempo runs in one week complete independently.

**Estimate:** ~1.0 day.

---

### P0-4 · Extract `useProgrammeScheduleEditor()` hook

**Bug location:** `src/pages/Settings.tsx` — schedule-editor logic owned by Settings.

Extract to `src/features/program/useProgrammeScheduleEditor.ts`. Both Week tab AND legacy Settings consume the same hook. No drift.

**Estimate:** ~0.5 days.

---

### P0-5 · Move TrainingSection controls → Programme Week/Run tabs

**Source:** `src/components/settings/TrainingSection.tsx:87-333`

Migrate 5 controls:
1. Weekly schedule editor → Week tab (uses `useProgrammeScheduleEditor`)
2. Run mode toggle → Run tab
3. Race goal setup form → Run tab
4. Race prep progress display → Run tab
5. Weekly run template overrides → Run tab

Settings keeps: rest timer defaults, audio cues defaults, shoes, privacy zones, units, notifications.

Add deep-link banner at top of Settings (one-release): "Plan settings have moved → Programme".

**Estimate:** ~1.0 day.

---

### P0-6 · Onboarding must support Both days (NEW)

**Bug location:** `src/pages/Onboarding.tsx:349, 1007-1011`

```typescript
// Current — wrong (blocks doubles)
canAdvance[9] =
  runFrequency === "none" ||
  (daysPerWeek + weeklyRunDays <= 7 && (runMode !== "race_prep" || raceTargetDate !== ""));
```

This rule directly contradicts the v7 hybrid architecture. A user picking 6 lifts + 2 runs is blocked.

**Fix:** Drop the `daysPerWeek + weeklyRunDays <= 7` blocker. Replace with doubles-aware UX:

```typescript
canAdvance[9] =
  runFrequency === "none" ||
  (validateDoublesViable(daysPerWeek, weeklyRunDays) &&
   (runMode !== "race_prep" || raceTargetDate !== ""));

function validateDoublesViable(lift: number, run: number): boolean {
  if (lift + run <= 7) return true;
  // Both days needed — require at least one of each
  return lift > 0 && run > 0 && lift + run - 7 <= Math.min(lift, run);
}
```

UX banner (replaces the red error):

```
You've selected {lift} lifting days and {run} runs.
{bothCount} day{s} will include both lifting and running.

[Looks good]
[Reduce runs]
[Reduce lifting days]
```

Where `bothCount = lift + run - 7` (and the copy correctly says "1 day will include both" when bothCount=1, "2 days" when bothCount=2, etc.).

**Acceptance:** User can pick 6 lifts + 2 runs and onboarding accepts it with a doubles-day explanation.

**Estimate:** ~0.5 days.

---

### P0-7 · Onboarding must save concrete `weekSchedule` (NEW)

**Bug location:** `src/pages/Onboarding.tsx:376-379` (save path)

Currently saves:
```typescript
weeklyWorkoutsTarget: daysPerWeek,
weeklyRunsTarget: effectiveRunDays,
weeklyRunDaysTarget: effectiveRunDays,
```

But does NOT save a `weekSchedule: ScheduleDay[]` array. New users finish onboarding with counts only; the Week tab has nothing concrete to render.

**Fix:** Call `planBuilder()` (P0-10) during onboarding save. The builder produces a concrete `weekSchedule` and persists it on the user document.

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

await updateProfile({
  ...planOutput.profileUpdates,
  weekSchedule: planOutput.weekSchedule,  // ← NEW
});
await setProgramState(planOutput.programState);  // includes workouts + runDays + runPlan
```

**Existing-user backfill:** Lazy. On first Programme open, if `profile.weekSchedule` is null, derive it from `weeklyWorkoutsTarget` + `weeklyRunDaysTarget` via `generateSchedule()` (post-P0-0 fix) and persist.

**Acceptance:** New user reaches Week tab and sees a concrete 7-day layout without needing to configure anything else.

**Estimate:** ~0.5 days.

---

### P0-8 · Retake mode must prefill all run-plan state (NEW)

**Bug location:** `src/pages/Onboarding.tsx:269-292` (retake useEffect)

```typescript
// Current — prefills most things, but NOT these
if (profile.runFrequency) setRunFrequency(profile.runFrequency);
// Missing:
// - runMode (defaults to "freeform")
// - weeklyRunDays (defaults to 2)
// - raceDistance (no prefill)
// - raceTargetDate (no prefill)
```

A race-prep user re-doing onboarding loses their race plan silently — defaults back to freeform / 10K / no date.

**Fix:** Add to retake prefill:

```typescript
if (profile.runMode) setRunMode(profile.runMode);
if (profile.weeklyRunDaysTarget) setWeeklyRunDays(profile.weeklyRunDaysTarget);
if (profile.raceGoal?.distance) setRaceDistance(profile.raceGoal.distance);
if (profile.raceGoal?.targetDate) setRaceTargetDate(profile.raceGoal.targetDate);
```

**Acceptance:** Existing race-prep user triggers retake → all race details prefilled, no data loss.

**Estimate:** ~0.25 days.

---

### P0-9 · Programme owns reconfiguration (NEW)

**Source:** `src/components/settings/TrainingSection.tsx:90-96`

Current "Edit programme" button:
```typescript
onClick={async () => {
  await updateProfile({ onboardingComplete: false });
  navigate("/onboarding", { state: { retake: true } });
}}
```

This hack repurposes onboarding as the edit flow. With v7 architecture, plan management lives in Programme — reconfiguration should too.

**Fix:**

1. **Remove "Edit programme" from Settings.** Replace with deep-link banner (P0-5):
   ```
   Plan settings have moved
   Your schedule, race prep and training split now live in Programme.
   [Open Programme]
   ```

2. **Add "Configure Plan" entry to Programme overflow menu (`⋯`).** Opens a bottom-sheet wizard (vaul drawer).

3. **Configure Plan wizard reuses onboarding components** (`StepLifting`, `StepRunning`, `StepWeeklyPreview`) but:
   - Skips identity/body steps
   - Different copy ("Update your plan" not "Your plan is ready")
   - Different confirmation ("Continue with rebuild?" with explicit destruction warnings)
   - Calls `planBuilder({ ...input, preserveHistory: true })`

4. **Full onboarding retake** (rare) accessed via Settings → Reset profile. Clear opt-in, not the default edit path.

**Acceptance:** User edits plan via Programme ⋯ → Configure Plan, never bounces through `/onboarding`.

**Estimate:** ~1.0 day (sheet UI + component reuse + copy variants).

---

### P0-10 · Onboarding calls shared `planBuilder` (NEW)

**Source:** `src/pages/Onboarding.tsx:355-420` (save path)

Currently onboarding:
1. Saves profile fields (including `runMode`, `weeklyRunDays`, `raceGoal`)
2. Builds the lift program state via lift-specific logic
3. **Relies on `useProgram` to lazily hydrate `runDays`/`runPlan` later**

This delayed hydration is fragile, especially with `scheduledRunId` becoming foundational. Race-prep users get an inconsistent first session — profile says race_prep but `runDays` doesn't exist until they navigate to Programme.

**Fix:** Extract `planBuilder()` (`src/features/program/planBuilder.ts`). Single function used by:
- Onboarding (creates first plan)
- Configure Plan (rebuilds existing plan)

`planBuilder()` outputs:
- `weekSchedule` (the concrete 7-day layout)
- `programState.workouts` (lift programme)
- `programState.runDays` (concrete `ScheduledRunDay[]` with `scheduledRunId`, `weekKey`, `date`)
- `programState.runPlan` (race-prep or structured metadata)
- `profileUpdates` (training-focus / nutrition-phase / mode fields)

Onboarding calls it. Configure Plan calls it. Both surfaces produce identical shape. No drift, no lazy hydration bugs.

**Acceptance:** A new race-prep user reaches Programme → Run tab immediately shows race strip + this week's runs (no empty state).

**Estimate:** ~0.75 days (extract + call from both surfaces).

---

### Related cleanup · Rename "Goal" → nutrition phase

Move "Cut / Lean Bulk / Recomp" from ProgramSettingsPanel → Food/Nutrition surface.

**Estimate:** ~0.25 days.

---

## Tab Specifications

(Same as v2 — see `docs/program-run-mockups-v7.html` for visual reference.)

Brief summary:

- **Today** — single modality / doubles / rest / completion states
- **Week** — 7-day operational list with visible `⋯` overflow on rows
- **Lift** — current Programme preserved exactly + optional coral doubles dot
- **Run** — race-prep / structured / no-plan / archived-race states

The overflow menu (Programme `⋯` top right) adds **"Configure Plan"** as a new entry.

---

## Race-Prep Variable Duration · Compressed Plans

| Plan length | Indicator | Notes |
|---|---|---|
| 1-7 weeks | Single continuous progress bar | Plan too short for periodisation |
| 8-16 weeks | Discrete dots | Sweet spot |
| 17+ weeks | Three-segment phase bar | Avoids dot crowding |

**Compressed plan handling:**

```typescript
totalWeeks = Math.ceil(diffToRace / 7);
const compressed = totalWeeks < config.minWeeks;
```

UI labels compressed plans honestly: "Compressed 10K plan · 4 weeks · we'll keep this conservative."

**Hard floor:** 2 weeks. Below that, decline to generate.

---

## Race Complete → Archived Card

| Time since race | Display |
|---|---|
| 0-14 days | Full celebration race strip |
| 14+ days | Collapses to small "Last race" card — preserves the achievement |
| User dismisses or starts new plan | Card removed |

Don't fully disappear.

---

## "Just Go for a Run" — Contextual Placement

| Context | Copy | Visual |
|---|---|---|
| Today · planned run | "Just go for a run" | Ghost button below Start |
| Today · rest day | "Just go for a run anyway" | Solid secondary |
| Today · completed | "+ Add another run today" | Coral text-link |
| Run · no plan | "Or just go for a run" | Ghost button |
| Run · plan settings | "Freeform — run when you like" | Radio option |

---

## Scheduler Adherence Rules

| Saved run | Effect on planned run |
|---|---|
| Exact template + matching `scheduledRunId` | Completes (`completed_exact`) |
| Same type, different template | **Does NOT auto-complete.** Mismatch reconciliation UX (save-time prompt). |
| Run on rest day | `freeform_extra` — no completion |
| Run on completed day | `freeform_extra` — no duplicate |
| Invalid run | Cannot complete |
| User reconciles mismatch | `completed_modified` |

---

## Build Phasing · ~14.25 Days Total

| Phase | Work | Days |
|---|---|---|
| **P0-0** | `generateSchedule` emits Both days (fixed pseudocode) | 0.5 |
| **P0-1** | `runScheduler` uses `weekSchedule` | 1.0 |
| **P0-2** | Add `scheduledRunId` + `weekKey` + `date` to type + backfill | 0.75 |
| **P0-3** | Update Run.tsx, RunSummary, RunCTACard, runPlanMetadata for `scheduledRunId` | 1.0 |
| **P0-4** | Extract `useProgrammeScheduleEditor()` hook | 0.5 |
| **P0-5** | Move TrainingSection controls → Programme Run/Week + Settings deep-link | 1.0 |
| **P0-6** | Onboarding doubles support — drop `>7` blocker, add doubles UX | 0.5 |
| **P0-7** | Onboarding saves concrete `weekSchedule` + existing-user backfill | 0.5 |
| **P0-8** | Retake prefills `runMode`/`weeklyRunDays`/`raceDistance`/`raceTargetDate` | 0.25 |
| **P0-9** | Configure Plan wizard in Programme (replaces Settings hack) | 1.0 |
| **P0-10** | Extract `planBuilder()` + call from onboarding | 0.75 |
| **P1-1** | Segmented control on Program.tsx | 0.5 |
| **P1-2** | TodayTab with single / doubles / rest / completion states | 1.25 |
| **P1-3** | ScheduleTab (Week) with 7-day list + visible ⋯ menus + history nav | 1.5 |
| **P2-1** | RunTab with race strip + compressed-plan support | 1.25 |
| **P2-2** | Rename Goal → nutrition phase, move to Food | 0.25 |
| **P3-1** | Mismatch reconciliation UX (save-time) | 0.5 |
| **P3-2** | Race elapsed (archived card after 14d) + completion celebration + no-show | 0.75 |

**Total: ~14.25 days** of focused work.

---

## Out of Scope (Explicit)

1. **`PlannedTrainingItem` unified abstraction** — v2 territory
2. **Lift workouts moving to date-indexed** — v2 territory
3. **Cross-modal periodisation engine** — v2
4. **Cycling / swimming / mobility modalities** — v2
5. **Adaptive scheduling** (auto-move missed runs) — v1.1+
6. **Race-prep + lift deload sync** — v2
7. **AM/PM ordering UI for doubles** — v1.1
8. **Apple Watch / HealthKit / Live Activities** — separate native track

---

## Code References

| File | Purpose | Changes |
|---|---|---|
| `src/pages/Program.tsx` | Programme page (1015 lines) | Add view state, segmented control, render tabs, "Configure Plan" overflow entry |
| `src/pages/Onboarding.tsx` | Onboarding flow (1100+ lines) | **P0-6:** drop doubles blocker. **P0-7:** save `weekSchedule`. **P0-8:** retake prefills run-plan state. **P0-10:** call `planBuilder()`. New weekly-layout-preview step. |
| `src/components/program/DayStepper.tsx` | Circular pill stepper | Preserve as-is; used in Lift tab |
| `src/lib/scheduleUtils.ts` | Weekly schedule generator | **P0-0 fix:** emit Both days when total > 7 (with corrected counting) |
| `src/features/program/runScheduler.ts` | Run plan generator | **P0-1 fix:** drive from `weekSchedule`. Compressed-plan support. |
| `src/features/program/programTypes.ts` | Type definitions | **P0-2:** add `scheduledRunId`, `weekKey`, `date`, status enum |
| `src/features/program/useProgram.ts` | Programme state hook | Read scheduled run data; emit `scheduledRunId` on creation |
| `src/features/program/planBuilder.ts` | **NEW** | Single source of truth for plan creation. Called by onboarding + Configure Plan. |
| `src/features/program/useProgrammeScheduleEditor.ts` | **NEW** | Extracted schedule-editor hook |
| `src/components/program/ConfigurePlanSheet.tsx` | **NEW** | Reconfiguration wizard (bottom sheet) |
| `src/components/home/RunCTACard.tsx` | Home run CTA | **P0-3:** route by `scheduledRunId` |
| `src/pages/Run.tsx` | Run execution page | **P0-3:** parse `scheduledRunId`, resolve, preserve in `planMetadata` |
| `src/pages/RunSummary.tsx` | Run summary + save | **P0-3:** complete exact scheduled instance via `scheduledRunId` |
| `src/lib/runPlanMetadata.ts` | Phase B1 metadata | **P0-3:** extend with `scheduledRunId` |
| `src/components/settings/TrainingSection.tsx` | Settings training section | **P0-5:** strip active plan controls; render deep-link banner. **P0-9:** remove "Edit programme" button. |
| `src/components/program/ProgramSettingsPanel.tsx` | Programme settings panel | Move cut/recomp/lean bulk to Food |
| `src/components/run/RunSetupModal.tsx` | /run setup screen | No changes — universal ad-hoc destination |

---

## Open Questions for Final Review

1. **`weekSchedule` backfill timing** — lazy on first Programme open (cheap, no Cloud Function) vs eager Cloud Function migration (cleaner data). My pick: lazy.

2. **Hard floor for race-prep duration** — 2 weeks minimum, below which we decline. Confirmed.

3. **Configure Plan in-week changes** — if user edits while mid-week, does the change apply to this week or next? My pick: this week unless explicit "Start fresh week" opt-in.

4. **Mismatch reconciliation timing (P3)** — save-time prompt vs deferred Week-tab prompt. My pick: save-time.

5. **Weekly layout preview editing in onboarding** — confirmatory only vs editable. My pick: confirmatory only.

6. **Configure Plan destruction warnings** — should we cancel in-flight race-prep silently or require explicit confirm? My pick: explicit confirm.

7. **Equipment changes in Configure Plan** — should equipment changes trigger lift programme regeneration? My pick: yes (different equipment = different exercise selection).

8. **Existing user UX after migration** — first time they open Programme post-deploy, do we show a one-shot Coachmark explaining the new tabs? My pick: yes for users with `runMode !== 'freeform'`.

---

## Decisions Already Made (Don't Relitigate)

These came out of: 7 mockup iterations, 1 LLM council session, 3 ChatGPT external reviews (Programme/Run + onboarding + counting bug), 5 Explore-agent code-verification passes, and the user's product judgement.

- 4-tab Programme architecture (Today / Week / Lift / Run)
- Footprint icon → `/run` (smart shortcut)
- `/run` setup screen preserved as-is
- "Just go for a run" placement is contextual
- Scheduler fix uses `weekSchedule` as source of truth
- `scheduledRunId` is the new routing primitive
- Settings keeps defaults only
- Race-prep durations are variable (2-26 weeks); compressed plans labelled honestly
- `PlannedTrainingItem` deferred to v2
- Race complete archives after 14 days (doesn't disappear)
- Visible `⋯` overflow menus on row actions
- `useProgrammeScheduleEditor()` hook extraction
- **Onboarding creates the plan; Programme edits the plan; Settings stores defaults**
- **Configure Plan (in Programme ⋯) replaces "Edit programme" (in Settings) for existing users**
- **`planBuilder()` is shared between onboarding and Configure Plan — single source of truth**
- **Identity/body steps stay in onboarding (TDEE depends on them)**
- **Configure Plan is plan-only (skips identity); Full Onboarding Retake stays for profile reset (opt-in via Settings → Reset profile)**

---

**End of spec v3.**

This spec is paste-ready for ChatGPT sign-off OR ready to hand to Claude for build-out. 11 P0 sub-tasks must land before any UI is built. Once P0 ships, the 4-tab UI + Configure Plan wizard build on solid foundations.
