import { useMemo } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import PageShell from "@/components/ui/PageShell";
import ProgramOfflineBanner from "@/components/program/ProgramOfflineBanner";
import DayActionContent from "@/components/program/DayActionContent";
import { ProgramSkeleton } from "@/components/LoadingSkeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { useProgramEngine } from "@/features/program/useProgramEngine";
import { useRollingSessionContexts } from "@/features/program/useRollingSessionContexts";
import { useClaimMapForProgram } from "@/hooks/useClaimMapForProgram";
import { useLocalDateKey } from "@/hooks/useLocalDateKey";
import { useAuth } from "@/lib/auth";
import { goBackOr } from "@/lib/backNavigation";
import { parseLocalDate } from "@/lib/dateHelpers";
import { formatShortWeekdayDayMonth } from "@/utils/formatters";

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** Train's Run tab on this run's day: where Back lands when the page was
 *  opened from outside the app. */
function trainFor(dateKey: string): string {
  return `/program?tab=run&rday=${dateKey}`;
}

/**
 * A run's own page (`/program/run/:date`, TrainWk1 call 2): what the
 * day's sheet held for it, as a page. The run and how it should feel, why
 * it is in the week, change it for this day, mark it done, skip it, move
 * it, restore a skipped one. Train's run card opens it from its ⋯; an
 * action that lands goes back there, as the sheet closed.
 *
 * It reads the engine Train holds (`useProgramEngine`), so it opens with
 * the plan on screen and a change made here is the one Train shows.
 */
export default function RunSession() {
  const { date } = useParams();
  if (!date || !DATE_KEY.test(date)) {
    return <Navigate to="/program?tab=run" replace />;
  }
  // A new date is a new page: its move picker starts closed.
  return <RunSessionPage key={date} dateKey={date} />;
}

function RunSessionPage({ dateKey }: { dateKey: string }) {
  const navigate = useNavigate();
  const {
    programState,
    loading,
    recentLayoff,
    recentRuns,
    overrideRunDay,
    markManualComplete,
    skipRunDay,
    skipWorkoutDay,
    restoreRunDay,
    restoreWorkoutDay,
    moveRunDay,
  } = useProgramEngine();
  const { profile } = useAuth();
  const todayKey = useLocalDateKey();
  const { claimMap, unclaimedByDate } = useClaimMapForProgram(programState);
  // A plan with no race date's weeks: the run's reason in the plan's terms
  // (Run24 (3)), as Train's card gives it.
  const rollingContexts = useRollingSessionContexts({
    profile,
    programState,
    recentLayoff,
    recentRuns,
    today: todayKey,
  });
  const dayLabel = useMemo(
    () => formatShortWeekdayDayMonth(parseLocalDate(dateKey)),
    [dateKey]
  );
  const back = () => goBackOr(navigate, trainFor(dateKey));

  if (loading) return <ProgramSkeleton />;
  if (!programState) {
    return (
      <ErrorState
        title="Couldn’t load your programme"
        description="Something went wrong fetching your training plan. Check your connection and try again."
        retry={{ label: "Retry", onClick: () => window.location.reload() }}
      />
    );
  }

  return (
    <PageShell
      /* The day's header below names the page, as the sheet's did: an h1
         for a reader landing here. */
      title={`Manage ${dayLabel}`}
      titleHidden
      banner={<ProgramOfflineBanner />}
      eyebrow={
        <Link
          to={trainFor(dateKey)}
          onClick={(e) => {
            e.preventDefault();
            back();
          }}
          className="inline-flex min-h-[44px] items-center gap-1 -ml-2 px-2"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Train
        </Link>
      }
    >
      <div className="space-y-4">
        {/* The run alone: Train's run card is run-scoped, and the lift
            has its own page. */}
        <DayActionContent
          dateKey={dateKey}
          scope="run"
          profile={profile}
          programState={programState}
          claimMap={claimMap}
          unclaimedByDate={unclaimedByDate}
          overrideRunDay={overrideRunDay}
          markManualComplete={markManualComplete}
          skipRunDay={skipRunDay}
          skipWorkoutDay={skipWorkoutDay}
          restoreRunDay={restoreRunDay}
          restoreWorkoutDay={restoreWorkoutDay}
          moveRunDay={moveRunDay}
          rollingContexts={rollingContexts}
          onClose={back}
        />
      </div>
    </PageShell>
  );
}
