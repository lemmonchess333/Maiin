# Tropos · Programme + Run Integration — Full Implementation Spec

**Status:** Pre-implementation. All mockups committed. Awaiting build green-light.
**Branch:** `claude/improve-food-page-design-V6Voe`
**Mockup files (in repo):** `docs/program-run-mockups-v3.html` → `v7.html`

---

## Context

Tropos is a hybrid fitness app (React 19 + TypeScript + Firebase + Capacitor). Currently lift-first, with a run shortcut bolted on via a coral footprint icon on the Programme page that navigates to `/run`. The data model (`ProgramState.runDays`, `ProgramState.runPlan`) already unifies lift + run planning, but the UI doesn't reflect this — runs are managed in `/settings`, not `/program`.

We're refactoring to make Tropos feel like a unified hybrid training system. After 7 iterations (v1 → v7), code review by ChatGPT, and verification via repo exploration, we landed on a **4-tab Programme architecture**.

---

## The Decision · 4-Tab Programme

Replace the current single-view Programme page with a tabbed interface:

```
┌─────────────────────────────────────┐
│ Programme                       🦶 ⋯│
│ Week 3 · Hypertrophy + Base         │
├─────────────────────────────────────┤
│ [Today] [Schedule] [Lift]   [Run]   │  ← Segmented control
├─────────────────────────────────────┤
│ (tab-specific content)              │
└─────────────────────────────────────┘
```

| Tab | Purpose | Default for |
|---|---|---|
| **Today** | "What do I do right now?" Hero card(s) for today's planned sessions. Stacks doubles. Win banner after completion. | Default landing |
| **Schedule** | "What does my week look like?" 7-day operational list with type pills (Lift / Run / Both / Rest), move/swap/skip actions, history navigation via WeekPhaseRow chevrons. | Power users |
| **Lift** | "Show me my lifts." Current Programme behaviour preserved exactly. Circular DayStepper, exercise list. Optional coral doubles dot on circles when same day has a run. | Lifter mental model |
| **Run** | "Show me my run plan." Race-prep / structured / freeform hub. Race strip (when race_prep), this week's runs, plan controls (race goal, run days, mode toggle). Where all migrated Settings controls live. | Runner mental model |

### Why this won

Previous iterations (v3-v6) tried a "footprint icon as view switcher" — tap footprint → swap Programme content between Lift view and Run view. Got us 80% of the way but couldn't cleanly surface **doubles days** (same day has lift AND run). The Today tab nails this: stacked cards, AM/PM pills, both independently startable.

ChatGPT's external review surfaced 3 P0 code bugs that make this architecture necessary anyway. See P0 section below.

---

## Footprint Icon Behaviour Change

| Before | After |
|---|---|
| Top-right of Programme. Tap → `/run` (ad-hoc setup). Coachmark: "Track a run from here." | **Same.** Top-right of Programme. Tap → `/run` ad-hoc setup. Tabs handle planning. |

The footprint icon is now purely an execution shortcut. Plan navigation lives in tabs.

---

## P0 Prerequisites · Must Ship Before UI Work

All three are **verified bugs** in the current code, surfaced by ChatGPT's review and confirmed via repo inspection. Without these fixes, the 4-tab UI sits on broken foundations.

### P0-1 · Scheduler must support Both days

**Bug location:** `src/features/program/runScheduler.ts:54, 148`

```typescript
// Current — wrong
const clampedRun = Math.max(1, Math.min(7 - clampedLift, runDaysTarget));
// ...
if (!liftDays.has(d)) available.push(d);  // line 63
```

The scheduler caps run days at `7 - liftDayCount` AND explicitly excludes lift days. It **cannot produce a day with both a lift session and a run session** — even though:
- `scheduleUtils.ts:6` defines `DayType = lift | run | both | rest` (the data type supports it)
- Users on hybrid plans (Hyrox, marathon prep with strength accessory, etc.) need doubles

**Fix:**

```typescript
// New — drive scheduling from weekSchedule directly
const runEligibleDays = weekSchedule.filter(d => d.type === "run" || d.type === "both");
const liftEligibleDays = weekSchedule.filter(d => d.type === "lift" || d.type === "both");
```

If user explicitly marks a day as `both`, the scheduler may place a run there alongside the lift.

