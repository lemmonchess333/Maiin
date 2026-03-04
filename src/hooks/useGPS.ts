import { useState, useRef, useCallback } from 'react';
import { KalmanFilter, isValidReading, haversine } from '../lib/gps';
import type { GPSPoint } from '../lib/gps';

export type GPSSignalQuality = 'searching' | 'weak' | 'fair' | 'good' | 'strong';

interface GPSState {
  points: GPSPoint[];
  currentPoint: GPSPoint | null;
  distance: number;
  isTracking: boolean;
  error: string | null;
  gpsAccuracy: number | null;
  signalQuality: GPSSignalQuality;
}

function getSignalQuality(accuracy: number | null): GPSSignalQuality {
  if (accuracy === null) return 'searching';
  if (accuracy <= 8) return 'strong';
  if (accuracy <= 15) return 'good';
  if (accuracy <= 30) return 'fair';
  return 'weak';
}

export function useGPS(elapsedSeconds = 0) {
  const [state, setState] = useState<GPSState>({
    points: [],
    currentPoint: null,
    distance: 0,
    isTracking: false,
    error: null,
    gpsAccuracy: null,
    signalQuality: 'searching',
  });

  const watchIdRef = useRef<number | null>(null);
  const kalmanRef = useRef(new KalmanFilter());
  const pointsRef = useRef<GPSPoint[]>([]);
  const distanceRef = useRef(0);

  // Pre-warm: fire a quick getCurrentPosition first so the browser/OS
  // starts warming up the GPS chipset before watchPosition begins.
  const preWarm = useCallback(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // Just update accuracy display — don't add to track yet
        setState((s) => ({
          ...s,
          gpsAccuracy: pos.coords.accuracy,
          signalQuality: getSignalQuality(pos.coords.accuracy),
        }));
      },
      () => {}, // silence errors — this is best-effort
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 2000 }
    );
  }, []);

  const start = useCallback(() => {
    if (!navigator.geolocation) {
      setState((s) => ({ ...s, error: 'Geolocation not supported' }));
      return;
    }

    if (pointsRef.current.length === 0) {
      kalmanRef.current.reset();
      pointsRef.current = [];
      distanceRef.current = 0;
    }

    const options: PositionOptions = {
      enableHighAccuracy: true,
      maximumAge: elapsedSeconds > 1800 ? 3000 : 0,
      timeout: elapsedSeconds > 1800 ? 15000 : 12000,
    };

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy, altitude, speed } = pos.coords;
        const lastPoint = pointsRef.current[pointsRef.current.length - 1] || null;
        const elapsedMs = pointsRef.current.length > 0
          ? Date.now() - pointsRef.current[0].timestamp
          : 0;

        // Always update accuracy display even if reading is rejected
        const quality = getSignalQuality(accuracy);
        setState((s) => ({ ...s, gpsAccuracy: accuracy, signalQuality: quality }));

        if (!isValidReading(pos.coords, lastPoint, elapsedMs / 1000)) return;

        const smoothed = kalmanRef.current.process(latitude, longitude, accuracy);
        const point: GPSPoint = {
          lat: smoothed.lat,
          lon: smoothed.lon,
          altitude,
          accuracy,
          speed,
          timestamp: Date.now(),
          rawLat: latitude,
          rawLon: longitude,
        };

        if (lastPoint) {
          distanceRef.current += haversine(lastPoint.lat, lastPoint.lon, point.lat, point.lon);
        }

        pointsRef.current.push(point);
        setState({
          points: [...pointsRef.current],
          currentPoint: point,
          distance: distanceRef.current,
          isTracking: true,
          error: null,
          gpsAccuracy: accuracy,
          signalQuality: quality,
        });
      },
      (err) => setState((s) => ({ ...s, error: err.message, signalQuality: 'searching' })),
      options
    );

    setState((s) => ({ ...s, isTracking: true }));
  }, [elapsedSeconds]);

  const stop = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setState((s) => ({ ...s, isTracking: false }));
  }, []);

  const getPoints = useCallback(() => pointsRef.current, []);

  return { ...state, preWarm, start, stop, getPoints };
