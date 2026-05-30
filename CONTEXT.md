# Tropos — Domain Context

Domain vocabulary as it solidifies, plus the reference-app patterns we've researched. Skills like `improve-codebase-architecture`, `diagnose`, `tdd`, and `grill-me` read this to use the project's actual terms and to inform decisions with what dominant apps already do.

Update when a /grill-me session crystallises new vocabulary, when we adopt or reject a reference-app pattern with explicit reasoning, or when a competitor changes a relevant behaviour.

---

## Domain glossary

### Running

- **runDay** — a prescribed running slot for a specific date. Carries `id` (stable across regenerates within a week), `date` (YYYY-MM-DD, local timezone), `weekKey` (Sunday of the week, local), `templateId` (e.g. `easy_30`, `tempo_20`, `long_10k`, `10k_race`), `status`. Persisted in `programState.runDays[]`.
- **programState** — Firestore doc at `users/{uid}/programState/current`. Holds the user's running + lifting prescriptions: `runDays`, `runPlan`, `workouts`, `weekHistory`, `weekNumber`, `splitType`.
- **runMode** — `freeform | race_prep` (the `structured` value was retired in Run9a; legacy structured profiles migrate to freeform on load). User profile field; drives schedule generation. The user-facing model is two-state: **freeform substrate + optional race-goal overlay**. Freeform = no scheduled runDays; race_prep = goal-anchored periodisation toward a target date.
- **runPlan** — sub-object on programState. Holds mode-specific config: `mode`, `raceGoal` (race_prep only), `currentWeek`, `totalWeeks`, `compressed` flag (when race date forces a sub-minimum plan), `phase` (currently only `"recovery"`), `recoveryEndDate`.
- **recovery phase** — post-race state where all run slots emit `easy_30` templates. Triggered by completing the race-day runDay. Distance-scaled: 5K=1w, 10K=2w, half=3w, marathon=4w. Cleared by the recovery-exit effect 7d after `recoveryEndDate`, or by `skipRecoveryEarly` writer.
- **race_no_show** — runDay status assigned when race date passes by >3 days without a logged run. Recoverable — legal transition to `completed_exact` via the late-reconciliation flow.
- **expired** _(proposed, not shipped — Q6)_ — runDay status assigned when PR-G's auto-rollover archives a planned slot the user didn't act on. Distinct from `skipped` (deliberate user action). Doesn't break streaks; analytics may choose to count or ignore.
- **softlink** _(proposed, not shipped — Q7 revision)_ — derive runDay completion at render time from the existence of a saved run with matching date + template, rather than persisting `linkedRunId`. Matches reference-app convention; eliminates user-facing link/unlink UI.
- **Ad-hoc run launcher** — the run-type picker accessed via the **footprint icon** on the Programme page (top-right). Lets the user start a run on demand without committing to a programmed plan. Run types: Free Run, Easy Run, Tempo Run, Intervals, Long Run, Race (outdoor GPS); Treadmill, Guided Run (other). **Freeform mode shares this same launcher surface** — Freeform mode's "Go" CTA opens the same Choose-run-type picker. Distinct from Structured / Race Prep modes which surface their pre-scheduled runs day-by-day in ProgrammeRunSection. The ad-hoc launcher is the single canonical entry point for unplanned runs, regardless of which mode the user is in.

### Lifting (for cross-reference)

- **workouts** — array of prescribed lift sessions on programState. Each has `dayIndex`, `dayName`, `exercises[]`, `completed`, `skipped`.
- **weekHistory** — array of archived past weeks, currently storing `{ workouts, weekNumber }`. Proposed extension (Q6): also store `runDays`.

### Training-week scheduling ontology & surfaces

Tropos deliberately uses **two different scheduling ontologies**, one per discipline. They are not a bug or unharmonised tech debt — each is correct for its sport. See `docs/adr/0002-dual-scheduling-ontology.md`.

