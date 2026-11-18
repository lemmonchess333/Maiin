import PerformanceReadError from "./PerformanceReadError";
import { Suspense, useId } from "react";
import { Activity, ChevronDown, Info, Lock } from "lucide-react";
import { lazyRetry } from "@/lib/lazyRetry";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import SectionHeading from "@/components/ui/SectionHeading";
import UITooltip from "@/components/ui/Tooltip";
import { PerformanceCardSkeleton } from "@/components/LoadingSkeleton";
import ArrivalFade from "@/components/ui/ArrivalFade";
import { useArrivedAfterLoading } from "@/hooks/useArrivedAfterLoading";
import LoadAgainstUsual from "@/components/analytics/LoadAgainstUsual";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";
import { usePerformanceWeeks } from "@/hooks/usePerformance";
import { useLiftUnit } from "@/hooks/useLiftUnit";
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
  scoreWindowLabel,
  takeMoreLine,
} from "@/lib/performanceLine";
import { performanceWeekBreakdown } from "@/lib/performanceWeekBreakdown";
import { getCardColour } from "@/lib/performanceColour";
import { haptic } from "@/lib/haptic";
import { THEME } from "@/lib/theme";
import { cn } from "@/lib/utils";

const PerformanceDetails = lazyRetry(
  () => import("@/components/analytics/PerformanceDetails")
);

/** What stands in the verb's place until the baseline has formed. */
const EARLY_READ = "Early read";

/* How to read the lead. "Usual week" is the engine's baseline, the active
 * weeks in the 28 days before the window (`performanceWeekBreakdown`), and
 * the verb is the engine's own verdict (PI1): only "Backing off" says to
 * ease off. So the card answers "can I take more?" with the engine's word,
 * on screen under the bars (`takeMoreLine`), and adds no rule of its own:
 * the score's band cannot say "room for more" safely, since a week of one
 * sport tops out in Steady however big it was (LIFT-EV-10,
 * `performanceLine.ts`). "These" 7 days, because a score kept from before
 * a break names an older window. The windows are pinned to the engine by
 * `piExplainerWindow.test.ts`. */
const LEAD_EXPLAINER =
  "These 7 days of lifting and running, against your usual week: the average of the weeks you trained in the 4 before them. Backing off means ease off. Any other word means carry on with your plan.";

interface PerformanceSectionProps {
  /** Whether anything is logged at all: see `performanceEmptyCopy`. */
  hasLoggedSession?: boolean;
  /** The reader's distance unit, for the running figures. History passes
   *  its own; `km` stands in only where nothing does. */
  distanceUnit?: DistanceUnit;
  /** Whether "Score details" is open. History keeps it in the URL. */
  detailsOpen?: boolean;
  onToggleDetails?: (open: boolean) => void;
  /** The details are Pro for this account (whole-app grill Q84): the row
   *  shows a lock and asks `onToggleDetails(true)`, which offers Pro. */
  detailsLocked?: boolean;
}

function Heading() {
  return (
    <div className="flex items-center gap-1">
      <SectionHeading>Performance</SectionHeading>
      <UITooltip content={LEAD_EXPLAINER}>
        <button
          type="button"
          aria-label="About your usual week"
          className="p-4 -m-4 text-muted-foreground hover:text-foreground transition-colors"
        >
          <Info className="size-3" aria-hidden="true" />
        </button>
      </UITooltip>
    </div>
  );
}

/**
 * The top of the Progress overview (App1 Q10, 13 November 2026): "the
 * page leads with load against your usual and whether you can take more".
 *
 * The lead is the engine's verdict in words, the verb and its line (PI1),
 * over the last seven days' lifting and running against the usual week,
 * each figure from the score's own document. It is the screen's hero:
 * the verb is its largest text (§14m), in the band's colour, so the word,
 * its colour and the bars say one thing.
 *
 * The 0–100 score itself is one of the details (Q10), opened in place
 * under "Score details" with what it is made of (`PerformanceDetails`),
 * which is Pro (Q84). It is shown nowhere else: the weekly review keeps
 * its verdict in words and drops the number (Q12). The details keep one
 * load model, the score's (Q16).
 */
export default function PerformanceSection({
  hasLoggedSession = false,
  distanceUnit = "km",
  detailsOpen = false,
  onToggleDetails,
  detailsLocked = false,
}: PerformanceSectionProps = {}) {
  const { currentWeek, docsAvailable, loading, failed, refresh } =
    usePerformanceWeeks();
  const liftUnit = useLiftUnit();
  const arrival = useArrivedAfterLoading(loading);
  const detailsId = useId();

  /* While the week loads, the heading is already the loaded one and the
     card holds the loaded card's shape (Pol1), so the week arriving moves
     nothing under it. */
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

  /* Nothing scored yet. Which sentence, and whether there is an action at
     all, depends on whether anything has been logged: `performanceEmptyCopy`
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
  /* While the baseline is still forming there is no usual week, so no
     verdict. A first-week 81 once read "Peak" in a confident green over
     "Establishing your baseline", two statements saying opposite things.
     So the verb gives way to "Early read", and the colour, a verdict too,
     to the brand's: a first week is not told to back off in amber. */
  const label = establishing ? EARLY_READ : verb.label;
  const { textHue } = establishing
    ? { textHue: "hsl(var(--primary-strong))" }
    : getCardColour(pi, loadBand, deloadRecommended);
  const line = establishing
    ? getEstablishingLine(currentWeek.signals)
    : getLine(verb.state, currentWeek.signals);
  const { measures } = performanceWeekBreakdown(currentWeek, {
    distanceUnit,
    liftUnit,
    establishing,
  });

  return (
    <section aria-label="Performance" className="space-y-2">
      <Heading />
      <ArrivalFade {...arrival}>
        <Card className="space-y-4" data-performance-lead="">
          <div className="@container space-y-1">
            <p className="text-xs font-semibold text-muted-foreground">
              {scoreWindowLabel(currentWeek.weekKey, new Date())}
            </p>
            {/* The verdict. Its longest words ("Sharpening", "Recovering")
                are about 5.3 em wide, so where the card is narrower than
                that at the reader's text size (a 320 pt phone at the
                largest text) the type steps down to 17% of the card's
                width rather than split the word. Where container queries
                are missing (iOS 15) it keeps its size and may break
                inside the word, never past the card. */}
            <p
              className="text-hero supports-[container-type:inline-size]:text-[length:min(var(--text-hero),17cqi)] font-extrabold leading-[1.05] tracking-tight break-words hyphens-auto"
              style={{ color: textHue }}
            >
              {label}
            </p>
            <p className="text-sm text-muted-foreground">{line}</p>
          </div>
          <LoadAgainstUsual measures={measures} />
          {/* Whether you can take more (Q10), in the engine's own terms. */}
          <p
            className="text-sm font-semibold text-foreground"
            data-take-more=""
          >
            {takeMoreLine(establishing ? null : verb.state)}
          </p>
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
        aria-label={detailsLocked ? "Score details, Pro" : undefined}
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
              <PerformanceDetails distanceUnit={distanceUnit} />
            </Suspense>
          </SectionErrorBoundary>
        </div>
      )}
    </section>
  );
}
