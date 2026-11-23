import { liftDayNameIn } from "@/lib/liftDayLabel";
import { plannedIntervalPaceSPerKm, withPlannedRest } from "@/lib/intervalRest";
import RunPlanPurpose from "@/components/run/RunPlanPurpose";
import LiftPurpose from "@/components/program/LiftPurpose";
/**
 * One day's training to manage: the run (and on Home the lift), why it is
 * in the week, and what can be done to it. Drawn in two places:
 *
 *   - `DayActionSheet`, Home's day sheet, opened from DayPeekCard's
 *     "Manage day": the whole day, run and lift. Home stays
 *     glance-first; the sheet handles the editing.
 *   - A run's own page (`/program/run/:date`, TrainWk1 call 2), opened
 *     from the ⋯ on Train's run card: the run alone.
 *   - (The lift's own page carries a lift's skip, with SkipConfirmSheet;
 *     this does not compete with that flow.)
 *
 * These are the only path to manual completion, a run's skip and a day's
 * restore outside Settings's retake-onboarding flow.
 *
 * Status-aware rules (PR-0b-iii):
 *   - planned                       → template swap + Skip + Mark complete
 *   - skipped / race_no_show        → locked badge + Restore action
 *                                     (SESSION-RESTORE-01: a skip is reversible)
 *   - completed_*                   → locked badge, no actions
 *   - race_completed_unlinked       → passive copy, no actions
 *
 * It resolves the day via the shared trainingResolver
 * (PR-0c) so it agrees with Home's WeekStrip + DayPeekCard about
 * what's training for the given date.
 */

import { useMemo, useRef, useState } from "react";
import SectionLabel from "@/components/ui/SectionLabel";
import MetaLine from "@/components/ui/MetaLine";
import Select from "@/components/ui/Select";
import {
  Footprints,
  Dumbbell,
  Check,
  X,
  TriangleAlert,
  RotateCcw,
  CalendarDays,
} from "lucide-react";
import { THEME } from "@/lib/theme";
import { cn } from "@/lib/utils";
import {
  RUN_TEMPLATES,
  isRunWalkTemplateId,
  isScheduledRaceRunDay,
} from "@/lib/workoutTemplates";
import {
  isRecoveryRunDay,
  runSessionPresentation,
  weekHoldsQuality,
} from "@/lib/runSessionExplainer";
import { runSessionAbout, runSessionName } from "@/lib/runSessionAbout";
import { racePaceWorkFor } from "@/lib/racePace";
import { sessionFuelingLine } from "@/lib/fueling";
import { runTemplateName, sessionPaceDisplay } from "@/lib/runLabels";
import { useDistanceUnit } from "@/hooks/useDistanceUnit";
import {
  planningEasyPaceSPerKm,
  prescriptivePaceTableFromFitness,
  resolveSessionPaces,
  raceDistanceKeyFromKm,
} from "@/lib/runPaces";
import { runDoseLine } from "@/lib/runDose";
import { targetZoneForRun, maxHrFromAge, zoneMetaItems } from "@/lib/hrZones";
import { profileAge } from "@/lib/age";
import { formatShortWeekdayDayMonth } from "@/utils/formatters";
import {
  parseLocalDate,
  localWeekKey,
  localDateString,
} from "@/lib/dateHelpers";
import { resolveRunMoveOptions } from "@/lib/runReschedule";
import {
  resolveTrainingDayForDate,
  type ResolvedLift,
} from "@/lib/trainingResolver";
import { hasHybridInterference } from "@/lib/runProgrammeViewModel";
import {
  getCompletionKind,
  type ClaimState,
} from "@/lib/scheduledRunCompletion";
import type { SavedRunDoc } from "@/lib/runClaims";
import type { UserProfile } from "@/lib/auth";
import type { RollingSessionContext } from "@/features/program/rollingWeeksAhead";
import type { ProgramState } from "@/features/program/programTypes";
import type { ProgramOutcome } from "@/features/program/programOutcome";
import { Collapse } from "@/components/ui/Collapse";
import { IconButton } from "@/components/ui/IconButton";
import { goalDayName } from "@/lib/raceGoalEntry";

