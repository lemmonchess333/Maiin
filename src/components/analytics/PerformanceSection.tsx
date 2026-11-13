import PerformanceReadError from "./PerformanceReadError";
import { Suspense, useId, type ReactNode } from "react";
import {
  Activity,
  ChevronDown,
  Info,
  Lock,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { lazyRetry } from "@/lib/lazyRetry";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import SectionHeading from "@/components/ui/SectionHeading";
import ProgressRing from "@/components/ui/ProgressRing";
import UITooltip from "@/components/ui/Tooltip";
import { PerformanceCardSkeleton } from "@/components/LoadingSkeleton";
import ArrivalFade from "@/components/ui/ArrivalFade";
import { useArrivedAfterLoading } from "@/hooks/useArrivedAfterLoading";
import Sparkline from "@/components/analytics/Sparkline";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";
import { usePerformanceWeeks } from "@/hooks/usePerformance";
import type { DistanceUnit } from "@/lib/distanceUnits";
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
import { formatDayMonth, formatSigned } from "@/utils/formatters";
import { haptic } from "@/lib/haptic";
import { THEME } from "@/lib/theme";
import { cn } from "@/lib/utils";

const PerformanceDetails = lazyRetry(
  () => import("@/components/analytics/PerformanceDetails")
);

/** How many weekly scores the card's line draws. */
const WEEKS_SHOWN = 6;

/** What stands in the verb's place until the baseline has formed. */
const EARLY_READ = "Early read";

/** The ring's size at the default text size. It is sized in rem
 *  (`scaleWithText`), so the score inside still fits at larger text. */
const RING = 96;
const RING_STROKE = 8;

/* The only explanation of this number anywhere in the app. PI = 65% load
 * + 25% recovery + 10% adherence per `src/lib/performanceTypes.ts`; the
 * tooltip distils that without leaking the weights, which would invite
 * over-optimisation against a single dimension.
 *
 * The WINDOW is the part that was once wrong. The engine scores a 7-day
 * window (`WINDOW_DAYS`) against a 28-day baseline (`BASELINE_DAYS`)
 * normalised to a 7-day equivalent — every one of the three factors is
 * measured over the current week. The sentence said the score combined
 * them "over the last 4 weeks", which describes the baseline as though
 * it were the scored period: a reader is told a bad week will weigh on
 * the figure for a month, when the opposite is nearer the truth, because
 * a hard week is scored against a calm four.
 *
 * `piExplainerWindow.test.ts` reads both constants out of
 * `functions/performanceEngine.js` and fails if this sentence stops
 * agreeing with the engine that actually runs. */
const PI_EXPLAINER =
  "0–100 score for your last 7 days — training load, recovery and consistency, measured against your previous 4 weeks. A higher score is not a recommendation to train harder — read it alongside your load and recovery guidance.";

interface PerformanceSectionProps {
  /** Whether anything is logged at all: see `performanceEmptyCopy`. */
  hasLoggedSession?: boolean;
  /** The reader's distance unit, for the running figures in the details.
   *  History passes its own; `km` stands in only where nothing does. */
  distanceUnit?: DistanceUnit;
  /** Whether "Score details" is open. History keeps it in the URL. */
  detailsOpen?: boolean;
  onToggleDetails?: (open: boolean) => void;
  /** The details are Pro for this account (whole-app grill Q84): the row
   *  shows a lock and asks `onToggleDetails(true)`, which offers Pro. */
  detailsLocked?: boolean;
  /** Drawn inside the open details, after the index chart: the training
   *  load card, which History feeds from its own range. */
  children?: ReactNode;
}

function Heading() {
  return (
    <div className="flex items-center gap-1">
      <SectionHeading>Performance</SectionHeading>
      <UITooltip content={PI_EXPLAINER}>
        <button
          type="button"
          aria-label="About Performance Index"
          className="p-4 -m-4 text-muted-foreground hover:text-foreground transition-colors"
        >
          <Info className="size-3" aria-hidden="true" />
        </button>
      </UITooltip>
    </div>
  );
}

/**
 * The one place the Performance Index is shown (Trim1 call 5, 11 November
 * 2026): the top of the Analytics overview.
 *
 * It was on Home's closing row, on this card as bare digits and again on
 * a Performance page as a gauge, with three sets of words for one week
 * (the verb and line, a headline and a body) and two colour scales. This
 * is the verdict's face as PI1 and PI3 locked it and DESIGN_GUIDE §3f
 * keeps it: the ring in the band's colour with the score in it, the verb
 * and its line, and the chip. The last six weeks are one line under it.
 *
 * What the score is made of opens in place, under "Score details": the
 * seven days against the usual week, the index over twelve weeks, the
 * four factors, the load band, and the training load. That is Hist6's
 * one tap (and Hist5b's "no drawer, no new route"); the Performance page
 * DS3 added is gone, and its links open the overview with the details
 * open (`History.tsx`).
 */
export default function PerformanceSection({
  hasLoggedSession = false,
  distanceUnit = "km",
  detailsOpen = false,
  onToggleDetails,
  detailsLocked = false,
  children,
}: PerformanceSectionProps = {}) {
  const {
    weeks,
    currentWeek,
    previousWeek,
    docsAvailable,
    loading,
    failed,
    refresh,
  } = usePerformanceWeeks(WEEKS_SHOWN);
  const arrival = useArrivedAfterLoading(loading);
  const detailsId = useId();

  /* While the week loads, the heading is already the loaded one and the
     card holds the loaded card's shape (Pol1), so the score arriving
     moves nothing under it. */
  if (loading) {
    return (
      <section aria-label="Performance" className="space-y-2">
        <Heading />
        <PerformanceCardSkeleton />
        {/* The "Score details" row's place. */}
        <div aria-hidden="true" className="min-h-11" />
      </section>
    );
  }

  if (failed) {
    return (
      <section aria-label="Performance" className="space-y-2">
        <SectionHeading>Performance</SectionHeading>
        <PerformanceReadError onRetry={refresh} />
      </section>
    );
  }

  /* No score yet. Which sentence, and whether there is an action at all,
     depends on whether anything has been logged: `performanceEmptyCopy`
     owns that split. */
  if (!currentWeek) {
    const copy = performanceEmptyCopy(hasLoggedSession);
    return (
      <section aria-label="Performance" className="space-y-2">
        <SectionHeading>Performance</SectionHeading>
        <ArrivalFade {...arrival}>
          <Card padded={false}>
            <EmptyState
              compact
              icon={Activity}
              accent={THEME.brand}
              headline={copy.headline}
              sub={copy.sub}
              action={
                copy.showAction
                  ? {
                      label: "Start a workout",
                      href: "/program",
                      variant: "neutral",
                    }
                  : undefined
              }
            />
          </Card>
        </ArrivalFade>
      </section>
    );
  }

  const pi = Math.round(currentWeek.performanceIndex ?? 0);
  const loadBand = resolveLoadBand(currentWeek);
  const deloadRecommended = resolveDeloadRecommended(currentWeek);
  const verb = getVerb(loadBand, deloadRecommended);
  const establishing = isEstablishingBaseline({
    docsAvailable,
    lifetimeWeeks: currentWeek.signals?.lifetimeWeeks,
  });
  /* While the baseline is still forming the score is a real number but
     not yet a verdict. A first-week 81 once read "Peak" in a confident
     green over "Establishing your baseline", two statements saying
     opposite things about whether the number means anything. So the
     verb gives way to "Early read", and the colour, a verdict too, to
     the brand's: a first week is not told to back off in amber. */
  const label = establishing ? EARLY_READ : verb.label;
  const { hue, textHue } = establishing
    ? { hue: THEME.brand, textHue: "hsl(var(--primary-strong))" }
    : getCardColour(pi, loadBand, deloadRecommended);
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
  // A change is noise until the baseline forms, and a zero is not a gain.
  const showDelta = !establishing && delta !== null && delta !== 0;

  const series = weeks.map((w) => w.performanceIndex ?? 0);
  const firstDate = parseLocalDate(weeks[0].weekKey);
  const lastDate = parseLocalDate(currentWeek.weekKey);
  /* The newest score is not always this week's: someone back after a
     break keeps the last one they earned. The label says which. */
  const lastIsThisWeek = lastDate > addLocalDays(new Date(), -7);

  return (
    <section aria-label="Performance" className="space-y-2">
      <Heading />
      <ArrivalFade {...arrival}>
        <Card className="space-y-3">
          {/* The words keep at least 9em beside the ring and go under it
            when they cannot, rather than one word to a line at larger
            text. */}
          <div className="flex flex-wrap items-center gap-4">
            <ProgressRing
              value={pi / 100}
              size={RING}
              stroke={RING_STROKE}
              color={hue}
              cut
              scaleWithText
            >
              <p className="text-4xl font-extrabold font-figure tabular-nums leading-none text-foreground">
                <span className="sr-only">Performance Index </span>
                {pi}
              </p>
            </ProgressRing>
            <div className="min-w-[min(100%,9em)] flex-1 space-y-1">
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
                  <span aria-hidden="true">{formatSigned(delta!)}</span>
                  <span className="sr-only">
                    {`${delta! > 0 ? "Up" : "Down"} ${Math.abs(delta!)} on last week`}
                  </span>
                </span>
              )}
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold" style={{ color: textHue }}>
                  {label}
                </span>
                {". "}
                {line}
              </p>
            </div>
          </div>
          {/* The six weeks as one line. With the details open the twelve
            weeks' chart below says the same and more, so the line gives
            way to it. */}
          {series.length >= 2 && !detailsOpen && (
            <div data-performance-trend="">
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
      </ArrivalFade>

      {/* Disclosure: a row at the start edge, as the finish screen's
          "Session details" is, naming what it opens. Open or closed is
          carried by the chevron and aria-expanded. */}
      <button
        type="button"
        onClick={() => {
          haptic("light");
          onToggleDetails?.(!detailsOpen);
        }}
        aria-expanded={detailsLocked ? undefined : detailsOpen}
        aria-controls={detailsLocked ? undefined : detailsId}
        className={cn(
          "flex w-full items-center justify-between gap-2 min-h-11 rounded-lg text-sm font-semibold text-foreground",
          "hover:text-lifting-strong transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        )}
      >
        Score details
        {detailsLocked ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
            <Lock aria-hidden="true" className="size-3.5" />
            Pro
          </span>
        ) : (
          <ChevronDown
            aria-hidden="true"
            className={cn(
              "size-4 text-muted-foreground transition-transform duration-200",
              detailsOpen && "rotate-180"
            )}
          />
        )}
      </button>

      {detailsOpen && (
        <div id={detailsId} className="space-y-4">
          <SectionErrorBoundary sectionName="performance-details">
            <Suspense
              fallback={
                <div className="p-4 rounded-2xl bg-card motion-safe:animate-pulse h-48" />
              }
            >
              <PerformanceDetails distanceUnit={distanceUnit}>
                {children}
              </PerformanceDetails>
            </Suspense>
          </SectionErrorBoundary>
        </div>
      )}
    </section>
  );
}
