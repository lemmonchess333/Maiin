import {
  Palette,
  Weight,
  Ruler,
  Moon,
  Sun,
} from "lucide-react";
import AccordionSection from "@/components/AccordionSection";
import { track as trackSettingsEvent } from "@/lib/settingsAnalytics";
import type { UserProfile } from "@/lib/auth";

interface UnitsAppearanceSectionProps {
  profile: UserProfile;
  toggleUnit: (key: "preferredWeightUnit" | "preferredHeightUnit", current: string) => void;
  toggleDark: () => void;
  inline?: boolean;
}

export default function UnitsAppearanceSection({
  profile,
  toggleUnit,
  toggleDark,
  inline = false,
}: UnitsAppearanceSectionProps) {
  return (
    <AccordionSection inline={inline} icon={<Palette className="w-5 h-5 text-primary" />} title="Units & Appearance" subtitle="Weight, height, dark mode">
      <div className="space-y-2">
        <button
          onClick={() => {
            // The current value flips on the next render; we capture
            // the value BEFORE the flip so the telemetry reads as
            // "user picked this state" rather than "user was on this
            // state". toggleUnit() handles the actual flip + persist.
            const next = profile.preferredWeightUnit === "kg" ? "lbs" : "kg";
            trackSettingsEvent("settings_toggle_changed", { toggle: "weight_unit", value: next });
            toggleUnit("preferredWeightUnit", profile.preferredWeightUnit);
          }}
          className="w-full flex items-center justify-between p-4 rounded-xl bg-muted hover:bg-muted/80 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Weight className="w-5 h-5" />
            <span>Weight Unit</span>
          </div>
          <span className="font-medium">
            {profile.preferredWeightUnit.toUpperCase()}
          </span>
        </button>

        <button
          onClick={() => {
            const next = profile.preferredHeightUnit === "cm" ? "ft" : "cm";
            trackSettingsEvent("settings_toggle_changed", { toggle: "distance_unit", value: next });
            toggleUnit("preferredHeightUnit", profile.preferredHeightUnit);
          }}
          className="w-full flex items-center justify-between p-4 rounded-xl bg-muted hover:bg-muted/80 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Ruler className="w-5 h-5" />
            <span>Height Unit</span>
          </div>
          <span className="font-medium">
            {profile.preferredHeightUnit.toUpperCase()}
          </span>
        </button>

        <button
          onClick={() => {
            trackSettingsEvent("settings_toggle_changed", { toggle: "theme", value: profile.darkMode ? "light" : "dark" });
            toggleDark();
          }}
          className="w-full flex items-center justify-between p-4 rounded-xl bg-muted hover:bg-muted/80 transition-colors"
        >
          <div className="flex items-center gap-3">
            {profile.darkMode ? (
              <Moon className="w-5 h-5" />
            ) : (
              <Sun className="w-5 h-5" />
            )}
            <span>Dark Mode</span>
          </div>
          <span className="font-medium">
            {profile.darkMode ? "ON" : "OFF"}
          </span>
        </button>
      </div>
    </AccordionSection>
  );
}
