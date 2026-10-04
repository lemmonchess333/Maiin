/**
 * `/workout/:workoutId` — a saved lift session you can return to.
 *
 * Runs have had `/run/:runId` since the run surface shipped. Lifts had
 * nothing: History's lifting section is aggregates only (volume chart, heat
 * map, two stat cards), the per-entry list was removed by product call on
 * 2026-07-04, and Home's day card taps through for runs but not for lifts.
 * So no surface in Tropos showed you one saved lift session.
 *
 * That gap had a second, sharper consequence. Sharing a workout was a
 * ONE-SHOT: the post-completion screen was the only surface that could do
 * it, so missing that moment made a session unshareable forever. That
 * matters most to a user whose saved default is "never": nothing of theirs
 * is posted automatically, and this page is how they post one old session
 * later. It is what makes that default safe to pick.
 *
 * It also removes the reason two share controls used to sit on the
 * completion screen BEFORE the save ran: "Share to circle" published a
 * `session_completed` event and "Share Workout" exported a card, while
 * "Save Workout" was a different button entirely. Share to circle → Close
 * without saving left a Circle post claiming a session with no record
 * behind it. Sharing from a record that already exists cannot do that.
 *
 * Fetch mirrors `RunDetail` exactly (useParams + one-shot getDoc) rather
 * than reading `useWorkouts()`'s in-memory list, which holds only the newest
 * 50 and would 404 on an older session or on a cold deep-link before the
 * snapshot resolves.
 */
import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ChevronLeft, Share2, Users, Check, Dumbbell } from "lucide-react";

import { useAuth } from "@/lib/auth";
import { THEME } from "@/lib/theme";
import { parseLocalDate } from "@/lib/dateHelpers";
import { durationFigure, setsFigure, workFigure } from "@/lib/liftFigures";
import {
  SET_TYPE_COPY,
  asSetType,
  setBadge,
  setName,
} from "@/features/program/setLabels";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { IconButton } from "@/components/ui/IconButton";
import { EmptyState } from "@/components/ui/EmptyState";
import SectionHeading from "@/components/ui/SectionHeading";
import StatFigure from "@/components/ui/StatFigure";
import ExerciseThumb from "@/components/program/ExerciseThumb";
import SetTypeChip from "@/components/workout/SetTypeChip";
import SessionLoadState from "@/components/session/SessionLoadState";
import { useSessionDoc } from "@/hooks/useSessionDoc";
import ShareCardSheet from "@/components/share/ShareCardSheet";
import CircleShareSheet from "@/components/social/CircleShareSheet";
import WorkoutFeedShareSheet from "@/components/workout/WorkoutFeedShareSheet";
import DeleteSessionAction from "@/components/session/DeleteSessionAction";
import CorrectWorkoutSheet from "@/components/workout/CorrectWorkoutSheet";
import {
  workoutTonnageKg,
  workoutTitle,
  type Workout,
} from "@/hooks/useWorkouts";

/** Working sets only. Warm-ups are logged on the same list but are not the
 *  session's work, and counting them inflates every set total on the page —
 *  the same filter `SessionCompleteScreen` applies to its sets figure. A set
 *  saved before set types were recorded is a working set, as the export
 *  has always read it. */
function workingSets(ex: Workout["exercises"][number]) {
  return (ex.sets ?? [])
    .filter((s) => s.type !== "warmup")
    .map((s) => ({ ...s, type: s.type ?? "working" }));
}

/** What a set did, as the workout screen writes it: "60 kg × 8", a hold's
 *  seconds, or a bodyweight set's reps. */
function setResult(
  set: { reps: number; weightKg: number },
  timed: boolean
): { shown: string; spoken: string } {
  const reps = set.reps || 0;
  if (timed) return { shown: `${reps} s`, spoken: `${reps} seconds` };
  const repWord = reps === 1 ? "rep" : "reps";
  if (!(set.weightKg > 0)) {
    return { shown: `${reps} ${repWord}`, spoken: `${reps} ${repWord}` };
  }
  return {
    shown: `${set.weightKg} kg × ${reps}`,
    spoken: `${set.weightKg} kg, ${reps} ${repWord}`,
  };
}

/** One exercise of the saved session: its drawing and name, then each set
 *  with the badge the workout screen gave it, so a drop set reads "D" here
 *  as it did there (setLabels). */
