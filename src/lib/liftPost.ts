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
import { formatExerciseSummary } from "@/lib/exerciseSummary";
import { workoutTonnageKg, type WorkoutExercise } from "@/lib/savedWorkouts";
import type { ActivityPreview, ShareDecision } from "@/lib/shareComposer";
import type { ActivityPost, PostedExercise } from "@/lib/activityPost";

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
export function liftPostPreview(lift: LiftForPost): ActivityPreview {
  const { done, tonnageKg } = liftFigures(lift);
  return {
    type: "workout",
    title: lift.title,
    meta: [
      `${done.length} exercise${done.length === 1 ? "" : "s"}`,
      tonnageKg > 0
        ? `${Math.round(tonnageKg).toLocaleString()} kg volume`
        : "",
      lift.durationMinutes > 0 ? `${lift.durationMinutes} min` : "",
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
    duration: lift.durationMinutes * 60,
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
}

const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/**
 * The exercise rows of any lift post in the feed. Posts carry one of three
 * shapes, and the card draws all of them:
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
export function liftPostRows(raw: unknown): LiftPostRow[] {
  if (!Array.isArray(raw)) return [];
  const rows: LiftPostRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
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
      rows.push({
        name,
        summary: typeof ex.summary === "string" ? ex.summary : "",
        structured: null,
      });
      continue;
    }
    // Which lift it is decides "BW" and seconds. Older posts carry no id,
    // and the catalogue names the lift.
    const exerciseId =
      typeof ex.exerciseId === "string" && ex.exerciseId
        ? ex.exerciseId
        : EXERCISES.find((e) => e.name === name)?.id;
    rows.push({
      name,
      summary: formatExerciseSummary({ ...structured, exerciseId }),
      structured,
    });
  }
  return rows;
}
