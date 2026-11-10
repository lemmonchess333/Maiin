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

/** The plugin, or null off-native (belt-and-braces with getLocationSource's
 *  platform branch) so a stray web/test invocation is inert instead of
 *  tripping Capacitor's internal UNIMPLEMENTED rejection.
 *
 *  Handed back as it is, never through a promise. It used to be
 *  `Promise.resolve(plugin)`: a plugin is a Proxy that answers every property
 *  with a native call, `then` included, so the promise called
 *  `BackgroundGeolocation.then()`, which iOS does not implement, and never
 *  settled. No watcher was ever added: iOS never asked for location, no
 *  error came back to say it was off, and a run sat on "Finding GPS"
 *  (CLAUDE.md, "Never resolve a promise with a Capacitor plugin"). */
function nativePlugin(): BackgroundGeolocationPlugin | null {
  return isNativePlatform() ? BackgroundGeolocation : null;
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

/** The Web's TIMEOUT error, for a one-off fix that did not come in time. */
function timeoutError(): GeolocationPositionError {
  return {
    code: 3,
    message: "Timeout expired",
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
  getCurrent(options, onFix, onError) {
    const plugin = nativePlugin();
    if (!plugin) return; // plugin missing → silent, same as a slow fix
    let settled = false;
    let id: string | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const finish = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      if (id) void plugin.removeWatcher({ id }).catch(() => {});
    };
    /* Give up at `timeout`, as the Web's getCurrentPosition does. The run
       screen polls one of these every 3 s while its watch is acquiring;
       without this each one lived until a fix came, so a slow fix (indoors,
       no cached location) left a watcher per poll, keeping location on
       after the run screen had gone. */
    const timeout = options?.timeout;
    if (typeof timeout === "number" && Number.isFinite(timeout)) {
      timer = setTimeout(
        () => {
          timer = null;
          if (settled) return;
          settled = true;
          onError(timeoutError());
          finish();
        },
        Math.max(0, timeout)
      );
    }
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
    const plugin = nativePlugin();
    if (plugin) {
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
    }
    const handle: LocationWatch = {
      clear() {
        cleared = true;
        if (id && plugin) {
          const watcherId = id;
          id = null;
          void plugin.removeWatcher({ id: watcherId }).catch(() => {});
        }
      },
    };
    return handle;
  },
};
