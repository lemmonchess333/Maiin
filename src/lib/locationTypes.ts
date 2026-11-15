/**
 * Neutral location-source contracts (2026-07-11 audit batch 3).
 *
 * The factory (locationSource.ts) imports the native implementation,
 * and the native implementation previously imported these interfaces
 * BACK from the factory — a two-file cycle. Implementations depend on
 * this dependency-free module only; the factory re-exports for the
 * existing importers (useGPS etc.).
 */
/** Handle to an active watch; `clear()` stops it (web: clearWatch). */
export interface LocationWatch {
  clear(): void;
}

export interface LocationSource {
  /** One-shot fix (used to pre-warm the GPS chipset before watching). */
  getCurrent(
    options: PositionOptions,
    onFix: PositionCallback,
    onError: PositionErrorCallback
  ): void;
  /** Continuous fixes until the returned handle is cleared. */
  watch(
    options: PositionOptions,
    onFix: PositionCallback,
    onError: PositionErrorCallback,
    purpose?: WatchPurpose
  ): LocationWatch;
}

/**
 * What a watch is for. "record" (the default) is a run's own: it asks for
 * location if it has to and keeps going with the screen locked. "warm" is
 * the run screen's before Start (useGpsWarmup): it never asks, and stops
 * with the app in the background, so it is never the ask and never keeps
 * location on behind the person's back.
 */
export type WatchPurpose = "record" | "warm";
