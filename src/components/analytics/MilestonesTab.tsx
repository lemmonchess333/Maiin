/**
 * The chronology — what has happened, newest first.
 *
 * Deliberately plain. The app already has surfaces that celebrate
 * (the completion screen), score (the performance index) and collect
 * (the badge grid below). This one only remembers, so it carries no
 * hero, no ring, no count-up and no confetti: a date column and a line
 * per thing, sport-coded so a lift and a run are distinguishable at a
 * glance without a legend.
 *
 * Grouped by month rather than rendered flat, because a year of PRs is a
 * wall of dates otherwise and the month heading is the cheapest way to
 * make it scannable.
 */
import { useMemo } from "react";
import { Dumbbell, Footprints, Trophy, Sparkles } from "lucide-react";
import SectionLabel from "@/components/ui/SectionLabel";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDayMonth } from "@/utils/formatters";
import { THEME } from "@/lib/theme";
import {
  buildMilestones,
  type Milestone,
  type MilestoneSources,
} from "@/lib/milestones";

/** Sport-coding, per the closed palette: purple lifts, coral runs. */
const KIND_STYLE: Record<
  Milestone["kind"],
  { Icon: typeof Dumbbell; tint: string }
> = {
  "first-workout": { Icon: Dumbbell, tint: THEME.brand },
  "lift-pr": { Icon: Dumbbell, tint: THEME.brand },
  "first-run": { Icon: Footprints, tint: THEME.running },
  badge: { Icon: Trophy, tint: THEME.brand },
};

/**
 * Month heading for a "yyyy-MM-dd" key, built from the numerals rather than
 * parsed into a Date and re-formatted. Handing a date-only string to the
 * Date constructor parses it as UTC, so the first of any month renders as
 * the previous month for every reader west of Greenwich — the local-vs-UTC
 * mixing the house rules ban.
 */
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
function monthHeading(isoDate: string): string {
  const [year, month] = isoDate.split("-");
  const index = Number(month) - 1;
  return MONTH_NAMES[index] ? `${MONTH_NAMES[index]} ${year}` : year;
}

/** Local-safe day label — same reason as above, no UTC round-trip. */
function dayLabel(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return formatDayMonth(new Date(year, month - 1, day));
}

function MilestoneRow({ milestone }: { milestone: Milestone }) {
  const { Icon, tint } = KIND_STYLE[milestone.kind];
  return (
    <li className="flex items-start gap-3 py-2.5">
      <div
        className="size-9 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: `${tint}1a` }}
      >
        <Icon className="size-4" style={{ color: tint }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground leading-tight">
          {milestone.title}
        </p>
        {milestone.detail && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {milestone.detail}
          </p>
        )}
      </div>
      <p className="text-xs text-muted-foreground font-mono tabular-nums shrink-0 pt-0.5">
        {dayLabel(milestone.date)}
      </p>
    </li>
  );
}

export default function MilestonesTab(sources: MilestoneSources) {
  const months = useMemo(() => {
    const milestones = buildMilestones(sources);
    const grouped: Array<{ heading: string; items: Milestone[] }> = [];
    for (const milestone of milestones) {
      const heading = monthHeading(milestone.date);
      const last = grouped[grouped.length - 1];
      if (last && last.heading === heading) last.items.push(milestone);
      else grouped.push({ heading, items: [milestone] });
    }
    return grouped;
  }, [sources]);

  if (months.length === 0) {
    return (
      <EmptyState
        icon={Sparkles}
        headline="Nothing to look back on yet"
        sub="Your first session, your bests and your badges will collect here as they happen."
      />
    );
  }

  return (
    <div className="space-y-5">
      {months.map((month) => (
        <section key={month.heading}>
          <SectionLabel tier="section">{month.heading}</SectionLabel>
          <ul className="mt-1 divide-y divide-border/50">
            {month.items.map((milestone) => (
              <MilestoneRow key={milestone.id} milestone={milestone} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
