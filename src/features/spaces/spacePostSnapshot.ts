/**
 * The session a Space post carries: a snapshot of a logged run or lift,
 * taken when the post is written, so the post draws without reading the
 * session again (the feed's idiom). A workout carries its volume,
 * exercise count and movement categories; a run its distance, pace and a
 * downsampled route.
 *
 * firestore.rules accepts only these keys on a post's `activity`, so a key
 * added here without one there refuses every post that carries it.
 * spacePostSnapshot.cross.test.ts pins the two lists equal.
 */
import { inferMovementCategory } from "@/lib/exerciseMovementCategory";
import { liftPostLeadExerciseId } from "@/lib/liftPost";
import { clipRouteEnds, DEFAULT_CLIP_METERS } from "@/lib/shareCard/polyline";
import { workoutTonnageKg } from "@/hooks/useWorkouts";
import type { SpacePostActivitySnapshot } from "./spaceTypes";
import type { RecentSession } from "./useRecentSessions";

/** Every key a snapshot may hold, as the rules list them. */
export const SPACE_POST_SNAPSHOT_KEYS = [
  "type",
  "distance",
  "avgPace",
  "duration",
  "elevationGain",
  "routePreview",
  "totalVolume",
  "exerciseCount",
  "muscleGroups",
  "leadExerciseId",
] as const satisfies readonly (keyof SpacePostActivitySnapshot)[];

/** Route points cap for the snapshot — bounds the post doc size while
 *  keeping the RouteScene silhouette intact. */
const ROUTE_POINTS_MAX = 40;

function downsample<T>(points: T[], max: number): T[] {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => points[Math.round(i * step)]);
}

/** The snapshot of `a`. `keepRouteEnds` is the poster's choice to show
 *  where a run started and finished. */
export function spacePostSnapshot(
  a: RecentSession,
  keepRouteEnds: boolean
): SpacePostActivitySnapshot {
  if (a.kind === "run") {
    const r = a.run;
    // Any signed-in account can read a space post, so the route's ends are
    // trimmed exactly as a run shared to the feed trims them: the privacy
    // setting promises that the start and finish of a shared run are hidden.
    const route =
      r.routePreview && !keepRouteEnds
        ? clipRouteEnds(r.routePreview, DEFAULT_CLIP_METERS)
        : r.routePreview;
    return {
      type: "run",
      distance: r.distance,
      avgPace: r.avgPace,
      duration: r.duration,
      elevationGain: r.elevationGain,
      ...(route && route.length > 1
        ? { routePreview: downsample(route, ROUTE_POINTS_MAX) }
        : {}),
    };
  }
  const w = a.workout;
  const categories = Array.from(
    new Set(
      w.exercises.map((ex) =>
        inferMovementCategory(ex.exerciseName, ex.exerciseId)
      )
    )
  );
  const leadExerciseId = liftPostLeadExerciseId(
    w.exercises.map((ex) => ({
      exerciseId: ex.exerciseId,
      name: ex.exerciseName,
    }))
  );
  return {
    type: "workout",
    totalVolume: Math.round(workoutTonnageKg(w)),
    exerciseCount: w.exercises.length,
    muscleGroups: categories,
    duration: w.durationMinutes * 60,
    ...(leadExerciseId ? { leadExerciseId } : {}),
  };
}
