# Programme Run Section — Follow-Up Work

## Context

The Programme → Run section landed in its current shape across PR-0a → PR-B (May 2026). It's structurally sound: inline mode picker (PR-B), composing handler that sequences `updateProfile` + `refreshRunSchedule` atomically, per-mode operational heroes (PR-4), DayActionSheet for per-day actions (PR-1), `/setup-matt-pocock-skills` repo config (May 17).

What's still incomplete or incorrect:

- **Post-race state is paper.** `race_no_show` and `race_completed_unlinked` are defined in `ScheduledRunStatus` but never written by any code path. The UI has dead branches for them. `linkedRunId` is similarly defined but never written.
- **No recovery phase.** After a user completes a race plan, the UI shows a dead-end "Race day has passed" muted banner. The "Switch to structured running" button on the post-race card today mislabels what it does.
- **No automatic week rollover.** A run-only user (no lifts) never sees a rotation of their `programState.runDays`. The same Mon/Wed/Sat entries persist until they manually edit their schedule. Race-prep users' `currentWeek` never ticks up automatically.
- **Per-day template overrides die on schedule refresh.** Setting Monday=tempo via the per-row `<select>` writes `userOverride: "tempo_20"`. Any subsequent `refreshRunSchedule` (triggered by a schedule edit, target change, or — once PR-D ships — the auto-transition) regenerates `runDays[]` from scratch and silently drops the override.
- **"This week" label in the freeform hero is wrong.** Uses `weeklyData[weeklyData.length - 1]` (most recent week with any runs), which can be a past calendar week when a user hasn't run this week. Labels last week's data as "This week."
- **"Next planned run" card lacks temporal anchor.** Today's `Next · {dayLabel}` doesn't distinguish today / tomorrow / past-planned. The user has to compute proximity.
- **Mode-change pending state is silent.** During the 1-2 second `updateProfile` + `refreshRunSchedule` window, only the non-active chips dim — no positive "we're working on this" signal.

This document is the plan to close all of these, designed end-to-end in a /grill-me session (22 decisions, May 17 2026).

---

## Revision — soft-link reframe (May 17 2026, second /grill-me)

After PR-F, PR-D, PR-E, PR-C, PR-G shipped, a follow-up grill on race-day reconciliation reached a different conclusion than the original plan. The reframe:

**What we built:** persisted `linkedRunId` linkage between saved runs and `runDay` slots, plus a state-machine status (`completed_exact`, `race_no_show`, etc.) tracking whether the linkage exists.

**What the reference apps do** (see `CONTEXT.md` for the full audit): Strava, Nike Run Club, Garmin Connect, and TrainingPeaks all do linkage **invisibly** — date-based at render time, or start-time selection. None surface "link / unlink" as a user concept.

**The revision:** drop user-facing linkage entirely. Compute completion at render time via "saved run with matching date + template exists." This means:

- **DROP:** the planned Q1 "Was this your scheduled race?" RunSummary prompt — out of pattern with reference apps.
- **DROP:** the planned Q2 late-reconciliation UI (post-race card "Link a past run" button, History overflow) — same reason.
- **MODIFY:** the planned Q3 enum collapse — go further. Remove `completed_exact / completed_modified / completed_late` entirely. runDay statuses become `planned | skipped | race_no_show | expired`. Completion is derived, never stored.
- **KEEP:** Q4 "What's next?" card after recovery clears. Independent of linkage.
- **KEEP:** Q5 mid-recovery mode-change banner. Independent.
- **KEEP:** Q6 auto-rollover archive + Welcome-back sheet. Modify to use `expired` status from the simplified enum.
- **NEW:** rip `linkedRunId` writes out of `completeRunDay`. The function becomes `markRunDayDone(idOrDayIndex)` that flips status from `planned` to a non-existent-anymore terminal — replaced by the soft-link computation. Actually: even `markRunDayDone` may not be needed if completion is purely derived. To investigate during implementation.

**Race-day recovery trigger (new mechanism):** today, PR-D's `completeRunDay` enters recovery when the race-day runDay completes. Under soft-link, recovery enters when an effect detects: `profile.runMode === "race_prep"` AND `today >= raceGoal.targetDate` AND `a saved run exists on raceGoal.targetDate with matching distance`. Strava-synced races trigger recovery on next app open after sync.

