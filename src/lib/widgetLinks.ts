/**
 * The address a widget's tap opens the app at, and the check that turns
 * it into a route (Wid1: tapping opens the session).
 *
 * The app registers no URL scheme of its own: the one address it already
 * opens from outside is the invite link on the app's own origin
 * (`nativeInviteLinks.ts`), and the router's own paths are what Home's
 * cards navigate to. So a widget opens the app at that origin with one of
 * those paths, marked as a widget's ("https://troposfit.com/program?day=2
 * &from=widget"); iOS hands a widget's URL to its own app, which hears it
 * as Capacitor's `appUrlOpen`. The same address opens the web app at the
 * same page.
 *
 * A URL arriving from outside is untrusted input, not a route to follow:
 * only the paths a widget writes, with the parameters each takes, pass.
 */
import {
  HOME_WIDGET_LINK_ORIGIN,
  HOME_WIDGET_PATHS,
} from "@/lib/homeWidgetContract";
import { isNativePlatform } from "@/lib/platform";

/** The parameter that marks an address as a widget's. */
export const WIDGET_SOURCE_PARAM = "from";
export const WIDGET_SOURCE = "widget";

/** The parameters each path may carry, and what each may hold: a
 *  programme day's index, Train's tab, a run day's date. */
const PARAMS: Record<string, Record<string, RegExp>> = {
  "/": {},
  "/food": {},
  "/program": {
    day: /^\d{1,2}$/,
    tab: /^(run|lift)$/,
    rday: /^\d{4}-\d{2}-\d{2}$/,
  },
};

/** The address a widget opens for an app path. */
export function widgetUrl(path: string): string {
  const url = new URL(path, HOME_WIDGET_LINK_ORIGIN);
  url.searchParams.set(WIDGET_SOURCE_PARAM, WIDGET_SOURCE);
  return url.toString();
}

/** The app route a widget's address opens, or null for anything else. */
export function widgetRoute(input: unknown): string | null {
  if (typeof input !== "string" || input.length > 512) return null;
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (
    url.origin !== HOME_WIDGET_LINK_ORIGIN ||
    url.username ||
    url.password ||
    url.hash ||
    url.searchParams.getAll(WIDGET_SOURCE_PARAM).join() !== WIDGET_SOURCE
  )
    return null;
  const path = url.pathname;
  if (!(HOME_WIDGET_PATHS as readonly string[]).includes(path)) return null;
  const allowed = PARAMS[path];
  const kept = new URLSearchParams();
  for (const [key, value] of url.searchParams) {
    if (key === WIDGET_SOURCE_PARAM) continue;
    const shape = allowed[key];
    if (!shape || !shape.test(value) || kept.has(key)) return null;
    kept.set(key, value);
  }
  const search = kept.toString();
  return search ? `${path}?${search}` : path;
}

// Capacitor keeps the launch URL. Read once, so a later mount does not
// open the same widget's page again.
let launchConsumed = false;

/** Calls `onRoute` with the route of each widget tap, the one that started
 *  the app included. Resolves to the way to stop listening. */
export async function listenForWidgetLinks(
  onRoute: (route: string) => void
): Promise<() => void> {
  if (!isNativePlatform()) return () => {};
  const { App } = await import("@capacitor/app");
  let live = true;
  const listener = await App.addListener("appUrlOpen", ({ url }) => {
    const route = widgetRoute(url);
    if (!live || !route) return;
    launchConsumed = true;
    onRoute(route);
  });
  if (!launchConsumed) {
    void App.getLaunchUrl()
      .then((launch) => {
        const route = widgetRoute(launch?.url);
        if (!live || launchConsumed || !route) return;
        launchConsumed = true;
        onRoute(route);
      })
      .catch(() => {});
  }
  return () => {
    live = false;
    void listener.remove().catch(() => {});
  };
}

export function __resetWidgetLinksForTests(): void {
  launchConsumed = false;
}
