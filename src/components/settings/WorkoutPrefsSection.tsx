import { Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptic";
import { track as trackSettingsEvent } from "@/lib/settingsAnalytics";
import AccordionSection from "@/components/AccordionSection";
import type { UserProfile, UpdateProfileResult } from "@/lib/auth";

interface WorkoutPrefsSectionProps {
  autoRestTimer: boolean;
  setAutoRestTimer: (v: boolean) => void;
  defaultRestSeconds: number;
  setDefaultRestSeconds: (v: number) => void;
  audioCues: boolean;
  setAudioCues: (v: boolean) => void;
  updateProfile: (data: Partial<UserProfile>) => Promise<UpdateProfileResult>;
  inline?: boolean;
}

export default function WorkoutPrefsSection({
  autoRestTimer,
  setAutoRestTimer,
  defaultRestSeconds,
  setDefaultRestSeconds,
  audioCues,
  setAudioCues,
  updateProfile,
  inline = false,
}: WorkoutPrefsSectionProps) {
  return (
    <AccordionSection
      inline={inline}
      icon={<Timer className="size-5 text-primary" />}
      title="Workout Preferences"
      subtitle="Rest timer, audio cues"
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between p-4 rounded-lg bg-muted">
          <div>
            <p className="text-sm text-foreground">Auto-start rest timer</p>
            <p className="text-xs text-muted-foreground">
              Timer starts after completing a set
            </p>
          </div>
          <button
            onClick={async () => {
              haptic("light");
              const prev = autoRestTimer;
              const next = !autoRestTimer;
              setAutoRestTimer(next);
              trackSettingsEvent("settings_toggle_changed", {
                toggle: "auto_rest_timer",
                value: next,
              });
              const result = await updateProfile({ autoRestTimer: next });
              if (!result.ok) setAutoRestTimer(prev);
            }}
            aria-label="Toggle auto-start rest timer"
            role="switch"
            aria-checked={autoRestTimer}
            className={cn(
              "w-10 h-6 rounded-full transition-colors relative",
              autoRestTimer ? "bg-primary" : "bg-muted border border-border"
            )}
          >
            <div
              className={cn(
                "size-4 rounded-full bg-white absolute top-1 transition-transform shadow-sm",
                autoRestTimer ? "translate-x-5" : "translate-x-1"
              )}
            />
          </button>
        </div>

        <div className="flex items-center justify-between p-4 rounded-lg bg-muted">
          <span className="text-sm text-foreground">Default rest time</span>
          <select
            value={defaultRestSeconds}
            onChange={async (e) => {
              const prev = defaultRestSeconds;
              const val = Number(e.target.value);
              setDefaultRestSeconds(val);
              const result = await updateProfile({ defaultRestSeconds: val });
              if (!result.ok) setDefaultRestSeconds(prev);
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

        <div className="flex items-center justify-between p-4 rounded-lg bg-muted">
          <div>
            <p className="text-sm text-foreground">Audio cues</p>
            <p className="text-xs text-muted-foreground">
              Voice announcements during runs
            </p>
          </div>
          <button
            onClick={async () => {
              haptic("light");
              const prev = audioCues;
              const next = !audioCues;
              setAudioCues(next);
              const result = await updateProfile({ audioCues: next });
              if (!result.ok) setAudioCues(prev);
            }}
            aria-label="Toggle audio cues"
            role="switch"
            aria-checked={audioCues}
            className={cn(
              "w-10 h-6 rounded-full transition-colors relative",
              audioCues ? "bg-primary" : "bg-muted border border-border"
            )}
          >
            <div
              className={cn(
                "size-4 rounded-full bg-white absolute top-1 transition-transform shadow-sm",
                audioCues ? "translate-x-5" : "translate-x-1"
              )}
            />
          </button>
        </div>
      </div>
    </AccordionSection>
  );
}
