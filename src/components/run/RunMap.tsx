import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { GPSPoint } from '../../lib/gps';

interface RunMapProps {
  points: GPSPoint[];
  currentPoint: GPSPoint | null;
  interactive?: boolean;
  height?: string;
}

export default function RunMap({ points, currentPoint, interactive = false, height = 'h-48' }: RunMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const polylineRef = useRef<L.Polyline | null>(null);
  const markerRef = useRef<L.CircleMarker | null>(null);
  const accuracyRef = useRef<L.Circle | null>(null);
  const startMarkerRef = useRef<L.CircleMarker | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const initialCenter: [number, number] = currentPoint
      ? [currentPoint.lat, currentPoint.lon]
      : points.length > 0
        ? [points[0].lat, points[0].lon]
        : [51.505, -0.09];

    mapRef.current = L.map(containerRef.current, {
      zoomControl: interactive,
      attributionControl: false,
      dragging: interactive,
      scrollWheelZoom: interactive,
      touchZoom: interactive,
      doubleClickZoom: false,
    }).setView(initialCenter, 15);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors © CARTO',
    }).addTo(mapRef.current);

    polylineRef.current = L.polyline([], {
      color: '#a78bfa',
      weight: 5,
      opacity: 1,
      smoothFactor: 1.5,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(mapRef.current);

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [interactive]);

  useEffect(() => {
    if (!mapRef.current || !polylineRef.current || points.length === 0) return;

    const latLngs = points.map((p) => [p.lat, p.lon] as [number, number]);
    polylineRef.current.setLatLngs(latLngs);

    if (points.length >= 1 && !startMarkerRef.current) {
      startMarkerRef.current = L.circleMarker([points[0].lat, points[0].lon], {
        radius: 6,
        color: '#22c55e',
        fillColor: '#22c55e',
        fillOpacity: 1,
        weight: 2,
      }).addTo(mapRef.current);
    }

    if (currentPoint) {
      if (!accuracyRef.current) {
        accuracyRef.current = L.circle([currentPoint.lat, currentPoint.lon], {
          radius: currentPoint.accuracy,
          stroke: false,
          fillColor: '#8b5cf6',
          fillOpacity: 0.12,
        }).addTo(mapRef.current);
      }
      accuracyRef.current.setLatLng([currentPoint.lat, currentPoint.lon]);
      accuracyRef.current.setRadius(Math.max(currentPoint.accuracy, 5));

      if (!markerRef.current) {
        markerRef.current = L.circleMarker([currentPoint.lat, currentPoint.lon], {
          radius: 7,
          color: '#ffffff',
          fillColor: '#8b5cf6',
          fillOpacity: 1,
          weight: 2,
        }).addTo(mapRef.current);
      } else {
        markerRef.current.setLatLng([currentPoint.lat, currentPoint.lon]);
      }

      mapRef.current.panTo([currentPoint.lat, currentPoint.lon], { animate: true, duration: 0.5 });
    }

    if (!currentPoint && points.length > 1) {
      mapRef.current.fitBounds(polylineRef.current.getBounds(), { padding: [20, 20] });
    }
  }, [points, currentPoint]);

  return <div ref={containerRef} className={`w-full ${height} rounded-xl overflow-hidden`} />;
}
