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
          ],
        },
      ],
    },
  };
}

/** Opt-in until the signed app's public identifier has been verified.
 * Apple's supported root location avoids Hosting's dotfile ignore.
 */
export function universalLinksPlugin(
  prefix: string | undefined,
  isFirebaseHosting: boolean
): Plugin {
  return {
    name: "tropos-universal-links",
    apply: "build",
    generateBundle() {
      if (!isFirebaseHosting || !prefix) return;
      this.emitFile({
        type: "asset",
        fileName: "apple-app-site-association",
        source: JSON.stringify(appleAppSiteAssociation(prefix)),
      });
    },
  };
}