- **date-pinned** (runs) — a running slot belongs to a specific **calendar date** (`runDay.date`). Missing it leaves it missed; it does not slide forward. Right for running, where the stimulus is about the day (long run Sunday, intervals Tuesday, race countdown).
- **split-ordered** (lifts) — a lift session belongs to a **position in the rotation** (`workouts[]` order), not a weekday. "Next up" is the next not-completed/not-skipped session, done **whenever** you next train; volume accumulates and a session is not lost if a day slips. Right for lifting, where total weekly volume matters more than which weekday.
- **planned week vs progress** — the calendar shows the _planned_ week; "next up" reflects _progress_. They can legitimately differ (you worked ahead, or lifted off-schedule) — this is plan-vs-progress, **not** a conflict. Lift completion state (`workout.completed`) is shared, so a done session reads done on every surface.
- **week rail** (`HybridWeekRail`) — single-week, calendar overview with a coral RUN lane + a purple LIFT lane per day. Renders the _planned_ week; the shared "this week" glance across Programme tabs. Shows run identity precisely (date-pinned) and lift day-types as the planned shape — it does **not** own lift session-identity selection (that's the cursor's job).
- **week strip** (`WeekStrip`, Home) — multi-week, horizontally-scrolling **date navigator** with density dots (purple = lift, coral = run). A navigation + glance surface, not a plan editor.
- **next-up cursor** (`DayStepper`, Lift tab) — the numbered (Day 1..N) rotation cursor; the lift _execution_ surface. Selects the split-ordered "next" session to start.

### Nutrition (daily targets)

Calorie + macro target for a given date. The single source of truth is `useEffectiveTargets(date)`; every surface (Home, Food, FoodHeroCard, TodayEnergy, HeroDrillDownSheet) reads from there.

- **baseTarget** — the user's stored daily calorie target (from `profile.targetCalories`). The TDEE + phase + goal output of onboarding / Settings, before any per-day adjustment.
- **dayType** — `"lift" | "run" | "both" | "rest"`. Derived from the user's weekly schedule (`profile.weekSchedule`, or `generateSchedule(...)` if absent) on the date's day-of-week. The "planned" day type, before observing actual activity.
- **strategicBonus** — the program's prescribed calorie adjustment for the day type. Phase-aware (`strength` lift day = +400 hypertrophy over-feed; `cut` lift day = +150; rest day = 0). Returned by `phaseNutrition.getDayAdjustment`.
- **actualBurn** — sum of `totalCalories` from completed workouts + `calories` from completed runs on the date. Runs are filtered through `isVolumeEligible` before summing (drops "too-fast" mis-saves that would otherwise lower the target). Lift and run burn are also exposed separately as `actualLiftBurn` / `actualRunBurn` for source-detection toasts.
- **effectiveDayType** — the day type after observing actual activity. May differ from the planned `dayType` (e.g. user did a lift on what was scheduled as a rest day). Derived in `effectiveTargets.deriveEffectiveDayType`.
- **effectiveBonus** — `max(strategicBonus, actualBurn)`. The `max` rule (not add, not replace) preserves strategic over-feeds when actual burn is smaller, rewards over-performance when actual burn exceeds strategy, and never under-fuels. The user's `profile.adjustCaloriesForTraining = false` toggle short-circuits this to `strategicBonus` only (no Firestore subscriptions opened).
- **finalTarget** — `baseTarget + effectiveBonus`. The number the user sees as "today's calorie target."

---

## Reference-app patterns

Audited May 2026. Re-verify when products change. Each subsection lists what the reference apps do, then the Tropos position with reasoning.

### Linking a saved run to a planned training-plan slot

**Reference apps:**

- **Strava (premium Training Plans):** silent date-based association. Whatever the user uploads on a planned day fills that slot. No prompt at save. No explicit unlink UI surfaced.
- **Nike Run Club (training plans):** linkage at START time — user taps the workout from the plan calendar to start it. Casual runs ("Just Run" mode) don't get associated. No reconciliation prompt at end. Missed planned runs just stay missed.
- **Garmin Connect (calendar workouts):** date-based implicit association. Saved activities fill the calendar slot for that day.
- **TrainingPeaks:** same — date-based, automatic.

