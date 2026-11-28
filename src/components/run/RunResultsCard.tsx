import { useId } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import SectionHeading from "@/components/ui/SectionHeading";
import InlineNumerals from "@/components/ui/InlineNumerals";
import PlaceDisc from "@/components/run/PlaceDisc";
import { finishTimeLabel, nearDistanceLabel } from "@/lib/runLabels";
import {
  placingDistanceName,
  placingGap,
  type RunPlacing,
} from "@/lib/runPlacings";
import { resultsSentence, type SegmentPlacing } from "@/lib/segments";
import type { DistanceUnit } from "@/lib/distanceUnits";

/** The most segment rows the finish lists; the rest are on the run's page,
 *  as Strava's Results shows a few and "View All Results". */
export const FINISH_SEGMENT_ROWS = 3;

/**
 * A run's results on the run finish, in one block as Strava's Results:
 * your top three (Run29), the distances this run placed 1st to 3rd at
 * among your own times, then its segments that placed 1st to 3rd among
 * your own efforts there (Run30 call 1). Each row has its disc, its time
 * and your best before it. A distance or a segment run for the first time
 * has no row; nothing shows for a run that placed nowhere.
 *
 * A finish says one reward sentence (DESIGN_GUIDE rule 30): when the hero
 * above says one (`rewardAbove`), the block shows its rows and no sentence.
 * Otherwise the strongest place leads (`resultsSentence`): a segment's 1st
 * ("Ran Hill Road in 3:25, your fastest yet.") over a distance's 2nd, a
 * distance at an equal place ("Ran 5K in 25:41, your 2nd fastest."). A
 * distance's 1st is the reward above it (`finishMoment`), so it has no
 * sentence here.
 */
export default function RunResultsCard({
  placings,
  segments = [],
  runId = null,
  unit = "km",
  rewardAbove = false,
}: {
  placings: readonly RunPlacing[];
  segments?: readonly SegmentPlacing[];
  /** The saved run, whose page lists every segment. */
  runId?: string | null;
  unit?: DistanceUnit;
  /** The hero above already says a reward sentence. */
  rewardAbove?: boolean;
}) {
  const headingId = useId();
  if (placings.length === 0 && segments.length === 0) return null;
  const sentence = rewardAbove ? null : resultsSentence(placings, segments);
  const shownSegments = segments.slice(0, FINISH_SEGMENT_ROWS);
  const moreSegments = segments.length - shownSegments.length;
  return (
    <Card
      as="section"
      tone="flat"
      aria-labelledby={headingId}
      data-run-results
      className="space-y-2"
    >
      <SectionHeading id={headingId} size="compact">
        Results
      </SectionHeading>
      {sentence && (
        <p className="text-sm text-muted-foreground">
          <InlineNumerals>{sentence}</InlineNumerals>
        </p>
      )}
      <ul>
        {placings.map((placing) => (
          <li
            key={placing.meters}
            className="flex min-h-[44px] flex-wrap items-center gap-x-3 gap-y-0.5 py-1.5"
          >
            <PlaceDisc place={placing.place} />
            <span className="text-sm font-semibold text-foreground">
              {placingDistanceName(placing.meters)}
            </span>
            <span className="ml-auto flex items-baseline gap-2">
              <span className="text-base font-bold font-mono tabular-nums text-foreground">
                {finishTimeLabel(placing.seconds)}
              </span>
              <span className="text-xs text-muted-foreground">
                <InlineNumerals>{placingGap(placing)}</InlineNumerals>
              </span>
            </span>
          </li>
        ))}
        {shownSegments.map((segment) => (
          <li key={segment.segmentId} data-segment-result>
            <Link
              to={`/segment/${segment.segmentId}`}
              className="-mx-2 flex min-h-[44px] items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <PlaceDisc place={segment.place} />
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
                  {finishTimeLabel(segment.seconds)}
                </span>
                <span className="block text-xs text-muted-foreground">
                  <InlineNumerals>{placingGap(segment)}</InlineNumerals>
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
      {moreSegments > 0 && runId && (
        <Link
          to={`/run/${runId}`}
          className="flex min-h-[44px] items-center text-sm font-semibold text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg"
        >
          {moreSegments === 1
            ? "1 more segment on the run’s page"
            : `${moreSegments} more segments on the run’s page`}
        </Link>
      )}
    </Card>
  );
}
