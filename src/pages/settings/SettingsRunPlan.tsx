/**
 * SettingsRunPlan — the dedicated run-plan editing screen.
 *
 * The focused destination for the Run tab's "Edit run plan" (on the race
 * card, or at the tab's foot for a free runner) and its "Set a race goal"
 * entry. Renders RunPlanSettings (running only: the race, its runway and
 * the run days) so editing the run plan does not drop the user into the
 * full onboarding-style ProgrammeSettings editor. It is a row on the
 * Settings list since Trim1 call 2; it sat under a Programme page before.
 * Voice cues for runs, from Settings → Workouts, are here too (call 7).
 *
 * Adjust this week (Run13) is not here: it adjusts the race plan's week,
 * so its one entry is the race card on Train's Run tab, where that week
 * is on screen.
 */
import { useAuth } from "@/lib/auth";
import { useProgram } from "@/features/program/useProgram";
import SettingsSection from "@/components/settings/SettingsSection";
import RunPlanSettings from "@/components/program/RunPlanSettings";
import RunFitnessSection from "@/components/settings/RunFitnessSection";
import HeartRateZonesSection from "@/components/settings/HeartRateZonesSection";
import VoiceCuesPref from "@/components/settings/VoiceCuesPref";

export default function SettingsRunPlan() {
  const { profile, updateProfile, refreshProfile } = useAuth();
  const { programState, readiness, recentLayoff } = useProgram();

  if (!profile) {
    // Brief auth-resolution window; route guards keep signed-out users out.
    return <SettingsSection title="Run plan" />;
  }

  return (
    <SettingsSection title="Run plan" subtitle="Your goal, run days and zones">
      <RunPlanSettings
        key={profile.uid}
        profile={profile}
        programState={programState}
        readiness={readiness}
        recentLayoff={recentLayoff}
        refreshProfile={refreshProfile}
      />
      <VoiceCuesPref
        key={`cues-${profile.uid}`}
        profile={profile}
        updateProfile={updateProfile}
      />

      {/*
        The two running-FITNESS inputs, below the plan they feed.
        Both shipped built and rendered by nothing (#1921), which for
        `HeartRateZonesSection` meant `profile.maxHeartRate` had three
        readers — DayActionSheet, ProgrammeRunSection, useHeartRate — and
        no way for a user to set it, so every one of them fell back to the
        Tanaka age estimate permanently. `RunFitnessSection` was claimed
        in writing by `PaceInsightCard`'s own header ("Used both in
        Settings (RunFitnessSection) and post-run (RunSummary)").

        Here because this page is the running-only destination and both
        are running physiology.
      */}
      <RunFitnessSection profile={profile} updateProfile={updateProfile} />
      <HeartRateZonesSection updateProfile={updateProfile} />
    </SettingsSection>
  );
}