**Acceptance:** A user with `weekSchedule = [Mon: both, Wed: lift, Sat: run]` gets a `ScheduledRunDay` on Monday alongside their Monday lift.

**Estimate:** ~0.75 days.

---

### P0-2 · Route runs by scheduled identity, not template

**Bug location:** `src/components/home/RunCTACard.tsx:21-32`

```typescript
// Current — wrong
const tmpl = todayRun ? RUN_TEMPLATES.find(...) : null;
const templateParam = tmpl ? "?template=" + tmpl.id : "";
navigate("/run" + templateParam);
```

This loses scheduled-run identity. If a user has **two tempo runs in the same week** (e.g. Tuesday and Saturday), `/run?template=tempo-run-id` cannot tell which one is being executed. The `plannedRunDayIndex` is captured post-hoc by `runPlanMetadata.ts:208` based on "today," which only works if today is the planned day.

**Fix:**

1. Add `scheduledRunId: string` (e.g. `"runday_2026-05-14_tempo"`) to `ScheduledRunDay` type.
2. Replace template URL with: `/run?scheduledRunId=...&source=home|programme`
3. `RunSummary.tsx`'s `shouldCompleteRunDay()` matches against `scheduledRunId`, not template type.

**New `ScheduledRunDay` shape:**

```typescript
type ScheduledRunDay = {
  id: string;             // NEW — stable scheduledRunId
  weekKey: string;        // NEW — for week-bucket queries
  date: string;           // NEW — YYYY-MM-DD calendar anchor
  dayIndex: number;       // 0=Sun..6=Sat (existing)
  templateId: string;
  plannedType: "easy" | "tempo" | "intervals" | "long" | "race";
  status:
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
  linkedRunId?: string;
  userOverride?: boolean;
};
```

**Acceptance:** Two tempo runs in one week complete independently when executed in the right order.

**Estimate:** ~0.5 days.

---

### P0-3 · Move active-plan state out of Settings

**Bug location:** `src/components/settings/TrainingSection.tsx:87-333`

Currently `TrainingSection.tsx` contains **5 active-plan controls** that don't belong in Settings:

1. **Weekly schedule editor** (lines 108-194) — visual 7-day grid with tap-to-cycle Rest→Lift→Run→Both
2. **Run mode toggle** (lines 196-225) — Freeform / Structured / Race Prep
3. **Race goal setup form** (lines 227-270) — distance + date + "Create Race Plan" button
4. **Race prep progress display** (lines 273-301) — current week / total weeks + progress bar
5. **Weekly run template overrides** (lines 303-327) — per-day template dropdowns

These are **active plan management**, not preferences. They belong in the Programme.

**Fix:**

1. Move weekly schedule editor → `Programme Schedule tab`
2. Move run mode + race goal + race progress + weekly overrides → `Programme Run tab`
3. Settings keeps: rest timer defaults, audio cues defaults, shoes, privacy zones, units, notifications
4. Add a deep-link banner at top of Settings (one-release transition): "Plan settings have moved → Programme"

**Pattern reference:** Mirror the existing `/log → /food` route migration.

**Estimate:** ~0.75 days.

---

### Related cleanup · Rename "Goal" → nutrition phase

**Location:** `src/components/program/ProgramSettingsPanel.tsx:100-118`, `src/features/program/programTypes.ts:20`

The "Goal" picker currently presents "Cut / Lean Bulk / Recomp" as a **Programme** setting. But:

```typescript
export type Goal = "cut" | "lean bulk" | "recomp";       // line 20 — nutrition phases
export type PrimaryGoal = "hypertrophy" | "strength" | "fat_loss" | "general" | "running";  // line 34 — training focus
```

The actual training focus type (`PrimaryGoal`) is never exposed in the UI. Users see "Cut" and think it's their training goal, not their dietary phase. **Misleading naming, not actual data conflation** — but worth fixing.

**Fix:**
- Move Cut/Recomp/Lean Bulk → Food / Nutrition surface (where it logically belongs)
- Surface training focus (hypertrophy/strength/etc.) in Programme settings if needed

**Estimate:** ~0.25 days (mostly relabelling + sheet move).

---

## Tab Specifications

### Today Tab

**Default landing for Programme.** What's happening today.

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

