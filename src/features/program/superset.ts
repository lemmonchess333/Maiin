/**
 * Supersets in a session (Mob1 call 2): two or more exercises next to each
 * other, done set by set in turn, A1 → B1 → A2 → B2, with the rest after
 * the group's last exercise each round rather than after every set.
 *
 * A group is held on the session's prescription by its exercises' slots
 * (`instanceId`), so it stays with an exercise swapped in its place and is
 * kept in the draft. Each group is an object, not a bare list, because the
 * prescription is stored with a programme completion and Firestore keeps
 * no array inside an array. A superset is the session's: it never reaches
 * the plan. The saved workout records each grouped exercise's group as a
 * number (`superset`), an optional field older readers pass over, and the
 * workout's page and its post show it ("Superset A").
 */

import { isSetOutstanding } from "./sessionCursor";

type CursorSet = { completed: boolean; type?: string };

/** One superset: its exercises' slots, in session order. */
export interface SessionSuperset {
  ids: string[];
}

type Slotted = { instanceId?: string };

/** The places in the session of the superset `index` is in, in order, or
 *  null when it is in none. */
export function supersetAt(
  exercises: readonly Slotted[],
  supersets: readonly SessionSuperset[] | undefined,
  index: number
): number[] | null {
  const id = exercises[index]?.instanceId;
  if (!id || !supersets) return null;
  const group = supersets.find((g) => g.ids.includes(id));
  if (!group) return null;
  const places = exercises
    .map((ex, i) =>
      ex.instanceId && group.ids.includes(ex.instanceId) ? i : -1
    )
    .filter((i) => i >= 0);
  return places.length >= 2 ? places : null;
}

/** What the workout screen says under an exercise in a superset, "Superset
 *  with Push-Ups" (or "with Dips and Push-Ups"), or null for one in none. */
export function supersetWith(
  exercises: readonly (Slotted & { name: string })[],
  supersets: readonly SessionSuperset[] | undefined,
  index: number
): string | null {
  const group = supersetAt(exercises, supersets, index);
  if (!group) return null;
  const others = group.filter((i) => i !== index).map((i) => exercises[i].name);
  return `Superset with ${others.join(" and ")}`;
}

/** The groups as runs of neighbours in the session, two or more each:
 *  anything else is no superset. */
function tidy(
  exercises: readonly Slotted[],
  groups: readonly SessionSuperset[]
): SessionSuperset[] {
  const out: SessionSuperset[] = [];
  for (const group of groups) {
    let run: string[] = [];
    const flush = () => {
      if (run.length >= 2) out.push({ ids: run });
      run = [];
    };
    for (const ex of exercises) {
      if (ex.instanceId && group.ids.includes(ex.instanceId))
        run.push(ex.instanceId);
      else flush();
    }
    flush();
  }
  return out;
}

/** Whether the exercise at `index` can be put in a superset with the one
 *  after it: both have a slot, and the next is in no superset yet. */
export function canSupersetWithNext(
  exercises: readonly Slotted[],
  supersets: readonly SessionSuperset[] | undefined,
  index: number
): boolean {
  const here = exercises[index]?.instanceId;
  const next = exercises[index + 1]?.instanceId;
  if (!here || !next || here === next) return false;
  return supersetAt(exercises, supersets, index + 1) === null;
}

/** The exercise at `index` and the one after it in one superset: the next
 *  joins this one's group, or the two start one. */
export function supersetWithNext(
  exercises: readonly Slotted[],
  supersets: readonly SessionSuperset[] | undefined,
  index: number
): SessionSuperset[] {
  const current = supersets ?? [];
  if (!canSupersetWithNext(exercises, current, index)) return [...current];
  const here = exercises[index].instanceId!;
  const next = exercises[index + 1].instanceId!;
  const joined = current.some((g) => g.ids.includes(here))
    ? current.map((g) => (g.ids.includes(here) ? { ids: [...g.ids, next] } : g))
    : [...current, { ids: [here, next] }];
  return tidy(exercises, joined);
}

/** The exercise at `index` out of its superset. The rest stay together
 *  where they are still neighbours; one left alone is no superset. */
export function leaveSuperset(
  exercises: readonly Slotted[],
  supersets: readonly SessionSuperset[] | undefined,
  index: number
): SessionSuperset[] {
  const id = exercises[index]?.instanceId;
  const current = supersets ?? [];
  if (!id) return [...current];
  return tidy(
    exercises,
    current.map((g) => ({ ids: g.ids.filter((other) => other !== id) }))
  );
}

/** The first set an exercise still needs, or -1. */
function outstanding(sets: readonly CursorSet[] | undefined): number {
  if (!sets) return -1;
  return sets.findIndex((_, i) => isSetOutstanding(sets, i));
}

/**
 * Where a superset goes after a set of the exercise at `from`: the next
 * exercise in the group with a set left, in the group's order, and back
 * to its start for the next round. `rest` says the round is over, so the
 * rest timer runs first. Null once nothing in the group is left.
 *
 * The group turns on working sets only. A warm-up stays on its exercise,
 * with a warm-up's rest, until its ramp is done, so the next exercise's
 * working sets never land in the middle of this one's warm-ups.
 */
export function nextInSuperset(
  logs: readonly (readonly CursorSet[])[],
  members: readonly number[],
  from: number,
  afterWarmup = false
): { exerciseIndex: number; setIndex: number; rest: boolean } | null {
  const at = members.indexOf(from);
  if (at < 0) return null;
  if (afterWarmup) {
    const setIndex = outstanding(logs[from]);
    if (setIndex >= 0) return { exerciseIndex: from, setIndex, rest: true };
  }

  for (let step = 1; step <= members.length; step++) {
    const exerciseIndex = members[(at + step) % members.length];
    const setIndex = outstanding(logs[exerciseIndex]);
    if (setIndex >= 0)
      // Wrapping round to the group's start, or staying on this exercise
      // because the others are done, is a new round.
      return { exerciseIndex, setIndex, rest: at + step >= members.length };
  }
  return null;
}

/** Each exercise's superset as the saved workout records it: 1 for the
 *  session's first group, 2 for its second, nothing for one in none.
 *  With `done`, only exercises with a set done count: one skipped or not
 *  started is in no superset, and a group left with one exercise done is
 *  no superset either. */
export function supersetNumbers(
  exercises: readonly Slotted[],
  supersets: readonly SessionSuperset[] | undefined,
  done?: readonly boolean[]
): (number | undefined)[] {
  const counts = (i: number) => done?.[i] ?? true;
  const countedIds = new Set(
    exercises.flatMap((ex, i) =>
      ex.instanceId && counts(i) ? [ex.instanceId] : []
    )
  );
  const groups = tidy(exercises, supersets ?? [])
    .map((g) => ({ ids: g.ids.filter((id) => countedIds.has(id)) }))
    .filter((g) => g.ids.length >= 2);
  const order: SessionSuperset[] = [];
  return exercises.map((ex, i) => {
    const group =
      ex.instanceId && counts(i)
        ? groups.find((g) => g.ids.includes(ex.instanceId!))
        : undefined;
    if (!group) return undefined;

    if (!order.includes(group)) order.push(group);
    return order.indexOf(group) + 1;
  });
}

/** "Superset A", "Superset B": a group's name where it is shown. */
export function supersetLabel(group: number): string {
  return `Superset ${String.fromCharCode(64 + group)}`;
}
