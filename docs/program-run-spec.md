# Tropos · Programme + Run Integration — Full Implementation Spec (v2)

**Status:** Pre-implementation. All mockups committed. Awaiting build green-light.
**Branch:** `claude/improve-food-page-design-V6Voe`
**Mockup files (in repo):** `docs/program-run-mockups-v3.html` → `v7.html`
**Revision:** v2 — incorporates ChatGPT's external review (rated 8.2/10 → 9/10 with corrections).

---

## What changed from v1

ChatGPT reviewed v1 and identified 10 specific issues. All 10 have been incorporated into this v2:

| # | Correction | Status |
|---|---|---|
| 1 | **NEW P0-0:** `scheduleUtils.generateSchedule` silently truncates if `liftDays + runDays > 7` and never emits "both" type | ✅ Verified in code, added |
| 2 | `scheduledRunId` was under-scoped — `Run.tsx` does need changes | ✅ Corrected Code References + dedicated P0-3 |
| 3 | Footprint icon "ad-hoc only" wording was misleading | ✅ Reworded |
| 4 | "Schedule" tab label → "Week" (friendlier UX) | ✅ Renamed |
| 5 | Long-press-only row actions too hidden | ✅ Visible `⋯` overflow added |
| 6 | Race-prep `minWeeks` vs target date inconsistency | ✅ Compressed-plan handling added |
| 7 | Race-complete disappearing after 14 days too harsh | ✅ Archived "Last race" card instead |
| 8 | Today default ambiguity | ✅ First-launch=Today, then persist, deep links honoured |
| 9 | Schedule editor logic duplication risk | ✅ Extract as `useProgrammeScheduleEditor()` hook |
| 10 | 7-day estimate too tight | ✅ Updated to ~10.75 days (within 8-12 range) |

---

## Context

Tropos is a hybrid fitness app (React 19 + TypeScript + Firebase + Capacitor). Currently lift-first, with a run shortcut bolted on via a coral footprint icon on the Programme page that navigates to `/run`. The data model (`ProgramState.runDays`, `ProgramState.runPlan`) already unifies lift + run planning, but the UI doesn't reflect this — runs are managed in `/settings`, not `/program`.

We're refactoring to make Tropos feel like a unified hybrid training system. After 7 mockup iterations, one LLM council session, and two external reviews by ChatGPT, we landed on a **4-tab Programme architecture**.

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

| Tab (user-facing) | Internal component | Purpose |
|---|---|---|
| **Today** | `TodayTab.tsx` | "What do I do right now?" Hero card(s) for today's planned sessions. Stacks doubles. Win banner after completion. |
| **Week** | `ScheduleTab.tsx` | "What does my week look like?" 7-day operational list with type pills (Lift / Run / Both / Rest), move/swap/skip via visible `⋯` overflow, history navigation via WeekPhaseRow chevrons. |
| **Lift** | `LiftTab.tsx` (wraps current Programme) | "Show me my lifts." Current Programme behaviour preserved exactly. Circular DayStepper, exercise list. Optional coral doubles dot on circles when same day has a run. |
| **Run** | `RunTab.tsx` | "Show me my run plan." Race-prep / structured / freeform hub. Race strip (when race_prep), this week's runs, plan controls (race goal, run days, mode toggle). Where all migrated Settings controls live. |

**Naming rationale:** "Week" is friendlier than "Schedule" — matches the user's mental question ("what's my week?") rather than admin terminology. Component file stays `ScheduleTab.tsx` to avoid breaking import paths if we later expand to other operational views.

### Tab default logic

| Trigger | Behaviour |
|---|---|
| First launch post-migration | **Today** for everyone — teaches the new mental model |
| Subsequent launches | Persist the user's last selected tab via `localStorage.setItem("program-tab", selectedTab)` |
| Deep link (e.g. `/program?tab=run`) | Honour the link |
| Pure lifter with zero runs scheduled | Today tab renders identically to a single-modality lift day — near-zero cognitive cost. They can still switch to Lift tab; their choice persists. |

---

## Footprint Icon Behaviour

