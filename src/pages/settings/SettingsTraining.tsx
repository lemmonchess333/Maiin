/**
 * SettingsTraining — the canonical Programme Settings page (Set1.1 / Pgm4).
 *
 * Pgm4 made this the single, free destination for ALL programme editing.
 * It renders the unified `ProgrammeSettings` editor (which replaced the
 * onboarding-retake, the 6-step ConfigurePlanModal wizard and the
 * ProgramSettingsPanel sheet). The Programme page ⋯ menu and
 * ProgrammeRunSection's "Change plan ›" both deeplink here.
 *
 * Composition:
 *   - `useAuth` for profile (+ updateProfile, needed by ScheduleLayoutSheet)
 *   - `useProgram` for programState + updateSettings + regenerateProgram +
 *     refreshRunSchedule
 *   - `ProgrammeSettings` renders the grouped form; rebuild-class edits go
 *     through buildPlan + configurePlan (preserveHistory:true)
 *   - `ScheduleLayoutSheet` mounted at the page level; ProgrammeSettings
 *     opens it via the `onOpenWeeklyLayout` callback (the day-by-day layout
 *     is the one thing the unified screen links out to rather than owns)
 */
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useProgram } from "@/features/program/useProgram";
import SettingsSection from "@/components/settings/SettingsSection";
import ProgrammeSettings from "@/components/program/ProgrammeSettings";
import ScheduleLayoutSheet from "@/components/program/ScheduleLayoutSheet";

export default function SettingsTraining() {
  const { profile, updateProfile } = useAuth();
  const { programState, updateSettings, regenerateProgram, refreshRunSchedule } =
    useProgram();

  const [editLayoutOpen, setEditLayoutOpen] = useState(false);

  if (!profile) {
    // Defensive: route guards keep unauthenticated users out of
    // /settings/*; this is the brief auth-resolution window.
    return <SettingsSection title="Programme settings" />;
  }

  return (
    <>
      <SettingsSection
        title="Programme settings"
        subtitle="Goal, nutrition, lifting, running, equipment, injuries"
      >
        <ProgrammeSettings
          profile={profile}
          programState={programState}
          updateSettings={updateSettings}
          regenerateProgram={regenerateProgram}
          onOpenWeeklyLayout={() => setEditLayoutOpen(true)}
        />
      </SettingsSection>

      {/* Day-by-day layout editor — mounted at page level so the sheet's
          lifecycle matches the page, not a sub-section. */}
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
