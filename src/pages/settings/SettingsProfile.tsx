/**
 * SettingsProfile — Profile section nested page (Set1.2).
 * Hosts the photo, name and body metrics. State hoisted locally instead of
 * from the legacy Settings.tsx page.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye } from "lucide-react";
import { useAuth } from "@/lib/auth";
import SettingsSection from "@/components/settings/SettingsSection";
import SettingsAvatar from "@/components/settings/SettingsAvatar";
import ProfileInfoSection from "@/components/settings/ProfileInfoSection";
import { SettingsGroup, SettingsRow } from "@/components/settings/SettingsList";

export default function SettingsProfile() {
  const navigate = useNavigate();
  const { user, profile, updateProfile } = useAuth();
  const [name, setName] = useState(profile?.displayName ?? "");
  const [weightKg, setWeightKg] = useState(profile?.weightKg ?? 70);
  const [heightCm, setHeightCm] = useState(profile?.heightCm ?? 170);

  if (!profile) return <SettingsSection title="Profile" />;

  return (
    <SettingsSection
      title="Profile"
      subtitle="Photo, name, body metrics"
      section="profile_info"
    >
      {/* The photo lives here as well as on the Settings list: this page
          said "photo" in its subtitle and showed none. */}
      <div className="flex items-center gap-3">
        <SettingsAvatar profile={profile} />
        <p className="text-sm text-muted-foreground">
          Tap the photo to change it
        </p>
      </div>
      <ProfileInfoSection
        inline
        profile={profile}
        name={name}
        setName={setName}
        weightKg={weightKg}
        setWeightKg={setWeightKg}
        heightCm={heightCm}
        setHeightCm={setHeightCm}
        updateProfile={updateProfile}
      />
      {user && (
        <SettingsGroup>
          <SettingsRow
            icon={Eye}
            label="See your profile as others do"
            onClick={() => navigate(`/user/${user.uid}`)}
          />
        </SettingsGroup>
      )}
    </SettingsSection>
  );
}
