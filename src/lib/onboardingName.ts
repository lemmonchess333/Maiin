import { isAppleRelayEmail } from "@/lib/appleRelay";

/**
 * The name setup starts from: a draft's, the account's, the address's
 * local part, then "Athlete". A Hide My Email relay address is skipped:
 * its local part is random ("k7x9qzp2m"), and a public name made from it
 * is no one's.
 */
export function startingDisplayName(
  draftName: string | undefined,
  user: { displayName?: string | null; email?: string | null } | null
): string {
  if (draftName !== undefined) return draftName;
  const accountName = user?.displayName?.trim();
  if (accountName) return accountName;
  const email = user?.email;
  if (email && !isAppleRelayEmail(email)) {
    const local = email.split("@")[0]?.trim();
    if (local) return local;
  }
  return "Athlete";
}
