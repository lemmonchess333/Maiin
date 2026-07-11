/**
 * PR-1: per-day action sheet — canonical surface (post-PR-3).
 *
 * Single place to manage one day's training. Mounted from:
 *
 *   - Home DayPeekCard secondary "Manage" CTA — off-Programme
 *     access without exposing all actions inline. Home remains
 *     glance-first; the sheet handles the editing.
 *   - Programme Run rows — per-row "Manage" affordance on
 *     ProgrammeRunSection's per-day list.
 *   - (Lift swiper continues to use SkipConfirmSheet for in-
 *     session skip — DayActionSheet doesn't compete with that
 *     flow.)
 *
 * Before PR-1 the three workflows (manual `completeRunDay`, manual
 * `skipRunDay`, `skipWorkoutDay` from a non-swiper context) lived
 * only inside the Programme Week tab's overflow sheet. PR-1
 * extracted them into this sheet; PR-3 removed the Week tab once
 * coverage was verified — these are now the only path to those
 * actions outside Settings's retake-onboarding flow.
 *
 * Status-aware rules (PR-0b-iii):
 *   - planned                       → template swap + Skip + Mark complete
 *   - completed_* / skipped /
 *     race_no_show                  → locked badge, no actions
 *   - race_completed_unlinked       → passive copy, no actions
 *
 * The sheet resolves the day via the shared trainingResolver
 * (PR-0c) so it agrees with Home's WeekStrip + DayPeekCard about
 * what's training for the given date.
 */

import { useMemo } from "react";
import SectionLabel from "@/components/ui/SectionLabel";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Footprints, Dumbbell, Check, X, TriangleAlert } from "lucide-react";
import { THEME } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import { sessionPaceDisplay } from "@/lib/runLabels";
import {
  paceTableFromFitness,
  resolveSessionPaces,
  raceDistanceKeyFromKm,
} from "@/lib/runPaces";
import { targetZoneForRun, maxHrFromAge } from "@/lib/hrZones";
import { format } from "date-fns";
import { parseLocalDate, localWeekKey } from "@/lib/dateHelpers";
import { resolveTrainingDayForDate } from "@/lib/trainingResolver";
import { hasHybridInterference } from "@/lib/runProgrammeViewModel";
import {
  getCompletionKind,
  type ClaimState,
} from "@/lib/scheduledRunCompletion";
import type { SavedRunDoc } from "@/hooks/useClaimMap";
import type { UserProfile } from "@/lib/auth";
import type { ProgramState } from "@/features/program/programTypes";

interface DayActionSheetProps {
  open: boolean;
  onClose: () => void;
  /** Local "YYYY-MM-DD" of the day being managed. Required only
   *  when `open`. Pass null when closed; the sheet renders nothing. */
  dateKey: string | null;
  profile: UserProfile | null;
  programState: ProgramState | null;
  /** PR-J Q3 chunk B3d — derived completion source of truth.
   *  Forwarded to the shared `resolveTrainingDayForDate` call so
   *  the sheet's "Completed" badge tracks manual / saved-run-claim
   *  / legacy completions uniformly. Wired via `useClaimMap` in
   *  the parent (ProgrammeRunSection). Closes the last resolver
   *  back-compat fallback B3c left open. */
  claimMap: Map<string, ClaimState>;
  /** PR-J Q5 chunk B3f — unclaimed-runs selector. Used to detect
   *  the same-date paradox (P74): when a planned slot remains
   *  unclaimed but a saved run for the same date IS present as an
   *  extra (distance-fail or bucket-fail), surface a contextual
   *  hint above the Mark complete button so the user can resolve
   *  the friction with one tap. Wired via `useClaimMap` in the
   *  parent. */
  unclaimedByDate: Map<string, SavedRunDoc[]>;
  overrideRunDay: (idOrDayIndex: string | number, templateId: string) => void;
  /** PR-J Q2 chunk B2: replaces the deleted completeRunDay.
   *  Writes to programState.manualCompletions[runDayId]; derivation
   *  surfaces ✅ via the claim map (Q2 P27). */
  markManualComplete: (runDayId: string) => Promise<void>;
  skipRunDay: (idOrDayIndex: string | number) => Promise<void>;
  skipWorkoutDay: (dayIndex: number) => Promise<void>;
  /** Which blocks to surface.
   *
   *  - "day" (default) — the whole-day manager: run + lift blocks. Used by
   *    Home, which is the sport-agnostic daily glance, so "manage Monday"
   *    legitimately means "manage everything on Monday".
   *  - "run" — run block only. Used by the Programme **Run tab**, whose entire
   *    layout is partitioned by the Lift | Run segmented control. The `…` that
   *    opens this sheet lives on a run card inside the run-scoped surface, so
   *    handing back a lift block would violate that partition (and the lift
   *    has its own tab with richer management). Lift skipping on the Run tab
   *    was never the job of this affordance. */
  scope?: "day" | "run";
}

