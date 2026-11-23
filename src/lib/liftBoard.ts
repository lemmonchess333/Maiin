/**
 * Lift boards (Run30 call 3), as the app reads them: on a barbell lift's
 * page, the heaviest set of each person you follow, with yours among them,
 * copied from Hevy's per-exercise leaderboard ("Leaderboard - Heaviest
 * Weight", Following).
 *
 * The board is the server's (`functions/lib/liftBoards.js`): it is read
 * only through `getLiftBoard`, which shows the people you follow, from
 * workouts they shared with followers or everyone, across no block either
 * way, never a restricted account or one being deleted. There is no board
 * of everyone and no crown. Your own row is drawn here from your own
 * workouts, as a segment's is from your own efforts, so it is your
 * heaviest set whoever saw the workout.
 *
 * Which lifts have one, and which set counts, are copies of the server's,
 * pinned by `src/lib/__tests__/liftBoard.cross.test.ts`.
 */
import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";

export { LIFT_BOARD_EXERCISE_IDS, hasLiftBoard } from "./liftBoardLifts";

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** The heaviest load a set may carry and still count, in kg: past every
 *  barbell record, so a typed extra digit never tops a board. */
export const MAX_LOAD_KG = 600;

export interface LiftSet {
  weightKg: number;
  reps: number;
}

/**
 * The heaviest set that counts, or null: at least one rep, a load above 0
 * and at most MAX_LOAD_KG, never a warm-up; of two the same weight, more
 * reps. The server's `heaviestSet`.
 */
export function heaviestSet(
  sets: readonly { weightKg?: unknown; reps?: unknown; type?: unknown }[]
): LiftSet | null {
  let best: LiftSet | null = null;
  for (const set of sets) {
    if (!set || set.type === "warmup") continue;
    const weightKg = Number(set.weightKg);
    const reps = Math.floor(Number(set.reps));
    if (!Number.isFinite(weightKg) || !(weightKg > 0) || weightKg > MAX_LOAD_KG)
      continue;
    if (!Number.isFinite(reps) || reps < 1) continue;
    if (
      !best ||
      weightKg > best.weightKg ||
      (weightKg === best.weightKg && reps > best.reps)
    )
      best = { weightKg, reps };
  }
  return best;
}

/** Your own heaviest set of the lift, with where it was lifted. */
export interface OwnLiftBest extends LiftSet {
  workoutId: string;
  day: string | null;
}

/** Your heaviest set across your sessions of the lift; of two the same,
 *  the earlier, as the server orders a board. */
export function ownLiftBest(
  sessions: readonly {
    workoutId: string;
    date: string;
    sets: readonly { weightKg: number; reps: number }[];
  }[]
): OwnLiftBest | null {
  let best: OwnLiftBest | null = null;
  for (const session of sessions) {
    const set = heaviestSet(session.sets);
    if (!set) continue;
    const day = DAY_KEY.test(session.date) ? session.date : null;
    if (
      !best ||
      set.weightKg > best.weightKg ||
      (set.weightKg === best.weightKg && set.reps > best.reps) ||
      (set.weightKg === best.weightKg &&
        set.reps === best.reps &&
        (day ?? "9999") < (best.day ?? "9999"))
    )
      best = { ...set, workoutId: session.workoutId, day };
  }
  return best;
}

/** A row of a lift's board, as `getLiftBoard` returns it. */
export interface LiftBoardEntry extends LiftSet {
  uid: string;
  name: string | null;
  photoURL: string | null;
  day: string | null;
  activityId: string | null;
}

const isFinitePositive = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v > 0;

export function parseLiftBoardEntry(value: unknown): LiftBoardEntry | null {
  const row = value as Record<string, unknown> | null;
  if (!row || typeof row.uid !== "string" || !row.uid) return null;
  if (!isFinitePositive(row.weightKg) || !isFinitePositive(row.reps))
    return null;
  return {
    uid: row.uid,
    name: typeof row.name === "string" && row.name ? row.name : null,
    photoURL:
      typeof row.photoURL === "string" && row.photoURL ? row.photoURL : null,
    weightKg: row.weightKg,
    reps: Math.floor(row.reps),
    day: typeof row.day === "string" && DAY_KEY.test(row.day) ? row.day : null,
    activityId:
      typeof row.activityId === "string" && row.activityId
        ? row.activityId
        : null,
  };
}

export interface LiftBoardRow extends LiftSet {
  uid: string;
  self: boolean;
  name: string;
  photoURL: string | null;
  day: string | null;
  /** Where the row opens: the post it came from, or your workout. */
  href: string | null;
}

/**
 * The board as the viewer reads it: the people they follow (the server has
 * already left out anyone they may not see) and their own best among them,
 * heaviest first, then more reps, then you on a tie. Someone blocked since
 * the board was read is left out here too, as on every social surface.
 */
export function liftBoardRows(
  entries: readonly LiftBoardEntry[],
  own: OwnLiftBest | null,
  uid: string | null,
  blocked: ReadonlySet<string>
): LiftBoardRow[] {
  const rows: LiftBoardRow[] = entries
    .filter((e) => e.uid !== uid && !blocked.has(e.uid))
    .map((e) => ({
      uid: e.uid,
      self: false,
      name: e.name ?? "Lifter",
      photoURL: e.photoURL,
      weightKg: e.weightKg,
      reps: e.reps,
      day: e.day,
      href: e.activityId ? `/activity/${e.activityId}` : null,
    }));
  if (own && uid)
    rows.push({
      uid,
      self: true,
      name: "You",
      photoURL: null,
      weightKg: own.weightKg,
      reps: own.reps,
      day: own.day,
      href: `/workout/${encodeURIComponent(own.workoutId)}`,
    });
  return rows.sort(
    (a, b) =>
      b.weightKg - a.weightKg ||
      b.reps - a.reps ||
      Number(b.self) - Number(a.self)
  );
}

/** The board of the people the signed-in person follows, heaviest first. */
export async function fetchLiftBoard(
  exerciseId: string
): Promise<LiftBoardEntry[]> {
  const call = httpsCallable<{ exerciseId: string }, { entries: unknown[] }>(
    functions,
    "getLiftBoard"
  );
  const { data } = await call({ exerciseId });
  return (Array.isArray(data?.entries) ? data.entries : [])
    .map(parseLiftBoardEntry)
    .filter((e): e is LiftBoardEntry => e !== null);
}
