import { Palette, Weight, Ruler, Moon, Sun, EyeOff } from "lucide-react";
import AccordionSection from "@/components/AccordionSection";
import { track as trackSettingsEvent } from "@/lib/settingsAnalytics";
import { haptic } from "@/lib/haptic";
import type { UserProfile } from "@/lib/auth";

interface UnitsAppearanceSectionProps {
  profile: UserProfile;
  toggleUnit: (
    key: "preferredWeightUnit" | "preferredHeightUnit",
    current: string
  ) => void;
  toggleDark: () => void;
  toggleHideWeightNumber: () => void;
  inline?: boolean;
}

export default function UnitsAppearanceSection({
  profile,
  toggleUnit,
  toggleDark,
  toggleHideWeightNumber,
  inline = false,
}: UnitsAppearanceSectionProps) {
  return (
    <AccordionSection
      inline={inline}
      icon={<Palette className="size-5 text-primary" />}
      title="Units & Appearance"
      subtitle="Weight, height, dark mode"
    >
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => {
            haptic("light");
            // The current value flips on the next render; we capture
            // the value BEFORE the flip so the telemetry reads as
            // "user picked this state" rather than "user was on this
            // state". toggleUnit() handles the actual flip + persist.
            const next = profile.preferredWeightUnit === "kg" ? "lbs" : "kg";
            trackSettingsEvent("settings_toggle_changed", {
              toggle: "weight_unit",
              value: next,
            });
            toggleUnit("preferredWeightUnit", profile.preferredWeightUnit);
          }}
          className="w-full flex items-center justify-between p-4 rounded-xl bg-card border border-border/60 hover:bg-muted/40 active:scale-[0.97] transition-all"
        >
          <div className="flex items-center gap-3">
            <Weight className="size-5" />
            <span>Weight Unit</span>
          </div>
          <span className="font-medium">
            {profile.preferredWeightUnit.toUpperCase()}
          </span>
        </button>

        {/* #984 "Hide the number" anti-anxiety mode. Hides the raw
            body-weight figure app-wide (home tile + Progress trend
            chart) and shows direction/trend + goal progress instead.
            OFF by default — calm framing for users who don't want to
            fixate on a daily figure. */}
        <button
          type="button"
          onClick={() => {
            haptic("light");
            // Capture the value BEFORE the flip so telemetry reads as
            // "user picked this state". toggleHideWeightNumber()
            // handles the actual flip + persist.
            trackSettingsEvent("settings_toggle_changed", {
              toggle: "hide_weight_number",
              value: profile.hideWeightNumber ? "off" : "on",
            });
            toggleHideWeightNumber();
          }}
          className="w-full flex items-center justify-between p-4 rounded-xl bg-card border border-border/60 hover:bg-muted/40 active:scale-[0.97] transition-all"
        >
          <div className="flex items-center gap-3">
            <EyeOff className="size-5" />
            <div className="text-left">
              <span>Hide weight number</span>
              <p className="text-xs text-muted-foreground">
                Show your trend, not the figure
              </p>
            </div>
          </div>
          <span className="font-medium">
            {profile.hideWeightNumber ? "ON" : "OFF"}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            haptic("light");
            const next = profile.preferredHeightUnit === "cm" ? "ft" : "cm";
            trackSettingsEvent("settings_toggle_changed", {
              toggle: "distance_unit",
              value: next,
            });
            toggleUnit("preferredHeightUnit", profile.preferredHeightUnit);
          }}
          className="w-full flex items-center justify-between p-4 rounded-xl bg-card border border-border/60 hover:bg-muted/40 active:scale-[0.97] transition-all"
        >
          <div className="flex items-center gap-3">
            <Ruler className="size-5" />
            <span>Height Unit</span>
          </div>
          <span className="font-medium">
            {profile.preferredHeightUnit.toUpperCase()}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            haptic("light");
            trackSettingsEvent("settings_toggle_changed", {
              toggle: "theme",
              value: profile.darkMode ? "light" : "dark",
            });
            toggleDark();
          }}
          className="w-full flex items-center justify-between p-4 rounded-xl bg-card border border-border/60 hover:bg-muted/40 active:scale-[0.97] transition-all"
        >
          <div className="flex items-center gap-3">
            {profile.darkMode ? (
              <Moon className="size-5" />
            ) : (
              <Sun className="size-5" />
            )}
            <span>Dark Mode</span>
          </div>
          <span className="font-medium">{profile.darkMode ? "ON" : "OFF"}</span>
        </button>
      </div>
    </AccordionSection>
  );
}
