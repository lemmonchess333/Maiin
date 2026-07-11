/**
 * Native background-geolocation source — Step 2 of docs/run-background-gps.md.
 *
 * Adapts `@capacitor-community/background-geolocation` (a native watcher that
 * keeps fixes flowing with the screen locked / app backgrounded via an
 * OS-managed foreground service) to the `LocationSource` seam, so the entire
 * point pipeline (isValidReading → Kalman → distance/pace/splits) is untouched
 * — only the SOURCE of raw fixes changes on native.
 *
 * Shape translation (the seam's contract is the Web Geolocation shapes):
 *   plugin Location { latitude, longitude, accuracy, altitude,
 *                     altitudeAccuracy, bearing, speed, time }
 *     → GeolocationPosition { coords{ …, heading: bearing }, timestamp: time }
 *   plugin error { code: "NOT_AUTHORIZED", … }
 *     → GeolocationPositionError { code: 1 (PERMISSION_DENIED) } so the
 *       existing denied UX (useGPS handleError / the acquiring-screen copy)
 *       fires unchanged. Anything else maps to 2 (POSITION_UNAVAILABLE).
 *
 * The plugin package ships NO JavaScript — only the native iOS/Android code
 * plus type definitions. The documented JS side is `registerPlugin` from
 * `@capacitor/core` (already a static dependency via lib/platform.ts): on the
 * native shell the proxy bridges to the registered native implementation; on
 * web every call rejects "not implemented", which this adapter swallows —
 * getLocationSource() never returns this source on web anyway.
 *
 * "While Using"-only permission: the watcher still delivers while the app is
 * foregrounded and silently pauses when backgrounded — behaviourally the same
 * as the old web path, so nothing breaks; distinguishing it with a proactive
 * "allow Always for pocketed runs" nudge is part of the device-verification
 * pass (the plugin exposes no permission-query API to do it blind).
 */
import { registerPlugin } from "@capacitor/core";
import type {
  BackgroundGeolocationPlugin,
  CallbackError as PluginCallbackError,
  Location as PluginLocation,
} from "@capacitor-community/background-geolocation";
import type { LocationSource, LocationWatch } from "./locationTypes";
import { isNativePlatform } from "./platform";

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>(
  "BackgroundGeolocation"
);

/** Kept async-shaped so call sites read identically to the repo's other lazy
 *  plugin holders; the proxy itself is created synchronously above. Returns
 *  null off-native (belt-and-braces with getLocationSource's platform branch)
 *  so a stray web/test invocation is inert instead of tripping Capacitor's
 *  internal UNIMPLEMENTED rejection, which surfaces outside our promise chain. */
function loadPlugin(): Promise<BackgroundGeolocationPlugin | null> {
  return Promise.resolve(isNativePlatform() ? BackgroundGeolocation : null);
}

/** Map a plugin fix to the Web Geolocation shape the pipeline consumes. */
export function toGeolocationPosition(
  loc: PluginLocation
): GeolocationPosition {
  const coords = {
    latitude: loc.latitude,
    longitude: loc.longitude,
    accuracy: loc.accuracy,
    altitude: loc.altitude,
    altitudeAccuracy: loc.altitudeAccuracy,
    heading: loc.bearing,
    speed: loc.speed,
    toJSON() {
      return this;
    },
  };
  return {
    coords,
    timestamp: loc.time ?? Date.now(),
    toJSON() {
      return this;
    },
  } as GeolocationPosition;
}

/** Map a plugin error to the Web GeolocationPositionError shape. */
export function toGeolocationError(
  err: PluginCallbackError
): GeolocationPositionError {
  const denied = err.code === "NOT_AUTHORIZED";
  return {
    code: denied ? 1 : 2, // PERMISSION_DENIED : POSITION_UNAVAILABLE
    message:
      err.message || (denied ? "Permission denied" : "Position unavailable"),
    PERMISSION_DENIED: 1,
    POSITION_UNAVAILABLE: 2,
    TIMEOUT: 3,
  } as GeolocationPositionError;
}

/** Foreground-service notification copy (Android requires it for a
 *  background watcher; iOS ignores it). Calm, specific, no alarm. */
const BACKGROUND_TITLE = "Tropos is tracking your run";
const BACKGROUND_MESSAGE = "Distance and pace keep recording while you run.";

export const nativeLocationSource: LocationSource = {
  /* One-shot pre-warm. The plugin has no getCurrent — the documented pattern
     is a stale-tolerant watcher removed after its first fix. `stale: true`
     returns the cached last-known fix immediately, which is exactly what the
     chipset pre-warm wants. No permission prompt here (requestPermissions
     false) — the real watcher below owns the prompt so it's tied to Start. */
  getCurrent(_options, onFix, onError) {
    let settled = false;
    void loadPlugin().then((plugin) => {
      if (!plugin) return; // plugin missing → silent, same as a slow fix
      let id: string | null = null;
      const finish = () => {
        if (id) void plugin.removeWatcher({ id }).catch(() => {});
      };
      plugin
        .addWatcher({ requestPermissions: false, stale: true }, (pos, err) => {
          if (settled) return;
          settled = true;
          if (err) onError(toGeolocationError(err));
          else if (pos) onFix(toGeolocationPosition(pos));
          finish();
        })
        .then((watcherId) => {
          id = watcherId;
          if (settled) finish(); // fix arrived before the id resolved
        })
        .catch(() => {});
    });
  },

  /* Continuous fixes that SURVIVE screen-lock / backgrounding. The
     backgroundMessage/Title opt the watcher into background mode (omitting
     them yields a foreground-only watcher). distanceFilter 0 = every fix,
     matching the web watch cadence the pace/splits math expects. Web
     PositionOptions don't translate (the OS owns accuracy/timeout here) and
     are deliberately ignored. */
  watch(_options, onFix, onError) {
    let cleared = false;
    let id: string | null = null;
    void loadPlugin().then((plugin) => {
      if (!plugin) return;
      plugin
        .addWatcher(
          {
            backgroundTitle: BACKGROUND_TITLE,
            backgroundMessage: BACKGROUND_MESSAGE,
            requestPermissions: true,
            stale: false,
            distanceFilter: 0,
          },
          (pos, err) => {
            if (cleared) return;
            if (err) onError(toGeolocationError(err));
            else if (pos) onFix(toGeolocationPosition(pos));
          }
        )
        .then((watcherId) => {
          if (cleared) {
            // clear() raced the async id — remove the just-created watcher.
            void plugin.removeWatcher({ id: watcherId }).catch(() => {});
          } else {
            id = watcherId;
          }
        })
        .catch(() => {});
    });
    const handle: LocationWatch = {
      clear() {
        cleared = true;
        if (id) {
          const watcherId = id;
          id = null;
          void loadPlugin().then((plugin) => {
            if (plugin)
              void plugin.removeWatcher({ id: watcherId }).catch(() => {});
          });
        }
      },
    };
    return handle;
  },
};
