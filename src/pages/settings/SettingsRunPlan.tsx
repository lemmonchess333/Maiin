/**
 * SettingsRunPlan — the dedicated run-plan editing screen (Run-Split, 2026-07).
 *
 * The focused destination for the run-tab's "Edit run plan" / race-cockpit
 * "Edit" / "Set a race goal" entries. Renders RunPlanSettings (running only —
 * mode, race goal + runway, run days) so editing the run plan no longer drops
 * the user into the full onboarding-style ProgrammeSettings editor. The full
 * editor stays reachable via the in-page "Full programme settings" link and
 * from Settings.
 *
 * Run13 (RUN-02): also hosts the second entry to the proactive
 * Adjust-this-week sheet — race-prep users with a live (non-recovery,
 * non-elapsed) plan get a quiet row above the editor.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useProgram } from "@/features/program/useProgram";
import SettingsSection from "@/components/settings/SettingsSection";
import RunPlanSettings from "@/components/program/RunPlanSettings";
import AdjustWeekSheet from "@/components/program/AdjustWeekSheet";
import { localDateString } from "@/lib/dateHelpers";
import { resolveRunPlan } from "@/lib/runPlanResolver";
import { track as trackProgram } from "@/lib/programAnalytics";

export default function SettingsRunPlan() {
  const navigate = useNavigate();
  const { profile, updateProfile } = useAuth();
  const { programState, refreshRunSchedule, overrideRunDay, realignRacePlan } =
    useProgram();
  const [adjustOpen, setAdjustOpen] = useState(false);

  if (!profile) {
    // Brief auth-resolution window; route guards keep signed-out users out.
    return <SettingsSection title="Run plan" />;
  }

  // Run13 gating — mirror the cockpit entry: race-prep with a live plan only
  // (recovery and post-race own their own flows).
  //
  // The MODE and the GOAL both come from the resolver. This used to take
  // `runMode` from the profile but `raceGoal` from the programState mirror,
  // so between saving a race goal and the plan regenerating, `canAdjust` went
  // false and the "Adjust this week" affordance simply vanished — for a user
  // who had just told us about their race.
  //
  // The two remaining predicates are deliberately left as they were rather
  // than swapped for the resolver's near-equivalents, because neither is the
  // same question:
  //   - `resolved.isElapsed` ALSO fires when the plan runs out of weeks, so
  //     adopting it would newly hide the control for a user whose race is
  //     still ahead. That may well be right, but it is a product call about
  //     what "live plan" means, not part of this fix.
  //   - `inRecovery || recoveryEnded` both require a `recoveryEndDate`, so
  //     they would silently start ALLOWING adjust for `phase === "recovery"`
  //     with no end date — which this gate has always excluded.
  const resolved = resolveRunPlan(profile, programState, localDateString());
  const raceGoal = resolved.raceGoal;
  const todayKey = localDateString();
  const inRecoveryPhase = programState?.runPlan?.phase === "recovery";
  const raceElapsed = !!raceGoal?.targetDate && todayKey > raceGoal.targetDate;
  // `profile.runMode`, not `resolved.runMode`: the resolver derives its mode
  // from the goal, so `resolved.runMode === "race_prep"` is implied by
  // `!!raceGoal` and the clause would stop meaning anything. Keeping the
  // profile's own value preserves the gate for a legacy `structured` profile
  // that happens to carry a goal.
  const canAdjust =
    profile.runMode === "race_prep" &&
    !!raceGoal &&
    !inRecoveryPhase &&
    !raceElapsed;

  return (
    <SettingsSection
      title="Run plan"
      subtitle="Mode, race goal and run days — just your running"
    >
      {canAdjust && (
        <button
          type="button"
          onClick={() => {
            trackProgram("adjust_week_opened", { source: "settings" });
            setAdjustOpen(true);
          }}
          className="w-full min-h-[44px] flex items-center justify-between gap-3 rounded-xl bg-card px-4 py-3 mb-3 text-left active:scale-[0.97] transition-transform"
        >
          <span className="text-sm font-semibold text-foreground">
            Adjust this week
          </span>
          <span className="text-micro text-muted-foreground">
            Feeling off, or a crowded week
          </span>
        </button>
      )}

      <RunPlanSettings
        profile={profile}
        updateProfile={updateProfile}
        refreshRunSchedule={refreshRunSchedule}
        onOpenFullSettings={() => navigate("/settings/training")}
      />

      {canAdjust && raceGoal && (
        <AdjustWeekSheet
          open={adjustOpen}
          onClose={() => setAdjustOpen(false)}
          runDays={programState?.runDays ?? []}
          raceGoal={{
            distance: raceGoal.distance as "5k" | "10k" | "half" | "marathon",
            targetDate: raceGoal.targetDate,
          }}
          overrideRunDay={overrideRunDay}
          realignRacePlan={realignRacePlan}
        />
      )}
    </SettingsSection>
  );
}