export interface DayActionContentProps {
  /** Called once an action has landed, and by the close button: the sheet
   *  closes, a run's page goes back to Train. */
  onClose: () => void;
  /** The sheet's own close button. A page has its way back in its header. */
  showClose?: boolean;
  /** Local "YYYY-MM-DD" of the day being managed. */
  dateKey: string;
  profile: UserProfile | null;
  programState: ProgramState | null;
  /** PR-J Q3 chunk B3d — derived completion source of truth.
   *  Forwarded to the shared `resolveTrainingDayForDate` call so
   *  the sheet's "Completed" badge tracks manual / saved-run-claim
   *  / legacy completions uniformly. Wired via `useClaimMapForProgram` in
   *  the parent (ProgrammeRunSection). Closes the last resolver
   *  back-compat fallback B3c left open. */
  claimMap: Map<string, ClaimState>;
  /** PR-J Q5 chunk B3f — unclaimed-runs selector. Used to detect
   *  the same-date paradox (P74): when a planned slot remains
   *  unclaimed but a saved run for the same date IS present as an
   *  extra (distance-fail or bucket-fail), surface a contextual
   *  hint above the Mark complete button so the user can resolve
   *  the friction with one tap. Wired via `useClaimMapForProgram` in the
   *  parent. */
  unclaimedByDate: Map<string, SavedRunDoc[]>;
  overrideRunDay: (idOrDayIndex: string | number, templateId: string) => void;
  /** PR-J Q2 chunk B2: replaces the deleted completeRunDay.
   *  Writes to programState.manualCompletions[runDayId]; derivation
   *  surfaces ✅ via the claim map (Q2 P27). */
  markManualComplete: (runDayId: string) => Promise<ProgramOutcome>;
  skipRunDay: (idOrDayIndex: string | number) => Promise<ProgramOutcome>;
  skipWorkoutDay: (dayIndex: number) => Promise<ProgramOutcome>;
  /** SESSION-RESTORE-01: reverse a skip. Restores a skipped /
   *  race_no_show run slot (restoreRunDay) or a skipped lift day
   *  (restoreWorkoutDay) back to `planned` — a status reversal only,
   *  never a completion. */
  restoreRunDay: (idOrDayIndex: string | number) => Promise<ProgramOutcome>;
  restoreWorkoutDay: (dayIndex: number) => Promise<ProgramOutcome>;
  /** RUN-RESCHEDULE-01: one-off move of a planned run to another day
   *  within its week. Preserves identity; only date/dayIndex change. */
  moveRunDay: (
    idOrDayIndex: string | number,
    targetDayIndex: number
  ) => Promise<ProgramOutcome>;
  /** Which blocks to surface.
   *
   *  - "day" (default) — the whole-day manager: run + lift blocks. Used by
   *    Home, which is the sport-agnostic daily glance, so "manage Monday"
   *    legitimately means "manage everything on Monday".
   *  - "run" — run block only. A run's own page: its `…` lives on a run card
   *    inside Train's run-scoped surface, so handing back a lift block would
   *    break that partition (and the lift has its own page with richer
   *    management). Lift skipping from a run was never the job of this
   *    affordance. */
  scope?: "day" | "run";
  /** The day's lift, as Home's week lays it out (`manageLiftOn`): the one
   *  the day card names, so Skip skips the session Home shows there, and a
   *  passed day's skipped lift can be restored there. Absent reads as no
   *  lift: a sheet scoped to the run shows none. */
  lift?: ResolvedLift;
  /** A plan with no race date's weeks, by their Mondays
   *  (`useRollingSessionContexts`, Run24 (3)): a run's reason in the plan's
   *  terms. Home and Train pass them; without them such a run has none. */
  rollingContexts?: ReadonlyMap<string, RollingSessionContext> | null;
}

const NO_LIFT: ResolvedLift = {
  index: null,
  workout: null,
  status: "none",
  isTerminal: false,
  isStartable: false,
};

