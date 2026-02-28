import { useState, useRef, useCallback } from 'react';
import { KalmanFilter, isValidReading, haversine } from '../lib/gps';
import type { GPSPoint } from '../lib/gps';

interface GPSState {
  points: GPSPoint[];
  currentPoint: GPSPoint | null;
  distance: number;
  isTracking: boolean;
  error: string | null;
  gpsAccuracy: number | null;
}

export function useGPS() {
  const [state, setState] = useState<GPSState>({
    points: [], currentPoint: null, distance: 0,
    isTracking: false, error: null, gpsAccuracy: null,
  });
  const watchIdRef = useRef<number | null>(null);
  const kalmanRef = useRef(new KalmanFilter());
  const pointsRef = useRef<GPSPoint[]>([]);
  const distanceRef = useRef(0);

  const start = useCallback(() => {
    if (!navigator.geolocation) {
      setState(s => ({ ...s, error: 'Geolocation not supported' }));
      return;
    }
    kalmanRef.current.reset();
    pointsRef.current = [];
    distanceRef.current = 0;

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy, altitude, speed } = pos.coords;
        const lastPoint = pointsRef.current[pointsRef.current.length - 1] || null;
        if (!isValidReading(pos.coords, lastPoint)) {
          setState(s => ({ ...s, gpsAccuracy: accuracy }));
          return;
        }
        const smoothed = kalmanRef.current.process(latitude, longitude, accuracy);
        const point: GPSPoint = {
          lat: smoothed.lat, lon: smoothed.lon,
          altitude, accuracy, speed,
          timestamp: Date.now(),
          rawLat: latitude, rawLon: longitude,
        };
        if (lastPoint) {
          distanceRef.current += haversine(lastPoint.lat, lastPoint.lon, point.lat, point.lon);
        }
        pointsRef.current.push(point);
        setState({
          points: [...pointsRef.current], currentPoint: point,
          distance: distanceRef.current, isTracking: true,
          error: null, gpsAccuracy: accuracy,
        });
      },
      (err) => setState(s => ({ ...s, error: err.message })),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );
    setState(s => ({ ...s, isTracking: true }));
  }, []);

  const stop = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setState(s => ({ ...s, isTracking: false }));
  }, []);

  const getPoints = useCallback(() => pointsRef.current, []);

  return { ...state, start, stop, getPoints };
}
