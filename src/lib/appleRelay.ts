/**
 * Apple's Hide My Email addresses: random@privaterelay.appleid.com, and
 * random@private.icloud.com for new ones (the old domain keeps working).
 * The local part is random, so it is never a name and never something the
 * person would recognise as their address.
 */
export const APPLE_RELAY_DOMAINS = [
  "@privaterelay.appleid.com",
  "@private.icloud.com",
] as const;

export function isAppleRelayEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const lower = email.trim().toLowerCase();
  return APPLE_RELAY_DOMAINS.some((domain) => lower.endsWith(domain));
}