### Schedule Tab

**Operational 7-day view.** Where the user manages their week.

**Layout:**
- WeekPhaseRow at top (chevrons activate for past/future navigation)
- 7 rows, one per day
- Each row: date · type pill · planned items · status
- Today row gets a 2px brand-purple outline
- Past-week rows show actual outcomes (not target)
- "Edit week structure" CTA at bottom → opens weekly schedule editor (moved from Settings)

**Type pills:**
- `Lift` — brand purple soft background
- `Run` — coral soft background
- `Both` — gradient purple-to-coral background
- `Rest` — grey soft background

**Row actions:**
- Tap → drill into that day's detail
- Long-press → menu (Move / Swap / Skip / Mark done manually)

**Past weeks:** Show actual outcomes, "Viewing last week · Back to this week" banner, week summary block at bottom (completed/total km/adherence %).

**Components needed:**
- `ScheduleTab.tsx`
- `ScheduleRow.tsx` — list-row format
- `WeekSummaryCard.tsx` — past-week adherence summary
- `HistoryBanner.tsx` — "viewing past" indicator
- `WeekStructureEditor.tsx` — migrated from Settings (sheet variant)

---

### Lift Tab

**Current Programme behavior preserved.** Zero regression.

Existing components used as-is:
- `DayStepper.tsx` (circular pill stepper)
- `WeekPhaseRow.tsx`
- Session card with full exercise list
- All current handlers (advance week, reorder, regenerate)

**One small addition:** 12px coral doubles dot on stepper circles when same day has a planned run. Only renders post-P0-1 fix.

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
- This is also where race-elapsed users land after 14 days

#### Race complete (post-race)
- Race strip flips to gold-green celebration gradient
- Trophy icon
- Race result inline ("50:38 · 5:04 /km avg")
- Recap: "12 weeks · 32 runs · 268 km"
- "Set a new goal" primary CTA
- Race week recap rows below
- Auto-decays to no-plan state after 14 days

**Components needed:**
- `RunTab.tsx`
- `RaceStrip.tsx` — adapts to plan length (progress bar <8w / dots 8-16w / phase-segment bar 17+w) and state (active / complete / no-show)
- `RunSetupSheet.tsx` — for setting up structured or race prep from no-plan state
- `FullPlanModal.tsx` — 12+week list view with mileage chart
- `PlanControlsList.tsx` — settings-row format for race goal / run days / etc.

---

## Race-Prep Variable Duration Support

**Existing capability** in `runScheduler.ts`: `generateRacePlan({ distance, targetDate, ... })` returns `{ totalWeeks, weeks: ScheduledRunDay[][] }` for ANY duration. Phase distribution adapts proportionally.

**UI must adapt** the race strip's visual indicator based on `totalWeeks`:

| Plan length | Indicator | Why |
|---|---|---|
| 1-7 weeks | Single continuous progress bar | Plan too short for meaningful periodisation breaks |
| 8-16 weeks | Discrete dots (one per week) | Sweet spot — weekly progress visible |
| 17+ weeks | Three-segment phase bar (Base/Build/Taper) with current-week marker | Avoids dot crowding |

**Examples covered:**
- 4-week 5K crunch (Base 2 / Build 1 / Taper 1) — progress bar
- 8-week 10K standard (Base 3 / Build 3 / Taper 2) — 8 dots
- 12-week 10K classic (Base 5 / Build 4 / Taper 3) — 12 dots
- 16-week half marathon (Base 6 / Build 6 / Taper 4) — 16 narrow dots
- 20-week marathon (Base 8 / Build 7 / Taper 5) — 3-segment bar
- 24-week marathon (Base 10 / Build 8 / Taper 6) — 3-segment bar

All in **one component** with conditional render. No new pages per duration.

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

These are the gates for when a saved run "completes" a planned run. Some already work; others need explicit handling.

