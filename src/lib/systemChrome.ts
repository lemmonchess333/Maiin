/**
 * Keeps the phone's own chrome on the app's theme: the status bar's text
 * on iOS and Android, and the browser bar's colour on the web.
 *
 * Both were set once, for the dark theme the app boots in
 * (`capacitor.config.ts` gives the status bar light text, `index.html`
 * a dark theme-color), and nothing changed them when a person chose
 * light. On iPhone the status bar sits over the page, so light text over
 * the light page left the clock and battery unreadable.
 *
 * The theme is the `dark` class on <html>, which three places set
 * (`public/init.js`, `auth.tsx`, Settings → Units & appearance). Rather
 * than ask each of them to remember this, it watches the class.
 */
import { isNativePlatform } from "./platform";

type StatusBarStyle = "DARK" | "LIGHT";
type CapacitorStatusBar = {
  setStyle: (opts: { style: StatusBarStyle }) => Promise<void>;
};

// A holder, not the bare plugin: Capacitor's plugin object is a Proxy
// that answers every property, `.then` included, so resolving a Promise
// with it calls the plugin as a thenable. Same reason as haptic.ts.
type StatusBarHolder = { plugin: CapacitorStatusBar };
let statusBarPromise: Promise<StatusBarHolder | null> | null = null;

function loadStatusBar(): Promise<StatusBarHolder | null> {
  if (statusBarPromise) return statusBarPromise;
  statusBarPromise = import("@capacitor/status-bar")
    .then((mod) => {
      const m = mod as unknown as { StatusBar?: CapacitorStatusBar };
      return m.StatusBar ? { plugin: m.StatusBar } : null;
    })
    .catch(() => null);
  return statusBarPromise;
}

let lastDark: boolean | null = null;

/** `rgb(14, 14, 17)` → `#0e0e11`: theme-color is hex everywhere else
 *  (index.html, the manifest), and e2e/pwa.spec.ts reads it as hex. */
function toHex(rgb: string): string | null {
  const parts = rgb.match(/\d+(\.\d+)?/g);
  if (!parts || parts.length < 3) return null;
  return `#${parts
    .slice(0, 3)
    .map((v) => Math.round(Number(v)).toString(16).padStart(2, "0"))
    .join("")}`;
}

/** Match the chrome to the theme now. Cheap to call repeatedly. */
function syncSystemChrome(): void {
  if (typeof document === "undefined") return;
  const dark = document.documentElement.classList.contains("dark");
  if (dark === lastDark) return;
  lastDark = dark;

  // The browser bar takes the page's own ground, read back rather than
  // restated, so it follows the --background token.
  const meta = document.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"]'
  );
  const ground = toHex(getComputedStyle(document.body).backgroundColor);
  if (meta && ground) meta.content = ground;

  if (!isNativePlatform()) return;
  // Capacitor's DARK style is light text, for a dark page.
  void loadStatusBar().then((holder) =>
    holder?.plugin.setStyle({ style: dark ? "DARK" : "LIGHT" }).catch(() => {})
  );
}

/** Follow the theme for the life of the page. Returns the unsubscribe. */
export function startSystemChromeSync(): () => void {
  if (typeof document === "undefined") return () => {};
  syncSystemChrome();
  const observer = new MutationObserver(syncSystemChrome);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}

/** Test seam: forget the last theme seen. */
export function __resetSystemChromeForTests(): void {
  lastDark = null;
  statusBarPromise = null;
}