export default function DayActionSheet({
  open,
  onClose,
  dateKey,
  profile,
  programState,
  claimMap,
  unclaimedByDate,
  overrideRunDay,
  markManualComplete,
  skipRunDay,
  skipWorkoutDay,
  scope = "day",
}: DayActionSheetProps) {
  // The resolver is the single source of truth for what training
  // exists on this date. Same call Home and Programme Today make
  // (PR-0c), so the sheet inherits the date/weekKey-aware runDay
  // matching, the lift-index mapping, and the status-aware flags.
  const resolved = useMemo(() => {
    if (!dateKey) return null;
    return resolveTrainingDayForDate({
      dateKey,
      profile,
      programState,
      currentWeekKey: localWeekKey(new Date()),
      claimMap,
    });
  }, [dateKey, profile, programState, claimMap]);

  const dayLabel = useMemo(() => {
    if (!dateKey) return "";
    return format(parseLocalDate(dateKey), "EEE d MMM");
  }, [dateKey]);

  // Q5 P74 same-date paradox (chunk B3f). When a saved run exists
  // for THIS date but didn't claim a planned slot (distance-fail or
  // quality-bucket-fail), the run sits in `unclaimedByDate` keyed
  // by its date. Surface a contextual hint so the user can resolve
  // by marking the slot manually. Race day is excluded at the
  // render site (Q1 P4 / Q2 P21 — race-day completion is real-
  // saved-run-only).
  const hasSameDateExtra = useMemo(() => {
    if (!dateKey) return false;
    const extras = unclaimedByDate.get(dateKey);
    return !!extras && extras.length > 0;
  }, [dateKey, unclaimedByDate]);

  if (!open || !resolved) return null;

  const { lift, run } = resolved;
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
  // Adaptive Paces: the user's personalized pace for this session, appended to
  // the meta pill (e.g. "10km · 5:25–5:45 /km"). Band-first via the shared
  // sessionPaceDisplay rule (the range is the honest coaching target; singles
  // only for race pace). Null when there's no benchmark.
  const selectedRunPace: string | null = (() => {
    if (!selectedRunTemplate) return null;
    const table = paceTableFromFitness(profile?.runFitness ?? null);
    if (!table) return null;
    return sessionPaceDisplay(
      resolveSessionPaces(selectedRunTemplate.type, table, {
        raceDistanceKey: raceDistanceKeyFromKm(
          selectedRunTemplate.config.targetDistance
        ),
      })
    );
  })();
  const selectedRunMeta = selectedRunTemplate
    ? [
        selectedRunTemplate.config.targetDistance
          ? `${selectedRunTemplate.config.targetDistance}km`
          : `${selectedRunTemplate.estimatedDuration} min`,
        ...(selectedRunPace ? [selectedRunPace] : []),
      ].join(" · ")
    : null;
  // Target HR zone — the HR analogue of the pace target ("run easy in Zone 2").
  // Uses the measured max HR, else the age estimate; null when neither exists
  // (then we just don't show the pill — the pace pill still stands alone).
  const selectedRunHr: string | null = (() => {
    if (!selectedRunTemplate) return null;
    const maxHr = profile?.maxHeartRate ?? maxHrFromAge(profile?.age ?? 0);
    const band = targetZoneForRun(selectedRunTemplate.type, maxHr);
    if (!band) return null;
    return `Z${band.zone} · ${band.minBpm}–${band.maxBpm} bpm`;
  })();
  // Race-day detection by TEMPLATE TYPE, not by `templateId === "race"`.
  // Race templates have ids like `5k_race` / `marathon_race` (never the
  // literal "race"), so the old string-equality check was always false —
  // the DNF/DNS variant never rendered and manual-complete was never
  // suppressed on real race days. Resolving the template and reading its
  // `type` is the correct, id-agnostic gate (Q1 P4 / Q2 P21).
  const isRaceTemplate = selectedRunTemplate?.type === "race";

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
    <BottomSheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={`Manage ${dayLabel}`}
      description="Start, swap, or complete this day's sessions."
      hideHeader
    >
      <div className="px-5 pb-6 pt-3 space-y-4">
        {/* Drag handle */}
        <div className="w-9 h-1 rounded-full bg-border mx-auto" />

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
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-2 -m-2 rounded-lg text-muted-foreground active:scale-95"
          >
            <X className="size-4" />
          </button>
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
          <p className="flex items-start gap-2 text-xs text-warning leading-relaxed px-1">
            <TriangleAlert
              className="size-3.5 mt-0.5 shrink-0"
              aria-hidden="true"
            />
            Quality run and a lift share this day — if recovery's tight, go
            easier on one of them.
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
            <div className="flex items-start gap-3">
              <div className="size-11 rounded-2xl flex items-center justify-center shrink-0 bg-running/10">
                <Footprints className="size-5 text-running" />
              </div>
              <div className="min-w-0 flex-1">
                <SectionLabel>Run</SectionLabel>
                <p className="text-lg font-extrabold leading-tight text-foreground truncate">
                  {selectedRunTemplate?.name ?? "Run"}
                </p>
                {selectedRunTemplate?.description && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    {selectedRunTemplate.description}
                  </p>
                )}
                {(selectedRunMeta || selectedRunHr) && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {selectedRunMeta && (
                      <span className="inline-flex rounded-full bg-background/70 px-2.5 py-1 text-caption font-semibold text-muted-foreground">
                        {selectedRunMeta}
                      </span>
                    )}
                    {selectedRunHr && (
                      <span className="inline-flex rounded-full bg-running/10 px-2.5 py-1 text-caption font-semibold text-running font-mono tabular-nums">
                        {selectedRunHr}
                      </span>
                    )}
                  </div>
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
                      <span
                        className={cn(
                          "text-xs font-medium",
                          isManual && "opacity-70"
                        )}
                        style={{ color: THEME.success }}
                      >
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
                    Race day passed
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
              {/* Template swap — only enabled when startable. */}
              <label className="block">
                <SectionLabel as="span">Template</SectionLabel>
                <select
                  value={run.runDay.userOverride || run.runDay.templateId}
                  onChange={(e) =>
                    overrideRunDay(
                      run.runDay!.id ?? run.runDay!.dayIndex,
                      e.target.value
                    )
                  }
                  disabled={!run.isStartable}
                  aria-label={
                    run.isStartable
                      ? "Run template"
                      : `${run.status} — template locked`
                  }
                  className="w-full mt-1 bg-background/80 rounded-xl px-3 py-3 text-base border border-border/60 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {RUN_TEMPLATES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.type})
                    </option>
                  ))}
                </select>
                {run.isStartable && (
                  <span className="mt-1 block text-caption text-muted-foreground">
                    Changes this day only.
                  </span>
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
                        {run.status === "skipped" ? "skipped" : "planned"} slot
                        as done?
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
                        onClick={async () => {
                          if (run.runDay?.id) {
                            await markManualComplete(run.runDay.id);
                          }
                          onClose();
                        }}
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
                      Start Run is the only valid completion path. */}
                    {run.isStartable && isRaceTemplate && (
                      <>
                        <button
                          type="button"
                          onClick={async () => {
                            await skipRunDay(
                              run.runDay!.id ?? run.runDay!.dayIndex
                            );
                            onClose();
                          }}
                          className="w-full py-3 rounded-xl text-sm font-bold bg-destructive/10 text-destructive active:scale-[0.97] transition-transform"
                        >
                          DNF — Started but didn&apos;t finish
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await skipRunDay(
                              run.runDay!.id ?? run.runDay!.dayIndex
                            );
                            onClose();
                          }}
                          className="w-full py-3 rounded-xl text-sm font-bold bg-destructive/10 text-destructive active:scale-[0.97] transition-transform"
                        >
                          DNS — Didn&apos;t start
                        </button>
                      </>
                    )}
                    {run.isStartable && !isRaceTemplate && (
                      <button
                        type="button"
                        onClick={async () => {
                          await skipRunDay(
                            run.runDay!.id ?? run.runDay!.dayIndex
                          );
                          onClose();
                        }}
                        className="w-full py-3 rounded-xl text-sm font-bold bg-destructive/10 text-destructive active:scale-[0.97] transition-transform"
                      >
                        Skip this run
                      </button>
                    )}
                  </div>
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
                <p className="text-lg font-extrabold leading-tight text-foreground truncate">
                  {lift.workout.dayName || "Lift"}
                </p>
              </div>
              <div className="shrink-0 pt-1">
                {lift.status === "completed" && (
                  <span
                    className="text-xs font-medium"
                    style={{ color: THEME.success }}
                  >
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
                onClick={async () => {
                  await skipWorkoutDay(lift.index!);
                  onClose();
                }}
                className={cn(
                  "w-full py-3 rounded-xl text-sm font-bold",
                  "bg-destructive/10 text-destructive active:scale-[0.97] transition-transform"
                )}
              >
                Skip this lift
              </button>
            )}
          </section>
        )}
      </div>
    </BottomSheet>
  );
}
