/** SettingsUnitsAppearance — Units & Appearance nested page (Set1.2). */
import { useAuth } from "@/lib/auth";
import { writeString } from "@/lib/localStore";
import SettingsSection from "@/components/settings/SettingsSection";
import UnitsAppearanceSection from "@/components/settings/UnitsAppearanceSection";

export default function SettingsUnitsAppearance() {
  const { profile, updateProfile } = useAuth();

  async function toggleUnit(
    key:
      | "preferredWeightUnit"
      | "preferredHeightUnit"
      | "preferredDistanceUnit",
    current: string
  ): Promise<void> {
    if (key === "preferredWeightUnit") {
      await updateProfile({
        preferredWeightUnit: current === "kg" ? "lbs" : "kg",
      });
    } else if (key === "preferredHeightUnit") {
      await updateProfile({
        preferredHeightUnit: current === "cm" ? "ft" : "cm",
      });
    } else {
      /* Display-only, like its two siblings: every run stays stored in
         metres and seconds per kilometre, so this flips back and forth
         with no migration and no stored document rewritten. */
      await updateProfile({
        preferredDistanceUnit: current === "km" ? "mi" : "km",
      });
    }
  }

  async function toggleDark(): Promise<void> {
    const prev = !!profile?.darkMode;
    const next = !prev;
    // Optimistic DOM + stored-theme swap so the visual change is
    // instant; revert both if the Firestore write fails.
    document.documentElement.classList.toggle("dark", next);
    writeString("tropos-dark-mode", String(next));
    const result = await updateProfile({ darkMode: next });
    if (!result.ok) {
      document.documentElement.classList.toggle("dark", prev);
      writeString("tropos-dark-mode", String(prev));
    }
  }

  // #984 "Hide the number" anti-anxiety mode. Mirrors toggleDark's
  // profile-update path (no raw setDoc).
  async function toggleHideWeightNumber(): Promise<void> {
    await updateProfile({ hideWeightNumber: !profile?.hideWeightNumber });
  }

  if (!profile) return <SettingsSection title="Units & Appearance" />;

  return (
    <SettingsSection
      title="Units & Appearance"
      subtitle="Weight, distance, height, dark mode"
      section="units_appearance"
    >
      <UnitsAppearanceSection
        inline
        profile={profile}
        toggleUnit={toggleUnit}
        toggleDark={toggleDark}
        toggleHideWeightNumber={toggleHideWeightNumber}
      />
    </SettingsSection>
  );
}
