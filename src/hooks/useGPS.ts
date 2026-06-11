import { useState, useRef, useCallback, useEffect } from "react";
import { KalmanFilter, isValidReading, haversine } from "../lib/gps";
import { getLocationSource, type LocationWatch } from "../lib/locationSource";
import { logger } from "../lib/logger";
import type { GPSPoint } from "../lib/gps";

export type GPSSignalQuality =
  | "searching"
  | "weak"
  | "fair"
  | "good"
  | "strong";

interface GPSState {
  points: GPSPoint[];
  currentPoint: GPSPoint | null;
  distance: number;
  isTracking: boolean;
  error: string | null;
  gpsAccuracy: number | null;
  permissionState: PermissionState | null;
  signalQuality: GPSSignalQuality;
  /**
   * Wall-clock ms of the last *valid* fix (the one that actually moved
   * `distanceRef.current`). `null` until the first valid fix arrives.
   * Consumers compare `Date.now() - lastFixAt` to detect mid-run GPS
   * loss — `isValidReading` drops poor fixes silently so the visible
   * accuracy reading can stay stale even when real reception is gone.
   */
  lastFixAt: number | null;
}

function getSignalQuality(accuracy: number | null): GPSSignalQuality {
  if (accuracy === null) return "searching";
  if (accuracy <= 8) return "strong";
  if (accuracy <= 15) return "good";
  if (accuracy <= 30) return "fair";
  return "weak";
}

