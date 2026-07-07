/**
 * SettingsRunPlan — the dedicated run-plan editing screen (Run-Split, 2026-07).
 *
 * The focused destination for the run-tab's "Edit run plan" / race-cockpit
 * "Edit" / "Set a race goal" entries. Renders RunPlanSettings (running only —
 * mode, race goal + runway, run days) so editing the run plan no longer drops
 * the user into the full onboarding-style ProgrammeSettings editor. The full
 * editor stays reachable via the in-page "Full programme settings" link and
 * from Settings.
 */
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useProgram } from "@/features/program/useProgram";
import SettingsSection from "@/components/settings/SettingsSection";
import RunPlanSettings from "@/components/program/RunPlanSettings";

export default function SettingsRunPlan() {
  const navigate = useNavigate();
  const { profile, updateProfile } = useAuth();
  const { refreshRunSchedule } = useProgram();

  if (!profile) {
    // Brief auth-resolution window; route guards keep signed-out users out.
    return <SettingsSection title="Run plan" />;
  }

  return (
    <SettingsSection
      title="Run plan"
      subtitle="Mode, race goal and run days — just your running"
    >
      <RunPlanSettings
        profile={profile}
        updateProfile={updateProfile}
        refreshRunSchedule={refreshRunSchedule}
        onOpenFullSettings={() => navigate("/settings/training")}
      />
    </SettingsSection>
  );
}