function ExerciseRecord({
  exercise,
}: {
  exercise: Workout["exercises"][number];
}) {
  const sets = workingSets(exercise);
  const timed = exercise.repUnit === "seconds";
  return (
    <Card padded={false}>
      <div className="flex items-center gap-3 p-3">
        <ExerciseThumb exerciseId={exercise.exerciseId} size="sm" />
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-foreground text-balance">
            {exercise.exerciseName}
          </h3>
          <p className="text-sm text-muted-foreground font-mono tabular-nums">
            {sets.length} {sets.length === 1 ? "set" : "sets"}
          </p>
        </div>
      </div>
      {sets.length > 0 && (
        <ol className="border-t border-border/40">
          {sets.map((set, i) => {
            const type = asSetType(set.type);
            const result = setResult(set, timed);
            const kind =
              type === "dropset" || type === "failure"
                ? `, ${SET_TYPE_COPY[type].name.toLowerCase()}`
                : "";
            return (
              <li
                key={i}
                className="flex items-center gap-3 border-b border-border/40 px-3 py-1.5 last:border-b-0"
              >
                <SetTypeChip type={type} label={setBadge(sets, i)} />
                <span
                  aria-hidden="true"
                  className="text-base font-semibold font-mono tabular-nums text-foreground"
                >
                  {result.shown}
                </span>
                <span className="sr-only">
                  {`${setName(sets, i)}${kind}: ${result.spoken}`}
                </span>
              </li>
            );
          })}
        </ol>
      )}
      {/* The note the lifter typed during the session. This is the point
          of keeping it: "Level 8, 6.0 incline" is the machine setting they
          want back next time, and until now it was discarded on Finish.
          Absent on every session logged before notes were persisted, so
          the row simply does not render rather than showing an empty
          label. */}
      {exercise.notes && (
        <p className="border-t border-border/40 px-3 py-2 text-sm text-muted-foreground">
          {exercise.notes}
        </p>
      )}
    </Card>
  );
}

export default function WorkoutDetail() {
  const { workoutId } = useParams<{ workoutId: string }>();
  const { user } = useAuth();
  // A route/account change must clear the prior record and its share state
  // immediately, including while the next read is pending or fails.
  return <WorkoutDetailContent key={JSON.stringify([user?.uid, workoutId])} />;
}

