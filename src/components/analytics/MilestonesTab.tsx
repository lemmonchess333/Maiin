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
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Dumbbell,
  Footprints,
  Trophy,
  Sparkles,
  ChevronRight,
} from "lucide-react";
import SectionLabel from "@/components/ui/SectionLabel";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDayMonth } from "@/utils/formatters";
import { THEME } from "@/lib/theme";
import { useUid } from "@/lib/auth";
import { useTrainingBlock } from "@/features/program/useTrainingBlock";
import { buildBlockReview } from "@/features/program/blockReviewViewModel";
import { formatOneRepMaxRange } from "@/lib/analytics";
import { Button } from "@/components/ui/Button";
import { BottomSheet } from "@/components/ui/BottomSheet";
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
  "block-complete": { Icon: Dumbbell, tint: THEME.brand },
  "race-complete": { Icon: Footprints, tint: THEME.running },
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

function MilestoneRow({
  milestone,
  onOpenBlock,
}: {
  milestone: Milestone;
  onOpenBlock: (id: string) => void;
}) {
  const { Icon, tint } = KIND_STYLE[milestone.kind];
  const content = (
    <>
      <span
        className="size-9 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: `${tint}1a` }}
      >
        <Icon aria-hidden="true" className="size-4" style={{ color: tint }} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-foreground leading-tight">
          {milestone.title}
        </span>
        {milestone.detail && (
          <span
            className={`block text-xs text-muted-foreground mt-0.5${milestone.kind === "badge" ? "" : " font-mono tabular-nums"}`}
          >
            {milestone.detail}
          </span>
        )}
      </span>
      <span className="text-xs text-muted-foreground font-mono tabular-nums shrink-0 pt-0.5">
        {dayLabel(milestone.date)}
      </span>
      {(milestone.href || milestone.blockId) && (
        <ChevronRight
          aria-hidden="true"
          className="size-4 shrink-0 mt-0.5 text-muted-foreground"
        />
      )}
    </>
  );
  return (
    <li>
      {milestone.href ? (
        <Link
          to={milestone.href}
          className="flex min-h-11 items-start gap-3 py-2.5 pressable focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-lg"
        >
          {content}
        </Link>
      ) : milestone.blockId ? (
        <Button
          variant="ghost"
          fullWidth
          className="h-auto min-h-11 items-start justify-start gap-3 py-2.5 px-0 text-left whitespace-normal"
          onClick={() => onOpenBlock(milestone.blockId!)}
        >
          {content}
        </Button>
      ) : (
        <div className="flex items-start gap-3 py-2.5">{content}</div>
      )}
    </li>
  );
}

export default function MilestonesTab(
  sources: MilestoneSources & {
    workoutsLoading?: boolean;
    runsLoading?: boolean;
  }
) {
  const uid = useUid();
  // This component mounts only on Milestones. Programme archives are read
  // once there; the review reuses History's already-loaded workout records.
  const archive = useTrainingBlock(
    sources.blocks ? undefined : (uid ?? undefined)
  );
  const blocks = sources.blocks ?? archive.blocks;
  const [selectedBlock, setSelectedBlock] = useState<{
    uid: string | null;
    id: string;
  } | null>(null);
  const block =
    selectedBlock?.uid === uid
      ? blocks.find((b) => b.id === selectedBlock.id)
      : undefined;
  const review = useMemo(
    () =>
      block && !sources.workoutsLoading
        ? buildBlockReview(block, sources.workouts.slice())
        : null,
    [block, sources.workouts, sources.workoutsLoading]
  );
  const months = useMemo(() => {
    const milestones = buildMilestones({ ...sources, blocks });
    const grouped: Array<{ heading: string; items: Milestone[] }> = [];
    for (const milestone of milestones) {
      const heading = monthHeading(milestone.date);
      const last = grouped[grouped.length - 1];
      if (last && last.heading === heading) last.items.push(milestone);
      else grouped.push({ heading, items: [milestone] });
    }
    return grouped;
  }, [sources, blocks]);

  if (
    months.length === 0 &&
    !archive.loading &&
    !archive.failed &&
    !sources.workoutsLoading &&
    !sources.runsLoading
  ) {
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
      {archive.loading && (
        <p className="text-sm text-muted-foreground" role="status">
          Loading completed blocks…
        </p>
      )}
      {(sources.workoutsLoading || sources.runsLoading) && (
        <p className="text-sm text-muted-foreground" role="status">
          Loading saved sessions…
        </p>
      )}
      {archive.failed && (
        <p className="text-sm text-muted-foreground" role="status">
          Completed blocks couldn’t load. Your other milestones are still shown.
        </p>
      )}
      {months.map((month) => (
        <section key={month.heading}>
          <SectionLabel tier="section">{month.heading}</SectionLabel>
          <ul className="mt-1 divide-y divide-border/50">
            {month.items.map((milestone) => (
              <MilestoneRow
                key={milestone.id}
                milestone={milestone}
                onOpenBlock={(id) => setSelectedBlock({ uid, id })}
              />
            ))}
          </ul>
        </section>
      ))}
      <BottomSheet
        open={Boolean(block)}
        onOpenChange={(open) => {
          if (!open) setSelectedBlock(null);
        }}
        title={block?.title ?? "Completed block"}
        description="How the block went"
      >
        {block && sources.workoutsLoading && (
          <p className="px-4 py-8 text-sm text-muted-foreground" role="status">
            Loading the block’s sessions…
          </p>
        )}
        {block && review && (
          <div className="px-4 pt-3 pb-4 space-y-4">
            <p className="text-sm text-foreground">{review.verdict}</p>
            <p className="text-xs text-muted-foreground">
              <span className="font-mono tabular-nums">
                {review.completedLifts}
              </span>{" "}
              of{" "}
              <span className="font-mono tabular-nums">
                {review.plannedLifts}
              </span>{" "}
              planned lifts.
            </p>
            {review.anchors.some((a) => a.endE1rm) && (
              <div className="space-y-1.5">
                <SectionLabel>Main lifts</SectionLabel>
                {review.anchors
                  .filter((a) => a.endE1rm)
                  .map((anchor) => (
                    <div
                      key={anchor.exerciseId}
                      className="flex items-baseline justify-between gap-3"
                    >
                      <p className="text-xs text-foreground">
                        {anchor.exerciseName}
                      </p>
                      <p className="text-xs text-muted-foreground font-mono tabular-nums shrink-0">
                        ~{formatOneRepMaxRange(anchor.endE1rm!)}
                      </p>
                    </div>
                  ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Based on your saved sessions from this block.
            </p>
            <Button
              variant="secondary"
              fullWidth
              onClick={() => setSelectedBlock(null)}
            >
              Done
            </Button>
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
