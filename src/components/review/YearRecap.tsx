import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Share2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { parseLocalDate } from "@/lib/dateHelpers";
import { storedKmLabel } from "@/lib/runLabels";
import { distanceUnitLabel } from "@/lib/distanceUnits";
import { useDistanceUnit } from "@/hooks/useDistanceUnit";
import { useYearRecap, type TrainingYear } from "@/hooks/useYearRecap";
import { isWebStore, storeSubscriptionsUrl } from "@/lib/subscriptionTrial";
import type { YearRecapDue } from "@/lib/proReport";
import { formatDayMonthLong, formatDayMonthYear } from "@/utils/formatters";
import RecapStory, { type RecapSlide } from "@/components/review/RecapStory";
import StatRow from "@/components/review/StatRow";
import { ProLines } from "@/components/review/ProMonthCard";
import ShareCardSheet from "@/components/share/ShareCardSheet";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Spinner } from "@/components/ui/Spinner";

/** The recap's counts land as the weekly review's do. */
const COUNT_SECONDS = 0.6;

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

function YourYear({
  training,
  next,
  onShare,
}: {
  training: TrainingYear;
  next: () => void;
  onShare: (() => void) | null;
}) {
  const unit = useDistanceUnit();
  const sessions = training.lifts + training.runs;
  const parts = [
    training.lifts > 0 &&
      `${training.lifts} ${plural(training.lifts, "lift", "lifts")}`,
    training.runs > 0 &&
      `${training.runs} ${plural(training.runs, "run", "runs")}`,
  ].filter(Boolean);
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-h1 font-extrabold leading-tight tracking-tight text-foreground">
          Your year
        </h2>
        {onShare && (
          <IconButton
            aria-label="Share your year"
            icon={<Share2 />}
            variant="ghost"
            onClick={onShare}
          />
        )}
      </div>
      <div className="mt-6 space-y-6">
        <StatRow
          rule="bg-lifting"
          value={<AnimatedNumber value={sessions} duration={COUNT_SECONDS} />}
          caption={
            parts.length > 0
              ? `${plural(sessions, "session", "sessions")}, ${parts.join(" and ")}`
              : "sessions"
          }
        />
        {training.runs > 0 && (
          <StatRow
            rule="bg-running"
            value={
              <AnimatedNumber
                value={training.km}
                format={(km) => storedKmLabel(km, unit, false, 1)}
                duration={COUNT_SECONDS}
              />
            }
            caption={`${distanceUnitLabel(unit)} run`}
          />
        )}
        {training.bests > 0 && (
          <StatRow
            rule="bg-achievement"
            value={
              <AnimatedNumber value={training.bests} duration={COUNT_SECONDS} />
            }
            caption={plural(training.bests, "new best", "new bests")}
          />
        )}
      </div>
      <div className="mt-auto pt-8">
        <Button variant="secondary" fullWidth onClick={next}>
          Pro this year
        </Button>
      </div>
    </div>
  );
}

/** Where the plan is managed: the store's own list, or Account on the web. */
function ManageLink({ store }: { store: string | null }) {
  const className =
    "inline-flex min-h-11 items-center text-sm font-semibold text-foreground underline underline-offset-4";
  if (store && isWebStore(store)) {
    return (
      <Link to="/settings/account" className={className}>
        Manage Pro
      </Link>
    );
  }
  return (
    <a
      href={storeSubscriptionsUrl(store ?? "app_store")}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      Manage Pro
    </a>
  );
}

/**
 * "Your year", a week before a yearly Pro plan renews (App1 Q56): the
 * training year in three numbers, then what Pro did over it, then the day
 * it renews and where to manage it. Full screen, as the weekly review is
 * (DESIGN_GUIDE §14m's rewards are full screen), opened from its row on
 * Home, since a reward never opens over Home by itself (ADR-0004).
 *
 * `onShown` fires once the year has drawn, so the account records it then
 * and a read that failed leaves the row to try again.
 */
export default function YearRecap({
  due,
  onShown,
  onClose,
}: {
  due: YearRecapDue;
  onShown: () => void;
  onClose: () => void;
}) {
  const { profile } = useAuth();
  const { loading, failed, data, retry } = useYearRecap(due);
  const [shareOpen, setShareOpen] = useState(false);
  const shownRef = useRef(false);
  useEffect(() => {
    if (!data || shownRef.current) return;
    shownRef.current = true;
    onShown();
  }, [data, onShown]);

  const since = formatDayMonthYear(parseLocalDate(due.start));
  let slides: RecapSlide[];
  if (loading) {
    slides = [
      {
        key: "loading",
        label: "Loading",
        render: () => (
          <div className="flex flex-1 items-center justify-center">
            <Spinner />
          </div>
        ),
      },
    ];
  } else if (failed || !data) {
    slides = [
      {
        key: "failed",
        label: "Couldn’t load",
        render: () => (
          <div className="flex flex-1 flex-col" role="alert">
            <h2 className="text-h1 font-extrabold leading-tight tracking-tight text-foreground">
              Couldn&rsquo;t load your year
            </h2>
            <p className="mt-3 text-base text-muted-foreground">
              Check your connection and try again.
            </p>
            <div className="mt-auto space-y-2 pt-8">
              <Button variant="neutral" fullWidth onClick={retry}>
                Try again
              </Button>
              <Button fullWidth variant="ghost" onClick={onClose}>
                Done
              </Button>
            </div>
          </div>
        ),
      },
    ];
  } else {
    const sessions = data.training.lifts + data.training.runs;
    slides = [
      {
        key: "year",
        label: "Your year",
        render: (next) => (
          <YourYear
            training={data.training}
            next={next}
            onShare={sessions > 0 ? () => setShareOpen(true) : null}
          />
        ),
      },
      {
        key: "pro",
        label: "Pro this year",
        render: () => (
          <div className="flex flex-1 flex-col">
            <h2 className="text-h1 font-extrabold leading-tight tracking-tight text-foreground">
              Pro this year
            </h2>
            <div className="mt-6">
              <ProLines lines={data.lines} when="this year" />
            </div>
            <div className="mt-auto space-y-3 pt-8">
              <div>
                <p className="text-sm text-muted-foreground">
                  Your Pro year renews on {formatDayMonthLong(due.renewsAt)}.
                </p>
                <ManageLink store={due.store} />
              </div>
              <Button variant="neutral" fullWidth onClick={onClose}>
                Done
              </Button>
            </div>
          </div>
        ),
      },
    ];
  }

  return (
    <div className="fixed inset-0 z-50">
      <RecapStory
        eyebrow={`Since ${since}`}
        slides={slides}
        onClose={onClose}
        title="Your year"
        label="Your year"
      />
      {data && (
        <ShareCardSheet
          open={shareOpen}
          onOpenChange={setShareOpen}
          data={{
            template: "recap",
            recapTitle: "This year",
            handle: profile?.displayName || "Athlete",
            date: `Since ${since}`,
            sessionsCount: data.training.lifts + data.training.runs,
            distanceKm: data.training.km,
            totalVolumeKg: data.training.tonnageKg,
          }}
        />
      )}
    </div>
  );
}
