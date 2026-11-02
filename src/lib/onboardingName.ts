/**
 * The public name setup starts from.
 *
 * Only a name the person gave: one typed earlier (kept in the draft), or
 * the name on the account they signed in with (Google's, or the one Apple
 * shares). Otherwise the field starts empty and setup asks for one.
 *
 * Never the email address. Its local part ("jane.smith1990") is often a
 * full name with a birth year, and the public name is shown on the
 * profile and found by search, so a name made from it published part of
 * an address the person never chose to show. Setup started from it, and
 * from "Athlete" when there was no usable address, until 2026-11; a
 * draft saved then still holds one of the two, and neither was chosen.
 */
export function startingDisplayName(
  draftName: string | undefined,
  user: { displayName?: string | null; email?: string | null } | null
): string {
  return (
    chosenDraftName(draftName, user?.email) ?? user?.displayName?.trim() ?? ""
  );
}

/** The draft's name when the person chose it: not blank, and not one of
 *  the defaults setup used to start from. */
export function chosenDraftName(
  draftName: string | undefined,
  email: string | null | undefined
): string | undefined {
  const name = draftName?.trim();
  if (!name || name === "Athlete") return undefined;
  if (email && name === email.split("@")[0]?.trim()) return undefined;
  return draftName;
}
