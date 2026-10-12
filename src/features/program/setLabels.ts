/**
 * What a set in the workout screen is called.
 *
 * A warm-up has no number. The sets that count are numbered among
 * themselves, so with a three-set ramp in front of it the first working
 * set is "Set 1", not "Set 4": the ramp used to take the first numbers,
 * and the screen asked for "Set 4 of 6" on a three-set exercise.
 *
 * A drop set and a set taken to failure still count, as every lifting app
 * counts them; their badge shows the letter instead of the number, as
 * Hevy's and MacroFactor's do.
 */

export type SetType = "working" | "warmup" | "dropset" | "failure";

interface TypedSet {
  type: string;
  completed?: boolean;
}

export const SET_TYPE_ORDER: readonly SetType[] = [
  "working",
  "warmup",
  "dropset",
  "failure",
];

/** The set type menu: what each type is called and what it does here. */
export const SET_TYPE_COPY: Record<
  SetType,
  { name: string; letter: string; detail: string }
> = {
  working: {
    name: "Working set",
    letter: "",
    detail:
      "A normal set. It counts toward your volume and your bests, and sets your next weights.",
  },
  warmup: {
    name: "Warm-up",
    letter: "W",
    detail:
      "A lighter set before your working sets. Optional, and not saved with your workout.",
  },
  dropset: {
    name: "Drop set",
    letter: "D",
    detail:
      "Straight after a set, with less weight and no rest. Counts toward your volume, not your next weights.",
  },
  failure: {
    name: "To failure",
    letter: "F",
    detail: "As many reps as you can. Log the last rep you finished.",
  },
};

export function asSetType(type: string): SetType {
  return (SET_TYPE_ORDER as readonly string[]).includes(type)
    ? (type as SetType)
    : "working";
}

const isWarmup = (set: TypedSet) => set.type === "warmup";

/** 1-based place among the sets of the same kind: warm-ups among
 *  warm-ups, every other set among the sets that count. */
export function setOrdinal(sets: readonly TypedSet[], index: number): number {
  const warm = isWarmup(sets[index]);
  let n = 0;
  for (let i = 0; i <= index; i++) if (isWarmup(sets[i]) === warm) n++;
  return n;
}

/** What the row's badge shows: a working set's number, otherwise its
 *  type's letter. */
export function setBadge(sets: readonly TypedSet[], index: number): string {
  const type = asSetType(sets[index].type);
  return type === "working"
    ? String(setOrdinal(sets, index))
    : SET_TYPE_COPY[type].letter;
}

/** The set's name as the screen and a screen reader say it:
 *  "Set 2", "Warm-up 1". */
export function setName(sets: readonly TypedSet[], index: number): string {
  return `${isWarmup(sets[index]) ? "Warm-up" : "Set"} ${setOrdinal(sets, index)}`;
}

/** How many sets of the same kind the exercise has, and how many are
 *  done: the "of 3" and the "2 done" beside the set being logged. */
export function setCounts(
  sets: readonly TypedSet[],
  index: number
): { total: number; done: number } {
  const warm = sets[index] ? isWarmup(sets[index]) : false;
  const same = sets.filter((set) => isWarmup(set) === warm);
  return {
    total: same.length,
    done: same.filter((set) => set.completed).length,
  };
}

/** The sets that count toward a session's progress: every set but the
 *  warm-ups, which are optional. */
export function countedSets<T extends TypedSet>(sets: readonly T[]): T[] {
  return sets.filter((set) => !isWarmup(set));
}
