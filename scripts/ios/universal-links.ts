import type { Plugin } from "vite";

/** The public application-identifier prefix from the signed iOS app.
 * Usually the Team ID, but legacy accounts can have a different prefix.
 * Never infer it from a service key or publish a placeholder association.
 */
export function appleAppSiteAssociation(prefix: string) {
  if (!/^[A-Z0-9]{10}$/.test(prefix)) {
    throw new Error(
      "IOS_APP_ID_PREFIX must be the verified 10-character application-identifier prefix."
    );
  }
  return {
    applinks: {
      details: [
        {
          appIDs: [`${prefix}.com.tropos.app`],
          components: [
            {
              "/": "/",
              "?": { invite: "????????" },
              comment:
                "Tropos friend invites; ordinary web, legal and auth links stay on the web.",
            },
            {
              "/": "/activity/*",
              comment:
                "A shared post opens in the app (App1 Q51); without the app it is the post's public page.",
            },
            {
              "/": "/space/*",
              comment:
                "A shared Space opens in the app (Run27 call 11); without the app it is the web app's sign-in, then the Space.",
            },
          ],
        },
      ],
    },
  };
}

/** Where the association is served. Apple's CDN, which is what an iPhone
 * asks, reads `/.well-known/apple-app-site-association` and falls back to
 * the root only when that is missing; Firebase Hosting answers the
 * `.well-known` address with its own generated file (every path, for the
 * app registered with the project) unless the deploy carries one, which is
 * what kept Apple on Firebase's after the root file shipped (15 Nov 2026).
 * Hosting's dotfile ignore (firebase.json) drops a dotfile itself, not a
 * file inside a dot directory, so `.well-known/` deploys: firebase-tools
 * 15.34.0's own file listing keeps `.well-known/apple-app-site-association`.
 */
export const ASSOCIATION_PATHS = [
  ".well-known/apple-app-site-association",
  "apple-app-site-association",
] as const;

/** Opt-in until the signed app's public identifier has been verified. */
export function universalLinksPlugin(
  prefix: string | undefined,
  isFirebaseHosting: boolean
): Plugin {
  return {
    name: "tropos-universal-links",
    apply: "build",
    generateBundle() {
      // The Hosting deploy passes the APPLE_TEAM_ID secret, which the iPhone
      // build also strips of whitespace before use (deploy-ios.yml): a
      // pasted newline must not fail every website deploy.
      const value = prefix?.replace(/\s/g, "");
      if (!isFirebaseHosting || !value) return;
      const source = JSON.stringify(appleAppSiteAssociation(value));
      for (const fileName of ASSOCIATION_PATHS) {
        this.emitFile({ type: "asset", fileName, source });
      }
    },
  };
}