| Saved run state | Effect on planned run |
|---|---|
| Exact template match (same `templateId`) within same week | Auto-completes the planned run (`status = completed_exact`) |
| Same type, different template (e.g. user did Easy 5K on a Tempo day) | **Does NOT auto-complete.** Show mismatch reconciliation UX: "This was an Easy run, but Tuesday's plan was Tempo. What did you mean?" |
| Run on rest day | Saves as `freeform_extra`. No plan completion. |
| Run on already-completed day | Saves as `freeform_extra`. No duplicate completion. |
| Invalid run (<60s, <0.5km, GPS rejected) | Cannot complete planned session. Saves as invalid. |
| User explicitly reconciles a mismatch | Marks planned run as `completed_modified` (real flexibility without corrupting plan data) |

**Mismatch reconciliation UX** is new — needs design pass in P3.

---

## Mockup Coverage

The HTML mockup file (`docs/program-run-mockups-v7.html`) covers:

| § | Tab | State |
|---|---|---|
| 1 | Today | Single modality (lift-only day) |
| 2 | Today | **Doubles day** (lift AM + run PM stacked) |
| 3 | Today | Rest day |
| 4 | Today | Completion celebration with win banner |
| 5 | Schedule | This week (7-day list with all type pills) |
| 6 | Schedule | Past week (history nav + 80% adherence summary) |
| 7 | Lift | Preserved (current Programme + doubles dot indicator) |
| 8 | Run | Race prep 10K (race strip + this week + plan controls) |
| 9 | Run | Structured (no race date, with upgrade path) |
| 10 | Run | No plan / freeform (setup options + escape) |
| 11 | Run | Race complete (gold-green celebration + recap) |
| 12 | Settings | After migration (defaults only + deep-link banner) |

Plus earlier mockup files for variable race-prep durations (`v5`), edge states (`v6`).

---

## Build Phasing — 7 Days Total

P0 prerequisites first. They're bug fixes, not features. The 4-tab UI breaks without them.

| Phase | Work | Days | Acceptance |
|---|---|---|---|
| **P0-1** | Scheduler fix: drive from `weekSchedule` with Both support | 0.75 | A `both` day produces a scheduled run on that lift day |
| **P0-2** | Add `scheduledRunId` field + route all CTAs by it | 0.5 | RunSummary completes the exact scheduled instance |
| **P0-3** | Move TrainingSection controls → Programme Run + Schedule tabs | 0.75 | Settings no longer contains race goal form or weekly overrides |
| **P1-1** | Segmented control on Program.tsx (Today / Schedule / Lift / Run) | 0.5 | Tabs switch content area; URL preserves tab choice |
| **P1-2** | `TodayTab.tsx` with single / doubles / rest / completion states | 1.0 | Doubles day stacks both cards cleanly |
| **P1-3** | `ScheduleTab.tsx` with 7-day operational list + move/swap/skip + history nav | 1.0 | Past-week navigation works; type pills correct |
| **P2-1** | `RunTab.tsx` with race strip + this week's runs + plan controls | 1.0 | Race goal editor, run-days editor, full-plan modal all work |
| **P2-2** | Rename Goal → nutrition phase, move to Food | 0.25 | "Cut / Recomp / Lean Bulk" appears in Food, not Programme |
| **P3-1** | Run mismatch reconciliation UX | 0.5 | Off-plan runs save without auto-completing planned sessions |
| **P3-2** | Race elapsed states (complete + no-show) + completion celebration | 0.75 | Race date passes → cleanly resolves to complete or no-show |

**Total: ~7 days of focused work.**

---

## Out of Scope (Explicit)

These are tempting adjacent additions deferred to post-launch:

1. **`PlannedTrainingItem` unified data abstraction** — ChatGPT proposed a unified planned-item type covering lift + run with status tracking. Architecturally clean but multi-week migration. v2 territory.
2. **Lift workouts moving from position-indexed to date-indexed** — currently `workouts[i]` is workout #i, not Mon/Tue/Wed. Date-anchoring breaks existing history logic. v2 territory.
3. **Cross-modal intelligence** (deload weeks reducing both lift AND run, race-prep tapers backing off squat volume) — needs a unified periodisation engine. v2.
4. **Cycling, swimming, mobility modalities** — each is its own sport. Programme tabs would need to extend. Not for v1.
5. **Adaptive scheduling** (auto-moving missed runs to later in the week) — needs ML/heuristic logic. v1.1+.
6. **Race-prep deload sync** — runScheduler ignores lift deload weeks. Cross-modal periodisation deferred.
7. **Apple Watch / HealthKit / Live Activities** — separate native track per LAUNCH_TODO.

