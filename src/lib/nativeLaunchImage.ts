/**
 * The native launch image's hand-over to the web layer (iOS and Android).
 *
 * Capacitor's SplashScreen plugin covers the web view with the launch
 * image from launch until `launchShowDuration` (capacitor.config.ts) has
 * run out, then fades it over a further 200 ms. The launch animation
 * (LaunchSplash) starts as soon as React mounts, which on a quick phone
 * can be before that: the chevron would rise under the native image, and
 * the first thing seen would be a mark that had already finished. The web
 * layer draws the native image's frame exactly (launchSplash.test.ts pins
 * the four copies together), so once it is on screen the native image can
 * go at once, with no fade, and the rise starts in view. The plugin's
 * auto-hide stays as the net for a web layer that never mounts.
 *
 * A no-op on the web, where there is no native image; the plugin is only
 * loaded in the native shell.
 */
import { isNativePlatform } from "./platform";

type SplashScreenPlugin = {
  hide: (opts?: { fadeOutDuration?: number }) => Promise<void>;
};

export function hideNativeLaunchImage(): Promise<void> {
  if (!isNativePlatform()) return Promise.resolve();
  return import("@capacitor/splash-screen")
    .then((mod) => {
      // Read off the module, never resolved with: the plugin is a Proxy
      // that answers `.then`, so a Promise resolved with it would call it
      // as a thenable (haptic.ts, systemChrome.ts).
      const plugin = (mod as unknown as { SplashScreen?: SplashScreenPlugin })
        .SplashScreen;
      return plugin?.hide({ fadeOutDuration: 0 });
    })
    .then(
      () => undefined,
      () => undefined
    );
}
