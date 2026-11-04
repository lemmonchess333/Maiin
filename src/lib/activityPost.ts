/**
 * A feed post: the fields `postActivity` writes to `activities/{id}`.
 *
 * firestore.rules checks a post against a closed list of fields and
 * refuses the whole write when it carries one more. That list and this
 * type say the same thing in two places, so they are held together
 * twice: `FIELDS` below makes the type and the runtime list agree at
 * compile time, and activityPostFields.cross.test.ts compares the list
 * with the rules. A share sheet that sends a field the rules do not
 * know is a type error, not a post that fails on a phone.
 *
 * No runtime imports, so the rules tests can read it without starting
 * Firebase.
 */
import type { PostMoment } from "./postMoments";

/**
 * The caption box's limit, counted in UTF-16 code units. Both
 * `String.prototype.slice`, which the share sheets cut the caption with,
 * and the rules' `string.size()` count in those units (measured on the
 * emulator: 70 emoji pass at 140, 71 are refused), so the rules can hold
 * the same number.
 */
export const CAPTION_MAX = 140;

/** One exercise on a lift post (`liftPost`): what was done, as the feed
 *  card draws it and "Save as routine" copies it. */
export interface PostedExercise {
  name: string;
  exerciseId?: string;
  /** "3×8×60 kg": the row as drawn. */
  summary: string;
  /** Sets done. */
  setCount: number;
  /** The first set's reps (seconds for a timed hold) and load. */
  targetReps: number;
  targetWeightKg: number;
  /** The superset it was done in (Mob1 call 2), as the workout records
   *  it. Absent for an exercise done on its own. */
  superset?: number;
}

export type ActivityPost = {
  authorId: string;
  authorName: string;
  /** Denormalised author avatar URL, carried on the post and on each
   *  follower's feed item so ActivityCard can draw the author row
   *  without fetching the profile. Absent when the user has no photo;
   *  the card falls back to initials. */
  authorPhotoURL?: string;
  type: "run" | "workout";
  visibility: "public" | "followers" | "private";
  /** The note typed in the share sheet, at most CAPTION_MAX long. */
  caption?: string;
  workoutName?: string;
  runName?: string;
  activityTitle?: string;
  exerciseCount?: number;
  totalVolume?: number;
  duration?: number;
  distance?: number;
  avgPace?: number | string;
  elevationGain?: number;
  calories?: number;
  muscleGroups?: string[];
  /** The rules cap the list's length and nothing inside it. Every lift
   *  post builds its rows in `liftPost`; the feed holds older shapes too,
   *  which `liftPostRows` reads. */
  exercises?: PostedExercise[];
  prHit?: boolean;
  prExercise?: string;
  prWeight?: number;
  prCount?: number;
  challengeMilestone?: string;
  badgeEarned?: string;
  routePreview?: Array<{ lat: number; lon: number; breakBefore?: boolean }>;
  /** The run's map image in each theme, by download URL (Soc15 call 5).
   *  Never sent with the post: the author's app names it once the post
   *  exists and the images are uploaded (`routeMapUpload.ts`), and the
   *  rules take only the author's own `route-maps/{uid}/{postId}/` files,
   *  on a post that shares a route. */
  routeMap?: { light: string; dark: string };
  /** What happened to the author in the session (Soc15): a new PR, the
   *  longest run yet, a streak reached. At most three, each a kind and its
   *  numbers (`postMoments.ts`); absent when there were none. */
  moments?: PostMoment[];
};

/* Every field, once. A `Record` over the type's keys makes the compiler
   refuse both a field missing from here and one the type does not have. */
const FIELDS: Record<keyof ActivityPost, true> = {
  authorId: true,
  authorName: true,
  authorPhotoURL: true,
  type: true,
  visibility: true,
  caption: true,
  workoutName: true,
  runName: true,
  activityTitle: true,
  exerciseCount: true,
  totalVolume: true,
  duration: true,
  distance: true,
  avgPace: true,
  elevationGain: true,
  calories: true,
  muscleGroups: true,
  exercises: true,
  prHit: true,
  prExercise: true,
  prWeight: true,
  prCount: true,
  challengeMilestone: true,
  badgeEarned: true,
  routePreview: true,
  routeMap: true,
  moments: true,
};

export const ACTIVITY_POST_FIELDS = Object.keys(FIELDS) as ReadonlyArray<
  keyof ActivityPost
>;

/** Written by `postActivity` itself on every post, never passed in. */
export const ACTIVITY_POST_STAMPS = [
  "kudosCount",
  "commentCount",
  "createdAt",
] as const;
