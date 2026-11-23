import { useId } from "react";
import { Card } from "@/components/ui/Card";
import SectionHeading from "@/components/ui/SectionHeading";
import InlineNumerals from "@/components/ui/InlineNumerals";
import PlaceDisc from "@/components/run/PlaceDisc";
import { finishTimeLabel } from "@/lib/runLabels";
import {
  placingDistanceName,
  placingGap,
  placingSentence,
  type RunPlacing,
} from "@/lib/runPlacings";

/**
 * Your top three, on the run finish (Run29): the distances this run placed
 * 1st to 3rd at among your own times, each with its disc, its time and
 * your best, and one sentence on a 2nd or 3rd ("Ran 5K in 25:41, your 2nd
 * fastest."). A finish says one reward sentence (DESIGN_GUIDE rule 30):
 * when the hero above says one (`rewardAbove`: a first 10K, a streak, the
 * longest run, a best), the card shows its rows and no sentence of its
 * own. A 1st is always the reward above it (`finishMoment`). A distance
 * run for the first time has no row. Nothing for a run that placed
 * nowhere.
 */
export default function TopThreeCard({
  placings,
  rewardAbove = false,
}: {
  placings: readonly RunPlacing[];
  /** The hero above already says a reward sentence. */
  rewardAbove?: boolean;
}) {
  const headingId = useId();
  if (placings.length === 0) return null;
  const sentence = rewardAbove ? null : placingSentence(placings);
  return (
    <Card
      as="section"
      aria-labelledby={headingId}
      data-top-three
      className="space-y-2"
    >
      <SectionHeading id={headingId} size="compact">
        Your top three
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
      </ul>
    </Card>
  );
}
