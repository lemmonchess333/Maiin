/**
 * SettingsTraining — Programme settings nested page (Set1.1 / A1c / Run8).
 *
 * Run8 grill (see `/root/.claude/plans/gentle-giggling-creek.md`)
 * makes this page the canonical destination for ALL programme-structure
 * editing: run mode, race goal, run-days / lift-days frequencies, lift
 * split, weekly layout. The Programme page's "Manage Run Plan ›"
 * footer link deeplinks here in PR1; before that, ProgrammeRunSection
 * still owns its inline mode pills + race-goal form, but tapping
 * "Change plan ›" already lands users here.
 *
 * Composition:
 *   - `useAuth` for profile + updateProfile
 *   - `useProgram` for refreshRunSchedule (needed by mode + race
 *     writers) + regenerateProgram (needed by ScheduleLayoutSheet)
 *   - `TrainingSection` renders the three sub-sections (Run plan /
 *     Lift plan / Weekly layout) + retained Programme-link +
 *     Edit-programme retake-onboarding rows
 *   - `ScheduleLayoutSheet` mounted at the page level; TrainingSection
 *     opens it via the `onOpenWeeklyLayout` callback
 *
 * Locked vocabulary (Run8-Vocab): mode pills "Freeform / Structured /
 * Race Prep". Section labels "Run plan / Lift plan / Weekly layout".
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useProgram } from "@/features/program/useProgram";
import SettingsSection from "@/components/settings/SettingsSection";
import TrainingSection from "@/components/settings/TrainingSection";
import ScheduleLayoutSheet from "@/components/program/ScheduleLayoutSheet";

export default function SettingsTraining() {
  const navigate = useNavigate();
  const { profile, updateProfile } = useAuth();
  const { refreshRunSchedule, regenerateProgram } = useProgram();

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
        subtitle="Mode, race goal, frequency, weekly layout"
      >
        <TrainingSection
          profile={profile}
          updateProfile={updateProfile}
          refreshRunSchedule={refreshRunSchedule}
          navigate={navigate}
          onOpenWeeklyLayout={() => setEditLayoutOpen(true)}
        />
      </SettingsSection>

      {/* Schedule layout editor — mounted at page level so the
          sheet's lifecycle matches the page, not a sub-section. The
          sheet itself owns its body's useProgrammeScheduleEditor
          hook re-mount on each open (per ScheduleLayoutSheet's
          intentional shell/body split). */}
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
