import { isNonRaceGoal, type NonRaceGoal } from "@/lib/nonRaceGoal";

export default function NonRaceGoalSettings({
  value,
  onChange,
}: {
  value: NonRaceGoal | null;
  onChange: (value: NonRaceGoal | null) => void;
}) {
  const targetError =
    value?.kind === "runs"
      ? "Choose a whole number from 1 to 7 runs per week."
      : "Choose a whole number from 10 to 1200 minutes per week.";
  return (
    <section aria-label="Weekly running goal" className="space-y-3">
      <label className="block space-y-2 text-sm text-foreground">
        <span>Weekly running goal</span>
        <select
          className="ds-input min-h-11 w-full"
          value={value?.kind ?? ""}
          onChange={(e) =>
            onChange(
              e.target.value
                ? {
                    kind: e.target.value as NonRaceGoal["kind"],
                    target: e.target.value === "runs" ? 3 : 90,
                  }
                : null
            )
          }
        >
          <option value="">No weekly goal</option>
          <option value="runs">Number of runs</option>
          <option value="minutes">Time spent running</option>
        </select>
      </label>
      {value && (
        <label className="block space-y-2 text-xs text-muted-foreground">
          <span>
            {value.kind === "runs" ? "Runs per week" : "Minutes per week"}
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={value.kind === "runs" ? 1 : 10}
            max={value.kind === "runs" ? 7 : 1200}
            step={1}
            aria-invalid={!isNonRaceGoal(value)}
            value={value.target || ""}
            className="ds-input min-h-11 w-full font-mono tabular-nums"
            onChange={(e) =>
              onChange({ ...value, target: Number(e.target.value) })
            }
          />
        </label>
      )}
      {value && !isNonRaceGoal(value) && (
        <p role="status" className="text-xs text-muted-foreground">
          {targetError}
        </p>
      )}
      <p className="text-xs text-muted-foreground leading-relaxed">
        Run whenever suits you. Logged runs count towards your goal from Monday
        to Sunday; no workouts or race dates are added.
      </p>
    </section>
  );
}
