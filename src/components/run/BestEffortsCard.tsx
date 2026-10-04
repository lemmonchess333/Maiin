import { useId } from "react";
import { Card } from "@/components/ui/Card";
import SectionHeading from "@/components/ui/SectionHeading";
import { finishTimeLabel } from "@/lib/runLabels";

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
 */
export default function BestEffortsCard({
  efforts,
}: {
  efforts: readonly BestEffort[];
}) {
  const headingId = useId();
  if (efforts.length === 0) return null;
  return (
    <Card as="section" aria-labelledby={headingId} className="space-y-2">
      <SectionHeading id={headingId} size="compact">
        Best efforts
      </SectionHeading>
      <dl>
        {efforts.map((effort) => (
          <div
            key={effort.label}
            className="flex items-baseline justify-between gap-3 py-1.5"
          >
            <dt className="text-sm font-semibold text-running-strong">
              {effort.label}
            </dt>
            <dd className="text-base font-bold font-mono tabular-nums text-foreground">
              {finishTimeLabel(effort.time)}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
