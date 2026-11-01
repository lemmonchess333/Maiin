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
import { applyPrivacyZones, type PrivacyZone } from "@/lib/privacyZones";
import { sampleRoute, splitRouteSegments } from "@/lib/routeSegments";
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

/** How a run's route is shared. `keepRouteEnds` is the poster's choice to
 *  show where a run started and finished. `zones` is the poster's privacy
 *  zones as they are now, or null while they are loading or could not be
 *  read, which shares no route at all. */
export interface SnapshotRouteOptions {
  keepRouteEnds: boolean;
  zones: PrivacyZone[] | null;
}

/** The snapshot of `a`. */
export function spacePostSnapshot(
  a: RecentSession,
  { keepRouteEnds, zones }: SnapshotRouteOptions
): SpacePostActivitySnapshot {
  if (a.kind === "run") {
    const r = a.run;
    // Any signed-in account can read a space post. The stored route was cut
    // with the zones the run was saved under, so the zones as they are now
    // are cut again here, as every other way of sharing a run does; then
    // the ends are trimmed, as a run shared to the feed trims them.
    const zoned =
      r.routePreview && zones ? applyPrivacyZones(r.routePreview, zones) : null;
    const route =
      zoned && !keepRouteEnds
        ? clipRouteEnds(zoned, DEFAULT_CLIP_METERS)
        : zoned;
    const drawable =
      !!route && splitRouteSegments(route).some((piece) => piece.length > 1);
    return {
      type: "run",
      distance: r.distance,
      avgPace: r.avgPace,
      duration: r.duration,
      elevationGain: r.elevationGain,
      ...(route && drawable
        ? { routePreview: sampleRoute(route, ROUTE_POINTS_MAX) }
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
