/**
 * SettingsLiftPlan — the dedicated lift-plan editing screen (Section-Split,
 * 2026-07). The lifting counterpart to SettingsRunPlan.
 *
 * The focused destination for the Programme page's "Edit lift plan" entry.
 * Renders ProgrammeSettings in `variant="lift"` — training focus, experience,
 * lift days + split, equipment, injuries, engine toggles — so editing the lift
 * plan no longer drops the user into the full goal+nutrition+running editor.
 * The nutrition + running drafts thread through the (shared) buildPlan save
 * unchanged, so a lift edit never disturbs them. The full programme editor
 * stays reachable from Settings and the Programme ⋯ "Edit programme" menu.
 *
 * Composition mirrors SettingsTraining: useAuth for profile, useProgram for
 * the settings/rebuild/refresh writers, ProgrammeSettings for the grouped
 * form, and a page-level ScheduleLayoutSheet the form links out to.
 */
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useProgram } from "@/features/program/useProgram";
import SettingsSection from "@/components/settings/SettingsSection";
import ProgrammeSettings from "@/components/program/ProgrammeSettings";
import ScheduleLayoutSheet from "@/components/program/ScheduleLayoutSheet";

export default function SettingsLiftPlan() {
  const { profile, updateProfile } = useAuth();
  const {
    programState,
    updateSettings,
    regenerateProgram,
    refreshRunSchedule,
  } = useProgram();

  const [editLayoutOpen, setEditLayoutOpen] = useState(false);

  if (!profile) {
    // Brief auth-resolution window; route guards keep signed-out users out.
    return <SettingsSection title="Lift plan" />;
  }

  return (
    <>
      <SettingsSection
        title="Lift plan"
        subtitle="Focus, experience, lift days, equipment, injuries"
      >
        <ProgrammeSettings
          variant="lift"
          profile={profile}
          programState={programState}
          updateSettings={updateSettings}
          regenerateProgram={regenerateProgram}
          onOpenWeeklyLayout={() => setEditLayoutOpen(true)}
        />
      </SettingsSection>

      <ScheduleLayoutSheet
        open={editLayoutOpen}
        onClose={() => setEditLayoutOpen(false)}
        profile={profile}
        updateProfile={updateProfile}
        refreshRunSchedule={refreshRunSchedule}
        regenerateProgram={regenerateProgram}
      />
    </>
  );
}
