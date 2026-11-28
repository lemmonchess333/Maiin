import { useId } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import SectionHeading from "@/components/ui/SectionHeading";
import { useRunSegmentEfforts } from "@/hooks/useRunSegmentEfforts";
import { finishTimeLabel, nearDistanceLabel } from "@/lib/runLabels";
import { rankWords } from "@/lib/segments";
import type { DistanceUnit } from "@/lib/distanceUnits";

/**
 * A saved run's segment efforts (Run26 call 3): each segment it was timed
 * on, the time, and where that time stands among the runner's own efforts
 * there ("Your 2nd best"). A row opens the segment's page. Nothing shows
 * for a run timed on no segment, or while the efforts load: the card
 * arrives when the server has timed the run, a few seconds after saving.
 */
export default function RunSegmentEfforts({
  uid,
  runId,
  unit,
}: {
  uid: string | null | undefined;
  runId: string | null | undefined;
  unit: DistanceUnit;
}) {
  const headingId = useId();
  const { loading, failed, rows } = useRunSegmentEfforts(uid, runId);
  if (loading) return null;
  if (failed)
    return (
      <p className="text-center text-sm text-muted-foreground">
        Couldn’t load this run’s segments.
      </p>
    );
  if (rows.length === 0) return null;
  return (
    <Card
      as="section"
      tone="flat"
      aria-labelledby={headingId}
      className="space-y-1"
    >
      <SectionHeading id={headingId} size="compact">
        Segments
      </SectionHeading>
      <ul>
        {rows.map(({ effort, segment, rank, of }) => (
          <li key={effort.id}>
            <Link
              to={`/segment/${segment.id}`}
              className="-mx-2 flex min-h-[44px] items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <span className="min-w-0 flex-1">
                <span
                  dir="auto"
                  className="block truncate text-sm font-semibold text-foreground"
                >
                  {segment.name}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {nearDistanceLabel(segment.lengthMeters, unit)}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-base font-bold font-mono tabular-nums text-foreground">
                  {finishTimeLabel(effort.elapsedSeconds)}
                </span>
                <span
                  className={
                    rank === 1 && of > 1
                      ? "block text-xs font-semibold text-running-strong"
                      : "block text-xs text-muted-foreground"
                  }
                >
                  {rankWords(rank, of)}
                </span>
              </span>
              <ChevronRight
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
