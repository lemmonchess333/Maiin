import { useState } from "react";
import { Link } from "react-router-dom";
import { Feather, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { durationLabel, distanceLabel } from "@/lib/runLabels";
import { formatDayMonth } from "@/utils/formatters";
import { parseLocalDate } from "@/lib/dateHelpers";
import type { DistanceUnit } from "@/lib/distanceUnits";
import type { EaseWeekNudgeResult } from "@/lib/easeWeekNudge";
import { SHORT_TARGET_RATIO } from "@/lib/easeWeekNudge";

type ShortSessions = Extract<
  EaseWeekNudgeResult,
  { trigger: "short_sessions" }
>;
interface Props {
  trigger: "harder_ratings" | "pace_misses" | "short_sessions";
  count: number;
  total: number;
  evidence?: ShortSessions["evidence"];
  unit?: DistanceUnit;
  onEase: () => void;
  onDismiss: () => void;
}

/** Evidence-first suggestion. Only the existing preview's Apply changes a plan. */
export default function EaseWeekNudgeCard({
  trigger,
  count,
  total,
  evidence,
  unit = "km",
  onEase,
  onDismiss,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="relative rounded-xl p-3 bg-running/6 dark:bg-running/12 border border-running/20">
      <div className="flex items-start gap-3">
        <Feather
          className="size-5 text-running-strong shrink-0 mt-0.5"
          aria-hidden
        />
        <div className="flex-1 min-w-0 pr-9">
          <p className="text-sm font-semibold text-foreground">
            Take this week easier?
          </p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            {trigger === "harder_ratings" ? (
              <>
                You rated{" "}
                <span className="font-mono tabular-nums">{count}</span> of your
                last <span className="font-mono tabular-nums">{total}</span>{" "}
                rated runs harder than expected.
              </>
            ) : trigger === "pace_misses" ? (
              <>
                <span className="font-mono tabular-nums">{count}</span> of your
                last <span className="font-mono tabular-nums">{total}</span>{" "}
                judged tempo sessions were slower than their pace window.
              </>
            ) : (
              <>
                <span className="font-mono tabular-nums">{count}</span> of your
                last <span className="font-mono tabular-nums">{total}</span>{" "}
                comparable planned runs finished well short of their target.
                Time, conditions or tiredness could all play a part.
              </>
            )}
          </p>
        </div>
      </div>
      <IconButton
        aria-label="Dismiss"
        icon={<X />}
        onClick={onDismiss}
        className="absolute top-1 right-1"
      />
      <div className="mt-2 flex flex-wrap gap-1">
        <Button variant="sport-tinted" onClick={onEase}>
          Review easier week
        </Button>
        {evidence?.length ? (
          <Button
            variant="ghost"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "Hide runs" : "See runs"}
          </Button>
        ) : null}
      </div>
      {expanded && evidence?.length ? (
        <div className="mt-2 border-t border-running/20 pt-2">
          <p className="text-xs text-muted-foreground">
            Recorded less than{" "}
            <span className="font-mono tabular-nums">
              {Math.round(SHORT_TARGET_RATIO * 100)}%
            </span>{" "}
            of the saved target. Tap a run to check its details.
          </p>
          <ul className="mt-1">
            {evidence.map((run) => {
              const amount = (value: number) =>
                run.target.unit === "seconds"
                  ? durationLabel(value)
                  : distanceLabel(value, unit);
              return (
                <li key={run.id}>
                  <Link
                    to={`/run/${encodeURIComponent(run.id)}`}
                    className="flex flex-wrap justify-between items-center gap-2 min-h-11 rounded-lg px-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <span className="text-foreground">
                      {formatDayMonth(parseLocalDate(run.date))}
                    </span>
                    <span className="font-mono tabular-nums text-muted-foreground">
                      {amount(run.actual)} / {amount(run.target.value)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
