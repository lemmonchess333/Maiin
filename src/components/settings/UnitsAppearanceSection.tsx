import {
  Palette,
  Weight,
  Ruler,
  Moon,
  Sun,
} from "lucide-react";
import AccordionSection from "@/components/AccordionSection";
import type { UserProfile } from "@/lib/auth";

interface UnitsAppearanceSectionProps {
  profile: UserProfile;
  toggleUnit: (key: "preferredWeightUnit" | "preferredHeightUnit", current: string) => void;
  toggleDark: () => void;
}

export default function UnitsAppearanceSection({
  profile,
  toggleUnit,
  toggleDark,
}: UnitsAppearanceSectionProps) {
  return (
    <AccordionSection icon={<Palette className="w-5 h-5 text-primary" />} title="Units & Appearance" subtitle="Weight, height, dark mode">
      <div className="space-y-2">
        <button
          onClick={() => toggleUnit("preferredWeightUnit", profile.preferredWeightUnit)}
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
          onClick={() => toggleUnit("preferredHeightUnit", profile.preferredHeightUnit)}
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
          onClick={toggleDark}
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