**Pattern across the field:** none of the dominant running apps surface "link / unlink" as a user concept. Linkage is invisible plumbing — date proximity at render time, or start-time selection.

**Tropos position:** persisted `linkedRunId` is an internal-only concept that should NOT be exposed in the UX. Compute completion at read time by joining runDays to saved runs by date + template (soft-link). No save-time prompts. No History "Link?" chips. No unlink UI. PR-D's `linkedRunId` write stays as a useful internal hint but is not load-bearing; recovery-phase entry triggers on "saved run exists on race date," not on the link itself.

**Why deviate** — we don't. This is the case where we _match_ the reference apps after initially overcomplicating in PR-D/Q1/Q2.

### Post-race recovery prescription

**Reference apps:**

- **Strava:** no app-side recovery prescription. Up to the user.
- **Nike Run Club:** post-race "Recovery Plan" is optional, user-initiated. No auto-enter.
- **Garmin Connect:** "Recovery time" metric advisory only. Doesn't change the training plan.
- **TrainingPeaks:** recovery weeks are explicit in the coach-built plan, not state-machine triggered.

**Pattern:** auto-entering a recovery phase on race completion is not standard.

**Tropos position:** auto-enter recovery is a Tropos innovation. Justification: we're more opinionated than Strava (we prescribe) and more accessible than coach-built TrainingPeaks plans. The user gets a "you just ran a marathon; we'll give you 4 easy weeks" experience without having to think. Shipped in PR-D + PR-E. Safety net: `skipRecoveryEarly` writer (PR-C) lets the user opt out atomically.

### Mode change ("switch from race plan to freeform")

**Reference apps:**

- **Nike Run Club:** tap "End Plan" → confirmation modal → plan ends, freeform.
- **Garmin Connect:** drag / delete plan from calendar.
- **Strava:** deactivate plan in settings.

**Pattern:** confirmation step before destructive mode changes.

**Tropos position:** `ConfigurePlanModal` pattern matches. Tropos extension (Q5): when changing modes _mid-recovery_, the modal shows a banner ("Changing your plan will end recovery early") — a category of warning the reference apps don't have because they don't have a recovery phase to break.

### Logging a casual run when on a training plan

**Reference apps:** all of them just log it. No prompt. No "was this part of your plan?" anywhere.

**Tropos position:** match. Saved runs go to history; soft-link computes any plan-association at render time. The Q1 race-day RunSummary prompt initially proposed was out of pattern — dropped under the soft-link revision.

### Multi-week absence handling (auto-rollover)

**Reference apps:**

- **Nike Run Club:** plan stays paused at the user's last week. Reopening shows "You missed N weeks. Resume or restart?" — explicit prompt.
- **Garmin Connect:** calendar slots remain in the past; no auto-advance.
- **Strava:** premium plans don't auto-advance the week pointer.

**Pattern:** ask the user before silently advancing.

**Tropos position:** PR-G silently auto-advances up to 12 weeks with a single toast. Out of pattern. Q6 revision is to add a "Welcome back" bottom sheet on first open after rollover, and prompt the user to reset their plan when iterations > 4 (≈ a month absent). Halfway-aligns with reference apps while keeping the silent-rollover convenience for short absences.

### Streaks

**Reference apps:**

- **Duolingo:** day-by-day count, single freeze-day per period, public visibility, recoverable via "Streak Repair" (paid).
- **Apple Activity rings:** rings reset daily; streak shown but not gamified the same way.
- **Strava:** no streak feature. Achievements are weekly-distance / monthly-mileage badges.
- **Nike Run Club:** "Run Streak" tracker exists but is informational, not gamified.

**Pattern:** streaks are a Duolingo-specific gamification not native to running apps. Tropos has streak infrastructure (`src/features/streaks/`) but should follow the Duolingo-style "forgiving but visible" model — single freeze, public visibility, recovery affordance.

