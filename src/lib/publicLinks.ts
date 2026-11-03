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

/** The link an invite shares: the app's front door, which signs a new
 *  person up or a returning one in. */
export function appInviteUrl(): string {
  return PUBLIC_APP_ORIGIN;
}