function WorkoutDetailContent() {
  const { workoutId } = useParams<{ workoutId: string }>();
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  const {
    status,
    data: workout,
    retry,
  } = useSessionDoc<Workout & { id: string }>(user?.uid, "workouts", workoutId);
  const [cardOpen, setCardOpen] = useState(false);
  const [circleOpen, setCircleOpen] = useState(false);
  const [feedOpen, setFeedOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  /** Set optimistically once a feed post lands so the button flips to its
   *  "shared" state without a refetch. It belongs to the loaded doc it was
   *  set against: a fresh read (a retry, a correction) supersedes it and the
   *  doc's own `sharedActivityId` shows again, so no effect has to re-seed
   *  it. */
  const [sharedOverride, setSharedOverride] = useState<{
    doc: Workout & { id: string };
    id: string;
  } | null>(null);
  const sharedActivityId =
    workout && sharedOverride?.doc === workout
      ? sharedOverride.id
      : (workout?.sharedActivityId ?? null);

  /* A failed read is no longer reported as a missing workout. The old
     catch dropped the error and fell through to "not found", so a dropped
     connection told the user their session may have been deleted or that
     the link was someone else's — two claims, both false, one of them
     about their own data. */
  if (status !== "ready" || !workout) {
    return (
      <SessionLoadState
        status={status}
        icon={Dumbbell}
        loadingLabel="Loading workout"
        missingHeadline="Workout not found"
        missingSub="It may have been deleted, or the link belongs to another account."
        failedHeadline="Couldn't load this workout"
        failedSub="Check your connection and try again. Nothing has been changed."
        onRetry={retry}
        backHref="/history"
        backLabel="History"
      />
    );
  }

  const tonnage = workoutTonnageKg(workout);
  const exercises = workout.exercises ?? [];
  const totalSets = exercises.reduce((n, ex) => n + workingSets(ex).length, 0);
  // Holds count toward neither weight nor reps: their `reps` are seconds.
  const totalReps = exercises.reduce(
    (n, ex) =>
      ex.repUnit === "seconds"
        ? n
        : n + workingSets(ex).reduce((t, set) => t + (set.reps || 0), 0),
    0
  );
  /* The finish screen's three figures, written by the same rule
     (`liftFigures`), so the page you come back to says what it said. */
  const figures = [
    durationFigure(workout.durationMinutes ?? 0),
    workFigure(tonnage, totalReps),
    setsFigure(totalSets),
  ];

  const title = workoutTitle(workout);

  const dateObj = workout.createdAt?.toDate?.() ?? parseLocalDate(workout.date);
  const dateStr = dateObj.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const shortDate = dateObj.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="px-4 pt-4 space-y-4">
        <IconButton
          icon={<ChevronLeft className="size-5" />}
          aria-label="Back"
          variant="ghost"
          onClick={() => navigate(-1)}
        />

        {/* Header (DS3), as RunDetail's: the sport, the session's name,
            when. Share makes the picture card. */}
        <div>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-bold text-lifting-strong">Lift</p>
              <h1 className="mt-1 text-h1 font-extrabold leading-tight text-foreground text-balance break-words">
                {title}
              </h1>
            </div>
            <Button
              variant="secondary"
              onClick={() => setCardOpen(true)}
              leftIcon={<Share2 className="size-4" aria-hidden="true" />}
              className="shrink-0"
            >
              Share
            </Button>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{dateStr}</p>
        </div>

        <div className="grid grid-cols-3 divide-x divide-border">
          {figures.map((figure) => (
            <StatFigure
              key={figure.unit}
              value={figure.format(figure.to)}
              unit={figure.unit}
            />
          ))}
        </div>

        {/* The session's sets — the thing no other surface shows. */}
        <section aria-labelledby="workout-exercises" className="space-y-2">
          <SectionHeading id="workout-exercises">Exercises</SectionHeading>
          {exercises.length === 0 ? (
            <EmptyState
              compact
              icon={Dumbbell}
              headline="No exercises recorded"
              sub="This session was saved without any logged sets."
            />
          ) : (
            exercises.map((ex, i) => (
              <ExerciseRecord key={`${ex.exerciseId}-${i}`} exercise={ex} />
            ))
          )}
        </section>

        {/* Secondary share destinations. The image card is the header
            action (it's the one that leaves the app); these two publish
            INSIDE Tropos and read as distinct decisions, so they stay
            named rather than hidden behind a generic picker. */}
        <div className="space-y-2 pt-1">
          {user && (
            <Button
              fullWidth
              variant="secondary"
              onClick={() => setEditOpen(true)}
            >
              Correct workout
            </Button>
          )}
          {sharedActivityId ? (
            // Already posted — the completion flow's composer or an earlier
            // visit here. Re-posting would create a second activity doc for
            // one session, so this is a state, not a disabled button.
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-muted text-muted-foreground">
              <Check
                className="size-4 shrink-0"
                style={{ color: THEME.success }}
              />
              <span className="text-sm font-medium">Shared to your feed</span>
            </div>
          ) : (
            <Button
              fullWidth
              variant="secondary"
              onClick={() => setFeedOpen(true)}
              leftIcon={<Share2 className="size-4 shrink-0" />}
            >
              Share to feed
            </Button>
          )}
          {user && (
            <Button
              fullWidth
              variant="secondary"
              onClick={() => setCircleOpen(true)}
              leftIcon={<Users className="size-4 shrink-0" />}
            >
              Share to circle
            </Button>
          )}
        </div>

        {/* ADR-0012. Last on the page and behind a confirm: a records
            correction for a mis-log, not a primary action. */}
        {user && workoutId && (
          <DeleteSessionAction
            uid={user.uid}
            kind="workout"
            id={workoutId}
            sharedActivityId={sharedActivityId}
          />
        )}
      </div>

      {user && editOpen && (
        <CorrectWorkoutSheet
          uid={user.uid}
          workout={workout}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false);
            retry();
          }}
        />
      )}
      <ShareCardSheet
        open={cardOpen}
        onOpenChange={setCardOpen}
        data={{
          template: "lift",
          handle: profile?.displayName || "Athlete",
          date: shortDate,
          totalVolumeKg: tonnage,
          exerciseCount: exercises.length,
          durationSec: (workout.durationMinutes ?? 0) * 60,
        }}
      />

      {user && circleOpen && (
        <CircleShareSheet open onOpenChange={setCircleOpen} uid={user.uid} />
      )}

      {user && feedOpen && (
        <WorkoutFeedShareSheet
          open
          onOpenChange={setFeedOpen}
          uid={user.uid}
          workout={workout}
          title={title}
          onShared={(id) => setSharedOverride({ doc: workout, id })}
        />
      )}
    </div>
  );
}
