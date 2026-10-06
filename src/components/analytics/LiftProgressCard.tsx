import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import ExerciseThumb from "@/components/program/ExerciseThumb";
import Sparkline from "./Sparkline";
import { NewRecordChip } from "./PRCard";
import { LIFT_PROGRESS_SHOWN, type LiftProgressRow } from "@/lib/liftProgress";
import { parseLocalDate } from "@/lib/dateHelpers";
import { formatDayMonth } from "@/utils/formatters";
import { THEME } from "@/lib/theme";
import { T1_SPARKLINE_MIN_POINTS } from "@/lib/dataConfidence";

const day = (key: string) => formatDayMonth(parseLocalDate(key));
const setText = (set: { weight: number; reps: number }) =>
  `${set.weight} kg × ${set.reps}`;

/** Where the lift stands, in one line of plain words. */
function statusLine(row: LiftProgressRow): string {
  if (row.holding) {
    const n = row.holding.sessionsSince;
    return `No new best since ${day(row.holding.best.date)} · ${n} ${
      n === 1 ? "session" : "sessions"
    }`;
  }
  const from = `${setText(row.first)} on ${day(row.first.date)}`;
  if (row.direction === "up") return `Up from ${from}`;
  if (row.direction === "down") return `Down from ${from}`;
  return `Level with ${from}`;
}

/**
 * Each main lift's progress on the Lifting page (DS3): the latest top set,
 * where it came from in the range, and its line.
 *
 * A lifter opens Analytics to ask whether their lifts are going up. The
 * page answered with a month's tonnage, which a heavier leg day moves more
 * than any bench press ever will. This answers per lift, in sets they
 * lifted: "82.5 kg × 6, up from 75 kg × 6 on 28 Aug". A lift that has
 * stopped moving says so plainly, with how long and how many sessions,
 * because a stall is the most useful thing on the page and "Level" would
 * hide it. Gold marks a best set this week and nothing else.
 *
 * Each row opens the exercise's own history, where the full chart is.
 */
export default function LiftProgressCard({
  rows,
  subtitle,
  hasSessions = false,
}: {
  rows: readonly LiftProgressRow[];
  /** The range: "Last 30 days". */
  subtitle: string;
  /** Sessions in the range, none of them a lift's second: the card says
   *  what it is waiting for rather than vanishing, since every new user
   *  starts here. */
  hasSessions?: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  if (rows.length === 0 && !hasSessions) return null;
  const shown = showAll ? rows : rows.slice(0, LIFT_PROGRESS_SHOWN);
  const hidden = rows.length - LIFT_PROGRESS_SHOWN;

  return (
    <Card as="section" aria-label="Your lifts" className="space-y-3">
      <div>
        <h2 className="text-h3 font-bold text-foreground">Your lifts</h2>
        <p className="text-sm text-muted-foreground">
          Each session&apos;s top set · {subtitle}
        </p>
      </div>
      {rows.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Repeat a lift to see progress
        </p>
      )}
      {/* At larger text the picture gives way under 16em and the top set
          drops under the lift's line, rather than squeezing it to a word
          a line. Wide-first. */}
      <ul className="@container -mx-2">
        {shown.map((row) => (
          <li key={row.exerciseId || row.name}>
            <Link
              to={`/history/exercise/${encodeURIComponent(row.name)}`}
              className="flex min-h-[56px] flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-2 py-2 active:bg-muted/40 motion-safe:transition-colors"
            >
              <ExerciseThumb
                exerciseId={row.exerciseId || row.name}
                size="sm"
                className="@max-[16em]:hidden"
              />
              <div className="min-w-[min(100%,8em)] flex-1">
                <p className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-foreground">
                    {row.name}
                  </span>
                  {row.newBest && <NewRecordChip label="New best" />}
                </p>
                <p
                  className="mt-0.5 text-xs text-muted-foreground"
                  data-testid="lift-status"
                >
                  {statusLine(row)}
                </p>
              </div>
              <div className="ml-auto flex shrink-0 flex-col items-end gap-1">
                <span className="text-sm font-bold font-mono tabular-nums text-foreground">
                  {setText(row.latest)}
                </span>
                {row.series.length >= T1_SPARKLINE_MIN_POINTS && (
                  <Sparkline
                    values={row.series}
                    color={THEME.lifting}
                    width={56}
                    height={16}
                    endDot
                  />
                )}
              </div>
              <ChevronRight
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            </Link>
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <Button
          variant="ghost"
          size="md"
          fullWidth
          aria-expanded={showAll}
          onClick={() => setShowAll((v) => !v)}
        >
          {showAll ? "Show fewer" : `Show all ${rows.length} lifts`}
        </Button>
      )}
    </Card>
  );
}
