/**
 * The words of a shared post's and a shared card's page (owner, 22 Nov
 * 2026, in place of Soc17 call 3's "Join Sam on Tropos"): one small line
 * above the card naming the sharer by first name and what they shared,
 * and one button, "Join Tropos". On a card's page, with the code it was
 * shared with, the button opens the website's invite page (the code to
 * copy and the App Store badge, `WebsiteInvite`), so joining follows as
 * an invite does (Soc15 call 4); without one, and always on a post's
 * page, whose fixed public address must carry no code, the App Store.
 */
import type { ShareTemplate } from "@/components/share/ShareCardRenderer";
import { normaliseInviteCode } from "@/lib/inviteCode";
import { APP_STORE_URL, appInviteUrl } from "@/lib/publicLinks";

/** The button's words on both pages. */
export const JOIN_TROPOS = "Join Tropos";

/** What a card or post shows, as its line names it, with the sharer's
 * name and without one: a lift or circuit is a workout, a recap a week or
 * a year. Three or four words either way. */
function sharedThing(
  template: ShareTemplate,
  recapTitle?: string
): { named: string; unnamed: string } {
  switch (template) {
    case "run":
      return { named: "a run", unnamed: "A run, shared" };
    case "hybrid":
      return { named: "a session", unnamed: "A session, shared" };
    case "nutrition":
      return { named: "their food", unnamed: "A food day, shared" };
    case "recap":
      return /year/i.test(recapTitle ?? "")
        ? { named: "their year", unnamed: "A year, shared" }
        : { named: "their week", unnamed: "A week, shared" };
    default:
      return { named: "a workout", unnamed: "A workout, shared" };
  }
}

/** The line above the card: "Sam shared a run", or with no name to show,
 *  "A run, shared". `name` is drawn bold where the line is drawn. */
export function sharedLine(
  firstName: string | undefined | null,
  template: ShareTemplate,
  recapTitle?: string
): { name: string | null; rest: string } {
  const thing = sharedThing(template, recapTitle);
  const name = firstName?.trim() || null;
  return name
    ? { name, rest: ` shared ${thing.named}` }
    : { name: null, rest: thing.unnamed };
}

/** Where the button goes: the invite page with the code, else the store. */
export function joinTroposHref(inviteCode?: string | null): string {
  const code = normaliseInviteCode(inviteCode);
  return code ? appInviteUrl(code) : APP_STORE_URL;
}
