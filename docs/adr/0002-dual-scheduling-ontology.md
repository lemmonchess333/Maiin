---
Status: accepted
---

# Dual scheduling ontology: runs are date-pinned, lifts are split-ordered

## Context

Tropos is a hybrid lifting + running app. Two surfaces compute "today's lift"
by genuinely different rules: the **Programme Lift tab** (`Program.tsx` →
`DayStepper`) uses `workouts.findIndex(d => !d.completed && !d.skipped)` — the
next-incomplete session in the split, weekday-agnostic. Every **calendar**
surface (Home `WeekStrip`, `DayActionSheet`, the Run cockpit `HybridWeekRail`)
resolves lifts via `trainingResolver` → `liftIndexForDayOfWeek(weekSchedule,
dow)` — the workout pinned to _this weekday_. These disagree the moment
completions happen out of weekday order, on a non-lift day, or skip-and-make-up.

A "unification" grill (2026-05-30) asked whether to flatten everything onto one
axis (calendar) so the surfaces stop looking like different apps.

## Decision

Keep **both** ontologies, because each is correct for its discipline:

- **Runs are date-pinned (calendar).** The training stimulus is about the day —
  long run Sunday, intervals Tuesday, race countdown. A missed run stays missed.
- **Lifts are split-ordered (rotation).** Weekly _volume_ is what matters; "next
  up" is the next unfinished session, executed whenever you train, so a slipped
  day doesn't drop a session.

The **week rail** renders the _planned_ week (date-pinned runs + planned lift
day-types) and is the shared glance on both Programme tabs; the **next-up
cursor** (Lift tab `DayStepper`) is the lift _execution_ surface. They reconcile
as **plan vs progress** — the same way every training app reconciles a calendar
with "what's next" — and share `workout.completed` so completion never disagrees.

## Considered options

- **Force-calendar (single model): pin lifts to weekdays everywhere.** Simpler to
  _draw_ and would make every surface agree, but **rejected**: it would mark a
  Tuesday-instead-of-Monday lift as "missed Monday" and drop that session's
  volume for the week — punishing exactly the light-trainer / lapsed-and-returning
  segments CLAUDE.md says to design _for_, and degrading hypertrophy adherence.
  The visual tidiness is not worth the training-logic regression.

## Consequences

- A shared calendar surface must **not** assert a specific lift _session identity_
  pinned to a weekday as if it were authoritative — that's the cursor's call.
  The week rail shows the planned shape + shared completion, not a binding
  "Push is Monday" claim. (This is a live constraint on `HybridWeekRail`'s lift
  lane — do not "fix" it toward force-calendar.)
- Unifying the Programme/Home week surfaces is therefore a **visual + interaction
  coherence** effort (shared cell anatomy, colours, today indicator, language),
  NOT a scheduling-model migration.

## Update 2026-05-31 — Programme navigation cleanup

The dual ontology is **unchanged** (this was re-confirmed, owner-chosen, when a
follow-up spec proposed flattening lifts to a calendar selector — declined, for
the volume-drop reason above). What changed is component naming/placement only:

- The lift **next-up cursor** is now `ProgrammeWeekSelector` with `sport="lift"`
  (it replaced `DayStepper`, which was deleted). It is still **split-ordered** —
  the circle shows the session number (Day 1..N), driven by the same
  `workouts.findIndex(d => !d.completed && !d.skipped)` rotation. The cursor
  remains the lift execution surface.
- `ProgrammeWeekSelector` with `sport="run"` is the **date-pinned** run selector
  and, per the cleanup, it now **drives** the selected-day run command card
  (selected-date controller, not a glance).
- The combined `HybridWeekRail` is **no longer shown inside the Programme Lift or
  Run tabs** — each tab now shows a single scope-filtered selector in the same
  position (lift-only on Lift, run-only on Run), removing the duplicate
  navigation. The rail component + `buildHybridWeekItems` remain for potential
  reuse (e.g. Home), and the "do not assert weekday-pinned lift identity"
  constraint still applies wherever a combined calendar surface is used.

## Update 2026-10-05 — the order carries over between weeks (Lift4)

The dual ontology is unchanged. What changed is where a lift week starts:

- **The week opens with the session not reached.** At the rollover,
  `advanceWeek` moves the session that was up next (`nextUpIndex`, the same
  cursor Train's "Up next" reads, a "Make this next" choice included) to the
  front of `workouts`, and the rest follow in their order. Each session comes
  round once; nothing is doubled up to catch up. A week with nothing left to
  do, or whose first session was still next, keeps its order. Before this,
  every rollover put the cursor back on the first session, so a lifter on a
  three-session plan who managed two a week did the first two every week and
  never met the third — the light-trainer segment this ADR's rejected option
  was rejected to protect.
- **The calendar counts lift days from Monday.** `liftIndexForDayOfWeek`
  orders the lift days by `weekPosition`, so `workouts[0]` lands on the
  week's first lift day: the order the cursor runs and the builder spaces
  (`overlapModel.ts`). It counted from `getDay()`, which put `workouts[0]` on
  Sunday and showed every other lift day the session after the one Train
  started there. The generated weeks for 4 lift + 3 run days and for 6 lift
  days both lift on Sunday.

Consequences:

- After a rollover, `workouts` is no longer in the builder's order. Anything
  that pairs a saved plan with a built one has to match days by name, as
  `generateProgram` already does (`alignExistingTo`); a rebuild starts again
  from the builder's order.
- A day index is only meaningful inside its week. `nextWorkoutOverride` is
  cleared at the rollover, a finish checks the week and the day before it
  ticks anything (`commitWorkoutCompletion`), the server rejects a command
  whose day signature no longer matches (`workoutDaySignature`), and the
  rollover waits while a session is open or a finish is queued
  (`useProgram`).
- `weekHistory` archives each week in the order it was trained.
