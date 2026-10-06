import { Activity, TrendingDown, TrendingUp } from "lucide-react";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import SectionHeading from "@/components/ui/SectionHeading";
import { Skeleton } from "@/components/LoadingSkeleton";
import Sparkline from "@/components/analytics/Sparkline";
import { usePerformanceWeeks } from "@/hooks/usePerformance";
import {
  resolveLoadBand,
  resolveDeloadRecommended,
  isEstablishingBaseline,
} from "@/lib/performanceDocFields";
import {
  getVerb,
  getLine,
  getEstablishingLine,
  performanceEmptyCopy,
} from "@/lib/performanceLine";
import { getCardColour } from "@/lib/performanceColour";
import { addLocalDays, parseLocalDate } from "@/lib/dateHelpers";
import { formatDayMonth } from "@/utils/formatters";
import { haptic } from "@/lib/haptic";
import { THEME } from "@/lib/theme";

/** How many weekly scores the card's line draws. */
const WEEKS_SHOWN = 6;

/**
 * The overview's Performance card (DS3): the week's index, the verb and
 * line Home shows for it, and the last few weeks as one line. The gauge,
 * the index chart, the insights and the factor breakdown are one tap
 * away on the Performance page, which is also where Home's row opens.
 *
 * The verb and the line come from the same helpers as Home's row
 * (`getVerb`, `getLine`), so the two surfaces cannot name one week two
 * ways — the failure `performanceVerbParity.test.tsx` pins.
 */
export default function PerformanceOverviewCard({
  hasLoggedSession,
  onOpenDetails,
}: {
  /** Whether anything is logged at all: see `performanceEmptyCopy`. */
  hasLoggedSession: boolean;
  onOpenDetails: () => void;
}) {
  const { weeks, currentWeek, previousWeek, docsAvailable, loading } =
    usePerformanceWeeks(WEEKS_SHOWN);

  const details = (
    <button
      type="button"
      onClick={() => {
        haptic("light");
        onOpenDetails();
      }}
      className="inline-flex min-h-11 items-center text-sm font-semibold text-lifting-strong rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      Details
    </button>
  );

  if (loading) {
    return (
      <section aria-label="Performance" className="space-y-2">
        <SectionHeading>Performance</SectionHeading>
        <Card className="space-y-3">
          <Skeleton className="h-12 w-20" />
          <Skeleton className="h-10 w-full" />
        </Card>
      </section>
    );
  }

  if (!currentWeek) {
    const copy = performanceEmptyCopy(hasLoggedSession);
    return (
      <section aria-label="Performance" className="space-y-2">
        <SectionHeading>Performance</SectionHeading>
        <Card padded={false}>
          <EmptyState
            compact
            icon={Activity}
            accent={THEME.brand}
            headline={copy.headline}
            sub={copy.sub}
            action={
              copy.showAction
                ? { label: "Start a workout", href: "/program" }
                : undefined
            }
          />
        </Card>
      </section>
    );
  }

  const pi = Math.round(currentWeek.performanceIndex ?? 0);
  const loadBand = resolveLoadBand(currentWeek);
  const deloadRecommended = resolveDeloadRecommended(currentWeek);
  const verb = getVerb(loadBand, deloadRecommended);
  const { hue, textHue } = getCardColour(pi, loadBand, deloadRecommended);
  const establishing = isEstablishingBaseline({
    docsAvailable,
    lifetimeWeeks: currentWeek.signals?.lifetimeWeeks,
  });
  const line = establishing
    ? getEstablishingLine(currentWeek.signals)
    : getLine(verb.state, currentWeek.signals);
  // The week directly before, never an older one standing in for it.
  const delta = previousWeek
    ? Math.round(
        (currentWeek.performanceIndex ?? 0) -
          (previousWeek.performanceIndex ?? 0)
      )
    : null;
  // Same gate as Home's chip: a change is noise until the baseline forms,
  // and a zero is not a gain.
  const showDelta = !establishing && delta !== null && delta !== 0;

  const series = weeks.map((w) => w.performanceIndex ?? 0);
  const firstDate = parseLocalDate(weeks[0].weekKey);
  const lastDate = parseLocalDate(currentWeek.weekKey);
  /* The newest score is not always this week's: someone back after a
     break keeps the last one they earned. The label says which. */
  const lastIsThisWeek = lastDate > addLocalDays(new Date(), -7);

  return (
    <section aria-label="Performance" className="space-y-2">
      <SectionHeading action={details}>Performance</SectionHeading>
      <Card className="space-y-3">
        {/* The words keep at least 9em and go under the score when they
            cannot, rather than one word to a line at larger text. */}
        <div className="flex flex-wrap items-start gap-3">
          <p className="text-display font-extrabold font-mono tabular-nums leading-none text-foreground">
            <span className="sr-only">Performance Index </span>
            {pi}
          </p>
          <div className="min-w-[min(100%,9em)] flex-1 space-y-1 pt-0.5">
            {showDelta && (
              <span
                className={
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold font-mono tabular-nums " +
                  (delta! > 0
                    ? "bg-success/10 text-success-strong"
                    : "bg-running/10 text-running-strong")
                }
              >
                {delta! > 0 ? (
                  <TrendingUp className="size-3" aria-hidden="true" />
                ) : (
                  <TrendingDown className="size-3" aria-hidden="true" />
                )}
                <span aria-hidden="true">
                  {delta! > 0 ? "+" : ""}
                  {delta}
                </span>
                <span className="sr-only">
                  {`${delta! > 0 ? "Up" : "Down"} ${Math.abs(delta!)} on last week`}
                </span>
              </span>
            )}
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold" style={{ color: textHue }}>
                {verb.label}
              </span>
              {". "}
              {line}
            </p>
          </div>
        </div>
        {series.length >= 2 && (
          <div>
            <Sparkline
              values={series}
              color={hue}
              width={300}
              height={44}
              fluid
              endDot
            />
            <div className="mt-1 flex justify-between text-xs text-muted-foreground">
              <span>{formatDayMonth(firstDate)}</span>
              <span>
                {lastIsThisWeek ? "This week" : formatDayMonth(lastDate)}
              </span>
            </div>
          </div>
        )}
      </Card>
    </section>
  );
}
