/**
 * Instagram-Stories direct-share seam (SOCIAL S2).
 *
 * The real handoff is iOS-native: the `instagram-stories://share` URL
 * scheme + the `com.instagram.sharedSticker.*` pasteboard items, reached
 * via a Capacitor plugin (community `capacitor-share-instagram-stories`
 * if maintained, else a minimal native bridge) plus an
 * `LSApplicationQueriesSchemes` entry for `instagram` in Info.plist.
 * None of that can run on web or in this container.
 *
 * So this module is the WEB/NATIVE SPLIT — the exact pattern used by
 * `appCheck.ts` (web/native App Check) and `analyticsProvider.ts`: a
 * provider the native layer injects at boot, and a no-op web default.
 * With no provider registered (web, or native before the plugin lands),
 * `shareToInstagramStories` returns false and the caller falls back to
 * the generic OS share sheet — the spec's required graceful fallback.
 *
 * OPERATOR / NATIVE (cannot be done here):
 *   - add the Capacitor IG-stories plugin (or native bridge),
 *   - add `instagram` to LSApplicationQueriesSchemes in Info.plist,
 *   - call setNativeInstagramProvider(...) from the native boot path,
 *   - `cap sync ios`.
 */

export type ShareDestination = "instagram" | "sheet";

export interface IgStoryAsset {
  /** The 1080×1920 PNG export. */
  file: File;
  /** A transparent export is handed to Instagram as a STICKER asset so
   *  the user places it over their own camera content; an opaque export
   *  is handed over as the full-screen BACKGROUND asset. */
  asTransparentSticker: boolean;
}

type IgProvider = (asset: IgStoryAsset) => Promise<boolean>;

let nativeProvider: IgProvider | null = null;

/** Native iOS layer registers the real bridge here at boot. Passing null
 *  clears it (tests / teardown). */
export function setNativeInstagramProvider(provider: IgProvider | null): void {
  nativeProvider = provider;
}

/** True only when a native provider is registered AND (per the bridge's
 *  own canOpenURL check) Instagram is shareable. On web: always false. */
export function isInstagramShareAvailable(): boolean {
  return nativeProvider != null;
}

/**
 * Attempt a direct Instagram-Stories share. Resolves true when the asset
 * was handed off to Instagram, false when there's no native provider (or
 * Instagram isn't installed / the bridge declined) — in which case the
 * caller should fall back to the generic share sheet. Never throws.
 */
export async function shareToInstagramStories(
  asset: IgStoryAsset
): Promise<boolean> {
  if (!nativeProvider) return false;
  try {
    return await nativeProvider(asset);
  } catch {
    return false;
  }
}
