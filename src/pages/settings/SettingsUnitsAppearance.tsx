/** SettingsUnitsAppearance — Units & appearance nested page (Set1.2). */
import { useAuth } from "@/lib/auth";
import { writeString } from "@/lib/localStore";
import SettingsSection from "@/components/settings/SettingsSection";
import UnitsAppearanceSection from "@/components/settings/UnitsAppearanceSection";

export default function SettingsUnitsAppearance() {
  const { profile, updateProfile } = useAuth();

  async function toggleUnit(
    key:
      | "preferredWeightUnit"
      | "liftingWeightUnit"
      | "preferredHeightUnit"
      | "preferredDistanceUnit",
    current: string
  ): Promise<void> {
    if (key === "preferredWeightUnit") {
      await updateProfile({
        preferredWeightUnit: current === "kg" ? "lbs" : "kg",
      });
    } else if (key === "liftingWeightUnit") {
      /* Display, like its siblings: every load stays stored in kg. What
         changes besides is the kit the plan rounds to from here on. The
         plan's copy of the unit (`settings.loadUnit`) follows from
         useProgram, which writes it whenever it differs from this field,
         on Home, Train and the programme pages: before any session can
         start. Mounting the programme here for it cost the page 1.8 kB. */
      await updateProfile({
        liftingWeightUnit: current === "lbs" ? "kg" : "lbs",
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

  if (!profile) return <SettingsSection title="Units & appearance" />;

  return (
    <SettingsSection
      title="Units & appearance"
      subtitle="Weight, distance, height, theme"
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