| Before | After |
|---|---|
| Top-right of Programme. Tap → `/run` (ad-hoc setup). Coachmark: "Track a run from here." | **Same route, smarter target.** Tap → `/run`. `/run` decides whether today has a planned run (prefill from scheduled run) or no plan (default to freeform setup). Existing Phase B1 prefill logic already handles this. |

The footprint icon is an **execution shortcut**. It doesn't bypass the plan — it respects today's plan when one exists. Plan navigation lives in tabs.

**Critical:** the icon must not be described as "ad-hoc only." If a user has a planned tempo run today and taps the footprint, they get the planned tempo prefilled (not a freeform tempo that fails to reconcile with the plan).

---

## P0 Prerequisites · Must Ship Before UI Work

All five are **verified bugs** in the current code. ChatGPT's review caught the missing P0-0 that my v1 missed.

### P0-0 · `generateSchedule` must support Both days

**Bug location:** `src/lib/scheduleUtils.ts:39-58`

```typescript
// Current — wrong
while (l > 0 || r > 0) {
  if (l > 0) { pattern.push("lift"); l--; }
  if (r > 0) { pattern.push("run"); r--; }
}
// Assign pattern to slots in priority order
for (let i = 0; i < pattern.length && i < slotOrder.length; i++) {
  schedule[slotOrder[i]].type = pattern[i];   // never "both"
}
```

Two problems:
1. The pattern array only ever contains `"lift"` or `"run"` — never `"both"`
2. The loop terminates at `i < slotOrder.length` (7) — if `pattern.length > 7`, excess entries are **silently dropped**

**Example failure:** `generateSchedule(6, 2)` requests 6 lifts + 2 runs = 8 sessions. Pattern length = 8. Last entry is dropped. User asks for 6+2 and gets only 7 days scheduled with no doubles.

**Fix:**

```typescript
export function generateSchedule(liftDays: number, runDays: number): ScheduleDay[] {
  const total = liftDays + runDays;
  if (total <= 7) {
    // existing logic, but emits "both" only if explicitly requested via day-by-day editor
    // (auto-generation still alternates lift/run within 7-day budget)
    return /* existing pattern */;
  }
  // total > 7: must collapse onto fewer days using "both"
  const bothCount = total - 7;
  const liftOnlyCount = liftDays - bothCount;
  const runOnlyCount = runDays; // runs all get a slot (lifts pair with them)
  // Place "both" on highest-priority slots first
  // (Mon/Wed/Fri for hybrid training)
  return /* assemble with "both" slots */;
}
```

**Acceptance test:**
```typescript
generateSchedule(6, 2)
// Must produce:
//   countByType(result) → { lift: 6, run: 2, both: ≥1, rest: ≤6 }
//   Total active days emit "lift" + "both" = 6 (counts as a lift)
//   Total active run emit "run" + "both" = 2 (counts as a run)
```

**Estimate:** ~0.5 days.

---

### P0-1 · `runScheduler` must use `weekSchedule` (not exclude lift days)

**Bug location:** `src/features/program/runScheduler.ts:54, 148`

```typescript
// Current — wrong
const clampedRun = Math.max(1, Math.min(7 - clampedLift, runDaysTarget));
// ...
if (!liftDays.has(d)) available.push(d);  // line 63
```

The scheduler caps run days at `7 - liftDayCount` AND explicitly excludes lift days. Cannot produce doubles even after P0-0 fixes `generateSchedule`.

**Fix:** Drive scheduling from `weekSchedule` directly:

```typescript
const runEligibleDays = weekSchedule.filter(d => d.type === "run" || d.type === "both");
const liftEligibleDays = weekSchedule.filter(d => d.type === "lift" || d.type === "both");
// runScheduler.scheduleStructuredWeek / generateRacePlan
// use runEligibleDays instead of constructing them from liftDays + cap
```

**Acceptance:** A user with `weekSchedule = [Mon: both, Wed: lift, Sat: run]` gets a `ScheduledRunDay` on Monday alongside their Monday lift.

**Estimate:** ~1.0 day.

---

### P0-2 · Add `scheduledRunId` + `weekKey` + `date` to `ScheduledRunDay`

**Bug location:** Type definition in `src/features/program/programTypes.ts`

Currently `ScheduledRunDay` has `dayIndex: 0-6` but no stable ID and no calendar date. Two tempo runs in different weeks have the same `dayIndex`. Can't disambiguate.

