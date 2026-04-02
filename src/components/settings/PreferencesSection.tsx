import {
  Timer,
  Weight,
  Ruler,
  Moon,
  Sun,
} from "lucide-react";
import { cn } from "@/lib/utils";
import AccordionSection from "@/components/AccordionSection";
import type { UserProfile } from "@/lib/auth";

interface PreferencesSectionProps {
  profile: UserProfile;
  autoRestTimer: boolean;
  setAutoRestTimer: (v: boolean) => void;
  defaultRestSeconds: number;
  setDefaultRestSeconds: (v: number) => void;
  updateProfile: (data: Partial<UserProfile>, opts?: { allowProtected?: boolean }) => Promise<void>;
  toggleUnit: (key: "preferredWeightUnit" | "preferredHeightUnit", current: string) => void;
  toggleDark: () => void;
}

export default function PreferencesSection({
  profile,
  autoRestTimer,
  setAutoRestTimer,
  defaultRestSeconds,
  setDefaultRestSeconds,
  updateProfile,
  toggleUnit,
  toggleDark,
}: PreferencesSectionProps) {
  return (
    <AccordionSection icon={<Timer className="w-5 h-5 text-primary" />} title="Preferences" subtitle="Rest timer, units, dark mode">
      <div className="space-y-3">
        <p className="text-sm font-medium text-foreground">Workout Preferences</p>

        <div className="flex items-center justify-between p-4 rounded-lg bg-muted">
          <div>
            <p className="text-sm text-foreground">Auto-start rest timer</p>
            <p className="text-xs text-muted-foreground">Timer starts after completing a set</p>
          </div>
          <button
            onClick={async () => {
              const next = !autoRestTimer;
              setAutoRestTimer(next);
              await updateProfile({ autoRestTimer: next });
            }}
            aria-label="Toggle auto-start rest timer"
            role="switch"
            aria-checked={autoRestTimer}
            className={cn("w-10 h-6 rounded-full transition-colors relative", autoRestTimer ? "bg-primary" : "bg-muted border border-border")}
          >
            <div className={cn("w-4 h-4 rounded-full bg-white absolute top-1 transition-transform shadow-sm", autoRestTimer ? "translate-x-5" : "translate-x-1")} />
          </button>
        </div>

        <div className="flex items-center justify-between p-4 rounded-lg bg-muted">
          <span className="text-sm text-foreground">Default rest time</span>
          <select
            value={defaultRestSeconds}
            onChange={async (e) => {
              const val = Number(e.target.value);
              setDefaultRestSeconds(val);
              await updateProfile({ defaultRestSeconds: val });
            }}
            className="bg-card rounded-lg px-2 py-1 text-sm border border-border/50"
          >
            <option value={60}>1:00</option>
            <option value={90}>1:30</option>
            <option value={120}>2:00</option>
            <option value={150}>2:30</option>
            <option value={180}>3:00</option>
            <option value={240}>4:00</option>
            <option value={300}>5:00</option>
          </select>
        </div>
      </div>

      <p className="text-sm font-medium text-foreground mt-2">Units & Appearance</p>
      <div className="space-y-2">
        <button
          onClick={() => toggleUnit("preferredWeightUnit", profile.preferredWeightUnit)}
          className="w-full flex items-center justify-between p-4 rounded-lg bg-muted hover:bg-muted/80 transition-colors"
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
          className="w-full flex items-center justify-between p-4 rounded-lg bg-muted hover:bg-muted/80 transition-colors"
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
          className="w-full flex items-center justify-between p-4 rounded-lg bg-muted hover:bg-muted/80 transition-colors"
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
