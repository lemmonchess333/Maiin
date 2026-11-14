import { Card } from "@/components/ui/Card";
import {
  racePredictionResult,
  racePredictionWords,
  type GoalRaceRecord,
} from "@/lib/racePrediction";

/**
 * The goal race against what Tropos predicted for it, on the run summary
 * and the saved run's page: "Tropos predicted 3:52:10. You ran 3:48:31,
 * 3:39 faster.", and where the prediction moved during the plan, the first
 * one ("First predicted 4:05:00 in week 1 of 18."). Nothing when there was
 * no prediction to compare with. The words are `racePrediction.ts`'s.
 */
export default function RacePredictionResult({
  record,
  actualS,
  className,
}: {
  record: GoalRaceRecord | null | undefined;
  /** The run's recorded time, seconds. */
  actualS: number | null | undefined;
  className?: string;
}) {
  const result = racePredictionResult(record, actualS);
  if (!result) return null;
  const words = racePredictionWords(result);
  const figure = "font-mono tabular-nums font-semibold";
  return (
    <Card className={className}>
      <p className="text-sm text-foreground">
        Tropos predicted <span className={figure}>{words.predicted}</span>. You
        ran <span className={figure}>{words.ran}</span>
        {words.gap === null ? (
          ", to the second."
        ) : (
          <>
            , <span className={figure}>{words.gap}</span> {words.verdict}.
          </>
        )}
      </p>
      {words.first && (
        <p className="mt-1 text-xs text-muted-foreground">
          First predicted{" "}
          <span className="font-mono tabular-nums">{words.first.time}</span>
          {words.first.when}.
        </p>
      )}
    </Card>
  );
}
