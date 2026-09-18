/**
 * How many people are in a Circle, and whether another one fits.
 *
 * Capacity had exactly one rendering, and it was the one form that
 * cannot be read confidently: the detail sheet's "2 of 8 members". Three
 * lines below it the same sheet says "1 of 2 focusing this week", where
 * "N of M" means a subset of the members DOING something — so the header
 * parses as an unfinished sentence about 2 of the 8. The card behind the
 * sheet, visible at the same moment, said "2 members" for the same
 * circle.
 *
 * So the count is rendered one way everywhere, and capacity appears as a
 * word at the only moment it changes what the reader can do.
 */
export interface CircleCapacity {
  memberCount: number;
  maxMembers: number;
}

/** No room for another member — `joinGoalSpace` refuses with "circle full". */
export function isFull(space: CircleCapacity): boolean {
  return space.memberCount >= space.maxMembers;
}

/**
 * "1 member" · "2 members" · "8 members · full".
 *
 * Capacity is stated as a word rather than a ratio because the ratio was
 * the ambiguity. A reader who is not full does not need the ceiling; a
 * reader who is full needs to know that inviting is pointless, and that
 * is a fact, not an arithmetic exercise.
 */
export function memberLine(space: CircleCapacity): string {
  const count = `${space.memberCount} ${space.memberCount === 1 ? "member" : "members"}`;
  return isFull(space) ? `${count} · full` : count;
}
