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
  const raceGoal = programState?.runPlan?.raceGoal;
  const todayKey = localDateString();
  const inRecoveryPhase = programState?.runPlan?.phase === "recovery";
  const raceElapsed = !!raceGoal?.targetDate && todayKey > raceGoal.targetDate;
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
