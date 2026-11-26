import { useMemo } from "react";
import { Card } from "@/components/ui/Card";
import {
  computeHybridTrainingLoad,
  type ComputeHybridTrainingLoadInput,
  type HybridFormStatus,
} from "@/lib/hybridTrainingLoad";

const STATUS_LABELS: Record<
  Exclude<HybridFormStatus, "insufficient">,
  string
> = {
  fresh: "Fresh",
  optimal: "Balanced",
  building: "Building",
  overreaching: "Heavy load",
};

function formatSigned(value: number): string {
  if (value > 0) return `+${value.toFixed(1)}`;
  if (value < 0) return `−${Math.abs(value).toFixed(1)}`;
  return "0.0";
}

export default function HybridLoadCard({
  workouts,
  runs,
  todayKey,
}: ComputeHybridTrainingLoadInput) {
  const load = useMemo(
    () => computeHybridTrainingLoad({ workouts, runs, todayKey }),
    [workouts, runs, todayKey]
  );

  if (load.status === "insufficient") return null;

  const statusLabel = STATUS_LABELS[load.status];
  const deltaAbs = Math.abs(load.fitnessDelta14d).toFixed(1);
  const trendLead =
    load.fitnessDelta14d >= 0.5
      ? "up"
      : load.fitnessDelta14d <= -0.5
        ? "down"
        : "steady";

  const guidance =
    load.status === "overreaching"
      ? "Recent fatigue is well above your 6-week base. A lighter day or two helps absorb the work."
      : load.status === "building"
        ? "Recent load is ahead of your 6-week base. Keep easy sessions genuinely easy."
        : load.status === "fresh"
          ? "Fatigue has cleared below your 6-week base, leaving room for a harder effort."
          : "Recent load and your 6-week base are in balance for steady training.";

  return (
    <Card size="compact" tone="flat" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1 text-sm">
        <span className="font-medium text-foreground">Fitness and form</span>
        <span className="text-xs text-muted-foreground">{statusLabel}</span>
      </div>

      <div className="@container">
        <div className="grid grid-cols-3 @max-[17em]:grid-cols-1 gap-3">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Fitness</p>
            <p className="text-lg font-bold font-figure tabular-nums text-foreground">
              {load.fitness.toFixed(1)}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Fatigue</p>
            <p className="text-lg font-bold font-figure tabular-nums text-foreground">
              {load.fatigue.toFixed(1)}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Form</p>
            <p className="text-lg font-bold font-figure tabular-nums text-foreground">
              {formatSigned(load.form)}
            </p>
          </div>
        </div>
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">
        {trendLead === "steady" ? (
          <>
            Fitness is steady over the last{" "}
            <span className="font-mono tabular-nums">14</span> days. {guidance}
          </>
        ) : (
          <>
            Fitness is {trendLead}{" "}
            <span className="font-mono tabular-nums">{deltaAbs}</span> over the
            last <span className="font-mono tabular-nums">14</span> days.{" "}
            {guidance}
          </>
        )}
      </p>

      <p className="text-xs text-muted-foreground">
        {load.hasLift && load.hasRun
          ? "Combined lifting and running"
          : load.hasLift
            ? "Lifting load"
            : "Running load"}{" "}
        · <span className="font-mono tabular-nums">{load.activeDays42d}</span>{" "}
        active days in <span className="font-mono tabular-nums">6</span> weeks
      </p>
    </Card>
  );
}
