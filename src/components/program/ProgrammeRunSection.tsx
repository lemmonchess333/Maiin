/**
 * P0-8 / PR-0d: active-plan controls on the Programme tab.
 *
 * Pre-PR-0d, this section's mode chips called `updateProfile({ runMode })`
 * directly and rendered an inline race-goal form that wrote `raceGoal`
 * without going through `buildPlan`. Both writes were structurally
 * incomplete — flipping `runMode` from freeform → race_prep without
 * regenerating `runDays`, templates, and the week schedule left users
 * in an inconsistent state. PR-0d removes those bypasses:
 *
 *   - Run mode chips: active = no-op (preserves the selected
 *     styling, no surprise side effects); non-active = opens
 *     ConfigurePlanModal at the Running step. The modal runs
 *     planBuilder + the configurePlan Cloud Function so the
 *     whole plan rebuilds atomically.
 *   - Race-goal entry: replaced with a "Race prep not set up yet"
 *     stub + a [Set race goal] button that opens the same modal
 *     at the Running step. One authoritative flow.
 *
 * What stays here:
 *   - Race-elapsed banner (informational).
 *   - Race-plan progress strip when a plan exists.
 *   - Per-day template override list (still calls overrideRunDay
 *     directly because that's a non-structural per-day swap).
 *
 * What stays in Settings (TrainingSection):
 *   - Edit programme button (retake onboarding).
 *   - Weekly schedule editor (chips + apply changes).
 */