**Fix — new type:**

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
  id: string;              // NEW — stable scheduledRunId (e.g. "runday_2026-05-14_tempo")
  weekKey: string;         // NEW — Sunday-start week key (e.g. "2026-05-10")
  date: string;            // NEW — YYYY-MM-DD calendar anchor
  dayIndex: number;        // 0=Sun..6=Sat (existing, derived from date)
  templateId: string;
  plannedType: "easy" | "tempo" | "intervals" | "long" | "race";
  status: ScheduledRunStatus;
  linkedRunId?: string;
  movedFromDate?: string;
  movedToDate?: string;
  userOverride?: boolean;
};
```

**Critical rule:** If a run is moved to a different day, **preserve the same `id`**, update `date` and `dayIndex`, record `movedFromDate`. Do NOT generate a new ID on move — that would break adherence history.

**Backfill required:** Existing `runDays` entries (from TestFlight users) lack `id`/`date`/`weekKey`. On first read after the migration, populate these fields deterministically:
- `id = "runday_" + weekKey + "_" + dayIndex + "_" + templateId`
- `date = derived from programme start + dayIndex` (best effort)
- `weekKey = derived from runPlan.currentWeek`

**Estimate:** ~0.75 days.

---

### P0-3 · Update `Run.tsx`, `RunSummary.tsx`, `RunCTACard.tsx`, `runPlanMetadata.ts` to use `scheduledRunId`

**Bug location:** `src/components/home/RunCTACard.tsx:21-32`, `src/pages/Run.tsx`, `src/pages/RunSummary.tsx`, `src/lib/runPlanMetadata.ts`

**Current (RunCTACard):** Builds `?template=...` URL, loses scheduled-run identity.

**Current (Run.tsx):** Parses `?template=` and `?type=` URL params. Does NOT parse `scheduledRunId`.

**Fix scope (this is what v1 missed):**

1. **`RunCTACard.tsx`:** Build `?scheduledRunId=...&source=home` URL using `todayRun.id`.
2. **`Run.tsx`:**
   - Parse `?scheduledRunId` from URL params
   - Resolve the scheduled run from `programState.runDays.find(r => r.id === scheduledRunId)`
   - Prefill from that scheduled run's `templateId` + `plannedType`
   - Preserve `scheduledRunId` in `planMetadata` so `RunSummary` knows which instance to complete
   - Keep `?template=` fallback for one release (back-compat for existing nav)
3. **`RunSummary.tsx`:** `shouldCompleteRunDay()` matches against `scheduledRunId`, not just template type. Only the exact scheduled instance gets completed.
4. **`runPlanMetadata.ts`:** Extend `planMetadata` shape to include `scheduledRunId`. Update `computePlanMetadata` and `finalisePlanMetadata` accordingly.

**Acceptance:** Two tempo runs in one week (e.g. Tue + Sat) complete independently. Running the Tuesday tempo doesn't mark the Saturday tempo as done.

**Estimate:** ~1.0 day.

---

### P0-4 · Extract `useProgrammeScheduleEditor()` hook

**Bug location:** `src/pages/Settings.tsx` — schedule-editor logic lives in Settings; will be needed in Programme.

**Don't copy-paste.** Schedule-editor state (`customSchedule`, `runsTarget`, `workoutsTarget`, `handleDayToggle`, `handleApplyScheduleChanges`, `pendingRestructure`, etc.) is currently owned by Settings and passed into `TrainingSection`.

When the Week tab and Run tab need this logic, **extract first, then consume from both surfaces:**

```typescript
// New: src/features/program/useProgrammeScheduleEditor.ts
export function useProgrammeScheduleEditor() {
  const [schedule, setSchedule] = useState<ScheduleDay[]>([]);
  const [customSchedule, setCustomSchedule] = useState<ScheduleDay[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [pendingRestructure, setPendingRestructure] = useState(false);

  const toggleDayType = useCallback(/* ... */, []);
  const applyScheduleChanges = useCallback(/* ... */, []);
  const cancelChanges = useCallback(/* ... */, []);
  const confirmRestructure = useCallback(/* ... */, []);

  return {
    schedule, customSchedule, hasUnsavedChanges, pendingRestructure,
    toggleDayType, applyScheduleChanges, cancelChanges, confirmRestructure,
  };
}
```

Both `WeekTab.tsx` and the legacy Settings page (during transition) consume this hook. No drift, no duplicate bugs.

**Estimate:** ~0.5 days.

---

### P0-5 · Move TrainingSection controls → Programme Run/Week tabs

**Source:** `src/components/settings/TrainingSection.tsx:87-333`

Currently owns 5 controls that don't belong in Settings:
1. Weekly schedule editor (lines 108-194) → **Week tab** (uses `useProgrammeScheduleEditor`)
2. Run mode toggle (lines 196-225) → **Run tab**
3. Race goal setup form (lines 227-270) → **Run tab**
4. Race prep progress display (lines 273-301) → **Run tab**
5. Weekly run template overrides (lines 303-327) → **Run tab**

Settings keeps: rest timer defaults, audio cues defaults, shoes, privacy zones, units, notifications.

Add a deep-link banner at top of Settings (one-release transition): "Plan settings have moved → Programme".

**Pattern reference:** Mirror the existing `/log → /food` route migration.

**Estimate:** ~1.0 day.

---

### Related cleanup · Rename "Goal" → nutrition phase

**Location:** `src/components/program/ProgramSettingsPanel.tsx:100-118`, `src/features/program/programTypes.ts:20`

The "Goal" picker presents "Cut / Lean Bulk / Recomp" as a Programme setting. But these are nutrition phases, not training goals:

```typescript
export type Goal = "cut" | "lean bulk" | "recomp";       // nutrition phases
export type PrimaryGoal = "hypertrophy" | "strength" | "fat_loss" | "general" | "running";  // training focus
```

`PrimaryGoal` is never exposed in the UI. Users see "Cut" and think it's their training goal.

**Fix:**
- Move Cut/Recomp/Lean Bulk → Food / Nutrition surface
- Surface training focus (`PrimaryGoal`) in Programme settings if needed

**Estimate:** ~0.25 days.

---

## Tab Specifications

### Today Tab

**Default landing for Programme** (first launch only; subsequently persists last-selected).

**States:**

1. **Single modality** (lift OR run, not both) — one hero card with primary CTA. "Coming up" preview of next 2 days below.

2. **Doubles day** — two cards stacked vertically:
   - Lift card (AM by default, purple-tinted gradient)
   - Run card (PM by default, coral-tinted gradient)
   - Each independently startable
   - "Both" gradient pill in day header

3. **Rest day** — empty hero ("Sleep is the workout. Your recovery feeds tomorrow's Pull A."). "Just go for a run anyway" ghost button. "Coming up" preview.

4. **Completion** — win banner above ("Tempo nailed · 4:58 /km · 2s under target"). Card flips to completed state with vs-target deltas. "Up next" preview points to tomorrow.

**Components needed:**
- `TodayTab.tsx` — the tab shell
- `LiftSessionCard.tsx` — lift-coloured variant of session card
- `RunSessionCard.tsx` — coral variant with target stats grid
- `RestPill.tsx` — empty rest day card
- `WinBanner.tsx` — auto-dismiss 48h post-completion
- `UpNextRow.tsx` — schedule-row preview format

---

### Week Tab (internal: `ScheduleTab.tsx`)

**Operational 7-day view.** Where the user manages their week.

**Layout:**
- WeekPhaseRow at top (chevrons activate for past/future navigation)
- 7 rows, one per day
- Each row: date · type pill · planned items · status · **visible `⋯` overflow menu**
- Today row gets a 2px brand-purple outline
- Past-week rows show actual outcomes (not target)
- "Edit week structure" CTA at bottom → opens `useProgrammeScheduleEditor` UI (sheet variant)

**Type pills:**
- `Lift` — brand purple soft background
- `Run` — coral soft background
- `Both` — gradient purple-to-coral background
- `Rest` — grey soft background

**Row actions (this is what changed from v1):**
- **Tap row** → drill into that day's detail
- **Tap `⋯` overflow** → menu (Move / Swap / Skip / Mark done manually) — **always visible, not long-press only**
- Long-press also opens the same menu (power-user gesture)

**Past weeks:** Show actual outcomes, "Viewing last week · Back to this week" banner, week summary block at bottom (completed/total km/adherence %).

**Components needed:**
- `ScheduleTab.tsx` — labelled "Week" in the segmented control
- `ScheduleRow.tsx` — list-row format with visible `⋯` overflow
- `RowActionsMenu.tsx` — Move / Swap / Skip / Mark done manually
- `WeekSummaryCard.tsx` — past-week adherence summary
- `HistoryBanner.tsx` — "viewing past" indicator
- `WeekStructureEditor.tsx` — sheet variant of `useProgrammeScheduleEditor`

---

### Lift Tab

**Current Programme behavior preserved.** Zero regression.

Existing components used as-is:
- `DayStepper.tsx` (circular pill stepper)
- `WeekPhaseRow.tsx`
- Session card with full exercise list
- All current handlers (advance week, reorder, regenerate)

**One small addition:** 12px coral doubles dot on stepper circles when same day has a planned run. Only renders post-P0-0 + P0-1 fixes (scheduler must produce true Both days first).

**Migration risk:** None. Lift code path is unchanged when `view === 'lift'`.

---

### Run Tab

**Owner of all run-plan state.** Where TrainingSection's controls migrated to.

**Variants by mode:**

#### Race Prep (mode = "race_prep")
- Race strip at top: countdown, phase pill (Base/Build/Taper/Race), progress indicator
- This week's runs as schedule rows
- Plan controls (settings-row format):
  - Race goal: "10K · 14 Aug ›"
  - Run days: "3 / week ›"
  - View full plan: "›" (opens modal)
- "Pause plan" secondary CTA

#### Structured (mode = "structured")
- No race strip
- This week's runs as schedule rows
- Plan controls:
  - Mode: "Structured ›"
  - Run days: "3 / week ›"
  - "Set a race goal" — upgrade path to race_prep
- No "View full plan" (no multi-week plan to show)

#### No plan / Freeform (mode = "freeform")
- Empty hero: "No run plan yet"
- Two setup option cards: Structured / Race prep
- "Just go for a run" ghost button as escape

#### Race archived (post-race, after 14 days)
- Race strip celebration auto-collapses to a small "Last race" card
- "Last race · 10K · 50:38 · 12-week plan complete · [Set new goal]"
- Doesn't disappear — preserves the achievement visually
- User dismisses or starts a new plan to remove

**Components needed:**
- `RunTab.tsx`
- `RaceStrip.tsx` — adapts to plan length and state (active / complete / archived / no-show)
- `ArchivedRaceCard.tsx` — small post-14-day card
- `RunSetupSheet.tsx` — for setting up structured or race prep from no-plan state
- `FullPlanModal.tsx` — 12+week list view with mileage chart
- `PlanControlsList.tsx` — settings-row format for race goal / run days / etc.

---

## Race-Prep Variable Duration · Compressed Plans

`generateRacePlan` currently uses `Math.max(config.minWeeks, ceil(diffToRace / 7))`. This produces incoherent results when the target date is sooner than the minimum:

- User picks 10K race 4 weeks away (minWeeks = 6)
- Generator produces 6-week plan
- But the race is in 4 weeks
- Plan extends past the race date

**Fix:** Allow compressed plans with conservative progression and explicit labelling.

```typescript
totalWeeks = Math.ceil(diffToRace / 7);
const compressed = totalWeeks < config.minWeeks;
const plan = generateRacePlan({
  ...config,
  totalWeeks,
  compressed,  // signals scheduler to use conservative mileage progression
});
```

**UI treatment when compressed:**

```
┌─────────────────────────────────┐
│ 🎯 10K · 11 Jun · Compressed   │
│ Week 1 of 4 · we'll keep this  │
│ conservative                    │
└─────────────────────────────────┘
```

Honest framing: "compressed plan, conservative progression." Don't pretend it's a full build.

**Minimum bounds:**
- 5K: minWeeks 4, compressed if < 4
- 10K: minWeeks 6, compressed if < 6
- Half: minWeeks 8, compressed if < 8
- Marathon: minWeeks 12, compressed if < 12

Hard floor: **2 weeks minimum**. Below that, decline to generate a plan and prompt: "This race is too close for a plan — just keep your easy runs going."

---

## Race Strip Indicator Adapts to Plan Length

| Plan length | Indicator | Why |
|---|---|---|
| 1-7 weeks | Single continuous progress bar | Plan too short for meaningful periodisation breaks |
| 8-16 weeks | Discrete dots (one per week) | Sweet spot — weekly progress visible |
| 17+ weeks | Three-segment phase bar (Base/Build/Taper) with current-week marker | Avoids dot crowding |

All in **one component** with conditional render. No new pages per duration.

---

## Race Complete → Archived Card (not auto-decay)

After race day:

| Time since race | Display |
|---|---|
| 0-14 days | Full celebration race strip — gold-green gradient, trophy icon, race result, recap stats, "Set a new goal" CTA |
| 14+ days | **Collapses to small "Last race" card** — preserves the achievement without dominating the Run tab |
| User dismisses or starts new plan | Card removed |

Don't fully disappear the achievement. People like seeing evidence of progress.

---

## "Just Go for a Run" — Contextual Placement

The freeform escape lives wherever the user's thumb is when they're considering deviating from the plan. Same destination (`/run` setup) every time, different framing.

| Context | Placement | Copy | Visual |
|---|---|---|---|
| Today tab · planned run | Below "Start [planned]" | "Just go for a run" | Ghost button, coral outline |
| Today tab · rest day | Primary action on rest pill | "Just go for a run anyway" | Solid grey secondary |
| Today tab · completed | Footer text-link | "+ Add another run today" | Coral text → opens picker sheet |
| Run tab · no plan | Bottom of setup options | "Or just go for a run" | Ghost button, centred |
| Run tab · plan settings | Mode picker | "Freeform — run when you like" | Radio option (changes mode) |

The Outsider council member's killer line: "I'd never look top-right for an action. That's where settings live."

---

## Scheduler Adherence Rules

| Saved run state | Effect on planned run |
|---|---|
| Exact template match (same `templateId`) AND same `scheduledRunId` | Auto-completes the planned run (`status = completed_exact`) |
| Same type, different template (e.g. user did Easy 5K on a Tempo day) | **Does NOT auto-complete.** Show mismatch reconciliation UX: "This was an Easy run, but Tuesday's plan was Tempo. What did you mean?" |
| Run on rest day | Saves as `freeform_extra`. No plan completion. |
| Run on already-completed day | Saves as `freeform_extra`. No duplicate completion. |
| Invalid run (<60s, <0.5km, GPS rejected) | Cannot complete planned session. Saves as invalid. |
| User explicitly reconciles a mismatch | Marks planned run as `completed_modified` (real flexibility without corrupting plan data) |

**Mismatch reconciliation UX** is new — designed in P3. Save-time is the chosen timing: clear and prevents silent off-plan accumulation.

---

## Mockup Coverage

The HTML mockup file (`docs/program-run-mockups-v7.html`) covers:

| § | Tab | State |
|---|---|---|
| 1 | Today | Single modality (lift-only day) |
| 2 | Today | **Doubles day** (lift AM + run PM stacked) |
| 3 | Today | Rest day |
| 4 | Today | Completion celebration with win banner |
| 5 | Week | This week (7-day list with all type pills) |
| 6 | Week | Past week (history nav + 80% adherence summary) |
| 7 | Lift | Preserved (current Programme + doubles dot indicator) |
| 8 | Run | Race prep 10K (race strip + this week + plan controls) |
| 9 | Run | Structured (no race date, with upgrade path) |
| 10 | Run | No plan / freeform (setup options + escape) |
| 11 | Run | Race complete (gold-green celebration + recap) |
| 12 | Settings | After migration (defaults only + deep-link banner) |

**Note:** Mockups currently say "Schedule" tab — these need a text-only update to "Week" before/during build. Internal component name `ScheduleTab.tsx` is preserved.

---

## Build Phasing · ~10.75 Days Total

P0 prerequisites first. They're bug fixes, not features. The 4-tab UI breaks without them.

| Phase | Work | Days | Acceptance |
|---|---|---|---|
| **P0-0** | `scheduleUtils.generateSchedule` emits Both days when total > 7 | 0.5 | `generateSchedule(6, 2)` produces a schedule with ≥1 "both" day, no dropped sessions |
| **P0-1** | `runScheduler` uses `weekSchedule` (run/both eligible) | 1.0 | A `both` day in `weekSchedule` produces a scheduled run on that lift day |
| **P0-2** | Add `scheduledRunId` + `weekKey` + `date` to `ScheduledRunDay` type + backfill | 0.75 | New schedules have stable IDs; existing TestFlight data backfilled deterministically |
| **P0-3** | Update Run.tsx, RunSummary.tsx, RunCTACard.tsx, runPlanMetadata.ts to use scheduledRunId | 1.0 | Two tempo runs in same week complete independently |
| **P0-4** | Extract `useProgrammeScheduleEditor()` hook | 0.5 | Both Settings (legacy) and Week tab can use the same editor logic |
| **P0-5** | Move TrainingSection controls → Programme Run + Week tabs | 1.0 | Settings no longer contains race goal form, weekly schedule, or overrides |
| **P1-1** | Segmented control on Program.tsx (Today / Week / Lift / Run) + persistence | 0.5 | Tabs switch content area; URL + localStorage preserve choice |
| **P1-2** | `TodayTab.tsx` with single / doubles / rest / completion states | 1.25 | Doubles day stacks both cards cleanly |
| **P1-3** | `ScheduleTab.tsx` (Week tab) with 7-day list + visible ⋯ menus + history nav | 1.5 | Move/swap/skip work via overflow menu; past-week navigation works |
| **P2-1** | `RunTab.tsx` with race strip + this week's runs + plan controls + compressed-plan support | 1.25 | Race goal editor, run-days editor, full-plan modal, compressed plans all work |
| **P2-2** | Rename Goal → nutrition phase, move to Food | 0.25 | "Cut / Recomp / Lean Bulk" appears in Food, not Programme |
| **P3-1** | Run mismatch reconciliation UX (save-time) | 0.5 | Off-plan runs save without auto-completing; reconciliation prompt fires |
| **P3-2** | Race elapsed (archived card after 14 days) + completion celebration + race-no-show | 0.75 | Race date passes → cleanly resolves to complete / archived / no-show |

**Total: ~10.75 days** of focused work.

---

## Out of Scope (Explicit)

These are tempting adjacent additions deferred to post-launch:

1. **`PlannedTrainingItem` unified data abstraction** — ChatGPT proposed unifying lift + run planning under one type. Architecturally clean but multi-week migration. v2 territory.
2. **Lift workouts moving from position-indexed to date-indexed** — currently `workouts[i]` is workout #i, not Mon/Tue/Wed. Date-anchoring breaks existing history logic. v2 territory.
3. **Cross-modal intelligence** (deload weeks reducing both lift AND run, race-prep tapers backing off squat volume) — needs a unified periodisation engine. v2.
4. **Cycling, swimming, mobility modalities** — each is its own sport. Programme tabs would need to extend. Not for v1.
5. **Adaptive scheduling** (auto-moving missed runs to later in the week) — needs ML/heuristic logic. v1.1+.
6. **Race-prep deload sync** — runScheduler ignores lift deload weeks. Cross-modal periodisation deferred.
7. **AM/PM ordering UI for doubles** — defaults to AM lift / PM run. User-configurable per-day ordering deferred.
8. **Apple Watch / HealthKit / Live Activities** — separate native track per LAUNCH_TODO.

---

## Code References

| File | Purpose | What we're changing |
|---|---|---|
| `src/pages/Program.tsx` | Programme page (1015 lines) | Add view state, segmented control, render tabs |
| `src/components/program/DayStepper.tsx` | Circular pill stepper (185 lines) | Preserve as-is; used in Lift tab |
| `src/lib/scheduleUtils.ts` | Weekly schedule generator | **P0-0 fix:** emit Both days when total > 7 |
| `src/features/program/runScheduler.ts` | Run plan generator (261 lines) | **P0-1 fix:** drive from `weekSchedule`, support Both. Add compressed-plan handling. |
| `src/features/program/programTypes.ts` | Type definitions | **P0-2:** add `scheduledRunId`, `weekKey`, `date`, status enum, etc. |
| `src/features/program/useProgram.ts` | Programme state hook | Read scheduled run data; emit scheduledRunId on creation |
| `src/components/home/RunCTACard.tsx` | Home run CTA | **P0-3:** route by `scheduledRunId` |
| `src/pages/Run.tsx` | Run execution page | **P0-3:** parse `scheduledRunId`, resolve from programState, preserve in planMetadata |
| `src/pages/RunSummary.tsx` | Run summary + save | **P0-3:** complete the exact scheduled instance via `scheduledRunId` |
| `src/lib/runPlanMetadata.ts` | Plan adherence metadata (Phase B1) | **P0-3:** extend `planMetadata` shape with `scheduledRunId` |
| `src/components/settings/TrainingSection.tsx` | Settings training section (333 lines) | **P0-5:** strip out active plan controls; render deep-link banner |
| `src/features/program/useProgrammeScheduleEditor.ts` | NEW hook | **P0-4:** extract schedule-editor logic |
| `src/components/program/ProgramSettingsPanel.tsx` | Programme settings panel | Move cut/recomp/lean bulk to Food |
| `src/components/run/RunSetupModal.tsx` | /run setup screen | No changes — preserved as universal ad-hoc destination |

---

## Open Questions for Final Review

### 1. Backfill strategy for `scheduledRunId` on existing data

TestFlight users have `runDays` entries without `id`/`date`/`weekKey`. On migration:
- **Option A:** Lazy backfill — populate on first read from any code path that uses them
- **Option B:** Eager backfill via Cloud Function on user's next session
- **Option C:** Best-effort derivation at runtime with no persisted backfill

My pick: **Option A**. Cheapest, no Cloud Function deploy needed, fields populate naturally.

### 2. Hard floor for race-prep duration

Race in 2 weeks for a marathon — clearly impossible. What's the hard floor below which we decline to generate a plan entirely?

My pick: **2 weeks absolute minimum**. Below that, "This race is too close for a plan — just keep your easy runs going."

### 3. "Edit week structure" — when to trigger full regenerate?

If user changes Wed from "Lift" to "Rest" in the Week tab editor, does that:
- Regenerate the whole week's plan? (existing behaviour, destructive)
- Just remove Wed's planned items, keep others intact? (less surprising)

My pick: **Less surprising** — only affected days change. Show "Apply changes" CTA at the bottom so user explicitly confirms.

### 4. Mismatch reconciliation timing (P3)

When user runs Easy on a Tempo day:
- **Save-time prompt:** Clear, prevents silent off-plan accumulation. Slightly interruptive.
- **Later in Week tab:** Silent save as `freeform_extra`, surface later with "Tuesday's tempo wasn't done · catch up?" prompt.

My pick from v1: **Save-time.** Better data hygiene.

### 5. Should the Today tab show the "Up next" preview for rest days too?

If today is a rest day and tomorrow has a lift, do we surface tomorrow's lift card as a preview?

My pick: **Yes**, helps users mentally plan around rest.

---

## Decisions Already Made (Don't Relitigate)

These came out of: 7 mockup iterations, 1 LLM council session, 2 ChatGPT external reviews, 4 Explore-agent code-verification passes, and the user's product judgement.

- 4-tab Programme architecture (Today / Week / Lift / Run)
- Footprint icon → `/run` (smart shortcut, respects today's plan)
- `/run` setup screen preserved as-is
- "Just go for a run" placement is contextual, not chrome
- Scheduler fix uses `weekSchedule` as source of truth
- `scheduledRunId` is the new routing primitive
- Settings keeps defaults only
- Race-prep durations are variable (2-26 weeks); compressed plans labelled honestly
- `PlannedTrainingItem` deferred to v2
- Race complete archives after 14 days (doesn't disappear)
- Visible `⋯` overflow menus on row actions (long-press as secondary gesture)
- `useProgrammeScheduleEditor()` hook extraction (no copy-paste)

---

**End of spec v2.**

This spec is paste-ready for ChatGPT sign-off OR ready to hand to Claude for build-out. P0 work (the 5 sub-tasks) must land before any UI is built. Once P0 ships, the 4-tab UI can be built on solid foundations.