---

## Open Questions for ChatGPT Review

### 1. Tab vs route for Schedule

We've designed Schedule as a tab within `/program`. ChatGPT's earlier brief suggested it could also be a separate route. Tradeoffs:

- **Tab:** simpler IA, lives inside Programme, easy to switch back. State (selected date, history nav) doesn't deep-link cleanly.
- **Route:** clean URL (`/program/schedule?date=2026-05-14`), better deep-links from push notifications, more elaborate.

**Default choice: tab.** Right call?

### 2. Should Home show future-day CTAs?

Home's `WeekStrip` + `DayPeekCard` currently shows the rolling 7 days. ChatGPT suggested:
- Future planned day tap → opens Programme Schedule for that date
- Today CTAs → execute immediately

This is sound, but does it conflict with the current Home pattern where tapping a future day shows... what? Currently `DayPeekCard` says "No activity logged" for future days. ChatGPT wants planned-item display there.

**Should Home learn about planned items, or just stay as a historical activity log?**

### 3. Doubles ordering — am/pm or sequential

Doubles days default to `lift = AM` and `run = PM`. Currently this is implicit. ChatGPT's brief proposes:
- Make `timeOfDay: 'am' | 'pm' | null` part of `ScheduledRunDay` and `WorkoutDay`
- Let user reorder per day

**Worth adding to v1, or defer?** The current implicit AM-then-PM order works for 80% of users.

### 4. Mismatch reconciliation timing

When the user runs Easy on a Tempo day, when do we ask them to reconcile?
- **At RunSummary save time:** "This was Easy, planned was Tempo — what do you want to do?" Clear but interruptive.
- **Later in Programme Schedule:** Silent save as `freeform_extra`, show "Tuesday's Tempo wasn't done · catch up?" prompt later.

P3 design call. Save-time is clearer; later is less interruptive.

### 5. TestFlight beta migration

Existing beta users have `profile.runMode`, `profile.raceGoal`, and `programState.runDays` already populated. The P0-3 migration moves these from `/settings` UI to `/program` UI — same data, different surface.

**No data migration is required**, but the deep-link banner in Settings is necessary so existing users find the new home. Plus a one-shot Coachmark on the new Run tab: "Run plan settings moved here."

**Acceptable migration cost? Anything missed?**

### 6. The `PlannedTrainingItem` question

ChatGPT proposed unifying lift + run planning under a `PlannedTrainingItem` abstraction:

```typescript
type PlannedTrainingItem = {
  id, date, weekKey, dayIndex,
  modality: "lift" | "run",
  source: "program_lift" | "structured_run" | "race_prep_run" | "freeform",
  status: "planned" | "completed" | "completed_modified" | "missed" | "skipped" | "moved" | "extra",
  linkedActivityId
};
```

Pros:
- One shared source of truth across Home / Programme / Run / History
- Status tracking is consistent
- Adherence calculations become trivial

Cons:
- Multi-week refactor
- Current lift workouts are position-indexed; date-indexing breaks history
- Pre-launch this is a big swing

**Defer to v2, or fold into v1?** Strong preference is defer — the current `ProgramState.runDays + workouts` structure works post-P0-1 fix.

### 7. Today tab default vs Lift tab default

For a pure lifter (no runs), should Today tab still be the default landing, or should Programme open straight to Lift tab?

- **Today default:** Consistent across all user types. Lifter sees a Today card with their lift, "Coming up" preview. One extra concept to learn.
- **Lift default for lifters:** Matches current Programme behavior exactly. No learning curve.

Currently unresolved. My instinct: Today default with smart redirect — if user has zero runs scheduled this week, Today tab content is identical to a single-modality lift day, so the cognitive cost is near-zero.

### 8. Settings deep-link banner persistence

How long does the "Plan settings have moved → Programme" banner persist in Settings?

- **One release** (~6 weeks) — minimal annoyance, time-bound
- **Until dismissed** — user controls when it goes away
- **Forever** — protects against rediscovery loss but feels stale

My pick: one release, then auto-remove via a version check. Aligned with the `/log → /food` precedent.

---

## Code References (for ChatGPT verification)

