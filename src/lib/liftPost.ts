/**
 * A lift's feed post: what it says, and how the feed card reads it back.
 *
 * Every lift post is built here, from the saved workout's exercises, so a
 * post says what was done: the programme's finish, a saved routine's
 * finish (`liftCompletion`), and a saved workout posted later from
 * `/workout/:id` (`WorkoutFeedShareSheet`). Those three built it by hand
 * before, in three shapes, and the third left out the summary the feed
 * card drew, which broke the card.
 *
 * The feed holds posts of every shape ever written, so the reader
 * (`liftPostRows`) takes all of them.
 *
 * No Firestore here: the feed card reads posts through this module, and
 * the save code stays out of the Social screen.
 */
import { EXERCISES } from "@/lib/exercises";
import { getFormArtCutout, type FormArtCutout } from "@/lib/formArtCutouts";
import { formatExerciseSummary, NO_SETS_SUMMARY } from "@/lib/exerciseSummary";
import { workoutTonnageKg, type WorkoutExercise } from "@/lib/savedWorkouts";
import type { ActivityPreview, ShareDecision } from "@/lib/shareComposer";
import type { ActivityPost, PostedExercise } from "@/lib/activityPost";
import { liftUnitLabel, liftVolumeIn, type LiftUnit } from "@/lib/liftLoad";
import { formatDuration } from "@/utils/formatters";

/** A saved lift, as its post describes it. */
export interface LiftForPost {
  /** The session's name: the post's title. */
  title: string;
  exercises: WorkoutExercise[];
  /** Minutes as saved. */
  durationMinutes: number;
}

/**
 * The exercises a lift post lists: the ones done, each with its sets and
 * first set. The whole list goes on the post, for "Save as routine"; the
 * feed card draws the first three.
 */
export function postedExercises(
  exercises: readonly WorkoutExercise[]
): PostedExercise[] {
  return exercises
    .filter((ex) => ex.sets.length > 0)
    .map((ex) => {
      const setCount = ex.sets.length;
      const targetReps = ex.sets[0].reps || 0;
      const targetWeightKg = ex.sets[0].weightKg || 0;
      return {
        name: ex.exerciseName,
        ...(ex.exerciseId ? { exerciseId: ex.exerciseId } : {}),
        summary: formatExerciseSummary({
          setCount,
          targetReps,
          targetWeightKg,
          exerciseId: ex.exerciseId,
        }),
        setCount,
        targetReps,
        targetWeightKg,
        ...(ex.superset !== undefined ? { superset: ex.superset } : {}),
      };
    });
}

/** The exercises done, and the weight moved. */
function liftFigures(lift: LiftForPost) {
  return {
    done: lift.exercises.filter((ex) => ex.sets.length > 0),
    tonnageKg: workoutTonnageKg({ exercises: lift.exercises }),
  };
}

/** What the share sheet shows before a lift is posted. */
export function liftPostPreview(
  lift: LiftForPost,
  unit: LiftUnit = "kg"
): ActivityPreview {
  const { done, tonnageKg } = liftFigures(lift);
  return {
    type: "workout",
    title: lift.title,
    meta: [
      `${done.length} exercise${done.length === 1 ? "" : "s"}`,
      tonnageKg > 0
        ? `${Math.round(liftVolumeIn(tonnageKg, unit)).toLocaleString()} ${liftUnitLabel(unit)} volume`
        : "",
      // Saved minutes carry the clock's seconds; the preview reads whole ones.
      lift.durationMinutes > 0 ? formatDuration(lift.durationMinutes * 60) : "",
    ].filter(Boolean),
  };
}

/** The post for a saved lift: what was done, never the plan. */
export function liftPost(
  author: {
    uid: string;
    displayName?: string | null;
    photoURL?: string | null;
  },
  lift: LiftForPost,
  decision: Pick<ShareDecision, "visibility"> & { caption?: string }
): ActivityPost {
  const { done, tonnageKg } = liftFigures(lift);
  const caption = decision.caption?.trim();
  return {
    authorId: author.uid,
    authorName: author.displayName || "Athlete",
    ...(author.photoURL ? { authorPhotoURL: author.photoURL } : {}),
    type: "workout",
    visibility: decision.visibility,
    ...(caption ? { caption } : {}),
    workoutName: lift.title,
    activityTitle: lift.title,
    exerciseCount: done.length,
    totalVolume: tonnageKg,
    duration: Math.round(lift.durationMinutes * 60),
    muscleGroups: [...new Set(done.map((ex) => ex.category).filter(Boolean))],
    exercises: postedExercises(done),
  };
}

/** One row of a lift post, as the feed card draws it. */
export interface LiftPostRow {
  name: string;
  /** The row's figures: "3×8×60 kg", "3×8 BW", "3×60 s". */
  summary: string;
  /** The figures as numbers, for comparing a lift. Null on the oldest
   *  posts, which wrote a summary only. */
  structured: {
    setCount: number;
    targetReps: number;
    targetWeightKg: number;
  } | null;
  /** The superset it was done in (Mob1 call 2), on posts that say. */
  superset?: number;
}

const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/**
 * One stored row, read: the row to draw, "not done" for an exercise the
 * post lists with no set done, or null for an item that is not a row.
 */
