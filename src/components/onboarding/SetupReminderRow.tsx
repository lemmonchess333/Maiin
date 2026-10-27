import { useState } from "react";
import Card from "@/components/ui/Card";
import InlineNumerals from "@/components/ui/InlineNumerals";
import { Toggle } from "@/components/ui/Toggle";
import { requestNotificationPermission } from "@/lib/notifications";
import { isNativePlatform } from "@/lib/platform";
import { nextLiftName, reminderPreview } from "@/lib/workoutReminderCopy";
import type { ProgramState } from "@/features/program/programTypes";

/** The row's accessible name, and the words beside its switch. */
export const SETUP_REMINDER_LABEL = "Remind me on training days";

const TIME = /^\d{2}:\d{2}$/;

/**
 * Setup's one optional ask (Mob1 call 3): a reminder on training days at
 * a chosen time, previewed with the first session it would name ("Upper A
 * tomorrow at 07:30"). Nothing is asked until the switch is turned on;
 * then the phone's own permission question comes up, and a refusal
 * leaves the switch off and says where to change it. Left off, setup
 * writes nothing and reminders stay off. Settings → Notifications is
 * where it changes afterwards.
 */
export default function SetupReminderRow({
  on,
  time,
  schedule,
  programme,
  onChange,
}: {
  on: boolean;
  time: string;
  /** The plan's week, which says which days are lift and run days. */
  schedule: ReadonlyArray<{ day: number; type: string }>;
  /** The plan's lifts, or null for a plan with none. */
  programme: Pick<ProgramState, "workouts" | "nextWorkoutOverride"> | null;
  onChange: (next: { on?: boolean; time?: string }) => void;
}) {
  // The first reminder, or null when it would never go off.
  const preview = reminderPreview(
    time,
    schedule,
    nextLiftName(programme),
    new Date()
  );
  const [refused, setRefused] = useState(false);
  const [asking, setAsking] = useState(false);
  const toggle = async () => {
    if (asking) return;
    if (on) {
      onChange({ on: false });
      return;
    }
    setAsking(true);
    const granted = await requestNotificationPermission();
    setAsking(false);
    setRefused(!granted);
    if (granted) onChange({ on: true });
  };
  return (
    <Card as="section" aria-label="Training-day reminder" className="space-y-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold">{SETUP_REMINDER_LABEL}</p>
          {preview && (
            <p className="text-sm text-muted-foreground">
              <InlineNumerals>{preview}</InlineNumerals>
            </p>
          )}
        </div>
        <Toggle
          className="shrink-0"
          checked={on}
          disabled={asking}
          label={SETUP_REMINDER_LABEL}
          onChange={() => void toggle()}
        />
      </div>
      {on && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <label htmlFor="setup-reminder-time" className="text-sm">
            Reminder time
          </label>
          <input
            id="setup-reminder-time"
            type="time"
            value={time}
            onChange={(e) => {
              if (TIME.test(e.target.value)) onChange({ time: e.target.value });
            }}
            className="ds-input ml-auto w-auto min-w-0 max-w-full text-sm font-mono tabular-nums"
          />
        </div>
      )}
      {refused && !on && (
        <p role="status" className="text-sm text-muted-foreground">
          {isNativePlatform()
            ? "Notifications are off for Tropos. Allow them in your phone's Settings, then turn this on in Settings → Notifications."
            : "Notifications are off for Tropos in this browser. Allow them in its site settings, then turn this on in Settings → Notifications."}
        </p>
      )}
      {/* The web build's reminder is a timer in the open page
          (`notifications.ts`), so it says so rather than promise more. */}
      {on && !isNativePlatform() && (
        <p className="text-xs text-muted-foreground">
          On the web, a reminder arrives only while Tropos is open in a tab.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Optional. You can change it in Settings → Notifications.
      </p>
    </Card>
  );
}