import { useState } from "react";
import { Footprints, Check, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { THEME } from "@/lib/theme";
import { DAY_LABELS } from "@/lib/scheduleUtils";
import {
  getScheduledRunStatus,
  isScheduledRunEditable,
  isScheduledRunReconciliation,
} from "@/lib/scheduledRunStatus";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import { getRacePhaseLabel } from "@/features/program/runScheduler";
import { CONFIGURE_PLAN_RUNNING_STEP } from "./ConfigurePlanModal";
import DayActionSheet from "./DayActionSheet";
import type { UserProfile } from "@/lib/auth";
import type { ProgramState } from "@/features/program/programTypes";

interface ProgrammeRunSectionProps {
  profile: UserProfile;
  programState: ProgramState | null;
  /** Number of run days the user has scheduled. When 0, the entire
   *  section hides — there's no plan to edit. */
  runsTarget: number;
  overrideRunDay: (idOrDayIndex: string | number, templateId: string) => void;
  /** PR-1: action callbacks for the per-row DayActionSheet. The
   *  sheet preserves the manual-complete + skip-run + skip-lift
   *  flows that pre-PR-1 were Week-tab-only — once Week is
   *  retired (PR-2) these are the canonical surface. */
  completeRunDay: (idOrDayIndex: string | number) => Promise<void>;
  skipRunDay: (idOrDayIndex: string | number) => Promise<void>;
  skipWorkoutDay: (dayIndex: number) => Promise<void>;
  /** PR-0d: opens ConfigurePlanModal. The mode chips and the
   *  race-goal stub pass `CONFIGURE_PLAN_RUNNING_STEP` so the user
   *  lands directly in the run-config step. Without this callback
   *  the chips silently fall through to no-op (defensive — a parent
   *  that hasn't wired the modal yet won't crash, just won't open
   *  the editor). */
  onOpenConfigurePlan?: (initialStep?: number) => void;
}

export default function ProgrammeRunSection({
  profile,
  programState,
  runsTarget,
  overrideRunDay,
  completeRunDay,
  skipRunDay,
  skipWorkoutDay,
  onOpenConfigurePlan,
}: ProgrammeRunSectionProps) {
  // PR-1: which row is opening DayActionSheet. Stores the runDay's
  // matched date (so the sheet resolves the day the same way Home
  // does) or null when closed.
  const [manageDate, setManageDate] = useState<string | null>(null);

  // No run days scheduled — nothing to edit, hide the whole section.
  // P0-9's Configure Plan wizard is the surface for going from 0 → N
  // run days, not this inline editor.
  if (runsTarget <= 0) return null;

  const currentMode = profile.runMode ?? "freeform";

  return (
    <section
      aria-label="Run training"
      className="rounded-2xl p-4 space-y-4"
      style={{
        background: `${THEME.running}08`,
        border: `1px solid ${THEME.running}25`,
      }}
    >
      <header className="flex items-center gap-2">
        <Footprints className="w-4 h-4" style={{ color: THEME.running }} />
        <h2 className="text-sm font-semibold text-foreground">Run training</h2>
      </header>

      {/* Run mode picker — PR-0d: chip taps route through Configure
          Plan instead of mutating runMode directly. */}
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-wider" style={{ color: "hsl(var(--muted-foreground) / 0.7)" }}>
          Run mode
        </p>
        <div className="flex gap-2">
          {(["freeform", "structured", "race_prep"] as const).map((mode) => {
            const isActive = currentMode === mode;
            return (
              <button
                key={mode}
                onClick={() => {
                  // PR-0d: structural change. Active chip is a no-op
                  // (preserves selected styling). Non-active chip
                  // routes through ConfigurePlanModal so raceGoal /
                  // runDays / week schedule rebuild atomically via
                  // the configurePlan Cloud Function — the
                  // previous direct updateProfile({ runMode })
                  // left the rest of the plan stale.
                  if (isActive) return;
                  onOpenConfigurePlan?.(CONFIGURE_PLAN_RUNNING_STEP);
                }}
                className={cn(
                  "flex-1 py-2 rounded-lg text-xs font-medium transition-all",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {mode === "race_prep" ? "Race Prep" : mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          {currentMode === "freeform"
            ? "Pick any run type when you start"
            : currentMode === "structured"
              ? "Auto-assigns run templates to your run days"
              : "Follows a race training plan"}
        </p>
      </div>

      {/* PR-0d: race-prep without a goal → single CTA into the
          canonical setup flow (ConfigurePlanModal at Running step).
          Replaces the inline distance/date form whose handler wrote
          { runMode, raceGoal } without rebuilding the plan. */}
      {currentMode === "race_prep" && !programState?.runPlan?.raceGoal && (
        <div className="p-3 rounded-xl bg-card space-y-2">
          <p className="text-sm font-medium text-foreground">Race prep not set up yet</p>
          <p className="text-xs text-muted-foreground">
            Pick a distance and target date to generate your periodised plan.
          </p>
          <button
            onClick={() => onOpenConfigurePlan?.(CONFIGURE_PLAN_RUNNING_STEP)}
            className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium"
          >
            Set race goal
          </button>
        </div>
      )}

      {/* P3-2: race elapsed state. When the user's race date has
          passed, we surface a muted "race day passed" card with a
          CTA to set a new goal instead of leaving the user staring
          at a dead progress strip. Detection logic mirrors
          isRacePlanElapsed in runPlanMetadata so the analytics +
          UI agree on what "elapsed" means. */}
      {currentMode === "race_prep" && programState?.runPlan?.raceGoal && (() => {
        const target = new Date(programState.runPlan.raceGoal.targetDate);
        const now = new Date();
        const elapsed = !Number.isNaN(target.getTime()) && target.getTime() < now.getTime();
        if (!elapsed) return null;
        return (
          <div
            className="p-3 rounded-xl text-xs"
            style={{
              background: "hsl(var(--muted) / 0.5)",
              border: "1px solid hsl(var(--border))",
              color: "hsl(var(--foreground))",
            }}
          >
            <p className="font-semibold mb-0.5">Race day has passed</p>
            <p style={{ color: "hsl(var(--muted-foreground))" }}>
              {programState.runPlan.raceGoal.distance.toUpperCase()} on{" "}
              {programState.runPlan.raceGoal.targetDate}. Open Configure Plan to set a new race
              or switch to structured running.
            </p>
          </div>
        );
      })()}

      {/* Race plan progress — only when raceGoal exists. P2-1:
          compressed banner appears above when the plan was
          shortened below the ideal weeks for the distance. */}
      {currentMode === "race_prep" && programState?.runPlan?.raceGoal && programState.runPlan.compressed && (
        <div
          className="p-3 rounded-xl text-xs"
          style={{
            background: `${THEME.warning ?? "#D9884E"}12`,
            border: `1px solid ${THEME.warning ?? "#D9884E"}40`,
            color: "hsl(var(--foreground))",
          }}
        >
          <p className="font-semibold mb-0.5">Plan is compressed</p>
          <p style={{ color: "hsl(var(--muted-foreground))" }}>
            Your target date is sooner than the ideal build for this distance, so we've trimmed
            interval work and shortened the long-run progression to keep the plan safe.
          </p>
        </div>
      )}
      {currentMode === "race_prep" && programState?.runPlan?.raceGoal && (
        <div className="p-3 rounded-xl bg-card space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Race</span>
            <span className="text-sm font-medium text-foreground">
              {programState.runPlan.raceGoal.distance.toUpperCase()} &mdash; {programState.runPlan.raceGoal.targetDate}
            </span>
          </div>
          {programState.runPlan.totalWeeks && programState.runPlan.currentWeek != null && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Week</span>
                <span className="text-sm font-medium text-foreground">
                  {programState.runPlan.currentWeek + 1} / {programState.runPlan.totalWeeks}
                  {" · "}
                  {getRacePhaseLabel(programState.runPlan.currentWeek, programState.runPlan.totalWeeks)}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: ((programState.runPlan.currentWeek + 1) / programState.runPlan.totalWeeks * 100) + "%" }}
                />
              </div>
            </>
          )}
        </div>
      )}

      {/* Per-day template overrides — structured / race_prep with runDays */}
      {currentMode !== "freeform" && (programState?.runDays ?? []).length > 0 && (
        <div className="p-3 rounded-xl bg-card space-y-1.5">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">This week&apos;s runs</p>
          {(programState?.runDays ?? []).map((rd) => {
            // PR-0b-iii: status-aware row rendering.
            //   - reconciliation (race_completed_unlinked) →
            //     passive copy, no Start/Change/Skip
            //   - editable (planned) → enabled select
            //   - otherwise (terminal: completed_*, skipped,
            //     race_no_show) → disabled select + completion
            //     check icon for completed_* states
            const status = getScheduledRunStatus(rd);

            if (isScheduledRunReconciliation(status)) {
              return (
                <div key={rd.id ?? rd.dayIndex} className="flex items-center gap-3 py-1">
                  <span className="text-xs font-medium text-foreground w-8">
                    {DAY_LABELS[rd.dayIndex]}
                  </span>
                  <p className="flex-1 text-xs text-muted-foreground italic">
                    Race completed separately. Review this in History.
                  </p>
                </div>
              );
            }

            const editable = isScheduledRunEditable(status);
            return (
            <div key={rd.id ?? rd.dayIndex} className="flex items-center gap-3 py-1">
              <span className="text-xs font-medium text-foreground w-8">
                {DAY_LABELS[rd.dayIndex]}
              </span>
              <select
                value={rd.userOverride || rd.templateId}
                onChange={(e) => overrideRunDay(rd.id ?? rd.dayIndex, e.target.value)}
                disabled={!editable}
                aria-label={editable ? `Run template for ${DAY_LABELS[rd.dayIndex]}` : `${status} — template locked`}
                className="flex-1 bg-muted rounded-lg px-2 py-1.5 text-xs border border-border/50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {RUN_TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.type})
                  </option>
                ))}
              </select>
              {rd.completed && <Check className="w-4 h-4 text-green-500 shrink-0" />}
              {/* PR-1: per-row "Manage" affordance opens
                  DayActionSheet for this runDay's date. Preserves
                  the manual-complete + skip-run flows that
                  pre-PR-1 lived only in WeekTabContent. The button
                  renders for every row (terminal too) — the sheet
                  itself locks down disallowed actions. */}
              {rd.date && (
                <button
                  type="button"
                  onClick={() => setManageDate(rd.date ?? null)}
                  aria-label={`Manage ${DAY_LABELS[rd.dayIndex]} run`}
                  className="p-1.5 -m-1 rounded-md text-muted-foreground active:scale-95"
                >
                  <Settings2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            );
          })}
        </div>
      )}

      {/* PR-1: per-day action sheet. Mounted once at the section
          level; the per-row Manage buttons set `manageDate` to the
          runDay's calendar date so the sheet resolves the same
          slot Home would. */}
      <DayActionSheet
        open={manageDate !== null}
        onClose={() => setManageDate(null)}
        dateKey={manageDate}
        profile={profile}
        programState={programState}
        overrideRunDay={overrideRunDay}
        completeRunDay={completeRunDay}
        skipRunDay={skipRunDay}
        skipWorkoutDay={skipWorkoutDay}
      />
    </section>
  );
}
