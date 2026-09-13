/**
 * The Pro demo recording — a manifest, not a player.
 *
 * `ProDemoVideo` plays whatever is listed here; an empty list means the
 * offer page shows the drawn frames instead, which is also every
 * fallback's destination (reduced motion, data saver, a source that
 * fails to load). Listing a file that is not in `public/pro-demo/` would
 * be silently absorbed by that fallback, so `proDemoVideo.test.ts` walks
 * this list against the disk.
 *
 * Asset contract, so the next recording lands the same way: a screen
 * recording of the real app — Food, the camera, a real plate, the
 * result, then Home's target — cropped below the status bar, no audio
 * track, 720 px wide, H.264 MP4 first (plays everywhere), WebM second
 * (smaller where it plays), the pair under ~2 MB. Served from `public/`
 * at the app's base path; the service worker leaves video to the
 * browser (Range requests) and never caches it.
 */
export interface ProDemoSource {
  /** Path under `public/`, no leading slash. */
  path: string;
  type: "video/mp4" | "video/webm";
}

export const PRO_DEMO_SOURCES: readonly ProDemoSource[] = [];

/** Portrait crop of a phone screen — the top of the app, not the whole phone. */
export const PRO_DEMO_ASPECT = "4 / 5";

/** Resolves a `public/` path against the app's base (`/Maiin/` on Pages, `/` on Hosting). */
export function publicUrl(path: string): string {
  const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
  return `${base}/${path.replace(/^\//, "")}`;
}
