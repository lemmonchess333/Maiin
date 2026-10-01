/**
 * SettingsTraining — the Programme page (Set1.1 / Pgm4).
 *
 * Pgm4 made this the single, free destination for programme editing, then
 * the lift and run fields each got a focused editor (/settings/lift-plan,
 * /settings/run-plan) while this page went on rendering every lifting field
 * as well, so one setting could be changed from two pages. Since the
 * Settings pass (owner, 2026-10-01) it renders `ProgrammeSettings`'
 * overview: the saved setup, where each part is set, and the
 * whole-programme reset. The Programme page ⋯ menu deep-links here.
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
  const { profile, updateProfile, refreshProfile } = useAuth();
  const {
    programState,
    updateSettings,
    regenerateProgram,
    refreshRunSchedule,
    recentLayoff,
  } = useProgram();

  const [editLayoutOpen, setEditLayoutOpen] = useState(false);

  if (!profile) {
    // Defensive: route guards keep unauthenticated users out of
    // /settings/*; this is the brief auth-resolution window.
    return <SettingsSection title="Programme" />;
  }

  return (
    <>
      <SettingsSection
        title="Programme"
        subtitle="Your setup, and where each part is set"
        section="training"
      >
        <ProgrammeSettings
          variant="overview"
          profile={profile}
          programState={programState}
          recentLayoff={recentLayoff}
          updateSettings={updateSettings}
          regenerateProgram={regenerateProgram}
          refreshProfile={refreshProfile}
          onOpenWeeklyLayout={() => setEditLayoutOpen(true)}
          activeBlockFocus={
            programState?.trainingBlock?.owned
              ? programState.trainingBlock.focus
              : undefined
          }
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
