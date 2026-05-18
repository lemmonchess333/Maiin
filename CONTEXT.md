# Tropos — Domain Context

Domain vocabulary as it solidifies, plus the reference-app patterns we've researched. Skills like `improve-codebase-architecture`, `diagnose`, `tdd`, and `grill-me` read this to use the project's actual terms and to inform decisions with what dominant apps already do.

Update when a /grill-me session crystallises new vocabulary, when we adopt or reject a reference-app pattern with explicit reasoning, or when a competitor changes a relevant behaviour.

---

## Domain glossary

### Running

- **runDay** — a prescribed running slot for a specific date. Carries `id` (stable across regenerates within a week), `date` (YYYY-MM-DD, local timezone), `weekKey` (Sunday of the week, local), `templateId` (e.g. `easy_30`, `tempo_20`, `long_10k`, `10k_race`), `status`. Persisted in `programState.runDays[]`.
- **programState** — Firestore doc at `users/{uid}/programState/current`. Holds the user's running + lifting prescriptions: `runDays`, `runPlan`, `workouts`, `weekHistory`, `weekNumber`, `splitType`.
- **runMode** — `freeform | structured | race_prep`. User profile field; drives schedule generation. Freeform = no scheduled runDays; structured = weekly rotation; race_prep = goal-anchored periodisation toward a target date.
- **runPlan** — sub-object on programState. Holds mode-specific config: `mode`, `raceGoal` (race_prep only), `currentWeek`, `totalWeeks`, `compressed` flag (when race date forces a sub-minimum plan), `phase` (currently only `"recovery"`), `recoveryEndDate`.
- **recovery phase** — post-race state where all run slots emit `easy_30` templates. Triggered by completing the race-day runDay. Distance-scaled: 5K=1w, 10K=2w, half=3w, marathon=4w. Cleared by the recovery-exit effect 7d after `recoveryEndDate`, or by `skipRecoveryEarly` writer.
- **race_no_show** — runDay status assigned when race date passes by >3 days without a logged run. Recoverable — legal transition to `completed_exact` via the late-reconciliation flow.
- **expired** *(proposed, not shipped — Q6)* — runDay status assigned when PR-G's auto-rollover archives a planned slot the user didn't act on. Distinct from `skipped` (deliberate user action). Doesn't break streaks; analytics may choose to count or ignore.
- **softlink** *(proposed, not shipped — Q7 revision)* — derive runDay completion at render time from the existence of a saved run with matching date + template, rather than persisting `linkedRunId`. Matches reference-app convention; eliminates user-facing link/unlink UI.

### Lifting (for cross-reference)

- **workouts** — array of prescribed lift sessions on programState. Each has `dayIndex`, `dayName`, `exercises[]`, `completed`, `skipped`.
- **weekHistory** — array of archived past weeks, currently storing `{ workouts, weekNumber }`. Proposed extension (Q6): also store `runDays`.

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

**Why deviate** — we don't. This is the case where we *match* the reference apps after initially overcomplicating in PR-D/Q1/Q2.

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

**Tropos position:** `ConfigurePlanModal` pattern matches. Tropos extension (Q5): when changing modes *mid-recovery*, the modal shows a banner ("Changing your plan will end recovery early") — a category of warning the reference apps don't have because they don't have a recovery phase to break.

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

---



- After a /grill-me or /grill-with-docs session that touched feature design
- When a competitor changes a relevant pattern (and the change is material)
- When we adopt or reject a competitor pattern — write the reasoning here, not just the decision
- When new domain vocabulary stabilises in conversation (one term used 3+ times)
