import {
  Palette,
  Weight,
  Ruler,
  Moon,
  EyeOff,
  Footprints,
  Dumbbell,
} from "lucide-react";
import AccordionSection from "@/components/AccordionSection";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Toggle } from "@/components/ui/Toggle";
import { SettingsGroup, SettingsRow } from "@/components/settings/SettingsList";
import { track as trackSettingsEvent } from "@/lib/settingsAnalytics";
import { haptic } from "@/lib/haptic";
import type { UserProfile } from "@/lib/auth";
import { resolveLiftUnit } from "@/lib/liftLoad";

interface UnitsAppearanceSectionProps {
  profile: UserProfile;
  toggleUnit: (
    key:
      | "preferredWeightUnit"
      | "liftingWeightUnit"
      | "preferredHeightUnit"
      | "preferredDistanceUnit",
    current: string
  ) => void;
  toggleDark: () => void;
  toggleHideWeightNumber: () => void;
  inline?: boolean;
}

/* Every choice here is one of two, so each is a two-way switch that shows
   both options. They were rows whose value in capitals ("KG", "OFF")
   flipped when the row was tapped, with nothing to say it would. */
const CONTROL = "w-[124px] shrink-0";

export default function UnitsAppearanceSection({
  profile,
  toggleUnit,
  toggleDark,
  toggleHideWeightNumber,
  inline = false,
}: UnitsAppearanceSectionProps) {
  const theme = profile.darkMode ? "dark" : "light";
  const liftUnit = resolveLiftUnit(profile.liftingWeightUnit);
  return (
    <AccordionSection
      inline={inline}
      icon={<Palette className="size-5 text-primary" />}
      title="Units & appearance"
      subtitle="Weight, distance, height, theme"
    >
      <div className="space-y-4">
        <SettingsGroup title="Units">
          <SettingsRow
            icon={Weight}
            label="Body weight"
            description="Weigh-ins and goal weight"
            trailing={
              <SegmentedControl
                className={CONTROL}
                ariaLabel="Body weight unit"
                options={[
                  { value: "kg", label: "kg" },
                  { value: "lbs", label: "lb" },
                ]}
                value={profile.preferredWeightUnit}
                onChange={(next) => {
                  if (next === profile.preferredWeightUnit) return;
                  haptic("light");
                  trackSettingsEvent("settings_toggle_changed", {
                    toggle: "weight_unit",
                    value: next,
                  });
                  toggleUnit(
                    "preferredWeightUnit",
                    profile.preferredWeightUnit
                  );
                }}
              />
            }
          />
          {/* Lift18: its own switch, not body weight's. Someone who weighs
              in in stone lifts in kg. Loads stay stored in kg; this is
              how they read, and the plates the plan rounds to. */}
          <SettingsRow
            icon={Dumbbell}
            label="Lifting loads"
            description="Sets, targets, plates and bests"
            trailing={
              <SegmentedControl
                className={CONTROL}
                ariaLabel="Lifting load unit"
                options={[
                  { value: "kg", label: "kg" },
                  { value: "lbs", label: "lb" },
                ]}
                value={liftUnit}
                onChange={(next) => {
                  if (next === liftUnit) return;
                  haptic("light");
                  trackSettingsEvent("settings_toggle_changed", {
                    toggle: "lifting_unit",
                    value: next,
                  });
                  toggleUnit("liftingWeightUnit", liftUnit);
                }}
              />
            }
          />
          <SettingsRow
            icon={Footprints}
            label="Distance & pace"
            description="Runs, splits, elevation and spoken cues"
            trailing={
              <SegmentedControl
                className={CONTROL}
                ariaLabel="Distance unit"
                options={[
                  { value: "km", label: "km" },
                  { value: "mi", label: "mi" },
                ]}
                value={profile.preferredDistanceUnit}
                onChange={(next) => {
                  if (next === profile.preferredDistanceUnit) return;
                  haptic("light");
                  trackSettingsEvent("settings_toggle_changed", {
                    toggle: "run_distance_unit",
                    value: next,
                  });
                  toggleUnit(
                    "preferredDistanceUnit",
                    profile.preferredDistanceUnit
                  );
                }}
              />
            }
          />
          <SettingsRow
            icon={Ruler}
            label="Height"
            trailing={
              <SegmentedControl
                className={CONTROL}
                ariaLabel="Height unit"
                options={[
                  { value: "cm", label: "cm" },
                  { value: "ft", label: "ft" },
                ]}
                value={profile.preferredHeightUnit}
                onChange={(next) => {
                  if (next === profile.preferredHeightUnit) return;
                  haptic("light");
                  trackSettingsEvent("settings_toggle_changed", {
                    toggle: "height_unit",
                    value: next,
                  });
                  toggleUnit(
                    "preferredHeightUnit",
                    profile.preferredHeightUnit
                  );
                }}
              />
            }
          />
        </SettingsGroup>

        <SettingsGroup title="Appearance">
          <SettingsRow
            icon={Moon}
            label="Theme"
            trailing={
              <SegmentedControl
                className={CONTROL}
                ariaLabel="Theme"
                options={[
                  { value: "dark", label: "Dark" },
                  { value: "light", label: "Light" },
                ]}
                value={theme}
                onChange={(next) => {
                  if (next === theme) return;
                  haptic("light");
                  trackSettingsEvent("settings_toggle_changed", {
                    toggle: "theme",
                    value: next,
                  });
                  toggleDark();
                }}
              />
            }
          />
          {/* #984 "Hide the number" anti-anxiety mode. Hides the raw
              body-weight figure app-wide (home tile + Progress trend
              chart) and shows direction/trend + goal progress instead.
              OFF by default. */}
          <SettingsRow
            icon={EyeOff}
            label="Hide weight number"
            description="Show your trend, not the figure"
            trailing={
              <Toggle
                label="Hide weight number"
                checked={!!profile.hideWeightNumber}
                onChange={() => {
                  haptic("light");
                  trackSettingsEvent("settings_toggle_changed", {
                    toggle: "hide_weight_number",
                    value: profile.hideWeightNumber ? "off" : "on",
                  });
                  toggleHideWeightNumber();
                }}
              />
            }
          />
        </SettingsGroup>
      </div>
    </AccordionSection>
  );
}
