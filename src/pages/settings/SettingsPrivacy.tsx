/** SettingsPrivacy — Social & privacy nested page (Set1.2). */
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { usePrivacyZones } from "@/hooks/usePrivacyZones";
import SettingsSection from "@/components/settings/SettingsSection";
import PrivacySection from "@/components/settings/PrivacySection";
import RestrictionExplainer from "@/components/settings/RestrictionExplainer";

export default function SettingsPrivacy() {
  const { user, profile, updateProfile, updateShareDefaults, refreshProfile } =
    useAuth();
  const { zones: privacyZones, addZone, removeZone } = usePrivacyZones();
  const [newZoneName, setNewZoneName] = useState("");
  const [newZoneRadius, setNewZoneRadius] = useState(500);

  // The Sharing row shows the account's answers, which another device may
  // have changed since this one loaded the profile. Read them again when
  // the page opens.
  useEffect(() => {
    refreshProfile().catch((err: unknown) =>
      logger.warn("[SettingsPrivacy] couldn't read the profile:", err)
    );
  }, [refreshProfile]);

  if (!profile) return <SettingsSection title="Social & privacy" />;

  return (
    <SettingsSection
      title="Social & privacy"
      subtitle="Visibility, auto-post, GPS zones"
      section="privacy"
    >
      {/* Only for a restricted account: what is stopped and why (S4e D6). */}
      <RestrictionExplainer uid={user?.uid} />
      <PrivacySection
        inline
        user={user}
        profile={profile}
        updateProfile={updateProfile}
        updateShareDefaults={updateShareDefaults}
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
