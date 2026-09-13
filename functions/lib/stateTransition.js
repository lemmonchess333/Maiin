/* Client parity: src/features/program/stateTransition.ts. */
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .filter(([, child]) => child !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

function sameStoredValue(a, b) {
  return canonical(a) === canonical(b);
}

class ProgrammeConflictError extends Error {
  code = "failed-precondition";
  constructor() {
    super(
      "Your programme changed while you were editing. Review the latest plan and try again."
    );
  }
}

/** Apply only the fields this transition changes. Arrays are atomic: when both
 * writers changed the same array, require a fresh plan instead of guessing. */
function mergeChangedFields(base, proposed, current) {
  const before = base;
  const after = proposed;
  const live = current;
  const result = { ...live };
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (key === "updatedAt" || sameStoredValue(before[key], after[key]))
      continue;
    if (
      !sameStoredValue(live[key], before[key]) &&
      !sameStoredValue(live[key], after[key])
    )
      throw new ProgrammeConflictError();
    if (after[key] === undefined) delete result[key];
    else result[key] = after[key];
  }
  return result;
}

module.exports = {
  sameStoredValue,
  mergeChangedFields,
  ProgrammeConflictError,
};
