import type { Workout, WorkoutExercise, WorkoutSet } from "@/lib/savedWorkouts";

/** One set as Train's "Last:" line shows it. */
export interface LastSet {
  weightKg: number;
  reps: number;
}

/** A run of consecutive sets at one weight: "90 kg × 5, 5". */
export interface LastSetGroup {
  weightKg: number;
  reps: number[];
}

/**
 * The sets each exercise was last done with, for Train's "Last:" line:
 * every set the plan reads, in the order they were done.
 *
 * Not the best set alone: under Lift4 the plan says nothing when last
 * time's sets explain the new number, and one set can't. A weight held
 * after 12, 12, 10 would read "Last: 60 kg × 12" beside an unchanged
 * prescription, which looks like a bug.
 *
 * Drop sets are left out, as progression leaves them out. Warm-ups are not
 * saved, but a document from before sets had types (D2) can hold a light
 * set typed in by hand, so an untyped set under half the heaviest is still
 * read as a warm-up, as the best-set line did.
 */
export function lastSetsByExercise(
  workouts: readonly { exercises: readonly WorkoutExercise[] }[]
): Map<string, LastSet[]> {
  const map = new Map<string, LastSet[]>();
  // Newest first, so the first session found for an exercise is its last.
  for (const workout of workouts) {
    for (const exercise of workout.exercises) {
      if (map.has(exercise.exerciseId)) continue;
      const sets = countedSets(exercise.sets);
      if (sets.length) map.set(exercise.exerciseId, sets);
    }
  }
  return map;
}

/** A lift of a plan in its slot: `instanceId` is the slot. */
interface Lift {
  exerciseId: string;
  instanceId?: string;
}

/**
 * The sets each lift of a plan was last done with in its own slot (F11), for
 * Train's "Last:" line and where a session's rows start.
 *
 * One exercise can fill two slots, a heavy squat at 5 reps and a light one
 * at 9, and each slot's weight and reps follow its own sets. Read by the
 * exercise alone, the heavy squat opened with the light day's sets: a set
 * the person had taken weight off came back at 9 reps. A programme session
 * saved with its completion records the slot each exercise filled
 * (`programmeCompletion`), so a slot reads the last session that ran it with
 * that exercise.
 *
 * A slot no saved session records reads the exercise's last session, as
 * `lastSetsByExercise` does, leaving out any that ran it in another slot the
 * plan still runs it in: those sets follow another prescription. So a plan
 * rebuilt with new slots still reads the old plan's sessions, and a session
 * that records no slot (a routine, or a save from before completions were
 * kept) is read as before. A session waiting to sync records its slot when
 * it syncs; until then its slot reads the session before it.
 */
export function lastSetsBySlot(
  workouts: readonly Pick<Workout, "exercises" | "programmeCompletion">[],
  plan: readonly Lift[]
): (lift: Lift) => LastSet[] | undefined {
  const planSlots = new Set(
    plan.flatMap((lift) =>
      lift.instanceId ? [slotKey(lift.instanceId, lift.exerciseId)] : []
    )
  );
  const bySlot = new Map<string, LastSet[]>();
  const elsewhere: { exercises: WorkoutExercise[] }[] = [];
  // Newest first, so the first session found for a slot is its last.
  for (const workout of workouts) {
    const slots = slotsOf(workout);
    const unplaced: WorkoutExercise[] = [];
    workout.exercises.forEach((exercise, index) => {
      const slot = slots?.[index];
      const key = slot ? slotKey(slot, exercise.exerciseId) : null;
      if (key && !bySlot.has(key)) {
        const sets = countedSets(exercise.sets);
        if (sets.length) bySlot.set(key, sets);
      }
      if (!key || !planSlots.has(key)) unplaced.push(exercise);
    });
    elsewhere.push({ exercises: unplaced });
  }
  const byExercise = lastSetsByExercise(elsewhere);
  return ({ exerciseId, instanceId }) =>
    (instanceId ? bySlot.get(slotKey(instanceId, exerciseId)) : undefined) ??
    byExercise.get(exerciseId);
}

function slotKey(instanceId: string, exerciseId: string): string {
  return JSON.stringify([instanceId, exerciseId]);
}

/**
 * The slot each exercise of a saved session filled, from the prescription
 * its completion kept, which the saved exercises follow one for one. Null
 * when the session records none, or the two lists disagree.
 */
function slotsOf(
  workout: Pick<Workout, "exercises" | "programmeCompletion">
): (string | undefined)[] | null {
  const ran =
    workout.programmeCompletion?.context?.progression?.prescription?.exercises;
  if (
    !Array.isArray(ran) ||
    ran.length !== workout.exercises.length ||
    ran.some(
      (ex, index) => ex?.exerciseId !== workout.exercises[index].exerciseId
    )
  )
    return null;
  return ran.map((ex) => ex.instanceId);
}

function countedSets(sets: readonly WorkoutSet[]): LastSet[] {
  const heaviest = Math.max(0, ...sets.map((set) => set.weightKg));
  return sets
    .filter((set) =>
      set.type === undefined
        ? set.weightKg >= heaviest * 0.5
        : set.type === "working" || set.type === "failure"
    )
    .map(({ weightKg, reps }) => ({ weightKg, reps }));
}

/** Consecutive sets at one weight, grouped, so a top set and its back-offs
 *  read "100 kg × 5 · 90 kg × 5, 5". */
export function groupLastSets(sets: readonly LastSet[]): LastSetGroup[] {
  const groups: LastSetGroup[] = [];
  for (const set of sets) {
    const last = groups[groups.length - 1];
    if (last && last.weightKg === set.weightKg) last.reps.push(set.reps);
    else groups.push({ weightKg: set.weightKg, reps: [set.reps] });
  }
  return groups;
}