**Race-no-show trigger:** PR-D's auto-transition stays. The 3-day-grace + no-saved-run check still fires on app open. Independent of linkage.

This is captured as **PR-J — soft-link reframe**, to be sequenced after the current 5 PRs settle and before any new linkage-related work. See `CONTEXT.md` "Linking a saved run to a planned training-plan slot" for the full reference-app audit.

---

## Suggested PR sequence

PR-F + PR-G can ship in parallel with the PR-D → PR-E → PR-C chain.

```
PR-F: Run-section polish              ─┐
                                       ├─ ship parallel
PR-G: Auto week rollover              ─┘

PR-D: Race state-machine writers      ─┐
PR-E: Recovery phase                  ─┼─ ship sequenced (D first)
PR-C: Post-race card UX               ─┘
```

---

## PR-F — Run-section polish

Small follow-ups, independent of any state-machine or rollover work. Shippable first.

### Scope

1. **Fix "This week" labelling bug** in the freeform hero. Replace:
   ```ts
   const thisWeek = weeklyData[weeklyData.length - 1] ?? null;
   ```
   with:
   ```ts
   const thisWeekKey = localWeekKey(new Date());
   const thisWeek = weeklyData.find((w) => w.week === thisWeekKey) ?? null;
   ```
   When no bucket exists for the current calendar week, hide the "This week" line.

2. **Next-planned-run label with today/tomorrow/Pending detection.** Replace the current:
   ```tsx
   <p>Next · {DAY_LABELS[nextStartable.dayIndex]}</p>
   ```
   with a derived label:
   - `nextStartable.date === todayKey` → "Today"
   - `nextStartable.date === tomorrowKey` → "Tomorrow"
   - `nextStartable.date < todayKey` → "Pending" (past-planned, still startable but the date has passed)
   - else → `DAY_LABELS[dayIndex]`

3. **Preserve per-day `userOverride` across `refreshRunSchedule`.** In `useProgram.ts:refreshRunSchedule`, snapshot the existing overrides before regenerating and re-apply after. Pattern:
   ```ts
   const overrideSnapshot: Record<number, string> = {};
   for (const rd of programState.runDays ?? []) {
     if (rd.userOverride && (rd.type === "run" || rd.type === "both")) {
       overrideSnapshot[rd.dayIndex] = rd.userOverride;
     }
   }
   // ... generator runs ...
   runDays = runDays.map((rd) => {
     const preserved = overrideSnapshot[rd.dayIndex];
     return preserved ? { ...rd, userOverride: preserved, templateId: preserved } : rd;
   });
   ```
   Drops orphan overrides (where the day became rest); preserves where the day still has a run/both slot.

4. **Pending status line during mode changes.** Reuse the existing `modeError` slot in `ProgrammeRunSection.tsx`:
   ```tsx
   {modeChangePending ? (
     <p className="text-xs text-muted-foreground">Updating your plan…</p>
   ) : modeError ? (
     <p className="text-xs" style={{ color: THEME.running }} role="alert">{modeError}</p>
   ) : null}
   ```

### Tests

- Pin "this week" filter via `weekKey === currentWeekKey` exact-match.
- Pin override-preservation round-trip in `useProgramWriters.test.ts`: pre-populate `runDays` with a `userOverride`, fire `refreshRunSchedule`, assert the written runDay still carries it.
- Snapshot the next-run label derivation across todayKey / tomorrowKey / past-date / future-week cases.

---

## PR-D — Race state-machine writers

The structural foundation. Closes the "paper states" gap that PR-0a → PR-0b-iii left behind.

### Scope

1. **Auto-transition effect in `useProgram` load path.** When `programState` resolves, walk `runDays[]` for an entry matching `date === programState.runPlan.raceGoal.targetDate`. If found and `status === "planned"` and `(today - date) >= 3 days` → write `status: "race_no_show"` via `saveProgram`. Idempotent (subsequent runs find non-planned status and skip).

2. **Make `race_no_show` recoverable.** In `programTypes.ts:LEGAL_TRANSITIONS`:
   ```diff
   - race_no_show: [],
   + race_no_show: ["completed_exact", "completed_modified", "completed_late"],
   ```
   In `scheduledRunStatus.ts:TERMINAL_STATUSES`:
   ```diff
   - "race_no_show",
   ```
   `race_no_show` becomes a "soft terminal" status — recoverable via the existing reconciliation flow.

