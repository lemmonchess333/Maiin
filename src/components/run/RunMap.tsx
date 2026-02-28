import { useRef, useEffect, useState } from 'react';
import type { GPSPoint } from '../../lib/gps';
import { THEME } from '../../lib/theme';

interface RunMapProps {
  points: GPSPoint[];
  currentPoint: GPSPoint | null;
  interactive?: boolean;
  height?: string;
  paceColored?: boolean;
  avgPaceSecPerKm?: number;
  className?: string;
}

type MapLibreLike = {
  Map: new (opts: any) => any;
  Marker: new (opts?: any) => any;
};

declare global {
  interface Window {
    maplibregl?: MapLibreLike;
  }
}

let mapLibrePromise: Promise<MapLibreLike> | null = null;

function loadMapLibre(): Promise<MapLibreLike> {
  if (window.maplibregl) return Promise.resolve(window.maplibregl);
  if (mapLibrePromise) return mapLibrePromise;

  mapLibrePromise = new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://unpkg.com/maplibre-gl@5.3.0/dist/maplibre-gl.css';
    document.head.appendChild(css);

    const script = document.createElement('script');
    script.src = 'https://unpkg.com/maplibre-gl@5.3.0/dist/maplibre-gl.js';
    script.async = true;
    script.onload = () => {
      if (window.maplibregl) resolve(window.maplibregl);
      else reject(new Error('MapLibre failed to load'));
    };
    script.onerror = () => reject(new Error('Failed to fetch MapLibre script'));
    document.body.appendChild(script);
  });

  return mapLibrePromise;
}

export default function RunMap({
  points,
  currentPoint,
  interactive = false,
  height = 'h-full',
  paceColored = false,
  avgPaceSecPerKm,
  className = '',
}: RunMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any | null>(null);
  const markerRef = useRef<any | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const startMarkerRef = useRef<any | null>(null);
  const endMarkerRef = useRef<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const initialCenter: [number, number] = currentPoint
      ? [currentPoint.lon, currentPoint.lat]
      : points.length > 0
        ? [points[0].lon, points[0].lat]
        : [-0.09, 51.505];

    let cancelled = false;

    loadMapLibre()
      .then((maplibregl) => {
        if (cancelled || !containerRef.current || mapRef.current) return;
        const map = new maplibregl.Map({
          container: containerRef.current,
          style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
          center: initialCenter,
          zoom: 15,
          attributionControl: false,
          interactive,
          dragRotate: false,
          pitchWithRotate: false,
        });

        map.on('load', () => {
          setMapReady(true);
          map.addSource('route', {
            type: 'geojson',
            data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} },
          });

          map.addLayer({
            id: 'route-line',
            type: 'line',
            source: 'route',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': THEME.teal, 'line-width': 5, 'line-opacity': 0.9 },
          });

          if (paceColored) {
            map.addSource('pace-segments', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
            map.addLayer({
              id: 'pace-segments-line',
              type: 'line',
              source: 'pace-segments',
              layout: { 'line-join': 'round', 'line-cap': 'round' },
              paint: { 'line-color': ['get', 'color'], 'line-width': 5, 'line-opacity': 0.9 },
            });
            map.setLayoutProperty('route-line', 'visibility', 'none');
          }
        });

        mapRef.current = map;
      })
      .catch((e: Error) => setError(e.message));

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      setMapReady(false);
      markerRef.current = null;
      startMarkerRef.current = null;
      endMarkerRef.current = null;
    };
  }, [interactive, paceColored, points, currentPoint]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || points.length === 0 || !mapReady) return;

    const coords = points.map((p) => [p.lon, p.lat]);
    const routeSource = map.getSource('route');
    if (routeSource) {
      routeSource.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} });
    }

    if (paceColored && avgPaceSecPerKm && points.length > 1) {
      const features = [];
      for (let i = 1; i < points.length; i += 1) {
        const dist = haversineQuick(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon);
        const timeDiff = (points[i].timestamp - points[i - 1].timestamp) / 1000;
        const segPace = timeDiff > 0 && dist > 0 ? (timeDiff / dist) * 1000 : avgPaceSecPerKm;
        const ratio = segPace / avgPaceSecPerKm;
        let color: string = THEME.paceSlow;
        if (ratio < 0.92) color = THEME.paceFast;
        else if (ratio < 1.03) color = THEME.paceOnTarget;
        else if (ratio < 1.1) color = THEME.warning;

        features.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: [[points[i - 1].lon, points[i - 1].lat], [points[i].lon, points[i].lat]] },
          properties: { color },
        });
      }

      const paceSource = map.getSource('pace-segments');
      if (paceSource) paceSource.setData({ type: 'FeatureCollection', features });
    }

    if (currentPoint && window.maplibregl) {
      if (!markerRef.current) {
        const el = document.createElement('div');
        el.innerHTML = `<div style="width:24px;height:24px;border-radius:50%;background:${THEME.teal}33;display:flex;align-items:center;justify-content:center;"><div style="width:12px;height:12px;border-radius:50%;background:${THEME.teal};border:2px solid white;"></div></div>`;
        markerRef.current = new window.maplibregl.Marker({ element: el }).setLngLat([currentPoint.lon, currentPoint.lat]).addTo(map);
      } else {
        markerRef.current.setLngLat([currentPoint.lon, currentPoint.lat]);
      }
      map.easeTo({ center: [currentPoint.lon, currentPoint.lat], duration: 500 });
    }

    if (!currentPoint && points.length > 1) {
      const lngs = points.map((p) => p.lon);
      const lats = points.map((p) => p.lat);
      map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: 40, duration: 0 });
    }

    if (window.maplibregl && points.length > 0) {
      if (!startMarkerRef.current) startMarkerRef.current = createMarker(points[0], THEME.success).addTo(map);
      else startMarkerRef.current.setLngLat([points[0].lon, points[0].lat]);
    }

    if (window.maplibregl && !currentPoint && points.length > 1) {
      if (!endMarkerRef.current) endMarkerRef.current = createMarker(points[points.length - 1], THEME.danger).addTo(map);
      else endMarkerRef.current.setLngLat([points[points.length - 1].lon, points[points.length - 1].lat]);
    }
  }, [points, currentPoint, paceColored, avgPaceSecPerKm, mapReady]);

  if (error) {
    return <div className={`w-full ${height} ${className} bg-black/30 flex items-center justify-center text-xs text-white/60`}>Map unavailable</div>;
  }

  return <div ref={containerRef} className={`w-full ${height} ${className}`} />;
}

function createMarker(point: GPSPoint, color: string) {
  const el = document.createElement('div');
  el.style.cssText = `width:14px;height:14px;border-radius:50%;background:${color};border:2px solid white;`;
  return new window.maplibregl!.Marker({ element: el }).setLngLat([point.lon, point.lat]);
}

function haversineQuick(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
