import { useState } from "react";
import { Toggle } from "@/components/ui/Toggle";
import Select from "@/components/ui/Select";
import { haptic } from "@/lib/haptic";
import { track as trackSettingsEvent } from "@/lib/settingsAnalytics";
import ProgrammeSettingsGroup from "@/components/program/ProgrammeSettingsGroup";
import type { UserProfile, UpdateProfileResult } from "@/lib/auth";

/* A row's control drops under its label, at the right, once the label
   would be narrower than 8em: at double text on a 320px phone the switch
   beside it ran past the screen. At the designed size each row is one
   line. */
const ROW = "flex flex-wrap items-center gap-x-3 gap-y-2";
const LABEL = "min-w-[min(100%,8em)] flex-1";

/**
 * The rest timer, on Lift plan: whether it starts by itself after a set,
 * and how long it runs.
 *
 * Both were two of the three controls on Settings → Workouts, a page of
 * its own with nothing else on it (the third, voice cues for runs, is on
 * Run plan). Trim1 call 7 (the owner, 11 November 2026: "streamline all")
 * put each beside the plan it belongs to. They save as they are switched,
 * as the two engine toggles above them do.
 */
export default function RestTimerPrefs({
  profile,
  updateProfile,
}: {
  profile: UserProfile;
  updateProfile: (data: Partial<UserProfile>) => Promise<UpdateProfileResult>;
}) {
  const [autoRestTimer, setAutoRestTimer] = useState(
    profile.autoRestTimer ?? true
  );
  // 0, or no answer yet: the plan suggests each lift's rest (`restTime.ts`).
  const [defaultRestSeconds, setDefaultRestSeconds] = useState(
    profile.defaultRestSeconds ?? 0
  );

  return (
    <ProgrammeSettingsGroup
      title="Rest timer"
      subtitle="These save as you switch them."
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
          <label
            htmlFor="rest-between-sets"
            className="text-sm text-foreground"
          >
            Rest between sets
          </label>
          <Select
            id="rest-between-sets"
            value={defaultRestSeconds}
            onChange={async (e) => {
              const prev = defaultRestSeconds;
              const val = Number(e.target.value);
              setDefaultRestSeconds(val);
              const result = await updateProfile({ defaultRestSeconds: val });
              if (!result.ok) setDefaultRestSeconds(prev);
            }}
            className="ml-auto w-auto min-w-0 max-w-full"
          >
            <option value={0}>Plan’s suggestion</option>
            <option value={60}>1:00</option>
            <option value={90}>1:30</option>
            <option value={120}>2:00</option>
            <option value={150}>2:30</option>
            <option value={180}>3:00</option>
            <option value={240}>4:00</option>
            <option value={300}>5:00</option>
          </Select>
        </div>
      </div>
    </ProgrammeSettingsGroup>
  );
}