3. **Extend `completeRunDay` to accept `savedRunId`.** Signature becomes:
   ```ts
   completeRunDay(idOrDayIndex: string | number, savedRunId?: string)
   ```
   When `savedRunId` present, write `linkedRunId: savedRunId` alongside the status transition. Callers:
   - `RunSummary.tsx` post-save (line ~681) — has savedRunId, plumb it through
   - `RunSummary.tsx` reconciliation "Mark scheduled run complete" (line ~865) — same
   - `DayActionSheet.tsx` "Mark complete (manual)" — no savedRunId, omit the second arg

4. **Recovery-phase entry coupled to completion.** Inside `completeRunDay`, when the transition is `planned → completed_*` AND the target runDay is the race day (i.e. `date === raceGoal.targetDate`) AND the user's mode is `race_prep`, also write:
   ```ts
   runPlan.phase: "recovery"
   runPlan.recoveryEndDate: <distance-scaled>
   ```
   See PR-E for the duration table.

5. **Drop `race_completed_unlinked`.** Remove from `ScheduledRunStatus` enum, `LEGAL_TRANSITIONS`, `scheduledRunStatus.ts` helpers (`isScheduledRunReconciliation` returns `false` always — or delete the helper). Clean dead branches in:
   - `src/components/program/ProgrammeRunSection.tsx`
   - `src/components/program/DayActionSheet.tsx`
   - `src/components/home/DayPeekCard.tsx`
   - `src/lib/trainingResolver.ts` (the `isReconciliation` field in `ResolvedRun`)

6. **Keep `linkedRunId` on the type.** Reserve for future navigation hook (e.g. "tap a completed race in History → jump to RunSummary view"). No consumer yet.

### Tests

- Auto-transition: pre-populate `programState` with a race-day runDay where `date` is 4 days ago and `status: "planned"`. Render hook. Assert `setDoc` was called with that runDay's status updated to `race_no_show`.
- Recoverability: starting from a `race_no_show` runDay, call `completeRunDay(id, savedRunId)`. Assert the transition succeeds and `linkedRunId` is set.
- Idempotency: run the load effect twice. Assert the second pass writes nothing.
- Coupling: when `completeRunDay` transitions a race-day runDay, assert `runPlan.phase === "recovery"` and `recoveryEndDate` is set.

---

## PR-E — Recovery phase

Builds on PR-D's writers. Adds the actual phase semantics.

### Scope

1. **Phase storage.** Add to `RunPlan` type in `programTypes.ts`:
   ```ts
   interface RunPlan {
     mode: "structured" | "race_prep";
     raceGoal?: { distance: RaceDistance; targetDate: string };
     totalWeeks?: number;
     currentWeek?: number;
     compressed?: boolean;
     phase?: "recovery";              // NEW
     recoveryEndDate?: string;        // NEW — "YYYY-MM-DD"
   }
   ```

2. **Duration table.** Helper in `runScheduler.ts`:
   ```ts
   export function recoveryWeeksForDistance(distance: RaceDistance): number {
     switch (distance) {
       case "5k": return 1;
       case "10k": return 2;
       case "half": return 3;
       case "marathon": return 4;
     }
   }
   ```

