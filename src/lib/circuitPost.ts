/**
 * A circuit's feed post (Circ1 (11)): what it says, and how the feed card
 * reads it back. The `liftPost` family's circuit.
 *
 * A circuit is a workout with no sets (Circ1 (B)), so its post carries no
 * exercise rows: the rounds done, the interval and one round's moves go
 * under `circuit`, the moves as exercise ids the card names from the
 * catalogue, so the post holds no typed words there. The rest is a
 * workout post's: the title, the minutes and how many moves, which an app
 * from before circuits draws as a workout of that many exercises.
 *
 * Every circuit post is built here: the finish's (`completeCircuit`) and
 * one shared later from the circuit's own page (`WorkoutFeedShareSheet`).
 */
import { EXERCISES } from "@/lib/exercises";
import type { ActivityPost } from "@/lib/activityPost";
import type { ActivityPreview, ShareDecision } from "@/lib/shareComposer";
import { circuitHistorySummary } from "@/features/circuit/circuitCopy";
import type { SavedCircuit } from "@/features/circuit/savedCircuit";

/** A saved circuit, as its post describes it. */
export interface CircuitForPost {
  /** The post's title: the circuit's name. */
  title: string;
  circuit: SavedCircuit;
}

/** What the share sheet shows before a circuit is posted:
 *  "20 min · 4 rounds · 5 moves". */
export function circuitPostPreview({
  title,
  circuit,
}: CircuitForPost): ActivityPreview {
  return { type: "workout", title, meta: circuitHistorySummary(circuit) };
}

const whole = (value: number) => Math.max(0, Math.round(value));

/** The post for a saved circuit: what was done of it. */
export function circuitPost(
  author: {
    uid: string;
    displayName?: string | null;
    photoURL?: string | null;
  },
  { title, circuit }: CircuitForPost,
  decision: Pick<ShareDecision, "visibility"> & { caption?: string }
): ActivityPost {
  const caption = decision.caption?.trim();
  return {
    authorId: author.uid,
    authorName: author.displayName || "Athlete",
    ...(author.photoURL ? { authorPhotoURL: author.photoURL } : {}),
    type: "workout",
    visibility: decision.visibility,
    ...(caption ? { caption } : {}),
    workoutName: title,
    activityTitle: title,
    exerciseCount: circuit.moves.length,
    duration: whole(circuit.activeSeconds),
    circuit: {
      rounds: whole(circuit.roundsDone),
      workSeconds: whole(circuit.workSeconds),
      restSeconds: whole(circuit.restSeconds),
      moves: circuit.moves.map((move) => move.exerciseId),
    },
  };
}

/** A circuit post, as the feed card draws it. */
export interface CircuitPostView {
  rounds: number;
  workSeconds: number;
  restSeconds: number;
  /** One round's moves, named from the catalogue. An id it does not know
   *  is left out: the post never names a move itself. */
  moves: { exerciseId: string; name: string }[];
}

const BY_ID = new Map(EXERCISES.map((exercise) => [exercise.id, exercise]));

const count = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : null;

/** A post's circuit, read whole, or null for a post that is not one. */
export function circuitPostOf(raw: unknown): CircuitPostView | null {
  if (!raw || typeof raw !== "object") return null;
  const stored = raw as Record<string, unknown>;
  const rounds = count(stored.rounds);
  const workSeconds = count(stored.workSeconds);
  const restSeconds = count(stored.restSeconds);
  if (
    rounds === null ||
    workSeconds === null ||
    restSeconds === null ||
    !Array.isArray(stored.moves)
  )
    return null;
  const moves = stored.moves.flatMap((id) => {
    const exercise = typeof id === "string" ? BY_ID.get(id) : undefined;
    return exercise ? [{ exerciseId: exercise.id, name: exercise.name }] : [];
  });
  return { rounds, workSeconds, restSeconds, moves };
}
