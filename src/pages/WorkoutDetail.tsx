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
 * it, so missing that moment made a session unshareable forever. Worse
 * after the share-default change — a user whose stored default is "never"
 * has `compose()` silently decline every session, with no way to post an
 * individual one. This page is the escape hatch that makes that default
 * safe to pick.
 *
 * It also removes the reason two share controls used to sit on the
 * completion screen BEFORE the save ran: "Share to Circle" published a
 * `session_completed` event and "Share Workout" exported a card, while
 * "Save Workout" was a different button entirely. Share to Circle → Close
 * without saving left a Circle post claiming a session with no record
 * behind it. Sharing from a record that already exists cannot do that.
 *
 * Fetch mirrors `RunDetail` exactly (useParams + one-shot getDoc) rather
 * than reading `useWorkouts()`'s in-memory list, which holds only the newest
 * 50 and would 404 on an older session or on a cold deep-link before the
 * snapshot resolves.
 */
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { ChevronLeft, Share2, Users, Check, Dumbbell } from "lucide-react";

import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { THEME } from "@/lib/theme";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import ShareCardSheet from "@/components/share/ShareCardSheet";
import CircleShareSheet from "@/components/social/CircleShareSheet";
import WorkoutFeedShareSheet from "@/components/workout/WorkoutFeedShareSheet";
import {
  workoutTonnageKg,
  workoutTitle,
  type Workout,
} from "@/hooks/useWorkouts";

/** One stat in the primary row. Mirrors RunDetail's StatPill. */
function StatPill({
  value,
  label,
  color,
}: {
  value: string;
  label: string;
  color?: string;
}) {
  return (
    <div className="flex-1 py-3 text-center">
      <p
        className="text-2xl font-bold font-mono tabular-nums leading-none"
        style={{ color: color || "var(--foreground)" }}
      >
        {value}
      </p>
      <p className="text-xs uppercase tracking-widest text-muted-foreground mt-1">
        {label}
      </p>
    </div>
  );
}

function formatVolume(kg: number): string {
  if (kg >= 1000) return `${(kg / 1000).toFixed(1)}k`;
  return String(Math.round(kg));
}

/** Working sets only. Warm-ups are logged on the same list but are not the
 *  session's work, and counting them inflates every set total on the page —
 *  the same filter `SessionCompleteScreen` applies to its SETS stat. */
function workingSets(ex: Workout["exercises"][number]) {
  return (ex.sets ?? []).filter((s) => s.type !== "warmup");
}

export default function WorkoutDetail() {
  const { workoutId } = useParams<{ workoutId: string }>();
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  const [workout, setWorkout] = useState<Workout | null>(null);
  const [loading, setLoading] = useState(true);
  const [cardOpen, setCardOpen] = useState(false);
  const [circleOpen, setCircleOpen] = useState(false);
  const [feedOpen, setFeedOpen] = useState(false);
  /** Set optimistically once a feed post lands so the button flips to its
   *  "shared" state without a refetch. Seeded from the doc on load. */
  const [sharedActivityId, setSharedActivityId] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !workoutId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    getDoc(doc(db, "users", user.uid, "workouts", workoutId))
      .then((snap) => {
        if (cancelled) return;
        if (snap.exists()) {
          const data = { id: snap.id, ...snap.data() } as Workout;
          setWorkout(data);
          setSharedActivityId(data.sharedActivityId ?? null);
        }
      })
      .catch(() => {
        /* leave `workout` null — the not-found state below covers it */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, workoutId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Spinner size="lg" variant="primary" label="Loading workout" />
      </div>
    );
  }

  if (!workout) {
    return (
      <div className="min-h-screen bg-background px-4 pt-6">
        <IconButton
          icon={<ChevronLeft className="size-5" />}
          aria-label="Back"
          variant="ghost"
          onClick={() => navigate(-1)}
        />
        <EmptyState
          icon={Dumbbell}
          headline="Workout not found"
          sub="It may have been deleted, or the link belongs to another account."
          action={{ label: "History", href: "/history" }}
        />
      </div>
    );
  }

  const tonnage = workoutTonnageKg(workout);
  const exercises = workout.exercises ?? [];
  const totalSets = exercises.reduce((n, ex) => n + workingSets(ex).length, 0);

  const title = workoutTitle(workout);

  const dateObj = workout.createdAt?.toDate?.() ?? new Date(workout.date);
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

        {/* Header — mirrors RunDetail: identity + date left, share right. */}
        <div>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-widest text-muted-foreground mb-0.5">
                Lift
              </p>
              <h1 className="text-xl font-extrabold text-foreground truncate">
                {title}
              </h1>
            </div>
            <button
              type="button"
              onClick={() => setCardOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 min-h-[44px] rounded-xl text-xs font-medium active:scale-[0.97] transition-transform bg-primary/8 text-primary shrink-0"
            >
              <Share2 className="size-3.5" />
              Share
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">{dateStr}</p>
        </div>

        {/* Primary stats */}
        <div className="rounded-2xl bg-card card-shadow flex divide-x divide-border/40">
          <StatPill value={`${workout.durationMinutes ?? 0}`} label="Minutes" />
          <StatPill
            value={formatVolume(tonnage)}
            label="kg Volume"
            color={THEME.lifting}
          />
          <StatPill value={`${totalSets}`} label="Sets" />
        </div>

        {/* Exercise breakdown — the thing no other surface shows. */}
        <div className="space-y-2">
          <p className="text-caption uppercase tracking-widest text-muted-foreground px-1">
            Exercises
          </p>
          {exercises.length === 0 ? (
            <EmptyState
              compact
              icon={Dumbbell}
              headline="No exercises recorded"
              sub="This session was saved without any logged sets."
            />
          ) : (
            exercises.map((ex, i) => {
              const sets = workingSets(ex);
              return (
                <div
                  key={`${ex.exerciseId}-${i}`}
                  className="rounded-xl bg-card card-shadow p-3 space-y-2"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm font-semibold text-foreground min-w-0 truncate">
                      {ex.exerciseName}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono tabular-nums shrink-0">
                      {sets.length} {sets.length === 1 ? "set" : "sets"}
                    </p>
                  </div>
                  {sets.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {sets.map((s, si) => (
                        <span
                          key={si}
                          className="px-2 py-1 rounded-lg bg-muted text-xs font-mono tabular-nums text-foreground"
                        >
                          {ex.repUnit === "seconds"
                            ? `${s.reps}s`
                            : `${s.reps}×`}
                          {s.weightKg > 0 ? ` ${s.weightKg}kg` : ""}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Secondary share destinations. The image card is the header
            action (it's the one that leaves the app); these two publish
            INSIDE Tropos and read as distinct decisions, so they stay
            named rather than hidden behind a generic picker. */}
        <div className="space-y-2 pt-1">
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
              Share to Circle
            </Button>
          )}
        </div>
      </div>

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
          onShared={setSharedActivityId}
        />
      )}
    </div>
  );
}
