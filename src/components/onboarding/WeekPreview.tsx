import { useState } from "react";
import { Dumbbell, Footprints, Minus } from "lucide-react";
import Button from "@/components/ui/Button";
import { DAY_LABELS, type ScheduleDay } from "@/lib/scheduleUtils";
import { cn } from "@/lib/utils";

export default function WeekPreview({
  schedule,
  draft = false,
  freeRunning = false,
}: {
  schedule: ScheduleDay[];
  draft?: boolean;
  freeRunning?: boolean;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const detail = schedule.find((day) => day.day === selected);
  const lifts = schedule.filter(
    (day) => day.type === "lift" || day.type === "both"
  ).length;
  const runs = schedule.filter(
    (day) => day.type === "run" || day.type === "both"
  ).length;
  return (
    <section
      className="rounded-2xl bg-card card-shadow p-4 space-y-3"
      aria-label={draft ? "Draft week" : "Your week shape"}
    >
      <div>
        <h2 className="text-base font-semibold">
          {draft ? "Draft week" : "Your week shape"}
        </h2>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          <span className="font-mono tabular-nums">{lifts}</span> lifts
          {runs > 0 && (
            <>
              {" "}
              · <span className="font-mono tabular-nums">{runs}</span> runs
            </>
          )}
          {freeRunning && " · free running"}
        </p>
      </div>
      <div className="grid grid-cols-7 gap-0.5 -mx-2">
        {schedule.map(({ day, type }) => (
          <Button
            key={day}
            variant="ghost"
            aria-pressed={selected === day}
            aria-label={`${DAY_LABELS[day]}: ${type === "both" ? "lift and run" : type}`}
            onClick={() => setSelected(selected === day ? null : day)}
            className={cn(
              "min-w-11 min-h-16 px-0 flex-col gap-1 text-caption",
              selected === day && "bg-muted ring-1 ring-primary"
            )}
          >
            <span>{DAY_LABELS[day]}</span>
            <span className="flex h-5 items-center gap-0.5" aria-hidden="true">
              {(type === "lift" || type === "both") && (
                <Dumbbell className="size-4 text-lifting-strong" />
              )}
              {(type === "run" || type === "both") && (
                <Footprints className="size-4 text-running-strong" />
              )}
              {type === "rest" && (
                <Minus className="size-4 text-muted-foreground" />
              )}
            </span>
          </Button>
        ))}
      </div>
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {detail
          ? `${DAY_LABELS[detail.day]} · ${detail.type === "both" ? "Lift and run share this day." : detail.type === "lift" ? "A lifting slot. Sessions follow your split in order." : detail.type === "run" ? "A planned running slot." : "No planned session."}`
          : "Tap a day to inspect. Lifts follow your split in order."}
      </p>
      {freeRunning && (
        <p className="text-sm text-muted-foreground">
          Run when it suits you. Tropos won’t schedule your runs.
        </p>
      )}
    </section>
  );
}
