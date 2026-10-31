import { useId, useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { localDateString, parseLocalDate } from "@/lib/dateHelpers";
import { formatTimeOfDay } from "@/utils/formatters";
import {
  startAt,
  startBounds,
  startDayName,
  startDays,
  startProblem,
} from "@/features/program/sessionStart";

const pad = (n: number) => String(n).padStart(2, "0");
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const MINUTES = Array.from({ length: 60 }, (_, m) => m);

/**
 * When a lift started, said on the finish screen (Mob2 call 12): a day,
 * today or one before it back to the session's floor (`startBounds`), and
 * a time of day in 24 hours. The workout is dated by the day it started
 * (Lift3), so this is what dates it. A time later than now, or before the
 * floor on its first day, says so and is not saved.
 *
 * Three native selects, as Settings asks for a reminder's time: the
 * phone's own picker, with every value written by the app ("18", "30"),
 * so the hours never take a device's 12-hour clock.
 */
export default function StartTimeSheet({
  startedAt,
  accountStart,
  planWeek,
  onSave,
  onClose,
}: {
  startedAt: number;
  /** When the account began, in ms (`accountStartMs`); null unknown. */
  accountStart: number | null;
  /** A programme day, whose start stays in the plan's week. */
  planWeek: boolean;
  onSave: (startedAt: number) => void;
  onClose: () => void;
}) {
  const id = useId();
  const [bounds] = useState(() =>
    startBounds({ now: Date.now(), startedAt, accountStart, planWeek })
  );
  const start = new Date(startedAt);
  const [day, setDay] = useState(localDateString(start));
  const [hour, setHour] = useState(start.getHours());
  const [minute, setMinute] = useState(start.getMinutes());
  const days = startDays(bounds);
  const today = localDateString(new Date(bounds.latest));
  const at = startAt(day, hour, minute);
  const problem = startProblem(at, bounds);
  const message =
    problem === "later-than-now"
      ? "That's later than now."
      : problem === "before-the-floor"
        ? `The earliest that day is ${formatTimeOfDay(new Date(bounds.earliest))}.`
        : null;

  return (
    <BottomSheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="When you started"
      description="The workout is saved on the day it started."
      className="z-[70]"
      overlayClassName="z-[60]"
    >
      <form
        className="space-y-4 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (problem) return;
          onSave(at);
        }}
      >
        <label htmlFor={`${id}-day`} className="block space-y-2 text-sm">
          <span>Day</span>
          <Select
            id={`${id}-day`}
            value={day}
            onChange={(event) => setDay(event.target.value)}
            fieldClassName="min-h-[44px] text-base"
          >
            {days.map((key) => (
              <option key={key} value={key}>
                {startDayName(parseLocalDate(key), today)}
              </option>
            ))}
          </Select>
        </label>
        <fieldset className="space-y-2 text-sm">
          <legend className="mb-2">Time</legend>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              aria-label="Hour"
              value={hour}
              onChange={(event) => setHour(Number(event.target.value))}
              className="w-auto min-w-[88px] flex-1"
              fieldClassName="min-h-[44px] text-base font-mono tabular-nums"
            >
              {HOURS.map((h) => (
                <option key={h} value={h}>
                  {pad(h)}
                </option>
              ))}
            </Select>
            <span aria-hidden="true" className="font-mono text-base">
              :
            </span>
            <Select
              aria-label="Minute"
              value={minute}
              onChange={(event) => setMinute(Number(event.target.value))}
              className="w-auto min-w-[88px] flex-1"
              fieldClassName="min-h-[44px] text-base font-mono tabular-nums"
            >
              {MINUTES.map((m) => (
                <option key={m} value={m}>
                  {pad(m)}
                </option>
              ))}
            </Select>
          </div>
        </fieldset>
        {message && (
          <p role="alert" className="text-sm text-destructive-strong">
            {message}
          </p>
        )}
        <Button type="submit" fullWidth disabled={problem !== null}>
          Save start time
        </Button>
        <Button variant="ghost" fullWidth onClick={onClose}>
          Cancel
        </Button>
      </form>
    </BottomSheet>
  );
}
