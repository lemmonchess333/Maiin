/** SettingsPrivacy — Social & privacy nested page (Set1.2). */
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { usePrivacyZones } from "@/hooks/usePrivacyZones";
import SettingsSection from "@/components/settings/SettingsSection";
import PrivacySection from "@/components/settings/PrivacySection";

export default function SettingsPrivacy() {
  const { user, profile, updateProfile } = useAuth();
  const { zones: privacyZones, addZone, removeZone } = usePrivacyZones();
  const [newZoneName, setNewZoneName] = useState("");
  const [newZoneRadius, setNewZoneRadius] = useState(500);

  if (!profile) return <SettingsSection title="Social & privacy" />;

  return (
    <SettingsSection
      title="Social & privacy"
      subtitle="Visibility, auto-post, GPS zones"
      section="privacy"
    >
      <PrivacySection
        inline
        user={user}
        profile={profile}
        updateProfile={updateProfile}
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
