/**
 * SettingsProfile — Profile section nested page (Set1.2).
 * Hosts name + body metrics. State hoisted locally instead of from the
 * legacy Settings.tsx page.
 */
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import SettingsSection from "@/components/settings/SettingsSection";
import ProfileInfoSection from "@/components/settings/ProfileInfoSection";

export default function SettingsProfile() {
  const { profile, updateProfile } = useAuth();
  const [name, setName] = useState(profile?.displayName ?? "");
  const [weightKg, setWeightKg] = useState(profile?.weightKg ?? 70);
  const [heightCm, setHeightCm] = useState(profile?.heightCm ?? 170);

  if (!profile) return <SettingsSection title="Profile" />;

  return (
    <SettingsSection title="Profile" subtitle="Name, photo, body metrics">
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
    </SettingsSection>
  );
}
