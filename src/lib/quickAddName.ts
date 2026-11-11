/**
 * The name an entry logged without one is saved under.
 *
 * Quick add takes calories and macros and needs no name ("about 400 kcal
 * at the café"). Such an entry is a number, not a food: it never goes
 * into the pantry, and Quick add's recents and Your usual skip it, since
 * offering "Quick add, 400 kcal" back as a food to repeat would read as
 * the control that opens the form.
 */
export const QUICK_ADD_NAME = "Quick add";

/** True for an entry saved under the Quick add name. */
export function isQuickAddName(name: string | null | undefined): boolean {
  return (
    typeof name === "string" &&
    name.trim().toLowerCase() === QUICK_ADD_NAME.toLowerCase()
  );
}
