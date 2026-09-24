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
 * No imports, so the rules tests can read it without starting Firebase.
 */

/**
 * The caption box's limit, counted in UTF-16 code units. Both
 * `String.prototype.slice`, which the share sheets cut the caption with,
 * and the rules' `string.size()` count in those units (measured on the
 * emulator: 70 emoji pass at 140, 71 are refused), so the rules can hold
 * the same number.
 */
export const CAPTION_MAX = 140;

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
  /** The rules cap the list's length and nothing inside it; the share
   *  sheets write two shapes. */
  exercises?: Array<{ name: string } & Record<string, unknown>>;
  prHit?: boolean;
  prExercise?: string;
  prWeight?: number;
  prCount?: number;
  challengeMilestone?: string;
  badgeEarned?: string;
  routePreview?: Array<{ lat: number; lon: number; breakBefore?: boolean }>;
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
