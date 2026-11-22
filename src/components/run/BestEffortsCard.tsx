import { useId } from "react";
import { Card } from "@/components/ui/Card";
import SectionHeading from "@/components/ui/SectionHeading";
import PlaceDisc from "@/components/run/PlaceDisc";
import { finishTimeLabel } from "@/lib/runLabels";
import { placeWords, type RunPlacing } from "@/lib/runPlacings";

/** One best effort, as `detectBestEfforts` returns it. */
export interface BestEffort {
  /** Metres. */
  distance: number;
  /** Seconds. */
  time: number;
  /** "1K", "5K", "10K". */
  label: string;
}

/**
 * A run's best efforts: the quickest 1K, 5K and 10K found anywhere in its
 * track, each as a time. One card for the finish screen and a saved run,
 * so the two list them the same way.
 *
 * Times use the result format (`finishTimeLabel`): a 10K over the hour
 * reads "1:02:30", never "62:30".
 *
 * On a saved run's page an effort that placed 1st to 3rd among the runs
 * before it carries its disc and its place in the segment card's words
 * ("Your 2nd best"; Run29).
 */
export default function BestEffortsCard({
  efforts,
  placings = [],
}: {
  efforts: readonly BestEffort[];
  placings?: readonly RunPlacing[];
}) {
  const headingId = useId();
  if (efforts.length === 0) return null;
  return (
    <Card as="section" aria-labelledby={headingId} className="space-y-2">
      <SectionHeading id={headingId} size="compact">
        Best efforts
      </SectionHeading>
      <dl>
        {efforts.map((effort) => {
          const placing = placings.find((p) => p.meters === effort.distance);
          return (
            <div
              key={effort.label}
              className="flex items-center justify-between gap-3 py-1.5"
            >
              <dt className="flex items-center gap-2 text-sm font-semibold text-running-strong">
                {placing && <PlaceDisc place={placing.place} decorative />}
                {effort.label}
              </dt>
              <dd className="text-right">
                <span className="block text-base font-bold font-mono tabular-nums text-foreground">
                  {finishTimeLabel(effort.time)}
                </span>
                {placing && (
                  <span className="block text-xs text-muted-foreground">
                    {placeWords(placing)}
                  </span>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </Card>
  );
}