| File | Purpose | What we're changing |
|---|---|---|
| `src/pages/Program.tsx` | Programme page (1015 lines) | Add view state, segmented control, render tabs |
| `src/components/program/DayStepper.tsx` | Circular pill stepper (185 lines) | Preserve as-is; used in Lift tab |
| `src/features/program/runScheduler.ts` | Run plan generator (261 lines) | **P0-1 fix:** drive from weekSchedule, support Both |
| `src/features/program/useProgram.ts` | Programme state hook | Read; no major changes |
| `src/components/home/RunCTACard.tsx` | Home run CTA | **P0-2 fix:** route by scheduledRunId |
| `src/lib/runPlanMetadata.ts` | Plan adherence metadata (Phase B1) | Extend with scheduledRunId |
| `src/components/settings/TrainingSection.tsx` | Settings training section (333 lines) | **P0-3 fix:** strip out active plan controls |
| `src/components/program/ProgramSettingsPanel.tsx` | Programme settings panel | Move cut/recomp/lean bulk to Food |
| `src/features/program/programTypes.ts` | Type definitions | Add scheduledRunId, weekKey, status enum, etc. |
| `src/pages/Run.tsx` | Run execution page | No changes — stays as is |
| `src/lib/scheduleUtils.ts` | Schedule helpers | Already supports `DayType = both`; scheduler must use it |
| `src/components/run/RunSetupModal.tsx` | /run setup screen | No changes — preserved as universal ad-hoc destination |

---

## Files Already Touched (recently)

For context on the current state of the branch:

- `docs/program-run-mockups-v3.html` through `v7.html` — design iterations
- `src/lib/runPlanMetadata.ts` — Phase B1 (programme plan adherence metadata)
- `src/lib/runResumeStorage.ts` — Phase B3 (interrupted run resume)
- `src/components/run/RunResumePrompt.tsx` — Phase B3
- `src/hooks/useRunTimer.ts` — Phase B3 rehydration
- `src/hooks/useGPS.ts` — Phase B3 append points
- `src/pages/Run.tsx` — Phase B1 + B3 wiring

The integration we're spec'ing now sits ON TOP of all this work. Phase B1's `planMetadata` + `deriveStrip` already produces the metadata needed for the Run tab's race strip.

---

## What I Want ChatGPT to Stress-Test

1. **Architecture coherence** — Is the 4-tab split clean, or is there overlap (Today vs Schedule, Lift vs Today's lift card)?
2. **P0 prerequisite logic** — Are these really bugs, or are they design choices that have other reasons?
3. **Hidden edge cases** — What scenarios break the 4-tab model? (E.g. user with 6-day lift programme + 1 weekend run — does Today tab still feel right when 5/7 days are "single modality"?)
4. **Migration safety** — Will existing TestFlight users be confused or lose data when controls move from Settings to Programme?
5. **Data model concerns** — Should `scheduledRunId` be persisted on Firestore, derived, or hybrid cached?
6. **`/run` setup screen interaction** — Confirm that preserving `/run` setup as-is is the right call. It's the universal ad-hoc destination.
7. **Order-of-build risk** — Is the P0 → P1 → P2 → P3 sequence right? Anything that should ship together to avoid weird interim states?
8. **What's the smallest implementation sequence that avoids breaking existing flows?** Specifically: can P0-1 (scheduler fix) ship before any UI work, or does it depend on the UI to render Both correctly?

**Don't give generic UX advice.** Give concrete code-level risks, edge cases, and a recommended implementation sequence.

---

## Decisions Already Made (Don't Relitigate)

- 4-tab Programme architecture (Today / Schedule / Lift / Run)
- Footprint icon → `/run` (ad-hoc shortcut, not view switcher)
- `/run` setup screen preserved as-is
- "Just go for a run" placement is contextual, not chrome
- Scheduler fix uses `weekSchedule` as source of truth
- `scheduledRunId` is the new routing primitive
- Settings keeps defaults only
- Race-prep durations are variable (4-26 weeks), one component renders all
- `PlannedTrainingItem` deferred to v2

These came out of: 7 mockup iterations, 1 LLM council session (5 advisors + 5 peer reviewers + chairman synthesis), 4 Explore-agent code-verification passes, and the user's own product judgement.

---

**End of spec.** Send this whole document to ChatGPT for review.
