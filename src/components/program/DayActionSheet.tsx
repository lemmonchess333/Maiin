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
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Footprints, Dumbbell, Check, X } from "lucide-react";
import { THEME } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import { format } from "date-fns";
import { parseLocalDate, localWeekKey } from "@/lib/dateHelpers";
import { resolveTrainingDayForDate } from "@/lib/trainingResolver";
import type { ClaimState } from "@/lib/scheduledRunCompletion";
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

  return (
    <BottomSheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={`Manage ${dayLabel}`}
      hideHeader
    >
      <div className="px-5 pb-6 pt-3 space-y-4">
        {/* Drag handle */}
        <div className="w-9 h-1 rounded-full bg-border mx-auto" />

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Manage day
            </p>
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
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Empty state — no training scheduled. */}
        {!hasLift && !hasRun && (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Nothing scheduled for this day.
          </p>
        )}

        {/* Run section */}
        {hasRun && run.runDay && (
          <section
            aria-label="Run actions"
            className="rounded-xl p-3 space-y-3"
            style={{
              background: `${THEME.running}10`,
              border: `1px solid ${THEME.running}30`,
            }}
          >
            <div className="flex items-center gap-2">
              <Footprints
                className="w-4 h-4"
                style={{ color: THEME.running }}
              />
              <p className="text-sm font-semibold text-foreground">Run</p>
              {run.isCompleted && (
                <span
                  className="ml-auto text-xs font-medium"
                  style={{ color: THEME.success }}
                >
                  Completed
                </span>
              )}
              {run.status === "skipped" && (
                <span className="ml-auto text-xs font-medium text-muted-foreground">
                  Skipped
                </span>
              )}
              {run.status === "race_no_show" && (
                <span className="ml-auto text-xs font-medium text-muted-foreground">
                  Race day passed
                </span>
              )}
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
                <span className="text-xs uppercase tracking-wider text-muted-foreground">
                  Template
                </span>
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
                  className="w-full mt-1 bg-muted rounded-lg px-3 py-2 text-sm border border-border/50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {RUN_TEMPLATES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.type})
                    </option>
                  ))}
                </select>
              </label>

              {/* Skip + Mark complete — only when startable AND not
                    already completed. PR-J Q3 chunk B3d adds the
                    `!run.isCompleted` gate: with the claim map wired
                    a manual completion leaves runDay.status="planned"
                    (so isStartable stays true) but isCompleted flips
                    via the claim map. Without this gate the buttons
                    would still show next to the "Completed" badge.
                    PR-J Q2 chunk B2: markManualComplete writes to
                    the manualCompletions map (Q2 P11). Q2 P21:
                    UI-suppression on race day will land in chunk B3
                    when ProgrammeRunSection rewires to gate this
                    button per runDay.templateId === "race". */}
              {run.isStartable && !run.isCompleted && (
                <div className="space-y-2">
                  {/* Q5 P74 same-date paradox hint (chunk B3f).
                      When a saved run exists for this date but
                      didn't claim the slot (distance-fail or
                      quality-bucket-fail per Q1 P2/P3), surface a
                      contextual prompt so the user can resolve the
                      friction with one tap. Hidden on race-day slots
                      (race-day completion is strictly real-saved-run-
                      only — Q1 P4 / Q2 P21 inheritance). */}
                  {hasSameDateExtra && run.runDay?.templateId !== "race" && (
                    <p
                      role="status"
                      className="text-xs text-muted-foreground bg-muted/40 rounded-md px-2 py-1.5"
                    >
                      An extra run is logged for this date. Mark this planned
                      slot as done?
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={async () => {
                      if (run.runDay?.id) {
                        await markManualComplete(run.runDay.id);
                      }
                      onClose();
                    }}
                    className="w-full py-2.5 rounded-xl text-sm font-semibold bg-card border border-border active:scale-[0.97] transition-transform inline-flex items-center justify-center gap-1.5"
                  >
                    <Check
                      className="w-4 h-4"
                      style={{ color: THEME.success }}
                    />
                    Mark complete (manual)
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await skipRunDay(run.runDay!.id ?? run.runDay!.dayIndex);
                      onClose();
                    }}
                    className="w-full py-2.5 rounded-xl text-sm font-semibold bg-red-500/10 text-red-500 active:scale-[0.97] transition-transform"
                  >
                    Skip this run
                  </button>
                </div>
              )}
            </>
          </section>
        )}

        {/* Lift section */}
        {hasLift && lift.workout && lift.index !== null && (
          <section
            aria-label="Lift actions"
            className="rounded-xl p-3 space-y-3"
            style={{
              background: `${THEME.lifting}10`,
              border: `1px solid ${THEME.lifting}30`,
            }}
          >
            <div className="flex items-center gap-2">
              <Dumbbell className="w-4 h-4" style={{ color: THEME.lifting }} />
              <p className="text-sm font-semibold text-foreground">
                {lift.workout.dayName || "Lift"}
              </p>
              {lift.status === "completed" && (
                <span
                  className="ml-auto text-xs font-medium"
                  style={{ color: THEME.success }}
                >
                  Completed
                </span>
              )}
              {lift.status === "skipped" && (
                <span className="ml-auto text-xs font-medium text-muted-foreground">
                  Skipped
                </span>
              )}
            </div>

            {lift.isStartable && (
              <button
                type="button"
                onClick={async () => {
                  await skipWorkoutDay(lift.index!);
                  onClose();
                }}
                className={cn(
                  "w-full py-2.5 rounded-xl text-sm font-semibold",
                  "bg-red-500/10 text-red-500 active:scale-[0.97] transition-transform"
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
