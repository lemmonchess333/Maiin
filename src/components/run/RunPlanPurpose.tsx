import { format } from "date-fns";
import type { ScheduledRunDay } from "@/features/program/programTypes";
import { parseLocalDate } from "@/lib/dateHelpers";
import { adjacentDemandingRuns } from "@/lib/runSpacing";
import RunPurpose from "./RunPurpose";

export default function RunPlanPurpose({
  purpose,
  run,
  runDays,
}: {
  purpose?: string | null;
  run: ScheduledRunDay | null | undefined;
  runDays: readonly ScheduledRunDay[];
}) {
  const neighbours = run ? adjacentDemandingRuns(run, runDays) : [];
  const timeLimit = !run?.userOverride ? run?.timeLimit : undefined;
  if (!purpose && !neighbours.length && !timeLimit) return null;
  const days = [
    ...new Set(
      neighbours.map((day) => format(parseLocalDate(day.date!), "EEEE"))
    ),
  ].join(" and ");
  return (
    <RunPurpose>
      {purpose}
      {timeLimit && (
        <p className="text-sm text-muted-foreground leading-relaxed mt-2">
          This shorter session fits your saved time of about{" "}
          <span className="font-mono tabular-nums">{timeLimit.minutes}</span>{" "}
          minutes. You can adjust this in your run plan settings.
        </p>
      )}
      {neighbours.length > 0 && (
        <p className="text-sm text-muted-foreground leading-relaxed mt-2">
          Another demanding run is planned for {days}. You can move this run or
          choose an easier session to leave more space between them.
        </p>
      )}
    </RunPurpose>
  );
}