**Tropos position:** TBD as streak-related features land. When designing streak-break rules, default to: `race_no_show` does NOT break a streak (user raced, system didn't see it); `expired` does NOT break a streak (life happens); `skipped` does NOT break a streak (deliberate rest); only zero-activity days break it.

---

## Visual vocabulary

Sharpened during /grill-with-docs sessions on visual / layout decisions. These are precise definitions for terms that appeared ambiguous in CLAUDE.md or the codebase.

### Contextual card

A card whose CONTENT is sport-specific AND ACTIONABLE — not a card that merely lives within a sport-themed section.

- **Coral-tinted**: "Today's run" CTA on Home — it IS the run action.
- **NOT coral-tinted**: the outer "Run training" container on Programme — it's adjacent to run content, not the run action itself.

Disambiguates CLAUDE.md's "Running = coral. These two colours appear in calendar dots, section labels, icon tints, and contextual cards" — which the codebase previously read as "any card in run section." The sharper definition prevents coral overuse where every card-in-run-section took a coral fill.

### Coral discipline (run section)

Coral (#D4637A) appears as semantic accent in the Run section on:

- Run icon tints
- Section labels (10px uppercase tracking)
- Start CTAs (semantic: Start = start running)
- Active mode chip when the user is in run mode

Coral does NOT appear as:

- Large card fills
- Navigation links ("Change plan ›" footer is muted-gray, not coral)
- Save / general action buttons (those use brand-purple)

Equivalent discipline applies for purple (lifting) — accent not fill.

## Deliberate deviations from reference apps (Run9 redesign, 2026-05-29)

The run-section redesign (`Run9` lock in `.claude/plans/programme-run-followups.md`)
was adversarially stress-tested against the dominant running apps. Two
decisions deliberately deviate from the consumer-app convention; the
reasons are recorded here per the reference-app rule (a deviation needs an
explicit, written justification).

### Running is the flexible side; the lift programme is the structured anchor

Garmin (Daily Suggested Workouts), Strava (Instant Workouts, 2026), and NRC
all offer a **no-race adaptive "today's run" layer** — structure without a
race. Tropos deliberately does **not**: a race goal is the only running
"plan," and between/without races the run side is freeform logging. The tab is
kept from feeling barren with a DESCRIPTIVE cadence line ("you've run 3× in the
last 4 weeks", "last run 2 days ago") — descriptive only, computed client-side,
NEVER a weekly target or progress bar. A target would be structure, which the
run side deliberately does not add (a round-2 stress test caught that an earlier
"weekly target + progress" idea both rendered "0 of 0" — weeklyRunDaysTarget is
hard-zeroed for freeform — and contradicted this very position).

Tropos-specific reason: Tropos is a **hybrid** app. The **lift programme is
the structured anchor** that's always present and periodized; running is
deliberately the flexible complement. A single-sport runner would need a
no-race structured layer, but a Tropos user always has the lift programme
providing structure, so duplicating that on the run side adds a concept
without a Tropos payoff. (Do NOT re-derive this as a gap to "fix" — it's a
chosen position. Revisit only if Tropos adds a run-only user segment.)
Note: the original Run9 migration note wrongly cited "matches NRC/Strava" —
Strava removed static plans in 2025-07; that rationale is retired.

### Phase disclosure: lift shows a phase, run hides it

The lift tab surfaces a phase badge (`WeekPhaseRow`: "Week N · BUILD"); the
run tab hides base/build/peak and names **only the taper** in plain copy.
This asymmetry is deliberate, not a bug: the **lift phase is a mesocycle the
user explicitly configured and navigates**, whereas the **run phase is
auto-derived from the race date** (an implementation detail). Consumer
running apps hide periodization vocab; the one cue users need before a race
(the taper) is named in plain language. Garmin (the periodization-literate
outlier) does surface run phases, but that's the pro-leaning cohort, not
Tropos's calm-adaptive positioning.

---

- After a /grill-me or /grill-with-docs session that touched feature design
- When a competitor changes a relevant pattern (and the change is material)
- When we adopt or reject a competitor pattern — write the reasoning here, not just the decision
- When new domain vocabulary stabilises in conversation (one term used 3+ times)