3. **Recovery template generator.** Add a branch in `refreshRunSchedule` (or a new `scheduleRecoveryWeekV2`):
   ```ts
   if (runPlan.phase === "recovery") {
     // emit all easy_30 entries on the same weekly slots as the user's
     // weekSchedule, frequency unchanged
   }
   ```
   `runMode` stays `race_prep` during recovery (don't flip to structured). The phase distinguishes "in recovery" from "out of recovery" while preserving the user's original mode for re-entry semantics.

4. **Recovery exit logic in the load effect.** When `today >= recoveryEndDate`, the next render shows the "Recovery ended — what's next?" card variant (PR-C). One-week grace beyond `recoveryEndDate` before silent auto-promotion: at `today >= recoveryEndDate + 7 days`, clear `phase` and `recoveryEndDate`, leaving `runMode` as the user's pre-race value (which is still `race_prep` — but if the user wants to leave race_prep they pick a different mode via the chip row).

### Tests

- Phase entry: complete a 10K race runDay → assert `phase === "recovery"` and `recoveryEndDate === raceGoal.targetDate + 14 days`.
- Template emission: with `phase === "recovery"` and a 4-run-day weekSchedule, assert generated runDays all have `templateId === "easy_30"`.
- Phase exit: setting `today` past `recoveryEndDate` triggers the card variant change. At `+7d`, auto-promote (phase cleared).
- Distance scaling: assert 5K=7d, 10K=14d, half=21d, marathon=28d.

---

## PR-C — Post-race card UX

UI wrap. Depends on PR-D + PR-E writers.

### Scope

Replace the current "Race day has passed" muted banner (`ProgrammeRunSection.tsx:626-642`) with a state-driven card. Four variants:

**Variant 1: Completed → In recovery**
Trigger: race-day runDay status is `completed_*` AND `runPlan.phase === "recovery"`.

```
✓  10K — Saturday 14 Sep
   Race complete. Recovering for the next 2 weeks.
   Templates this week are all easy.

   [ Skip recovery early →  ]              (small link)
   [ View race-day run →    ]              (small link, only if linkedRunId)
```

**Variant 2: Mid-recovery**
Trigger: `runPlan.phase === "recovery"` AND today between race date + 1 and `recoveryEndDate`.

```
   Recovering — 12 days left.
   Easy runs this week.

   [ Skip recovery early →  ]              (small link)
```

**Variant 3: Recovery ended → choose next**
Trigger: `runPlan.phase === "recovery"` AND `today >= recoveryEndDate` AND `today < recoveryEndDate + 7 days`.

```
   Recovery complete.
   What's next?

   [ Set next race                ]
   [ Switch to structured running ]
```

**Variant 4: No-show**
Trigger: race-day runDay status is `race_no_show`.

```
?  10K — Saturday 14 Sep
   We marked this as no-show after three days with no log.
   Log it now if you actually ran.

   [ Log race now                  ]   ← primary, coral
   [ Set next race                 ]
   [ Switch to structured running  ]
```

### Behaviour

- All "Set next race" buttons open the existing inline race-goal form (already in `ProgrammeRunSection.tsx`).
- "Switch to structured running" calls existing `handleModeChange("structured")`.
- "Log race now" navigates to `/run?scheduledRunId=<race-runDay.id>` — uses the existing URL-pinning flow, which PR-D's extended `completeRunDay` will then write `linkedRunId` on completion.
- "View race-day run" — needs a `linkedRunId` value to navigate; route is `/run/{linkedRunId}` per the existing run detail pattern.
- "Skip recovery early" sets `runPlan.phase` undefined, clears `recoveryEndDate`, triggers a `refreshRunSchedule` to regenerate normal structured templates.
- In-card explanation copy directly under the headline — no separate toast.

### Tests

- Each variant renders the right set of buttons given the corresponding state.
- "Log race now" link includes `?scheduledRunId=<id>`.
- "Skip recovery early" clears `phase` and `recoveryEndDate` in the next setDoc call.
- The auto-transition wrote `phase: "recovery"` IS reflected in Variant 1 immediately on next render.

---

## PR-G — Auto week rollover

Independent of post-race work. Closes the "structured / race-prep runDays never rotate" gap.

### Scope

1. **Load-effect detection.** In `useProgram`'s load path, after `programState` resolves:
   ```ts
   const detectStaleWeek = (state: ProgramState): boolean => {
     const currentWeekKey = localWeekKey();
     const lastKnownWeekKey = state.runDays?.[0]?.weekKey ?? state.weekHistory?.[0]?.weekKey;
     return !!lastKnownWeekKey && lastKnownWeekKey < currentWeekKey;
   };

   let rolling = programState;
   let iterations = 0;
   while (detectStaleWeek(rolling) && iterations < 12) {
     rolling = advanceWeek(rolling);
     iterations++;
   }
   if (iterations > 0) {
     await saveProgram(rolling);
     toast.success(`Week advanced — ${iterations} week${iterations > 1 ? "s" : ""}`);
   }
   ```
   12-iteration cap prevents runaway in pathological cases (user opens app after 3+ months).

2. **Keep the Lift-tab "Advance to Next Week" button** as the "advance early" escape hatch. User who finished all this week's lifts on Wednesday can still tap it to roll forward immediately.

3. **Race progress strip auto-advancement.** With B-loop rolling weekly, `currentWeek` ticks up automatically. The race progress strip ("Week 3 / 8 · Build") stays current without any manual action. Once `currentWeek >= totalWeeks`, the race-day check (PR-D) fires and the post-race card takes over.

### Tests

- Stale-week detection: programState with `runDays[0].weekKey` set to 2 weeks ago. Render hook. Assert `advanceWeek` ran twice and `saveProgram` wrote the result.
- Iteration cap: programState with `weekKey` 14 weeks ago. Assert iterations capped at 12.
- No-op when current: `weekKey === localWeekKey()`. Assert no setDoc, no toast.
- Manual button still works: tap "Advance to Next Week" on the Lift tab → fires `advanceToNextWeek()` directly, bypasses the calendar gate.

### Trade-off honestly noted

A planned-but-never-done Saturday run gets archived in `weekHistory` as `status: "planned"` on the Monday rollover. That's intentional — honest record of "we didn't do this." If the user later logs the run with the Saturday date, the saved run is independent of the archived runDay; the runDay status remains `planned` in history. Acceptable for v1; could be improved by writing `status: "skipped"` (auto) on rollover for non-race past-planned runs, but that's an opinionated take we're deferring.

---

## PR-L — Server-side reconciliation (Apple Watch precondition)

Hard prerequisite for the near-term Apple Watch sequence. WatchOS apps can't run our React/TS reconciliation logic — they hit endpoints — so when Watch lands, state must be server-authoritative or the two clients will drift.

Ports the three pieces of shipped client-side reconciliation (PR-D, PR-E, PR-J) into Cloud Functions. Removes the `useEffect`-driven write path from `useProgram`; the hook becomes a pure Firestore reader + UI dispatcher.

### Scope

1. **Race no-show trigger** — new scheduled Cloud Function (daily, ~04:00 UTC). Iterates users where `programState.raceDate` is within the last 3 days and no run matching `raceTarget` distance was logged within ±2 days. Writes the no-show transition. Pattern matches existing `weeklyPerformanceRollup` user iteration.

2. **Recovery entry trigger** — extend existing `onRunCreated` Firestore trigger. When a saved run's distance matches the user's `programState.raceTarget` (within tolerance) and the run date is within ±2 days of `raceDate`, write `programState.recovery = { startDate, endDate }` using `recoveryWeeksForDistance` from PR-E.

3. **Recovery exit trigger** — fold into the same daily scheduled function as #1. When `recovery.endDate < now`, clear the recovery block.

4. **Fell-behind detection** — new scheduled Cloud Function (weekly, Mondays ~05:00 UTC, after performance rollup). Per-user evaluation of prior week's `weekHistory` entry: if `<50%` of prescribed runs have matching saved runs, set a `programState.pendingFellBehindPrompt` flag. Client renders the bottom sheet (PR-J) when it sees the flag on next app open and clears it on user choice.

5. **Remove client-side reconciliation** from `useProgram.ts`. Delete the reconciliation `useEffect` that today wraps race-no-show / recovery / fell-behind logic. The Q11a-A deep-equal guard (stopgap) also goes — there's no client write to guard.

### Tests

- Cloud Function unit tests for each new trigger (firebase-functions-test harness; already used by `weeklyPerformanceRollup`).
- Race no-show: fixture user with `raceDate = today - 1d`, no matching run → assert no-show write. Same user with a matching run → assert no write.
- Recovery entry via `onRunCreated`: fixture run matching `raceTarget` → assert recovery block written with correct end date. Non-matching distance → no write.
- Recovery exit: fixture user with `recovery.endDate < now` → assert cleared. With `endDate > now` → no change.
- Fell-behind: fixture week with 1/4 prescribed runs matched → assert flag set. 3/4 matched → no flag.
- Client: `useProgram` no longer calls `setDoc` from the reconciliation path. Render hook with stale state, assert it surfaces the state but does not mutate it.

### Migration

Existing users with client-side-reconciled state stay correct (state in Firestore is the same shape). New server triggers take over forward. No backfill needed — the next time each user's race/recovery/week-end event fires, the server reconciles.

### Trade-offs honestly noted

- **Latency.** Recovery hero pops in 3-10s after race completion on cold Function start vs <1s today. Acceptable — recovery is a multi-day state, not a moment.
- **Offline.** Run logged offline → queued via `offlineQueue.ts` → triggers fire when sync completes. User sees stale state until reconnect. Acceptable — recovery state isn't time-critical at the second-by-second level.
- **`functions/` is plain CommonJS JS.** Reconciliation logic loses TS type-safety on the server side. We extract shared constants (`recoveryWeeksForDistance` durations, `raceTarget` distance map) into a plain-JS module imported by both client (via build-time copy or shared package) and functions, to avoid drift.

### Sequencing

Ships before any Apple Watch work begins. Should sequence after PR-K (Q25 taper, small) and after PR-J ships its client-side version (we port the matured logic, not the in-flight one).

---

## Decision log

22 decisions from the /grill-me session that produced this plan. Captured so we don't re-litigate.

| # | Decision | Pick |
|---|---|---|
| 3 | Where auto-transition lives | Client-side effect in useProgram load |
| 4 | Is `race_no_show` recoverable? | Yes (α) — add transition arrows, remove from terminal |
| 5 | Grace period before auto-transition | 3 days |
| 6 | Scope of auto-transition | Narrow — race-day slot only, by date match |
| 7 | Keep `race_completed_unlinked`? | Drop entirely |
| 8 | Keep `linkedRunId`? | Yes — future navigation hook |
| 9 | How to write `linkedRunId` | Extend `completeRunDay(idOrDayIndex, savedRunId?)` |
| 10 | Notify user when auto-transition fires? | In-card explanation, no toast |
| 11 | Post-race card shape | Two-button card + optional secondary link |
| 12 | Edit race goal mid-plan | Split by edit type: date preserves currentWeek, distance resets |
| 14 | Recovery: 4th runMode or phase? | Phase only (B) |
| 15 | Recovery templates | All easy_30, frequency unchanged |
| 16 | Recovery end behaviour | Prompt via card (C) |
| 17 | Recovery entry trigger | Auto-enter on completion only (not no-show) |
| 18 | `useRunningStats` window | Keep 30 days, fix labelling bug |
| 19 | Next-planned-run label | Today / Tomorrow / Pending detection |
| 20 | `userOverride` across schedule refresh | Preserve where day still exists |
| 21 | Chip pending state UX | Status line in existing error slot |
| 22 | Week rollover | B-loop auto, manual button kept as escape hatch |
| 23 | Soft-link reframe (race-day reconciliation) | Drop user-facing linkage; derive completion at render time; race-no-show + recovery triggers stay (PR-J) |
| 24 | Fell-behind handling | E + (ii) — bottom sheet on next app open after a week where <50% of prescribed runs have saved-run matches. Three choices: shift plan back 1 week / compress remaining weeks / skip-and-continue. Coalesced (one sheet per low-completion week, not per missed run). Matches NRC's adaptive-plan pattern. |
| 25 | Race-week taper | A/B/A/B. **Q9a (trace):** taper already exists in `runScheduler.ts:130` (`getPhaseForWeek`) and applies in both v1 + v2 generators — long run becomes `easy_30`, one quality session retained (`8x400`), rest easy. **Q9b (duration):** current 25%-of-plan rule mis-scales — a full-length 5K plan gets 2 weeks taper (too much), marathon gets 4 weeks (fine). Replace with distance-aware cap: 5K/10K = 1w, half = 2w, marathon = 3w. Hard cap, taper phase begins `totalWeeks - taperWeeks` regardless of pct. **Q9c (shape):** volume-only — current code already matches (long run dropped, one short quality kept for sharpness). No change needed. **Q9d (surfacing):** add "TAPER WEEK · race in X days" section label on the race_prep operational hero when current week is in taper phase. New work — doesn't exist today. Sequenced as PR-K. |
| 10 | Recovery duration values (`recoveryWeeksForDistance`) | A/A/A. **Q10a (values):** lock 5K=1w / 10K=2w / half=3w / marathon=4w as shipped in PR-E. Within reference-app bell curve (Hal Higdon's marathon reverse-taper = 4w matches; Strava plans ~1w/2-3w/4w roughly matches). No telemetry to justify deviating. **Q10b (personalisation):** distance only — don't condition on experience or race-effort. Experience inference is fragile (new users may have years of unlogged training), race-effort needs estimation we don't have. Revisit with telemetry. **Q10c (surfacing):** keep current "Recovery week N of M" — explicit > vague date. Users in recovery are training-aware. No new work; existing PR-E values stand. Revisit in 6 months with churn data on race_prep users. |
| 11 | `useProgram` reconciliation cost & race conditions | **Q11a → C** (server-side reconciliation), sequenced as **PR-L** before Apple Watch sequence. Watch is near-term; WatchOS can't run our React/TS reconciliation, so server-authoritative state is unavoidable. C dissolves Q11b (no client writes → no multi-tab clobber) and Q11c (no client reconciliation → no cold-start race). **Stopgap:** ship Q11a-A (deep-equal guard on the existing `useEffect`) in the interim — ~1hr work, prevents the recursion bug from biting production while PR-L is built. Removed in PR-L when the `useEffect` itself is deleted. |
| 12 | Apple Watch data model & sync surface | **Q12a → B+water** (run logging + water logging at launch; lift logging deferred). Water already lives on the Home screen as a glanceable action — extending it to the Watch is trivial and high-value for a fitness wearable. Lift logging is hard on a small screen and lower priority; revisit when run-logging is proven. **Q12b → A** (direct Watch → Firestore via the Watch's own Firebase SDK, signed in via shared keychain). iPhone relay (B) is fatal for phone-free runs — defeats the whole point of Watch cellular. WatchConnectivity is also notoriously flaky. **Q12c → A** (Watch GPS authoritative when paired; iPhone fallback when Watch absent). Modern Watch GPS is purpose-built and comparable to phone GPS. Merge-server-side (C) is over-engineered for v1. **Impact on PR-L:** server-side reconciliation must remain client-agnostic — no client-version checks, no "writes only from React app" assumptions. Already true in PR-L's design but pinned explicitly here. |
| 13 | Apple Watch architecture & onboarding | **Q13a → B** (narrow shared Swift package). Capacitor doesn't support watchOS, so a native SwiftUI WatchKit target is forced. A (standalone, no sharing) risks drift on shared primitives — if marathon recovery duration changes in TS but not Swift, Watch shows a different end date than iPhone. C (thin-client, all logic server-side) is structurally impossible for real-time GPS. B keeps the shared surface narrow: pace formulas, `recoveryWeeksForDistance`, race distance enum, runMode enum, scheduled run status enum. Established as a `tropos-shared` Swift Package, ~1 day porting cost, then CI-enforced parity. Pieces excluded: nutrition, social, performance engine, charts. **Q13b → C** (both Apple-standard install + in-app prompt). A alone is too passive — many users never browse the Watch app list. B alone misses users who installed iOS before Watch shipped. C costs an extra dismissible Home card, gated on `WCSession.isPaired`. **Q13c → A** (shared keychain auto-sign-in). Tropos isn't security-sensitive enough to justify B's friction; C creates "why can I see but not start?" confusion. Implementation: App Group capability on both targets, write Firebase ID + refresh tokens to shared keychain on iPhone sign-in, read on Watch first launch. Firebase watchOS SDK supports custom auth since watchOS 7. **Implicit:** Watch starts runs independently of iPhone — no proximity check, full run lifecycle local (GPS, splits, pace cues, save). Matches Strava / NRC / Garmin. |

(Q1, Q2, Q13 dissolved into later decisions — Q1 led into the state-machine investigation, Q2 became the PR-D / PR-E split, Q13 ("rename Switch to recovery") became Q14 ("what is recovery?").)

---

## What's NOT in scope here

- **The earlier deferred "hybrid week-advancement" debate (atomic vs lift-only).** Dissolves under B-loop auto-rollover — the loop is calendar-driven, not completion-driven, so the gate question becomes moot. The Lift-tab manual button keeps the runMode-aware atomic semantics for users who want to advance early.
- **Future navigation hook for `linkedRunId`** ("tap completed race in History → jump to RunSummary view"). Field reserved by PR-D; consumer UI deferred until a real use case lands.
- **Coach analytics on no-show rates / completion rates.** Would require a Cloud Function instead of the client effect; defer until product asks for it.
- **`recovery` as a user-selectable runMode for ad-hoc recovery** (injury, overreach, life stress). Q14 rejected this; if real demand emerges later, promoting phase → mode is the path.
- **Distance-scaled recovery template variation** (e.g. one short long run mid-recovery). Q15 picked "all easy" for v1; the duration scaling alone covers the marathon-vs-5K distinction adequately.
