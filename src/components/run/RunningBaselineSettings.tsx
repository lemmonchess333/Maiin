import RecentRunningContext from "./RecentRunningContext";
import { localDateString } from "@/lib/dateHelpers";
import {
  isRunningBaseline,
  runningBaselineNeedsReview,
  type RunningBaseline,
} from "@/features/program/runningBaseline";
import type { RaceGoalPlannerState } from "@/lib/raceGoalPlanner";
import Button from "@/components/ui/Button";

export default function RunningBaselineSettings({
  value,
  onChange,
  preview,
}: {
  value: RunningBaseline | null;
  onChange: (value: RunningBaseline | null) => void;
  preview: RaceGoalPlannerState;
}) {
  const today = localDateString();
  const empty: RunningBaseline = {
    version: 1,
    experience: "building",
    weeklyMinutes: 0,
    longestRunMinutes: 0,
    confirmedAt: today,
    source: "self_reported",
  };
  const edit = (patch: Partial<RunningBaseline>) =>
    onChange({
      ...(value ?? empty),
      ...patch,
      confirmedAt: today,
      source: "self_reported",
    });
  const valid = isRunningBaseline(value);
  return (
    <section aria-label="Running starting point" className="space-y-3">
      <div>
        <p className="text-sm font-medium text-foreground">
          Your running starting point
        </p>
        <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
          Use recent training to keep planned runs within a familiar amount.
          Include running you do outside Tropos.
        </p>
      </div>
      {value ? (
        <>
          <label className="block space-y-2 text-xs text-muted-foreground">
            <span>Running experience</span>
            <select
              className="ds-input min-h-11 w-full"
              value={value.experience}
              onChange={(e) =>
                edit({
                  experience: e.target.value as RunningBaseline["experience"],
                })
              }
            >
              <option value="building">Building a running routine</option>
              <option value="returning">Returning after a break</option>
              <option value="regular">
                Running regularly, including faster sessions
              </option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                ["weeklyMinutes", "Recent minutes per week", 1200],
                ["longestRunMinutes", "Longest recent run, min", 300],
              ] as const
            ).map(([key, label, max]) => (
              <label
                key={key}
                className="block space-y-2 text-xs text-muted-foreground"
              >
                <span>{label}</span>
                <input
                  className="ds-input min-h-11 w-full font-mono tabular-nums"
                  type="number"
                  inputMode="numeric"
                  min={10}
                  max={max}
                  step={1}
                  aria-invalid={
                    !Number.isInteger(value[key]) ||
                    value[key] < 10 ||
                    value[key] > max ||
                    (key === "longestRunMinutes" &&
                      value[key] > value.weeklyMinutes)
                  }
                  value={value[key] || ""}
                  onChange={(e) => edit({ [key]: Number(e.target.value) })}
                />
              </label>
            ))}
          </div>
          {!valid && (
            <p role="status" className="text-xs text-muted-foreground">
              Enter your recent weekly total and longest run. The longest run
              cannot exceed the weekly total.
            </p>
          )}
          {valid && (
            <div
              aria-live="polite"
              className="space-y-1 text-xs text-muted-foreground leading-relaxed"
            >
              {runningBaselineNeedsReview(value, today) && (
                <p>
                  Your starting point needs a review. Easy running stays in
                  place until you confirm your current training.
                </p>
              )}
              <p>
                {value.experience === "regular" &&
                !runningBaselineNeedsReview(value, today)
                  ? "Faster sessions can stay where the plan and your recent running allow them."
                  : "The plan will use easy running while you build consistency."}{" "}
                Weekly time stays within this report where the available
                sessions fit. It will not increase automatically.
              </p>
              {preview.status !== "empty" && preview.status !== "invalid" && (
                <p>
                  Previewed week: about{" "}
                  <span className="font-mono tabular-nums">
                    {Math.round(preview.firstWeekMinutes)}
                  </span>{" "}
                  min.
                  {preview.firstWeekMinutes > value.weeklyMinutes
                    ? " This is above your report: the shortest sessions or protected runs do not fit. Review your run days and the preview before saving."
                    : ""}
                </p>
              )}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {valid && (
              <Button variant="outline" onClick={() => edit({})}>
                Confirm this is current
              </Button>
            )}
            <Button variant="ghost" onClick={() => onChange(null)}>
              Remove starting point
            </Button>
          </div>
        </>
      ) : (
        <Button variant="outline" onClick={() => onChange(empty)}>
          Add starting point
        </Button>
      )}
      <RecentRunningContext
        onUse={(context) =>
          onChange({
            ...(value ?? empty),
            weeklyMinutes: Math.round(context.averageWeeklyMinutes),
            longestRunMinutes: Math.round(context.longestMinutes),
            source: "recorded",
            confirmedAt: today,
          })
        }
      />
    </section>
  );
}
