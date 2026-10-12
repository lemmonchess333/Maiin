import { useState, useRef, useCallback, useEffect } from "react";
import {
  KalmanFilter,
  fixTimestamp,
  isValidReading,
  pausedMsOf,
  readingVerdict,
  segmentMetres,
  totalDistance,
} from "../lib/gps";
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
   * Wall-clock ms of the last fix RECEIVED. `null` until the first fix of
   * this tracking session arrives. Consumers compare
   * `Date.now() - lastFixAt` to detect mid-run GPS loss.
   *
   * This used to mean "the last fix that actually moved
   * `distanceRef.current`", which is a different question and made the
   * GPS-loss banner fire on a runner who was simply standing still.
   * `isValidReading` rejects any fix within 1m of the previous one — a
   * correct jitter filter, without which stationary GPS noise would
   * accumulate phantom distance — and a rejected fix did not stamp this
   * field. So waiting at a crossing, stretching before the first step, or
   * pausing to look at the phone all froze it, and after 8s the screen
   * said "GPS recovering · last fix Ns ago" and kept saying it, while the
   * accuracy chip sat at ±6m with full green bars because THAT is updated
   * on every fix regardless.
   *
   * Reported from a device on 2026-08-13 with the tell in plain sight: the
   * banner's age ran exactly `elapsed + 3s` in every screenshot — the age
   * of the first fix, never replaced.
   *
   * Stamped once, at the top of the position handler, on every fix that
   * arrives. "Has a fix arrived recently" is a question about reception,
   * so it is answered by reception and nothing else; fix QUALITY is the
   * accuracy chip's job, and whether the athlete moved is `distance`'s.
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
  /* Holds — the run's clock stopped (countdown, pause, auto-pause; Run.tsx
     drives `pause`/`resume` from the same state that stops its timer).
     While held, fixes move the map's dot but nothing joins the trace or the
     distance, so GPS drift at a crossing is never distance. The time held
     is added up in `pausedTotalMsRef` and stamped on every later point as
     `pausedMs`, which is how splits and best efforts take it out.
     `resumedAtRef` is when the last hold ended: a fix TAKEN before it was
     taken while held, however late it arrives. */
  const heldSinceRef = useRef<number | null>(null);
  const pausedTotalMsRef = useRef(0);
  const resumedAtRef = useRef(0);
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
      // A fresh trace starts on a running clock with nothing held.
      heldSinceRef.current = null;
      pausedTotalMsRef.current = 0;
      resumedAtRef.current = 0;
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
        const arrivedAt = Date.now();
        const lastPoint =
          pointsRef.current[pointsRef.current.length - 1] || null;
        const elapsedMs =
          pointsRef.current.length > 0
            ? arrivedAt - pointsRef.current[0].timestamp
            : 0;

        // Always update accuracy display even if reading is rejected —
        // and, for the same reason, record that a fix ARRIVED. Everything
        // below this point can decline to record the position (too coarse,
        // implausibly fast, less than a metre of movement) without any of
        // that being evidence about reception.
        const quality = getSignalQuality(accuracy);
        setState((s) => ({
          ...s,
          gpsAccuracy: accuracy,
          signalQuality: quality,
          lastFixAt: arrivedAt,
        }));

        /* When the fix was TAKEN, not when it got here — the two part
           company when the OS delivers fixes late or in a batch. Reception
           (`lastFixAt` above) stays on arrival: that is its question. */
        const fixAt = fixTimestamp(
          pos.timestamp,
          arrivedAt,
          lastPoint?.timestamp ?? null
        );

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
            timestamp: fixAt,
            rawLat: latitude,
            rawLon: longitude,
            // Only once something has been held: an absent field reads as 0,
            // and Firestore gets no field it does not need.
            ...(pausedTotalMsRef.current > 0
              ? { pausedMs: pausedTotalMsRef.current }
              : {}),
          };
        };

        // ── Held (countdown, pause, auto-pause). The dot follows the runner
        // and auto-resume reads the fix's speed — from fixes that would
        // have been recorded, as before — but nothing joins the trace or
        // the distance. Not counted as rejected either: a held fix is not a
        // bad one. A fix TAKEN before the last resume was taken while held,
        // however late it arrives, so it is dropped the same way.
        if (heldSinceRef.current !== null || fixAt < resumedAtRef.current) {
          if (
            heldSinceRef.current !== null &&
            isValidReading(pos.coords, lastPoint, elapsedMs / 1000, fixAt)
          ) {
            setState((s) => ({ ...s, currentPoint: makePoint(false) }));
          }
          return;
        }

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
            }));
            return;
          }
          // Still coarse — let the map follow the position, but don't record
          // it (avoids phantom distance from jumping between coarse fixes).
          setState((s) => ({ ...s, currentPoint: makePoint(false) }));
          return;
        }

        // ── Normal tracking (good lock).
        const verdict = readingVerdict(
          pos.coords,
          lastPoint,
          elapsedMs / 1000,
          fixAt
        );
        if (verdict !== "ok") {
          // A fix that has not moved is not a bad one: route quality reads
          // this count, and a runner standing at a crossing has a signal.
          if (verdict !== "still") rejectedFixCountRef.current += 1;
          return;
        }
        const point = makePoint(true);
        if (lastPoint) {
          // The splits' rule (gps.ts), so the run's distance and its splits
          // agree — including across a pause.
          distanceRef.current += segmentMetres(lastPoint, point);
        }
        pointsRef.current.push(point);
        setState((s) => ({
          ...s,
          points: [...pointsRef.current],
          currentPoint: point,
          distance: distanceRef.current,
          isTracking: true,
          error: null,
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
    // Defensive: clear any existing watch before replacing it. Current callers
    // stop() first, but a start() without an intervening stop() (a future
    // foreground/resume path, or a visible→visible edge) would otherwise leak a
    // second live watchPosition — both subscriptions call handleFix, double-
    // counting distance into distanceRef and corrupting the saved track.
    if (watchRef.current) {
      watchRef.current.clear();
      watchRef.current = null;
    }
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

  /**
   * Hold the trace: the run's clock has stopped (countdown, pause,
   * auto-pause). Independent of `stop` — a manual pause on the web stops
   * the watch too, an auto-pause keeps it running to see the runner set
   * off again, and a backgrounded web page stops it WITHOUT a hold.
   *
   * `since` backdates the hold for a restored trail, whose recording
   * stopped before this call; it never reaches back past the last recorded
   * point, or the moving clock would run backwards. Holding while already
   * held keeps the earlier start.
   */
  const pause = useCallback((since?: number) => {
    if (heldSinceRef.current !== null) return;
    const now = Date.now();
    const last = pointsRef.current[pointsRef.current.length - 1];
    heldSinceRef.current = Math.min(
      now,
      Math.max(since ?? now, last ? last.timestamp : -Infinity)
    );
  }, []);

  /** Release a hold: the time held is banked into every later point's
   *  `pausedMs`. A no-op when nothing is held. */
  const resume = useCallback(() => {
    const since = heldSinceRef.current;
    if (since === null) return;
    const now = Date.now();
    pausedTotalMsRef.current += Math.max(0, now - since);
    heldSinceRef.current = null;
    resumedAtRef.current = now;
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
    // Rebuild cumulative distance from the restored trail, by the rule the
    // live distance counts with (and the resume prompt shows).
    const dist = totalDistance(restored);
    pointsRef.current = [...pointsRef.current, ...restored];
    distanceRef.current = distanceRef.current + dist;
    const lastRestored = restored[restored.length - 1];
    /* Carry on the trail's held-time count, so the next point continues it
       rather than restarting from 0 — which would read every hold before
       the interruption as moving time. The gap since the trail ended is
       the caller's to hold (`pause(since)`): only it knows when recording
       stopped. */
    pausedTotalMsRef.current = Math.max(
      pausedTotalMsRef.current,
      pausedMsOf(lastRestored)
    );
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
    pause,
    resume,
    getPoints,
    getRejectedFixCount,
    appendPoints,
  };
}