export function useGPS(elapsedSeconds = 0) {
  const [state, setState] = useState<GPSState>({
    points: [],
    currentPoint: null,
    distance: 0,
    isTracking: false,
    error: null,
    gpsAccuracy: null,
    permissionState: null,
    signalQuality: "searching",
    lastFixAt: null,
  });

  const watchRef = useRef<LocationWatch | null>(null);
  // iOS-Safari/PWA fallback: see the watchdog in `start()`. `pollRef` is the
  // getCurrentPosition polling interval; `watchHealthyRef` flips true the
  // first time watchPosition actually delivers a fix.
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const watchHealthyRef = useRef(false);
  const kalmanRef = useRef(new KalmanFilter());
  const pointsRef = useRef<GPSPoint[]>([]);
  const distanceRef = useRef(0);
  const elapsedRef = useRef(elapsedSeconds);
  // PR H (audit P1 #9): track rejected-fix count for route-quality
  // scoring. Pre-PR-H `isValidReading` silently dropped poor fixes
  // and we had no aggregate signal to surface on the run summary.
  const rejectedFixCountRef = useRef(0);
  // First-fix acquisition. `acquireStartRef` marks when we began waiting for
  // the very first fix; `provisionalStartRef` is true while the run started on
  // a COARSE fix (>150 m) that hasn't been re-anchored by a good fix yet.
  // Indoors / in cities iOS's first fixes are 200 m–1 km until GPS warms up;
  // the old code required ≤150 m to even start, so it silently rejected every
  // fix and spun "Acquiring GPS" forever. We now start on whatever arrives
  // after a short grace, then re-anchor the start to the first good fix so the
  // recorded track + distance stay clean.
  const acquireStartRef = useRef<number | null>(null);
  const provisionalStartRef = useRef(false);
  /** ms to wait for a ≤150 m first fix before starting on a coarse one. */
  const FIRST_FIX_RELAX_MS = 6000;
  useEffect(() => {
    elapsedRef.current = elapsedSeconds;
  }, [elapsedSeconds]);

  // Check geolocation permission on mount
  useEffect(() => {
    if (!navigator.permissions) return;
    let cancelled = false;
    let permStatus: PermissionStatus | null = null;
    const onChange = () => {
      if (permStatus) {
        setState((s) => ({ ...s, permissionState: permStatus!.state }));
      }
    };
    navigator.permissions
      .query({ name: "geolocation" })
      .then((result) => {
        if (cancelled) return;
        permStatus = result;
        setState((s) => ({ ...s, permissionState: result.state }));
        result.addEventListener("change", onChange);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      // PermissionStatus objects are long-lived and shared across the
      // browser session — without removing the listener on unmount,
      // every consumer mount accumulates a fresh listener (and calls
      // setState on a stale component instance after unmount).
      if (permStatus) permStatus.removeEventListener("change", onChange);
    };
  }, []);

  // Pre-warm: fire a quick getCurrentPosition first so the browser/OS
  // starts warming up the GPS chipset before watchPosition begins.
  const preWarm = useCallback(() => {
    if (!navigator.geolocation) return;
    getLocationSource().getCurrent(
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 2000 },
      (pos) => {
        // Just update accuracy display — don't add to track yet
        setState((s) => ({
          ...s,
          gpsAccuracy: pos.coords.accuracy,
          signalQuality: getSignalQuality(pos.coords.accuracy),
        }));
      },
      () => {} // silence errors — this is best-effort
    );
  }, []);

  const start = useCallback(() => {
    if (!navigator.geolocation) {
      setState((s) => ({ ...s, error: "Geolocation not supported" }));
      return;
    }

    if (pointsRef.current.length === 0) {
      kalmanRef.current.reset();
      pointsRef.current = [];
      distanceRef.current = 0;
      // PR H: reset rejected-fix count on a fresh tracking session
      // for the same reason lastFixAt resets — avoid bleed from a
      // previous run.
      rejectedFixCountRef.current = 0;
      acquireStartRef.current = Date.now();
      provisionalStartRef.current = false;
      /* Reset lastFixAt on a fresh tracking session so a 'GPS lost'
         flag from a previous run doesn't bleed into this one. The
         first valid fix in this session will populate it. */
      setState((s) => ({ ...s, lastFixAt: null }));
    }

    const options: PositionOptions = {
      enableHighAccuracy: true,
      maximumAge: elapsedRef.current > 1800 ? 3000 : 0,
      timeout: elapsedRef.current > 1800 ? 15000 : 12000,
    };

    const handleFix: PositionCallback = (pos) => {
      {
        const { latitude, longitude, accuracy, altitude, speed } = pos.coords;
        const lastPoint =
          pointsRef.current[pointsRef.current.length - 1] || null;
        const elapsedMs =
          pointsRef.current.length > 0
            ? Date.now() - pointsRef.current[0].timestamp
            : 0;

        // Always update accuracy display even if reading is rejected
        const quality = getSignalQuality(accuracy);
        setState((s) => ({
          ...s,
          gpsAccuracy: accuracy,
          signalQuality: quality,
        }));

        const GOOD_FIX_M = 150;
        const makePoint = (useKalman: boolean): GPSPoint => {
          const c = useKalman
            ? kalmanRef.current.process(latitude, longitude, accuracy)
            : { lat: latitude, lon: longitude };
          return {
            lat: c.lat,
            lon: c.lon,
            altitude,
            accuracy,
            speed,
            timestamp: Date.now(),
            rawLat: latitude,
            rawLon: longitude,
          };
        };

        // ── First fix: START the run as soon as we have one we'll accept.
        // Outdoors a ≤150 m fix arrives within seconds; indoors / in cities
        // iOS's first fixes are coarser, so after a short grace we start on
        // whatever's available (marked provisional) rather than spinning
        // "Acquiring GPS" forever.
        if (pointsRef.current.length === 0) {
          const acquireMs = acquireStartRef.current
            ? Date.now() - acquireStartRef.current
            : Infinity;
          if (accuracy > GOOD_FIX_M && acquireMs < FIRST_FIX_RELAX_MS) {
            rejectedFixCountRef.current += 1;
            return; // hold out a little longer for a clean first fix
          }
          provisionalStartRef.current = accuracy > GOOD_FIX_M;
          // Diagnostic: which source broke the acquisition deadlock. Visible
          // in Safari Web Inspector → Console when debugging the device.
          logger.log(
            `[useGPS] first fix via ${
              watchHealthyRef.current ? "watch" : "poll"
            } (±${Math.round(accuracy)}m)`
          );
          const point = makePoint(true);
          pointsRef.current.push(point);
          setState((s) => ({
            ...s,
            points: [...pointsRef.current],
            currentPoint: point,
            distance: distanceRef.current,
            isTracking: true,
            error: null,
            lastFixAt: point.timestamp,
          }));
          return;
        }

        // ── Started on a COARSE fix and not yet re-anchored.
        if (provisionalStartRef.current) {
          if (accuracy <= GOOD_FIX_M) {
            // First good fix — re-anchor the start here so the coarse lead-in
            // doesn't inject phantom distance. Drop the provisional point and
            // restart the track + distance from this fix.
            kalmanRef.current.reset();
            const point = makePoint(true);
            pointsRef.current = [point];
            distanceRef.current = 0;
            provisionalStartRef.current = false;
            setState((s) => ({
              ...s,
              points: [point],
              currentPoint: point,
              distance: 0,
              isTracking: true,
              error: null,
              lastFixAt: point.timestamp,
            }));
            return;
          }
          // Still coarse — let the map follow the position, but don't record
          // it (avoids phantom distance from jumping between coarse fixes).
          setState((s) => ({ ...s, currentPoint: makePoint(false) }));
          return;
        }

        // ── Normal tracking (good lock).
        if (!isValidReading(pos.coords, lastPoint, elapsedMs / 1000)) {
          rejectedFixCountRef.current += 1;
          return;
        }
        const point = makePoint(true);
        if (lastPoint) {
          distanceRef.current += haversine(
            lastPoint.lat,
            lastPoint.lon,
            point.lat,
            point.lon
          );
        }
        pointsRef.current.push(point);
        setState((s) => ({
          ...s,
          points: [...pointsRef.current],
          currentPoint: point,
          distance: distanceRef.current,
          isTracking: true,
          error: null,
          lastFixAt: point.timestamp,
        }));
      }
    };

    const handleError: PositionErrorCallback = (err) =>
      setState((s) => ({
        ...s,
        error: err.message,
        // err.code 1 = PERMISSION_DENIED. Set permissionState from it too —
        // iOS Safari often doesn't support navigator.permissions for
        // geolocation, so this is the reliable signal that the user blocked
        // location (lets the UI show a clear "turn it on" message).
        permissionState: err.code === 1 ? "denied" : s.permissionState,
        signalQuality: "searching",
      }));

    // iOS Safari / standalone PWA: watchPosition can silently never fire
    // (it ignores its own `timeout`) even when the device locates fine in
    // other apps — the run then spins on "Acquiring GPS" forever. Defend
    // with a getCurrentPosition fallback poll that runs until the watch
    // proves healthy (delivers a fix). If the watch never does, the poll
    // stays our continuous fix source for the rest of the run. getCurrent
    // is the reliable path on iOS web where watch is flaky.
    watchHealthyRef.current = false;
    watchRef.current = getLocationSource().watch(
      options,
      (pos) => {
        if (!watchHealthyRef.current) {
          watchHealthyRef.current = true;
          // Watch is alive — drop the fallback poll to save battery.
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
        }
        handleFix(pos);
      },
      handleError
    );

    const pollOnce = () => {
      if (watchHealthyRef.current) return;
      getLocationSource().getCurrent(
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 1000 },
        handleFix,
        (err) => {
          // Only a definitive permission denial is worth surfacing from the
          // poll; transient timeouts are expected while acquiring, and the
          // watch's onError owns the generic error UI.
          if (err.code === 1) handleError(err);
        }
      );
    };
    if (pollRef.current) clearInterval(pollRef.current);
    pollOnce();
    pollRef.current = setInterval(pollOnce, 3000);

    setState((s) => ({ ...s, isTracking: true }));
  }, []);

  const stop = useCallback(() => {
    if (watchRef.current) {
      watchRef.current.clear();
      watchRef.current = null;
    }
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setState((s) => ({ ...s, isTracking: false }));
  }, []);

  // Clean up the active watch + fallback poll on unmount to prevent
  // memory/battery leak.
  useEffect(() => {
    return () => {
      if (watchRef.current) {
        watchRef.current.clear();
        watchRef.current = null;
      }
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, []);

  const getPoints = useCallback(() => pointsRef.current, []);
  /** PR H (audit P1 #9): snapshot of rejected-fix count for the
   *  current tracking session. Read at save time alongside getPoints
   *  to populate the run doc's routeQuality metrics. */
  const getRejectedFixCount = useCallback(
    () => rejectedFixCountRef.current,
    []
  );

  /**
   * Phase B3: rehydrate the GPS point buffer from a persisted
   * snapshot. Appends rather than replaces so a partial resume
   * (e.g. user resumes a run, GPS arrives, the live points are
   * collected on top of the restored trail) works cleanly.
   *
   * Also seeds the cumulative distance from the restored trail so
   * the live distance display starts from where it left off.
   */
  const appendPoints = useCallback((restored: GPSPoint[]) => {
    if (!Array.isArray(restored) || restored.length === 0) return;
    // Rebuild cumulative distance from the restored trail.
    let dist = 0;
    for (let i = 1; i < restored.length; i++) {
      dist += haversine(
        restored[i - 1].lat,
        restored[i - 1].lon,
        restored[i].lat,
        restored[i].lon
      );
    }
    pointsRef.current = [...pointsRef.current, ...restored];
    distanceRef.current = distanceRef.current + dist;
    const lastRestored = restored[restored.length - 1];
    setState((s) => ({
      ...s,
      points: [...pointsRef.current],
      currentPoint: lastRestored ?? s.currentPoint,
      distance: distanceRef.current,
      // lastFixAt stays at the restored point's timestamp so the
      // GPS-gap detector sees the staleness; the consumer is
      // expected to call suppressGapBannerUntil() to mute the
      // banner during the cold-start window.
      lastFixAt: lastRestored?.timestamp ?? s.lastFixAt,
    }));
  }, []);

  return {
    ...state,
    preWarm,
    start,
    stop,
    getPoints,
    getRejectedFixCount,
    appendPoints,
  };
}
