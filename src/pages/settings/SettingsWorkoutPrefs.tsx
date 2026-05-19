/** SettingsWorkoutPrefs — Workout-preferences nested page (Set1.2). */
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import SettingsSection from "@/components/settings/SettingsSection";
import WorkoutPrefsSection from "@/components/settings/WorkoutPrefsSection";

export default function SettingsWorkoutPrefs() {
  const { profile, updateProfile } = useAuth();
  const [autoRestTimer, setAutoRestTimer] = useState(profile?.autoRestTimer ?? true);
  const [defaultRestSeconds, setDefaultRestSeconds] = useState(profile?.defaultRestSeconds ?? 120);
  const [audioCues, setAudioCues] = useState(profile?.audioCues ?? true);

  if (!profile) return <SettingsSection title="Workout preferences" />;

  return (
    <SettingsSection title="Workout preferences" subtitle="Rest timer, audio cues">
      <WorkoutPrefsSection
        inline
        autoRestTimer={autoRestTimer}
        setAutoRestTimer={setAutoRestTimer}
        defaultRestSeconds={defaultRestSeconds}
        setDefaultRestSeconds={setDefaultRestSeconds}
        audioCues={audioCues}
        setAudioCues={setAudioCues}
        updateProfile={updateProfile}
      />
    </SettingsSection>
  );
}
