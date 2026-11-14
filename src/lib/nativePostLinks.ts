import { isNativePlatform } from "@/lib/platform";
import { PUBLIC_APP_ORIGIN } from "@/lib/publicLinks";

/**
 * A shared post's address (`publicPostUrl`), as the iPhone app receives it
 * through the universal-links file (App1 Q51): the in-app route for that
 * post, or null. A native URL event is untrusted input, so nothing but
 * this one shape on the production origin becomes a route.
 */
export function nativePostRoute(input: unknown): string | null {
  if (typeof input !== "string" || input.length > 2048) return null;
  try {
    const url = new URL(input);
    if (url.origin !== PUBLIC_APP_ORIGIN || url.username || url.password) {
      return null;
    }
    const match = /^\/activity\/([A-Za-z0-9_-]{1,64})\/?$/.exec(url.pathname);
    return match ? `/activity/${match[1]}` : null;
  } catch {
    return null;
  }
}

// Capacitor keeps the launch URL. Reading it on every mount would open a
// post already opened, over wherever the person has gone since.
let launchConsumed = false;
let launchQuery: Promise<{ url: string } | undefined> | undefined;

/** Listen first, then check the cold launch; a link that arrives while
 *  the app is open wins over the launch's. */
export async function listenForNativePostLinks(
  onRoute: (route: string) => void
): Promise<() => void> {
  if (!isNativePlatform()) return () => {};
  const { App } = await import("@capacitor/app");
  let live = true;
  let receivedWarm = false;
  const listener = await App.addListener("appUrlOpen", ({ url }) => {
    const route = nativePostRoute(url);
    if (!live || !route) return;
    receivedWarm = true;
    launchConsumed = true;
    onRoute(route);
  });
  if (!launchConsumed) {
    launchQuery ??= App.getLaunchUrl();
    void launchQuery
      .then((launch) => {
        const route = nativePostRoute(launch?.url);
        if (live && !launchConsumed && !receivedWarm && route) {
          launchConsumed = true;
          onRoute(route);
        }
      })
      .catch(() => {});
  }
  return () => {
    live = false;
    void listener.remove().catch(() => {});
  };
}