function readRow(
  item: unknown,
  unit: LiftUnit
): LiftPostRow | "not done" | null {
  if (!item || typeof item !== "object") return null;
  const ex = item as Record<string, unknown>;
  const name = typeof ex.name === "string" ? ex.name : "Exercise";
  const structured =
    isNumber(ex.setCount) &&
    isNumber(ex.targetReps) &&
    isNumber(ex.targetWeightKg)
      ? {
          setCount: ex.setCount,
          targetReps: ex.targetReps,
          targetWeightKg: ex.targetWeightKg,
        }
      : isNumber(ex.sets) && isNumber(ex.reps) && isNumber(ex.weightKg)
        ? {
            setCount: ex.sets,
            targetReps: ex.reps,
            targetWeightKg: ex.weightKg,
          }
        : null;
  if (!structured) {
    const summary = typeof ex.summary === "string" ? ex.summary : "";
    if (summary.trim() === NO_SETS_SUMMARY) return "not done";
    return { name, summary, structured: null };
  }
  if (Math.round(structured.setCount) <= 0) return "not done";
  const superset =
    isNumber(ex.superset) && ex.superset >= 1
      ? Math.round(ex.superset)
      : undefined;
  // Which lift it is decides "BW" and seconds. Older posts carry no id,
  // and the catalogue names the lift.
  const exerciseId =
    typeof ex.exerciseId === "string" && ex.exerciseId
      ? ex.exerciseId
      : EXERCISES.find((e) => e.name === name)?.id;
  return {
    name,
    summary: formatExerciseSummary({ ...structured, exerciseId }, unit),
    structured,
    ...(superset !== undefined ? { superset } : {}),
  };
}

/**
 * Whether a stored row is an exercise with a set done. Posts written now
 * list only those (`postedExercises`); posts shared from `/workout/:id`
 * before this module list every exercise in the workout, a skipped one
 * with no sets among them. A row that says nothing either way (a name
 * alone) counts as done.
 */
export function liftPostRowDone(item: unknown): boolean {
  return readRow(item, "kg") !== "not done";
}

/**
 * The exercise rows of any lift post in the feed, leaving out an exercise
 * with no set done. Posts carry one of three shapes, and the card draws
 * all of them:
 *
 * - `postedExercises`' (every post written now, and the finish screens'
 *   before it): the figures and a summary.
 * - The oldest posts': a name and a summary, no figures.
 * - Posts made from `/workout/:id` before this module: a name with `sets`,
 *   `reps` and `weightKg`, and no summary.
 *
 * The summary is formatted from the figures when there are any, so a
 * bodyweight or timed lift reads the same on every post.
 */
export function liftPostRows(
  raw: unknown,
  unit: LiftUnit = "kg"
): LiftPostRow[] {
  if (!Array.isArray(raw)) return [];
  const rows: LiftPostRow[] = [];
  for (const item of raw) {
    const row = readRow(item, unit);
    if (row && row !== "not done") rows.push(row);
  }
  return rows;
}

/**
 * How many exercises a lift post says were done, which is how many rows
 * its own page lists: a post whose rows carry figures holds every
 * exercise, so it is those rows. The oldest posts stored three rows with
 * no figures and the whole count, so theirs is the stored count, less any
 * row for an exercise with no set done, and never fewer than the rows.
 */
export function liftPostExerciseCount(post: {
  exercises?: unknown;
  exerciseCount?: unknown;
}): number {
  let drawn = 0;
  let notDone = 0;
  let wholeList = false;
  for (const item of Array.isArray(post.exercises) ? post.exercises : []) {
    const row = readRow(item, "kg");
    if (row === "not done") notDone += 1;
    else if (row) {
      drawn += 1;
      if (row.structured) wholeList = true;
    }
  }
  if (wholeList) return drawn;
  const stored = isNumber(post.exerciseCount)
    ? Math.max(0, Math.round(post.exerciseCount))
    : 0;
  return Math.max(drawn, stored - notDone);
}

/**
 * The drawing a lift post leads with: the first exercise done that has a
 * card cut-out, which the post's own order makes the session's lead lift.
 * Older posts carry no ids, and the catalogue names the lift; they can
 * list an exercise with no set done, which is passed over. Null when no
 * exercise on the post has a drawing.
 */
export function liftPostLeadArt(raw: unknown): FormArtCutout | null {
  const id = liftPostLeadExerciseId(raw);
  return id ? getFormArtCutout(id) : null;
}

/** The id of the lift `liftPostLeadArt` draws, for a post that stores the
 *  lead lift rather than its exercises (a Space post's attached workout). */
export function liftPostLeadExerciseId(raw: unknown): string | null {
  if (!Array.isArray(raw)) return null;
  for (const item of raw) {
    if (!item || typeof item !== "object" || !liftPostRowDone(item)) continue;
    const ex = item as Record<string, unknown>;
    const id =
      typeof ex.exerciseId === "string" && ex.exerciseId
        ? ex.exerciseId
        : typeof ex.name === "string"
          ? EXERCISES.find((e) => e.name === ex.name)?.id
          : undefined;
    if (id && getFormArtCutout(id)) return id;
  }
  return null;
}
