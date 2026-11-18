/**
 * The phone's Reduce Transparency setting, on the page, so a frosted
 * surface can draw solid under it (DS6, DESIGN_GUIDE §14o: "a solid
 * fallback under Reduce Transparency").
 *
 * The stylesheet's `prefers-reduced-transparency` query is not enough on
 * iPhone: WebKit does not support it (WebKit bug 175497), so in WKWebView
 * it never matches, and the tab bar stayed frosted for someone who had
 * asked iOS for solid surfaces. On the phone the setting comes from
 * `ios/App/App/AccessibilityPrefsPlugin.swift`, read at start, on each
 * change and whenever the app comes back to the foreground; on the web
 * from the media query, where a browser supports it. Either way the
 * answer is one attribute on <html>, `data-reduced-transparency`, which
 * frosted surfaces' solid fallbacks select on beside the media query: the
 * tab bar and the status bar's scrim here, the toasts and the workout's
 * docked cards in their own changes (#3416, #3426). The other blurred
 * chips (a Space's hero, the map's) are listed in the pre-launch backlog.
 *
 * An older app build without the plugin leaves the attribute off: the
 * surfaces stay frosted, as they were.
 */
import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { isNativePlatform } from "./platform";

export const REDUCED_TRANSPARENCY_ATTRIBUTE = "data-reduced-transparency";

const QUERY = "(prefers-reduced-transparency: reduce)";

interface AccessibilityPrefs {
  reduceTransparency?: unknown;
}

interface AccessibilityPrefsPlugin {
  get(): Promise<AccessibilityPrefs>;
  addListener(
    event: "change",
    listener: (prefs: AccessibilityPrefs) => void
  ): Promise<PluginListenerHandle>;
}

let plugin: AccessibilityPrefsPlugin | null = null;
function nativePlugin(): AccessibilityPrefsPlugin | null {
  if (!isNativePlatform()) return null;
  plugin ??= registerPlugin<AccessibilityPrefsPlugin>("AccessibilityPrefs");
  return plugin;
}

/** Mark the page, or clear the mark. Only a real `true` marks it. */
export function applyReducedTransparency(on: boolean): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (on) root.setAttribute(REDUCED_TRANSPARENCY_ATTRIBUTE, "");
  else root.removeAttribute(REDUCED_TRANSPARENCY_ATTRIBUTE);
}

/** Read the phone's setting and apply it. Safe to call repeatedly; a
 *  failed read changes nothing. */
export async function syncReducedTransparency(): Promise<void> {
  const native = nativePlugin();
  if (!native) return;
  try {
    const prefs = await native.get();
    applyReducedTransparency(prefs?.reduceTransparency === true);
  } catch {
    /* An app build from before the plugin: frosted, as it was. */
  }
}

/** Follow the setting for the life of the app. Returns the unsubscribe. */
export function startReducedTransparencySync(): () => void {
  if (typeof document === "undefined") return () => {};

  const native = nativePlugin();
  if (!native) {
    const query =
      typeof window.matchMedia === "function" ? window.matchMedia(QUERY) : null;
    if (!query) return () => {};
    const apply = () => applyReducedTransparency(query.matches);
    apply();
    query.addEventListener?.("change", apply);
    return () => query.removeEventListener?.("change", apply);
  }

  void syncReducedTransparency();
  let active = true;
  let handle: PluginListenerHandle | undefined;
  native
    .addListener("change", (prefs) =>
      applyReducedTransparency(prefs?.reduceTransparency === true)
    )
    .then((h) => {
      if (active) handle = h;
      else void h.remove();
    })
    .catch(() => {});
  // A change made in Settings while the app was in the background is read
  // on return, whether or not iOS posted it to a suspended app: on the
  // page's visibility and on the app becoming active, the two paths
  // `systemTextSize.ts` uses, since WKWebView does not always fire the
  // first on a return from Settings.
  const onVisible = () => {
    if (document.visibilityState === "visible") void syncReducedTransparency();
  };
  document.addEventListener("visibilitychange", onVisible);
  let removeResume: (() => void) | undefined;
  void import("@capacitor/app")
    .then(async ({ App }) => {
      const listener = await App.addListener(
        "appStateChange",
        ({ isActive }) => {
          if (isActive) void syncReducedTransparency();
        }
      );
      if (!active) void listener.remove();
      else removeResume = () => void listener.remove();
    })
    .catch(() => {});
  return () => {
    active = false;
    document.removeEventListener("visibilitychange", onVisible);
    removeResume?.();
    void handle?.remove();
  };
}

/** Test seam: forget the registered plugin. */
export function __resetReducedTransparencyForTests(): void {
  plugin = null;
}
