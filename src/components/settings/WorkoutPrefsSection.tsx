import { Timer } from "lucide-react";
import { Toggle } from "@/components/ui/Toggle";
import { haptic } from "@/lib/haptic";
import { track as trackSettingsEvent } from "@/lib/settingsAnalytics";
import AccordionSection from "@/components/AccordionSection";
import type { UserProfile, UpdateProfileResult } from "@/lib/auth";

/* A row's control drops under its label, at the right, once the label
   would be narrower than 8em: at double text on a 320px phone the switch
   beside it ran past the screen. At the designed size each row is one
   line, as before. */
const ROW =
  "flex flex-wrap items-center gap-x-3 gap-y-2 p-4 rounded-lg bg-muted";
const LABEL = "min-w-[min(100%,8em)] flex-1";

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
      title="Workout preferences"
      subtitle="Rest timer, audio cues"
    >
      <div className="space-y-3">
        <div className={ROW}>
          <div className={LABEL}>
            <p className="text-sm text-foreground">Auto-start rest timer</p>
            <p className="text-xs text-muted-foreground">
              Timer starts after completing a set
            </p>
          </div>
          <Toggle
            className="ml-auto"
            checked={autoRestTimer}
            label="Toggle auto-start rest timer"
            onChange={async () => {
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
          />
        </div>

        <div className={ROW}>
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
            className="ml-auto min-h-11 min-w-0 max-w-full bg-card rounded-lg px-3 text-sm border border-border/50"
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

        <div className={ROW}>
          <div className={LABEL}>
            <p className="text-sm text-foreground">Audio cues</p>
            <p className="text-xs text-muted-foreground">
              Voice announcements during runs
            </p>
          </div>
          <Toggle
            className="ml-auto"
            checked={audioCues}
            label="Toggle audio cues"
            onChange={async () => {
              haptic("light");
              const prev = audioCues;
              const next = !audioCues;
              setAudioCues(next);
              const result = await updateProfile({ audioCues: next });
              if (!result.ok) setAudioCues(prev);
            }}
          />
        </div>
      </div>
    </AccordionSection>
  );
}
