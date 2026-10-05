/**
 * The app's text follows the phone's text size on iPhone.
 *
 * WKWebView does not apply Dynamic Type to a page by itself, so someone
 * who sets larger text in iOS Settings → Display & Brightness → Text Size
 * (or the Larger Text accessibility sizes) got Tropos at its designed
 * size regardless. Every size in the app is in rem (`styles/tokens.css`),
 * so scaling the root font size scales all of it, and the screens built
 * for large text (the feed card, the food diary) lay themselves out by
 * the text size through em-measured container queries.
 *
 * `@capacitor/text-zoom`'s `getPreferred()` reads the system body size
 * over its 17pt default: 1 at the default setting, 1.35 at the largest
 * standard size, about 3.1 at the largest accessibility size. Two limits:
 *   - never below 1: smaller text would take the caption and micro sizes
 *     under DESIGN_GUIDE §10's 12px floor;
 *   - never above 2: double text is as far as any screen has been
 *     measured (the break-ui capture specs). Raise it as more screens are.
 *
 * The web needs none of this: a browser's own text zoom and page zoom
 * already reach the page. The setting is read again whenever the app
 * comes back to the foreground, so a change made in Settings applies on
 * return.
 */
import { isNativePlatform } from "./platform";

export const MIN_TEXT_SCALE = 1;
export const MAX_TEXT_SCALE = 2;

/** The phone's preferred text scale, held to what the app has been
 *  built and measured for. A missing or nonsense value is 1. */
export function clampTextScale(value: unknown): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : 1;
  return Math.min(MAX_TEXT_SCALE, Math.max(MIN_TEXT_SCALE, n));
}

/** Set the root font size to `scale` × the browser's default. */
export function applyTextScale(scale: number): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (scale === 1) root.style.removeProperty("font-size");
  else root.style.fontSize = `${Math.round(scale * 1000) / 10}%`;
}

type TextZoom = { getPreferred: () => Promise<{ value: number }> };
// A holder, not the bare plugin: Capacitor's plugin object is a Proxy
// that answers every property, `.then` included. Same as systemChrome.ts.
type TextZoomHolder = { plugin: TextZoom };
let textZoomPromise: Promise<TextZoomHolder | null> | null = null;

function loadTextZoom(): Promise<TextZoomHolder | null> {
  if (textZoomPromise) return textZoomPromise;
  textZoomPromise = import("@capacitor/text-zoom")
    .then((mod) => {
      const m = mod as unknown as { TextZoom?: TextZoom };
      return m.TextZoom ? { plugin: m.TextZoom } : null;
    })
    .catch(() => null);
  return textZoomPromise;
}

/** Read the phone's text size and apply it. Safe to call repeatedly. */
export async function syncSystemTextSize(): Promise<void> {
  const holder = await loadTextZoom();
  if (!holder) return;
  try {
    const { value } = await holder.plugin.getPreferred();
    applyTextScale(clampTextScale(value));
  } catch {
    /* No reading: the designed size stands. */
  }
}

/** Follow the phone's text size for the life of the app. Returns the
 *  unsubscribe. A no-op on the web. */
export function startSystemTextSizeSync(): () => void {
  if (!isNativePlatform() || typeof document === "undefined") return () => {};
  void syncSystemTextSize();
  const onVisible = () => {
    if (document.visibilityState === "visible") void syncSystemTextSize();
  };
  document.addEventListener("visibilitychange", onVisible);
  let removeResume: (() => void) | undefined;
  let active = true;
  void import("@capacitor/app")
    .then(async ({ App }) => {
      const listener = await App.addListener(
        "appStateChange",
        ({ isActive }) => {
          if (isActive) void syncSystemTextSize();
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
  };
}

/** Test seam: forget the loaded plugin. */
export function __resetSystemTextSizeForTests(): void {
  textZoomPromise = null;
}
