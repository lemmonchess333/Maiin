import { useState } from "react";
import { haptic } from "@/lib/haptic";
import { cn } from "@/lib/utils";
import BottomSheet from "@/components/ui/BottomSheet";
import SettingsSummaryRow from "@/components/settings/SettingsSummaryRow";
import type { UserProfile, UpdateProfileResult } from "@/lib/auth";

interface WorkoutPrefsSectionProps {
  autoRestTimer: boolean;
  setAutoRestTimer: (v: boolean) => void;
  defaultRestSeconds: number;
  setDefaultRestSeconds: (v: number) => void;
  audioCues: boolean;
  setAudioCues: (v: boolean) => void;
  updateProfile: (data: Partial<UserProfile>, opts?: { allowProtected?: boolean }) => Promise<UpdateProfileResult>;
}

function formatRest(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export default function WorkoutPrefsSection({
  autoRestTimer,
  setAutoRestTimer,
  defaultRestSeconds,
  setDefaultRestSeconds,
  audioCues,
  setAudioCues,
  updateProfile,
}: WorkoutPrefsSectionProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const primary = `Rest ${formatRest(defaultRestSeconds)} · ${autoRestTimer ? "Auto-start on" : "Auto-start off"}`;
  const secondary = `Voice cues ${audioCues ? "on" : "off"}`;

  return (
    <>
      <SettingsSummaryRow
        label="Workout preferences"
        primary={primary}
        secondary={secondary}
        onPress={() => setSheetOpen(true)}
      />
      <BottomSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title="Workout preferences"
        description="Rest timer and voice cue defaults"
      >
        <div className="space-y-3 overflow-y-auto px-4 pb-5 pt-4">
          <div className="flex items-center justify-between rounded-lg bg-muted p-4">
            <div>
              <p className="text-sm text-foreground">Auto-start rest timer</p>
              <p className="text-xs text-muted-foreground">Timer starts after completing a set</p>
            </div>
            <button
              onClick={async () => {
                haptic("light");
                const prev = autoRestTimer;
                const next = !autoRestTimer;
                setAutoRestTimer(next);
                const result = await updateProfile({ autoRestTimer: next });
                if (!result.ok) setAutoRestTimer(prev);
              }}
              aria-label="Toggle auto-start rest timer"
              role="switch"
              aria-checked={autoRestTimer}
              className={cn("relative h-6 w-10 rounded-full transition-colors", autoRestTimer ? "bg-primary" : "border border-border bg-muted")}
            >
              <div className={cn("absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform", autoRestTimer ? "translate-x-5" : "translate-x-1")} />
            </button>
          </div>

          <div className="flex items-center justify-between rounded-lg bg-muted p-4">
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
              className="rounded-lg border border-border/50 bg-card px-2 py-1 text-sm"
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

          <div className="flex items-center justify-between rounded-lg bg-muted p-4">
            <div>
              <p className="text-sm text-foreground">Voice cues</p>
              <p className="text-xs text-muted-foreground">Voice announcements during runs</p>
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
              aria-label="Toggle voice cues"
              role="switch"
              aria-checked={audioCues}
              className={cn("relative h-6 w-10 rounded-full transition-colors", audioCues ? "bg-primary" : "border border-border bg-muted")}
            >
              <div className={cn("absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform", audioCues ? "translate-x-5" : "translate-x-1")} />
            </button>
          </div>
        </div>
      </BottomSheet>
    </>
  );
}
