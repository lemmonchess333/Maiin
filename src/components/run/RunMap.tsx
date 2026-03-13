import { useRef, useEffect } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
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
  darkMode?: boolean;
  replayIndex?: number;
}

const TILE_STYLES = {
  dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  light: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
};

export default function RunMap({
  points, currentPoint, interactive = false,
  height = 'h-full', paceColored = false, avgPaceSecPerKm,
  className = '', darkMode = true, replayIndex,
}: RunMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const startMarkerRef = useRef<maplibregl.Marker | null>(null);
  const endMarkerRef = useRef<maplibregl.Marker | null>(null);

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const initialCenter: [number, number] = currentPoint
      ? [currentPoint.lon, currentPoint.lat]
      : points.length > 0
        ? [points[0].lon, points[0].lat]
        : [-0.09, 51.505];

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: darkMode ? TILE_STYLES.dark : TILE_STYLES.light,
      center: initialCenter,
      zoom: 15,
      attributionControl: false,
      interactive: interactive,
      dragRotate: false,
      pitchWithRotate: false,
    });

    map.on('load', () => {
      map.addSource('route', {
        type: 'geojson',
        data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} },
      });

      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': THEME.teal,
          'line-width': 5,
          'line-opacity': 0.9,
        },
      });

      if (paceColored) {
        map.addSource('pace-segments', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
        map.addLayer({
          id: 'pace-segments-line',
          type: 'line',
          source: 'pace-segments',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': ['get', 'color'],
            'line-width': 5,
            'line-opacity': 0.9,
          },
        });
        map.setLayoutProperty('route-line', 'visibility', 'none');
      }
    });

    mapRef.current = map;

    return () => { map.remove(); mapRef.current = null; };
  }, [interactive, paceColored, darkMode, currentPoint, points]);

  // Update route
  useEffect(() => {
    const map = mapRef.current;
    if (!map || points.length === 0) return;

    const updateRoute = () => {
      const visiblePoints = replayIndex !== undefined ? points.slice(0, replayIndex + 1) : points;
      const coords = visiblePoints.map(p => [p.lon, p.lat]);

      const routeSource = map.getSource('route') as maplibregl.GeoJSONSource | undefined;
      if (routeSource) {
        routeSource.setData({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: coords },
          properties: {},
        });
      }

      if (paceColored && avgPaceSecPerKm && visiblePoints.length > 1) {
        const features: { type: 'Feature'; geometry: { type: 'LineString'; coordinates: number[][] }; properties: { color: string } }[] = [];
        for (let i = 1; i < visiblePoints.length; i++) {
          const dist = haversineQuick(visiblePoints[i-1].lat, visiblePoints[i-1].lon, visiblePoints[i].lat, visiblePoints[i].lon);
          const timeDiff = (visiblePoints[i].timestamp - visiblePoints[i-1].timestamp) / 1000;
          const segPace = timeDiff > 0 && dist > 0 ? (timeDiff / dist) * 1000 : avgPaceSecPerKm;
          const ratio = segPace / avgPaceSecPerKm;

          let color: string;
          if (ratio < 0.92) color = THEME.paceFast;
          else if (ratio < 1.03) color = THEME.paceOnTarget;
          else if (ratio < 1.1) color = THEME.warning;
          else color = THEME.paceSlow;

          features.push({
            type: 'Feature' as const,
            geometry: {
              type: 'LineString' as const,
              coordinates: [[visiblePoints[i-1].lon, visiblePoints[i-1].lat], [visiblePoints[i].lon, visiblePoints[i].lat]],
            },
            properties: { color },
          });
        }

        const paceSource = map.getSource('pace-segments') as maplibregl.GeoJSONSource | undefined;
        if (paceSource) {
          paceSource.setData({ type: 'FeatureCollection', features });
        }
      }

      // Current position marker (live tracking)
      if (currentPoint) {
        if (!markerRef.current) {
          const el = document.createElement('div');
          el.innerHTML = `
            <div style="width:24px;height:24px;border-radius:50%;background:${THEME.teal}33;display:flex;align-items:center;justify-content:center;">
              <div style="width:12px;height:12px;border-radius:50%;background:${THEME.teal};border:2px solid white;"></div>
            </div>
          `;
          markerRef.current = new maplibregl.Marker({ element: el })
            .setLngLat([currentPoint.lon, currentPoint.lat])
            .addTo(map);
        } else {
          markerRef.current.setLngLat([currentPoint.lon, currentPoint.lat]);
        }
        map.easeTo({ center: [currentPoint.lon, currentPoint.lat], duration: 500 });
      }

      // Fit bounds for post-run static view
      if (!currentPoint && points.length > 1) {
        const lngs = points.map(p => p.lon);
        const lats = points.map(p => p.lat);
        map.fitBounds(
          [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
          { padding: 40, duration: 0 }
        );
      }

      // Start marker (green dot)
      if (points.length > 0 && !startMarkerRef.current) {
        const el = document.createElement('div');
        el.style.cssText = `width:14px;height:14px;border-radius:50%;background:${THEME.success};border:2px solid white;`;
        startMarkerRef.current = new maplibregl.Marker({ element: el })
          .setLngLat([points[0].lon, points[0].lat])
          .addTo(map);
      }

      // End marker (for post-run, hidden during replay)
      if (replayIndex !== undefined && endMarkerRef.current) {
        endMarkerRef.current.remove();
        endMarkerRef.current = null;
      }
      if (!currentPoint && points.length > 1 && !endMarkerRef.current && replayIndex === undefined) {
        const el = document.createElement('div');
        el.style.cssText = `width:14px;height:14px;border-radius:50%;background:${THEME.danger};border:2px solid white;`;
        endMarkerRef.current = new maplibregl.Marker({ element: el })
          .setLngLat([points[points.length - 1].lon, points[points.length - 1].lat])
          .addTo(map);
      }
    };

    if (map.loaded()) {
      updateRoute();
    } else {
      map.on('load', updateRoute);
    }
  }, [points, currentPoint, paceColored, avgPaceSecPerKm, replayIndex]);

  return <div ref={containerRef} className={`w-full ${height} ${className}`} />;
}

function haversineQuick(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
