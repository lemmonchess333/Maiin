import { useState } from "react";
import RecentRunningContext from "./RecentRunningContext";
import { localDateString } from "@/lib/dateHelpers";
import {
  isRunningBaseline,
  type RunningBaseline,
} from "@/features/program/runningBaseline";
import { blankRunningStart } from "@/features/program/runningStartDraft";
import type { RaceGoalPlannerState } from "@/lib/raceGoalPlanner";
import Button from "@/components/ui/Button";
import InlineNumerals from "@/components/ui/InlineNumerals";
import Select from "@/components/ui/Select";
import SectionHeading from "@/components/ui/SectionHeading";

/**
 * The running a race plan starts from, in the run plan editor. A plan set
 * up or changed with no starting point takes one from the runs recorded in
 * the last four weeks, which the editor fills in (`fromRecent`) and this
 * says in a line with a way to change it; with none, it asks for the two
 * numbers, or "I'm new to running", which starts with the run-walk weeks.
 * What it shows is what the save keeps.
 */
export default function RunningBaselineSettings({
  value,
  onChange,
  preview,
  fromRecent = false,
  recentStart = null,
  defaultExperience = "building",
}: {
  value: RunningBaseline | null;
  onChange: (value: RunningBaseline | null) => void;
  preview: RaceGoalPlannerState;
  /** `value` is the editor's fill from the recorded runs, untouched. */
  fromRecent?: boolean;
  /** The starting point the recorded runs give, to go back to. */
  recentStart?: RunningBaseline | null;
  defaultExperience?: Exclude<RunningBaseline["experience"], "new">;
}) {
  const today = localDateString();
  const [editing, setEditing] = useState(false);
  const empty = blankRunningStart(defaultExperience, today);
  const edit = (patch: Partial<RunningBaseline>) => {
    // Typing keeps the questions open, so they don't give way to the
    // summary the moment both numbers are valid.
    setEditing(true);
    onChange({
      ...(value && value.experience !== "new" ? value : empty),
      ...patch,
      confirmedAt: today,
      source: "self_reported",
    });
  };
  const valid = isRunningBaseline(value);
  const isNew = valid && value.experience === "new";
  const asking = value !== null && (editing || !valid);
  return (
    <section aria-label="Running starting point" className="space-y-2">
      <div>
        <SectionHeading size="compact">
          Your running starting point
        </SectionHeading>
        <p className="mt-1 text-xs text-muted-foreground">
          Your recent running. The plan climbs from it each week.
        </p>
      </div>
      {value === null ? (
        <Button variant="outline" onClick={() => onChange(empty)}>
          Add starting point
        </Button>
      ) : !asking ? (
        <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
          <p className="text-sm text-foreground">
            {isNew ? (
              "New to running: your first six weeks run as run-walk, and the plan builds from there."
            ) : (
              <InlineNumerals>
                {`Starting from ${
                  value.source === "recorded"
                    ? "your recent running"
                    : "your running"
                }: about ${value.weeklyMinutes} min a week, longest run ${
                  value.longestRunMinutes
                } min.`}
              </InlineNumerals>
            )}
          </p>
          {fromRecent && (
            <p>From the runs recorded here in the last four weeks.</p>
          )}
          {!isNew &&
            preview.status !== "empty" &&
            preview.status !== "invalid" && (
              <p>
                Previewed week: about{" "}
                <span className="font-mono tabular-nums">
                  {Math.round(preview.firstWeekMinutes)}
                </span>{" "}
                min.
                {preview.firstWeekMinutes > value.weeklyMinutes &&
                !preview.runWalkWeeks
                  ? " This is more than your week: even the shortest runs on your run days add up past it. Fewer run days keep it closer."
                  : ""}
              </p>
            )}
          <Button variant="outline" onClick={() => setEditing(true)}>
            Change
          </Button>
        </div>
      ) : (
        <>
          {value.experience !== "new" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                {(
                  [
                    ["weeklyMinutes", "Minutes a week", 1200],
                    ["longestRunMinutes", "Longest run, min", 300],
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
                  Your running in a usual week, and your longest run lately. The
                  longest run is part of the week, so it can't be more.
                </p>
              )}
              <label className="block space-y-2 text-xs text-muted-foreground">
                <span>Running experience</span>
                <Select
                  value={value.experience}
                  onChange={(e) =>
                    edit({
                      experience: e.target
                        .value as RunningBaseline["experience"],
                    })
                  }
                >
                  <option value="building">Building a running routine</option>
                  <option value="returning">Returning after a break</option>
                  <option value="regular">
                    Running regularly, including faster sessions
                  </option>
                </Select>
              </label>
              {value.experience !== "regular" && (
                <p className="text-xs text-muted-foreground">
                  Runs stay easy while your running builds towards the plan.
                </p>
              )}
            </>
          )}
          <div className="flex flex-wrap gap-2">
            {valid && (
              <Button variant="outline" onClick={() => setEditing(false)}>
                Done
              </Button>
            )}
            {value.experience !== "new" && (
              <Button
                variant="outline"
                onClick={() => {
                  onChange({
                    version: 1,
                    experience: "new",
                    weeklyMinutes: 0,
                    longestRunMinutes: 0,
                    confirmedAt: today,
                    source: "self_reported",
                  });
                  setEditing(false);
                }}
              >
                I'm new to running
              </Button>
            )}
            {value.experience === "new" && (
              <Button variant="outline" onClick={() => onChange(empty)}>
                I run already
              </Button>
            )}
            {recentStart && (
              <Button
                variant="outline"
                onClick={() => {
                  onChange(recentStart);
                  setEditing(false);
                }}
              >
                Use my recent running
              </Button>
            )}
            <Button variant="ghost" onClick={() => onChange(null)}>
              Remove starting point
            </Button>
          </div>
        </>
      )}
      <RecentRunningContext
        onUse={(context) =>
          onChange({
            ...(value && value.experience !== "new" ? value : empty),
            weeklyMinutes: Math.max(
              Math.round(context.longestMinutes),
              Math.round(context.averageWeeklyMinutes)
            ),
            longestRunMinutes: Math.round(context.longestMinutes),
            source: "recorded",
            confirmedAt: today,
          })
        }
      />
    </section>
  );
}
