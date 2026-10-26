import type { RaceGoalPlannerState } from "@/lib/raceGoalPlanner";
import type { RunTimeLimits } from "@/features/program/runTimeLimits";
import Select from "@/components/ui/Select";
import SectionHeading from "@/components/ui/SectionHeading";

export default function RunAvailabilitySettings({
  value,
  onChange,
  preview,
  hasConfirmedPace,
}: {
  value: RunTimeLimits;
  onChange: (value: RunTimeLimits) => void;
  preview: RaceGoalPlannerState;
  hasConfirmedPace: boolean;
}) {
  return (
    <section aria-label="Time for running" className="space-y-2">
      <div>
        <SectionHeading size="compact">Time for running</SectionHeading>
        <p className="mt-1 text-xs text-muted-foreground">
          The longest your runs can be. Race day stays as planned.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {(
          [
            ["sessionMinutes", "Other runs"],
            ["longRunMinutes", "Long run"],
          ] as const
        ).map(([key, label]) => (
          <label
            key={key}
            className="space-y-1.5 text-xs text-muted-foreground"
          >
            <span>{label}</span>
            <Select
              fieldClassName="font-mono tabular-nums"
              value={value[key] ?? ""}
              onChange={(event) =>
                onChange({
                  ...value,
                  [key]:
                    event.target.value === ""
                      ? null
                      : Number(event.target.value),
                })
              }
            >
              <option value="">No extra limit</option>
              {[30, 45, 60, 90, 120, 150].map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes} min
                </option>
              ))}
            </Select>
          </label>
        ))}
      </div>
      {(value.sessionMinutes !== null || value.longRunMinutes !== null) && (
        <div
          aria-live="polite"
          className="text-xs text-muted-foreground leading-relaxed space-y-1"
        >
          {preview.status !== "empty" && preview.status !== "invalid" && (
            <p>
              First week: about{" "}
              <span className="font-mono tabular-nums">
                {Math.round(preview.firstWeekMinutes)}
              </span>{" "}
              min in total.
              {preview.timeLimitedRuns > 0
                ? " Some sessions in this plan will be shorter to fit your time."
                : " The planned sessions already fit your time."}
            </p>
          )}
          <p>
            {hasConfirmedPace
              ? "Long-run estimates use your confirmed easy pace."
              : "Estimates use typical session times until you confirm an easy pace."}{" "}
            Actual duration can vary. If a long run cannot fit, an easy timed
            run takes its place. Less training time can limit race preparation.
          </p>
        </div>
      )}
    </section>
  );
}
