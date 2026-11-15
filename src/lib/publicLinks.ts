/**
 * The addresses Tropos hands to other people: a link someone pastes into
 * a message has to open the app for whoever receives it.
 *
 * Never `window.location.origin`. In the iPhone app that is
 * `capacitor://localhost`, which opens nothing anywhere else, and on the
 * GitHub Pages preview it drops the `/Maiin/` base the app is served
 * under. Every shared link names the production web app instead, the
 * origin the server's Stripe allow-list also requires
 * (`functions/index.js`).
 */

/** The production web app's origin. */
export const PUBLIC_APP_ORIGIN = "https://troposfit.com";

/** Tropos on the App Store (Apple ID 6762416918, docs/app-store/listing.md).
 *  The address takes each visitor to their own country's store. It opens
 *  the listing once the app is released; until then Apple says the app is
 *  not available. */
export const APP_STORE_URL = "https://apps.apple.com/app/id6762416918";

/** The query parameter an invite link carries its code in. The web app
 *  keeps it from the first page it opens (`pendingInvite.ts`). */
export const INVITE_PARAM = "invite";

/** The link an invite shares: the app's front door, which signs a new
 *  person up or a returning one in. With a person's code (Soc15) it
 *  carries who sent it, so joining from it follows both ways. */
export function appInviteUrl(code?: string): string {
  return code
    ? `${PUBLIC_APP_ORIGIN}/?${INVITE_PARAM}=${encodeURIComponent(code)}`
    : PUBLIC_APP_ORIGIN;
}

/** A feed post's own address (App1 Q51): the post in the app for someone
 *  who can see it there, and its public page for anyone else (Hosting
 *  sends it to `publicPostPage`, functions/lib/publicPost.js). The same
 *  path as the in-app route, so the iPhone app opens it as it is. */
export function publicPostUrl(activityId: string): string {
  return `${PUBLIC_APP_ORIGIN}/activity/${encodeURIComponent(activityId)}`;
}

/** A shared card's words with the way back to Tropos after them. A card
 *  reaches people who do not have the app, and until 13 Nov 2026 it was
 *  an image and words with nowhere to go (owner, Q69). The address is the
 *  front door every other shared link uses, or a public post's own page
 *  when the card is of one (`publicPostUrl`, Q51). */
export function withAppLink(
  text: string,
  link: string = PUBLIC_APP_ORIGIN
): string {
  return `${text} ${link}`;
}
