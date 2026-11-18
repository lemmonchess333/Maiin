import { useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import PageShell from "@/components/ui/PageShell";
import { Button } from "@/components/ui/Button";
import ProgramOfflineBanner from "@/components/program/ProgramOfflineBanner";
import LiftSessionView from "@/components/program/LiftSessionView";
import LiftSessionOverlays from "@/components/program/LiftSessionOverlays";
import { ProgramSkeleton } from "@/components/LoadingSkeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { useProgramEngine } from "@/features/program/useProgramEngine";
import { useLiftSession } from "@/features/program/useLiftSession";
import { useSessionsInFlight } from "@/hooks/useSessionsInFlight";
import { useWorkouts } from "@/hooks/useWorkouts";
import { useAuth } from "@/lib/auth";
import { goBackOr } from "@/lib/backNavigation";
import { liftDayNameIn } from "@/lib/liftDayLabel";
import { liftSessionPath } from "@/lib/sessionPages";

/** Train with this lift's day selected: where Back lands when the page
 *  was opened from outside the app. */
function trainFor(dayIndex: number): string {
  return `/program?tab=lift&day=${dayIndex}`;
}

/** The day the address names, or null when it names none. */
function dayFrom(raw: string | undefined): number | null {
  if (raw === undefined || !/^\d+$/.test(raw)) return null;
  return Number.parseInt(raw, 10);
}

/**
 * A lift's own page (`/program/lift/:day`, TrainWk1 call 2): what Train's
 * Lift tab shows under its day strip for this session, alone. Its card and
 * Start, why it is in the week, the exercises (replace, add, remove,
 * reorder), Short on time, Skip, Make this next, and a finished day's
 * record. The week's notices, its strip and its plan stay on Train.
 *
 * It reads the engine Train holds (`useProgramEngine`), so it opens with
 * the plan on screen and a change made here is the one Train shows.
 * `?start=1`, `easier=1`, `express=1` and `resume=1` open this day's
 * workout as they do on Train.
 */
export default function LiftSession() {
  const { day } = useParams();
  const dayIndex = dayFrom(day);
  // A new day is a new page: its menus, sheets and drag mode start closed.
  return <LiftSessionPage key={day} dayIndex={dayIndex} />;
}

function LiftSessionPage({ dayIndex }: { dayIndex: number | null }) {
  const navigate = useNavigate();
  const program = useProgramEngine();
  const { programState, loading, completeWorkoutDay } = program;
  const { profile } = useAuth();
  const inFlight = useSessionsInFlight(profile?.uid);
  const { workouts: recentWorkouts, loading: workoutsLoading } = useWorkouts();
  const session = useLiftSession({
    programState,
    inFlight,
    linkedDay: dayIndex,
    viewingHistory: false,
  });
  const [reorderMode, setReorderMode] = useState(false);

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
  const workout =
    dayIndex === null ? undefined : programState.workouts[dayIndex];
  if (dayIndex === null || !workout) return <Navigate to="/program" replace />;

  // The session as Train and the workout screen name it ("Pull B").
  const sessionName = liftDayNameIn(
    programState.workouts.map((w) => w.dayName),
    dayIndex,
    workout.dayName
  );

  return (
    <PageShell
      /* The card below is the hero and names the session (DS4, §14m): no
         large title above it, an h1 for a reader landing here. */
      title={sessionName}
      titleHidden
      banner={<ProgramOfflineBanner />}
      eyebrow={
        <Link
          to={trainFor(dayIndex)}
          onClick={(e) => {
            e.preventDefault();
            goBackOr(navigate, trainFor(dayIndex));
          }}
          className="inline-flex min-h-[44px] items-center gap-1 -ml-2 px-2"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Train
        </Link>
      }
      actions={
        /* Train's ⋯ holds "Reorder exercises" for its tab; here it is the
           page's one action, so it stands in the header, and Done ends it
           as on Train. */
        reorderMode ? (
          <Button
            variant="ghost"
            className="text-lifting-strong"
            onClick={() => setReorderMode(false)}
          >
            Done
          </Button>
        ) : (
          <Button variant="ghost" onClick={() => setReorderMode(true)}>
            Reorder exercises
          </Button>
        )
      }
    >
      <LiftSessionView
        programState={programState}
        program={program}
        session={session}
        dayIndex={dayIndex}
        workouts={programState.workouts}
        weekNumber={programState.weekNumber}
        recentWorkouts={recentWorkouts}
        reorderMode={reorderMode}
        /* On to the session up next, as Train's day strip moves on. */
        onSkipped={(nextUp) =>
          navigate(liftSessionPath(nextUp), { replace: true })
        }
      />
      <LiftSessionOverlays
        session={session}
        programState={programState}
        completeWorkoutDay={completeWorkoutDay}
        firstWorkout={!workoutsLoading && recentWorkouts.length === 0}
      />
    </PageShell>
  );
}
