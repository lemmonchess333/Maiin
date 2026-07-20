/** SettingsPrivacy — Social & Privacy nested page (Set1.2). */
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { usePrivacyZones } from "@/hooks/usePrivacyZones";
import SettingsSection from "@/components/settings/SettingsSection";
import PrivacySection from "@/components/settings/PrivacySection";

export default function SettingsPrivacy() {
  const { user, profile, updateProfile } = useAuth();
  const [defaultVisibility, setDefaultVisibility] = useState<
    "public" | "followers" | "private"
  >(profile?.defaultVisibility ?? "public");
  const [autoPostRuns, setAutoPostRuns] = useState(
    profile?.autoPostRuns ?? true
  );
  const [autoPostWorkouts, setAutoPostWorkouts] = useState(
    profile?.autoPostWorkouts ?? false
  );
  const { zones: privacyZones, addZone, removeZone } = usePrivacyZones();
  const [newZoneName, setNewZoneName] = useState("");
  const [newZoneRadius, setNewZoneRadius] = useState(500);

  if (!profile) return <SettingsSection title="Social & Privacy" />;

  return (
    <SettingsSection
      title="Social & Privacy"
      subtitle="Visibility, auto-post, GPS zones"
    >
      <PrivacySection
        inline
        user={user}
        profile={profile}
        updateProfile={updateProfile}
        defaultVisibility={defaultVisibility}
        setDefaultVisibility={setDefaultVisibility}
        autoPostRuns={autoPostRuns}
        setAutoPostRuns={setAutoPostRuns}
        autoPostWorkouts={autoPostWorkouts}
        setAutoPostWorkouts={setAutoPostWorkouts}
        privacyZones={privacyZones}
        addZone={addZone}
        removeZone={removeZone}
        newZoneName={newZoneName}
        setNewZoneName={setNewZoneName}
        newZoneRadius={newZoneRadius}
        setNewZoneRadius={setNewZoneRadius}
      />
    </SettingsSection>
  );
}
