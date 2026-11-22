/**
 * The one way on from a shared post's or card's page (Soc17 call 3):
 * "Join Sam on Tropos", with the sharer's first name, as Strava words it.
 * With the sharer's invite code it opens the website's invite page (the
 * code to copy and the App Store badge, `WebsiteInvite`), so joining
 * follows as an invite does (Soc15 call 4); without one, the App Store.
 */
import { normaliseInviteCode } from "@/lib/inviteCode";
import { APP_STORE_URL, appInviteUrl } from "@/lib/publicLinks";

/** "Join Sam on Tropos", or "Join Tropos" when no name is known. */
export function joinTroposWords(firstName?: string | null): string {
  const name = firstName?.trim();
  return name ? `Join ${name} on Tropos` : "Join Tropos";
}

/** Where the button goes: the invite page with the code, else the store. */
export function joinTroposHref(inviteCode?: string | null): string {
  const code = normaliseInviteCode(inviteCode);
  return code ? appInviteUrl(code) : APP_STORE_URL;
}