export default function DayActionContent({
  onClose,
  showClose = false,
  dateKey,
  profile,
  programState,
  claimMap,
  unclaimedByDate,
  overrideRunDay,
  markManualComplete,
  skipRunDay,
  skipWorkoutDay,
  restoreRunDay,
  restoreWorkoutDay,
  moveRunDay,
  scope = "day",
  lift = NO_LIFT,
  rollingContexts = null,
}: DayActionContentProps) {
  const unit = useDistanceUnit();
  // RUN-RESCHEDULE-01: reveal the destination-day picker inline.
  const [showMovePicker, setShowMovePicker] = useState(false);
  /* One action at a time, and each once: its buttons are disabled while
     its command is on its way, so a second tap cannot run it again or,
     on a run's page, go back twice and past Train. The ref holds it
     between two taps that land before the disabled state draws. */
  const acting = useRef(false);
  const [pending, setPending] = useState(false);
  const act = async (command: () => Promise<unknown>) => {
    if (acting.current) return;
    acting.current = true;
    setPending(true);
    try {
      await command();
      onClose();
    } finally {
      acting.current = false;
      setPending(false);
    }
  };
  // The resolver is the single source of truth for what training
  // exists on this date. Same call Home and Programme Today make
  // (PR-0c), so the sheet inherits the date/weekKey-aware runDay
  // matching, the lift-index mapping, and the status-aware flags.
  const resolved = useMemo(() => {
    return resolveTrainingDayForDate({
      dateKey,
      profile,
      programState,
      currentWeekKey: localWeekKey(new Date()),
      claimMap,
    });
  }, [dateKey, profile, programState, claimMap]);

  const dayLabel = useMemo(
    () => formatShortWeekdayDayMonth(parseLocalDate(dateKey)),
    [dateKey]
  );

  // Q5 P74 same-date paradox (chunk B3f). When a saved run exists
  // for THIS date but didn't claim a planned slot (distance-fail or
  // quality-bucket-fail), the run sits in `unclaimedByDate` keyed
  // by its date. Surface a contextual hint so the user can resolve
  // by marking the slot manually. Race day is excluded at the
  // render site (Q1 P4 / Q2 P21 — race-day completion is real-
  // saved-run-only).
  const hasSameDateExtra = useMemo(() => {
    const extras = unclaimedByDate.get(dateKey);
    return !!extras && extras.length > 0;
  }, [dateKey, unclaimedByDate]);

  const { run } = resolved;
  const hasLift = lift.workout !== null && lift.index !== null;
  const hasRun = run.runDay !== null;
  // Run-scoped invocations (Programme Run tab) never surface the lift block —
  // see the `scope` prop doc. Home keeps the full whole-day view.
  const showLift = scope === "day" && hasLift;
  const selectedRunTemplate = run.runDay
    ? RUN_TEMPLATES.find(
        (t) => t.id === (run.runDay?.userOverride || run.runDay?.templateId)
      )
    : null;
  // Run21 (2): a long run that finishes at race pace says so, by the
  // launch's own gate.
  const selectedRacePace = racePaceWorkFor(
    selectedRunTemplate,
    profile,
    programState?.runPlan
  );
  // Adaptive Paces: the user's personalised pace for this session, appended to
  // the meta pill (e.g. "10km · 5:25–5:45 /km"). Band-first via the shared
  // sessionPaceDisplay rule (the range is the honest coaching target; singles
  // only for race pace). Null when there's no benchmark, and for run-walk,
  // which is run by feel (Run20 (5)).
  const selectedRunPace: string | null = (() => {
    if (!selectedRunTemplate || isRunWalkTemplateId(selectedRunTemplate.id))
      return null;
    // A2: a tempo at the goal pace shows that pace, the one the run will
    // set, with or without a benchmark.
    if (selectedRacePace?.kind === "tempo") {
      return sessionPaceDisplay(
        { targetPace: Math.round(selectedRacePace.goalPaceS) },
        unit
      );
    }
    const table = prescriptivePaceTableFromFitness(profile?.runFitness ?? null);
    if (!table) return null;
    return sessionPaceDisplay(
      resolveSessionPaces(selectedRunTemplate.type, table, {
        raceDistanceKey: raceDistanceKeyFromKm(
          selectedRunTemplate.config.targetDistanceKm
        ),
      }),
      unit
    );
  })();
  const selectedRunMeta = selectedRunTemplate
    ? [
        // Run21 (5): a long run's minutes at the runner's own pace.
        runDoseLine(
          selectedRunTemplate,
          planningEasyPaceSPerKm(profile?.runFitness),
          plannedIntervalPaceSPerKm(profile?.runFitness)
        ),
        ...(selectedRunPace ? [selectedRunPace] : []),
      ].join(" · ")
    : null;
  // Target HR zone — the HR analogue of the pace target ("run easy in Zone 2").
  // Uses the measured max HR, else the age estimate; null when neither exists
  // (then we just don't show the pill — the pace pill still stands alone).
  const selectedRunHr: string[] = (() => {
    if (!selectedRunTemplate) return [];
    const maxHr =
      profile?.maxHeartRate ?? maxHrFromAge(profileAge(profile) ?? 0);
    const band = targetZoneForRun(
      selectedRunTemplate.type,
      maxHr,
      selectedRunTemplate.config.targetDistanceKm
    );
    return band ? zoneMetaItems(band) : [];
  })();
  // WAVE1-EXPLAIN (roadmap A5): one honest "why this session" sentence,
  // derived from the plan's REAL phase — null for freeform/extras, and the
  // line simply doesn't render.
  const selectedRunWhy: string | null = (() => {
    if (!selectedRunTemplate || !run.runDay) return null;
    const rp = programState?.runPlan;
    return runSessionPresentation({
      type: selectedRunTemplate.type,
      templateId: selectedRunTemplate.id,
      currentWeek: rp?.currentWeek,
      totalWeeks: rp?.totalWeeks,
      shortBase: rp?.shortBase,
      distance: rp?.raceGoal?.distance ?? profile?.raceGoal?.distance,
      weekHasQuality: weekHoldsQuality(
        programState?.runDays,
        run.runDay.weekKey
      ),
      racePace: selectedRacePace?.kind,
      inRecovery: isRecoveryRunDay(rp, run.runDay.date),
      rolling: run.runDay.weekKey
        ? rollingContexts?.get(run.runDay.weekKey)
        : null,
    }).purpose;
  })();
  // Race-day detection by TEMPLATE TYPE, not by `templateId === "race"`.
  // Race templates have ids like `5k_race` / `marathon_race` (never the
  // literal "race"), so the old string-equality check was always false —
  // the DNF/DNS variant never rendered and manual-complete was never
  // suppressed on real race days. Resolving the template and reading its
  // `type` is the correct, id-agnostic gate (Q1 P4 / Q2 P21).
  //
  // RUN-RACE-GUARD-01: prefer the day's IMMUTABLE race identity
  // (`runDay.type === "race"`) over the currently-resolved template.
  // Otherwise a race overridden to an easy template stops reading as a
  // race — which re-enabled the swap and un-hid Mark complete, letting
  // the race be silently erased. The writers refuse the same, so this
  // is defence-in-depth that also keeps the correct race UI showing.
  const isRaceTemplate =
    (!!run.runDay && isScheduledRaceRunDay(run.runDay)) ||
    selectedRunTemplate?.type === "race";

  /* Hybrid interference heads-up (runScheduler's "UI can flag it" note,
     finally wired). Quality run + lift on one day → one calm line; only
     on the full-day sheet (the run-scoped sheet has no lift context). */
  const interference =
    scope === "day" &&
    hasHybridInterference({
      hasLift,
      runType: selectedRunTemplate?.type ?? null,
    });

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <SectionLabel>
            {scope === "run" ? "Manage run" : "Manage day"}
          </SectionLabel>
          <p className="text-base font-semibold text-foreground mt-0.5">
            {dayLabel}
          </p>
        </div>
        {showClose && (
          <IconButton
            onClick={onClose}
            aria-label="Close"
            icon={<X />}
            className="-m-1.5 text-muted-foreground"
          />
        )}
      </div>

      {/* Empty state — nothing to manage in this scope. */}
      {(scope === "run" ? !hasRun : !showLift && !hasRun) && (
        <p className="text-sm text-muted-foreground py-4 text-center">
          {scope === "run"
            ? "No run scheduled for this day."
            : "Nothing scheduled for this day."}
        </p>
      )}

      {/* Hybrid interference heads-up — quality run + lift share this
          day (the scheduler avoids it when it can; when it can't, flag
          it calmly). Warning register per the design rules, one line,
          no action required. */}
      {interference && (
        <p className="flex items-start gap-2 text-xs text-warning-strong leading-relaxed px-1">
          <TriangleAlert
            className="size-3.5 mt-0.5 shrink-0"
            aria-hidden="true"
          />
          Quality run and a lift share this day — if recovery’s tight, go easier
          on one of them.
        </p>
      )}

      {/* Run section */}
      {hasRun && run.runDay && (
        <section
          aria-label="Run actions"
          className="rounded-2xl p-4 space-y-4 shadow-sm"
          style={{
            background: `linear-gradient(135deg, ${THEME.running}12, ${THEME.running}06)`,
            border: `1px solid ${THEME.running}30`,
          }}
        >
          {/* Wraps under the icon when the words would get less than
              10rem beside it (320 px at 2x text), rather than squeeze a
              word past its line. */}
          <div className="flex flex-wrap items-start gap-3">
            <div className="size-11 rounded-2xl flex items-center justify-center shrink-0 bg-running/10">
              <Footprints className="size-5 text-running" />
            </div>
            <div className="min-w-0 flex-1 basis-40">
              <SectionLabel>Run</SectionLabel>
              <p className="text-lg font-bold leading-tight text-foreground truncate">
                {runSessionName(selectedRunTemplate, selectedRacePace, unit)}
              </p>
              {/* Run21 (2): the session's one feel line. Its shape is
                  "What it is", in "Why this run" below. */}
              {selectedRunTemplate && (
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  {
                    runSessionAbout(selectedRunTemplate, {
                      racePace: selectedRacePace,
                    }).feel
                  }
                </p>
              )}
              <RunPlanPurpose
                purpose={selectedRunWhy}
                template={
                  selectedRunTemplate &&
                  withPlannedRest(
                    selectedRunTemplate,
                    plannedIntervalPaceSPerKm(profile?.runFitness)
                  )
                }
                racePace={selectedRacePace}
                run={run.runDay}
                runDays={programState?.runDays ?? []}
              />
              {/* A8: consensus fueling guidance for 75-min+ sessions —
                  one line, same register as the explainer above. */}
              {selectedRunTemplate &&
                sessionFuelingLine(selectedRunTemplate.estimatedDuration) && (
                  <p className="text-xs text-muted-foreground mt-1.5 leading-snug">
                    {sessionFuelingLine(selectedRunTemplate.estimatedDuration)}
                  </p>
                )}
              {(selectedRunMeta || selectedRunHr.length > 0) && (
                /* Distance/duration and the HR zone are facts about the
                   session, so they read as one line — the same MetaLine
                   the command card uses — not as two pills. */
                <MetaLine
                  size="xs"
                  className="mt-2"
                  items={[
                    ...(selectedRunMeta ? [selectedRunMeta] : []),
                    ...selectedRunHr,
                  ]}
                />
              )}
            </div>
            <div className="shrink-0 pt-1">
              {run.isCompleted &&
                (() => {
                  // Q2 P24 — distinguish manual ✅ vs real ✅ in the
                  // sheet's status badge. Real / legacy → solid
                  // "Completed". Manual → dimmed "Marked complete"
                  // so the user can tell which source flipped the
                  // slot when they reopen the sheet.
                  const runDayId = run.runDay?.id;
                  const completionKind = runDayId
                    ? getCompletionKind(runDayId, claimMap)
                    : null;
                  const isManual = completionKind === "manual";
                  return (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground">
                      <Check
                        className="size-3.5 text-success-strong"
                        aria-hidden="true"
                      />
                      {isManual ? "Marked complete" : "Completed"}
                    </span>
                  );
                })()}
              {run.status === "skipped" && (
                <span className="text-xs font-medium text-muted-foreground">
                  Skipped
                </span>
              )}
              {run.status === "race_no_show" && (
                <span className="text-xs font-medium text-muted-foreground">
                  {goalDayName(profile?.raceGoal)} passed
                </span>
              )}
            </div>
          </div>

          {/* PR-D: reconciliation branch removed alongside the
              drop of `race_completed_unlinked`. The reconciliation
              pattern still works — RunSummary's "Mark scheduled
              run complete" flow now transitions directly to
              completed_exact (or recovers from race_no_show
              under the updated LEGAL_TRANSITIONS). No
              intermediate status is needed. */}
          <>
            {/* Template swap — enabled only when startable AND not a
                race. RUN-RACE-GUARD-01: a race's template is locked so
                its identity can't be swapped away and completed as an
                ordinary run. */}
            <label className="block">
              <SectionLabel as="span">Template</SectionLabel>
              <Select
                className="mt-1"
                value={run.runDay.userOverride || run.runDay.templateId}
                onChange={(e) =>
                  overrideRunDay(
                    run.runDay!.id ?? run.runDay!.dayIndex,
                    e.target.value
                  )
                }
                disabled={!run.isStartable || isRaceTemplate}
                aria-label={
                  isRaceTemplate
                    ? `${goalDayName(profile?.raceGoal)} · template locked`
                    : run.isStartable
                      ? "Run template"
                      : `${run.status} — template locked`
                }
              >
                {RUN_TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {runTemplateName(t.name, unit)} ({t.type})
                  </option>
                ))}
              </Select>
              {isRaceTemplate ? (
                <span className="mt-1 block text-caption text-muted-foreground">
                  {goalDayName(profile?.raceGoal)} — the template is locked.
                </span>
              ) : (
                run.isStartable && (
                  <span className="mt-1 block text-caption text-muted-foreground">
                    Changes this day only.
                  </span>
                )
              )}
            </label>

            {/* Action block (Mark complete + Skip + same-date hint).
                  Two entry conditions, each with !isCompleted:
                    - Planned (existing B3d): isStartable → full
                      block, Mark + Skip + optional hint
                    - Skipped + same-date extra (Q5 P86 / B3h): the
                      hint + Mark complete surface; Skip is hidden
                      (already skipped). markManualComplete handles
                      the two-step `skipped → planned → manualComps`
                      transition internally per Q2 P20.
                  The skipped+extra entry is race-day-suppressed in
                  the gate itself (race-day completion is strictly
                  real-saved-run-only — Q1 P4 / Q2 P21 inheritance).
                  The planned race-day case is unchanged from B3d
                  (a unified Q2 P21 race-day suppression rule across
                  the planned Mark complete path lands separately). */}
            {!run.isCompleted &&
              (run.isStartable ||
                (run.status === "skipped" &&
                  hasSameDateExtra &&
                  !isRaceTemplate)) && (
                <div className="space-y-2">
                  {hasSameDateExtra && !isRaceTemplate && (
                    <p
                      role="status"
                      className="text-xs text-muted-foreground bg-muted/40 rounded-md px-2 py-1.5"
                    >
                      An extra run is logged for this date. Mark this{" "}
                      {run.status === "skipped" ? "skipped" : "planned"} slot as
                      done?
                    </p>
                  )}
                  {/* Q2 P21 (chunk B3j) — Mark complete suppressed
                      on race-day slots. Race-day completion is
                      strictly real-saved-run-only via Q1 P4
                      (templateId === "race" + ≥95% distance);
                      manual override would bypass the strict rule
                      and incorrectly trigger recovery entry.
                      Users on race day must log the run for real
                      (or wait for Strava sync) to complete the
                      slot. Skip stays available — see Q1 P7 (skip
                      is reversible). */}
                  {!isRaceTemplate && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        void act(async () => {
                          if (run.runDay?.id) {
                            await markManualComplete(run.runDay.id);
                          }
                        })
                      }
                      className="w-full py-3 rounded-xl text-sm font-bold bg-background border border-border active:scale-[0.97] transition-transform inline-flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      <Check
                        className="size-4"
                        style={{ color: THEME.success }}
                      />
                      Mark as done
                    </button>
                  )}
                  {/* Skip — only on planned slots. A skipped slot
                    surfaced for the P86 reconciliation path
                    shouldn't offer "skip" again.

                    Race-day variant (Run8 PR1d): templateId === "race"
                    swaps the single Skip button for two race-aware
                    options — DNF (started but didn't finish) and
                    DNS (didn't start). Both call skipRunDay with
                    the same underlying transition (the runDay
                    state machine doesn't distinguish the two);
                    the split is purely UX so race-day language
                    matches the reality the user is recording. A
                    real "Finished" path is deliberately absent —
                    race-day completion is strictly real-saved-
                    run-only (Q1 P4 / Q2 P21); logging the run via
                    Start run is the only valid completion path. */}
                  {run.isStartable && isRaceTemplate && (
                    <>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          void act(() =>
                            skipRunDay(run.runDay!.id ?? run.runDay!.dayIndex)
                          )
                        }
                        className="w-full py-3 rounded-xl text-sm font-bold bg-destructive/10 text-destructive-strong active:scale-[0.97] transition-transform"
                      >
                        DNF — Started but didn’t finish
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          void act(() =>
                            skipRunDay(run.runDay!.id ?? run.runDay!.dayIndex)
                          )
                        }
                        className="w-full py-3 rounded-xl text-sm font-bold bg-destructive/10 text-destructive-strong active:scale-[0.97] transition-transform"
                      >
                        DNS — Didn’t start
                      </button>
                    </>
                  )}
                  {run.isStartable && !isRaceTemplate && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        void act(() =>
                          skipRunDay(run.runDay!.id ?? run.runDay!.dayIndex)
                        )
                      }
                      className="w-full py-3 rounded-xl text-sm font-bold bg-destructive/10 text-destructive-strong active:scale-[0.97] transition-transform"
                    >
                      Skip this run
                    </button>
                  )}

                  {/* RUN-RESCHEDULE-01: move this planned run to another
                      day in the same week. Reveals a 7-day picker;
                      unavailable days (past / occupied / race / after the
                      race) are disabled, days with a coaching trade-off
                      (hard run onto a lift day / beside another hard run)
                      are flagged but still selectable. */}
                  {run.isStartable && !isRaceTemplate && run.runDay && (
                    <>
                      <button
                        type="button"
                        onClick={() => setShowMovePicker((v) => !v)}
                        aria-expanded={showMovePicker}
                        className="w-full py-3 rounded-xl text-sm font-bold bg-background border border-border active:scale-[0.97] transition-transform inline-flex items-center justify-center gap-1.5 shadow-sm"
                      >
                        <CalendarDays
                          className="size-4"
                          style={{ color: THEME.chrome.text }}
                        />
                        Move to another day
                      </button>
                      <Collapse open={showMovePicker}>
                        {() => (
                          <div
                            className="grid grid-cols-7 gap-1.5 pt-1"
                            role="group"
                            aria-label="Move to which day"
                          >
                            {resolveRunMoveOptions({
                              source: run.runDay!,
                              runDays: programState?.runDays ?? [],
                              weekSchedule: profile?.weekSchedule ?? [],
                              todayKey: localDateString(new Date()),
                            }).map((opt) => {
                              const label = [
                                "Sun",
                                "Mon",
                                "Tue",
                                "Wed",
                                "Thu",
                                "Fri",
                                "Sat",
                              ][opt.dayIndex].slice(0, 1);
                              return (
                                <button
                                  key={opt.dayIndex}
                                  type="button"
                                  disabled={!opt.available || pending}
                                  aria-label={`${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][opt.dayIndex]}${opt.warning ? " — has a trade-off" : opt.available ? "" : " — unavailable"}`}
                                  onClick={() =>
                                    void act(() =>
                                      moveRunDay(
                                        run.runDay!.id ?? run.runDay!.dayIndex,
                                        opt.dayIndex
                                      )
                                    )
                                  }
                                  className={cn(
                                    "min-h-[44px] rounded-lg text-xs font-bold flex flex-col items-center justify-center gap-0.5 transition-transform",
                                    opt.available
                                      ? "bg-background border border-border active:scale-[0.95]"
                                      : "bg-muted/40 text-muted-foreground cursor-not-allowed"
                                  )}
                                  style={
                                    opt.warning
                                      ? { borderColor: THEME.warning }
                                      : undefined
                                  }
                                >
                                  <span>{label}</span>
                                  {opt.warning && (
                                    <TriangleAlert
                                      className="size-3"
                                      style={{ color: THEME.warning }}
                                    />
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </Collapse>
                    </>
                  )}
                </div>
              )}

            {/* SESSION-RESTORE-01: a skip (or race no-show) is a
                reversible decision — restore the slot to planned so
                the user isn't dead-ended. Pure status reversal, not a
                completion. Shown on exactly the terminal-but-reversible
                states; completed_* slots stay locked. */}
            {(run.status === "skipped" || run.status === "race_no_show") && (
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  void act(() =>
                    restoreRunDay(run.runDay!.id ?? run.runDay!.dayIndex)
                  )
                }
                className="w-full py-3 rounded-xl text-sm font-bold bg-background border border-border active:scale-[0.97] transition-transform inline-flex items-center justify-center gap-1.5 shadow-sm"
              >
                <RotateCcw
                  className="size-4"
                  style={{ color: THEME.chrome.text }}
                />
                Restore to plan
              </button>
            )}
          </>
        </section>
      )}

      {/* Lift section — day-scope only (hidden on the Run tab; see `scope`). */}
      {showLift && lift.workout && lift.index !== null && (
        <section
          aria-label="Lift actions"
          className="rounded-2xl p-4 space-y-4 shadow-sm"
          style={{
            background: `linear-gradient(135deg, ${THEME.lifting}12, ${THEME.lifting}06)`,
            border: `1px solid ${THEME.lifting}30`,
          }}
        >
          <div className="flex items-start gap-3">
            <div className="size-11 rounded-2xl flex items-center justify-center shrink-0 bg-lifting/10">
              <Dumbbell className="size-5 text-lifting" />
            </div>
            <div className="min-w-0 flex-1">
              <SectionLabel>Lift</SectionLabel>
              <p className="text-lg font-bold leading-tight text-foreground truncate">
                {liftDayNameIn(
                  (programState?.workouts ?? []).map((w) => w.dayName),
                  lift.index,
                  lift.workout.dayName
                ) || "Lift"}
              </p>
              <LiftPurpose
                programme={programState}
                day={lift.workout}
                date={dateKey}
                experience={profile?.experience}
              />
            </div>
            <div className="shrink-0 pt-1">
              {lift.status === "completed" && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground">
                  <Check
                    className="size-3.5 text-success-strong"
                    aria-hidden="true"
                  />
                  Completed
                </span>
              )}
              {lift.status === "skipped" && (
                <span className="text-xs font-medium text-muted-foreground">
                  Skipped
                </span>
              )}
            </div>
          </div>

          {lift.isStartable && (
            <button
              type="button"
              disabled={pending}
              onClick={() => void act(() => skipWorkoutDay(lift.index!))}
              className={cn(
                "w-full py-3 rounded-xl text-sm font-bold",
                "bg-destructive/10 text-destructive-strong active:scale-[0.97] transition-transform"
              )}
            >
              Skip this lift
            </button>
          )}

          {/* SESSION-RESTORE-01: reverse a skipped lift back to
              plannable. Only on a genuinely skipped (non-completed)
              day; the writer no-ops otherwise. */}
          {lift.status === "skipped" && lift.index !== null && (
            <button
              type="button"
              disabled={pending}
              onClick={() => void act(() => restoreWorkoutDay(lift.index!))}
              className="w-full py-3 rounded-xl text-sm font-bold bg-background border border-border active:scale-[0.97] transition-transform inline-flex items-center justify-center gap-1.5 shadow-sm"
            >
              <RotateCcw
                className="size-4"
                style={{ color: THEME.chrome.text }}
              />
              Restore to plan
            </button>
          )}
        </section>
      )}
    </>
  );
}
