/**
 * P0-8: active-plan controls migrated out of Settings.
 *
 * Pre-P0-8, run-mode + race-goal + per-day template overrides lived
 * in Settings's TrainingSection because there was nowhere else for
 * them. The v7 architecture explicitly relocates "active plan
 * editing" to the Programme tab — Settings becomes a defaults +
 * deep-link surface, not a primary plan editor.
 *
 * What lives here:
 *   - Run mode picker (freeform / structured / race_prep). Same
 *     write-on-tap semantics as the Settings copy — selecting a
 *     mode calls updateProfile immediately so reads downstream
 *     pick up the new value.
 *   - Race-goal form (only when runMode === "race_prep" AND no
 *     plan exists yet). Mirrors the validation + side-effects from
 *     TrainingSection's handleSaveRaceGoal verbatim — same
 *     toasts, same minimum-weeks gate, same refreshRunSchedule
 *     follow-up.
 *   - Race-plan progress strip (when a plan exists).
 *   - Per-day template override list (structured / race_prep
 *     only). Calls overrideRunDay; this is the same function that
 *     P0-6's `?scheduledRunId=` flow will now write to by id, so
 *     edits here are reachable from the Run page on next start.
 *
 * What stays in Settings (TrainingSection):
 *   - Edit programme button (retake onboarding).
 *   - Weekly schedule editor (chips + apply changes) — that's
 *     general "how do I want my week to look" and applies to both
 *     non-running and running users. Stays where Settings is.
 *
 * The component is plain props-driven; the Programme page hands it
 * everything from useAuth + useProgram. Pulling these from context
 * directly would couple the section to the broader page lifecycle
 * (and break the storybook-style isolation we'd want when this
 * eventually moves to its own Run tab in P1-1).
 */

import { useState } from "react";
import { Footprints, Flag, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { THEME } from "@/lib/theme";
import { DAY_LABELS } from "@/lib/scheduleUtils";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import { getRacePhaseLabel } from "@/features/program/runScheduler";
import type { UserProfile, UpdateProfileResult } from "@/lib/auth";
import type { ProgramState } from "@/features/program/programTypes";

interface ProgrammeRunSectionProps {
  profile: UserProfile;
  programState: ProgramState | null;
  /** Number of run days the user has scheduled. When 0, the entire
   *  section hides — there's no plan to edit. */
  runsTarget: number;
  updateProfile: (
    data: Partial<UserProfile>,
    opts?: { allowProtected?: boolean },
  ) => Promise<UpdateProfileResult>;
  overrideRunDay: (dayIndex: number, templateId: string) => void;
  refreshRunSchedule: () => Promise<void>;
}

export default function ProgrammeRunSection({
  profile,
  programState,
  runsTarget,
  updateProfile,
  overrideRunDay,
  refreshRunSchedule,
}: ProgrammeRunSectionProps) {
  const [raceDistance, setRaceDistance] = useState<"5k" | "10k" | "half" | "marathon">("10k");
  const [raceTargetDate, setRaceTargetDate] = useState("");
  const [savingRaceGoal, setSavingRaceGoal] = useState(false);

  // No run days scheduled — nothing to edit, hide the whole section.
  // P0-9's Configure Plan wizard is the surface for going from 0 → N
  // run days, not this inline editor.
  if (runsTarget <= 0) return null;

  const handleSaveRaceGoal = async (): Promise<void> => {
    // All validation toasts share one id so rapid-retry on the Save
    // button replaces the previous message instead of stacking.
    if (!raceTargetDate) {
      toast.error("Please select a target date", { id: "race-goal" });
      return;
    }
    const target = new Date(raceTargetDate);
    const now = new Date();
    if (target < now) {
      toast.error("Target date is in the past", { id: "race-goal" });
      return;
    }
    const weeksAway = Math.round((target.getTime() - now.getTime()) / (7 * 24 * 60 * 60 * 1000));
    if (weeksAway < 3) {
      toast.error("Target date must be at least 3 weeks away", { id: "race-goal" });
      return;
    }
    setSavingRaceGoal(true);
    try {
      await updateProfile({
        runMode: "race_prep",
        raceGoal: { distance: raceDistance, targetDate: raceTargetDate },
      });
      await refreshRunSchedule();
      toast.success("Race plan created!", { id: "race-goal" });
    } catch {
      toast.error("Failed to save race goal", { id: "race-goal" });
    } finally {
      setSavingRaceGoal(false);
    }
  };

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

      {/* Run mode picker */}
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-wider" style={{ color: "hsl(var(--muted-foreground) / 0.7)" }}>
          Run mode
        </p>
        <div className="flex gap-2">
          {(["freeform", "structured", "race_prep"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => updateProfile({ runMode: mode })}
              className={cn(
                "flex-1 py-2 rounded-lg text-xs font-medium transition-all",
                currentMode === mode
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {mode === "race_prep" ? "Race Prep" : mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {currentMode === "freeform"
            ? "Pick any run type when you start"
            : currentMode === "structured"
              ? "Auto-assigns run templates to your run days"
              : "Follows a race training plan"}
        </p>
      </div>

      {/* Race goal setup form — only when race_prep + no existing plan */}
      {currentMode === "race_prep" && !programState?.runPlan?.raceGoal && (
        <div className="p-3 rounded-xl bg-card space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <Flag className="w-4 h-4 text-primary" />
            <span className="text-xs font-medium text-foreground">Set Your Race Goal</span>
          </div>
          <fieldset>
            <legend className="text-xs text-muted-foreground uppercase tracking-wider">Distance</legend>
            <div className="flex gap-1.5 mt-1">
              {(["5k", "10k", "half", "marathon"] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setRaceDistance(d)}
                  className={cn(
                    "flex-1 py-2 rounded-lg text-xs font-medium transition-all",
                    raceDistance === d
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {d === "half" ? "Half" : d === "marathon" ? "Full" : d.toUpperCase()}
                </button>
              ))}
            </div>
          </fieldset>
          <div>
            <label htmlFor="programme-race-target-date" className="text-xs text-muted-foreground uppercase tracking-wider">
              Target Date
            </label>
            <input
              id="programme-race-target-date"
              type="date"
              value={raceTargetDate}
              onChange={(e) => setRaceTargetDate(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-lg bg-muted border border-border/50 text-foreground text-sm"
            />
          </div>
          <button
            onClick={handleSaveRaceGoal}
            disabled={savingRaceGoal || !raceTargetDate}
            className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
          >
            {savingRaceGoal ? "Creating plan..." : "Create Race Plan"}
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
          {(programState?.runDays ?? []).map((rd) => (
            <div key={rd.id ?? rd.dayIndex} className="flex items-center gap-3 py-1">
              <span className="text-xs font-medium text-foreground w-8">
                {DAY_LABELS[rd.dayIndex]}
              </span>
              <select
                value={rd.userOverride || rd.templateId}
                onChange={(e) => overrideRunDay(rd.dayIndex, e.target.value)}
                className="flex-1 bg-muted rounded-lg px-2 py-1.5 text-xs border border-border/50"
              >
                {RUN_TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.type})
                  </option>
                ))}
              </select>
              {rd.completed && <Check className="w-4 h-4 text-green-500 shrink-0" />}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
