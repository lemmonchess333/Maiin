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
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const initialCenter: [number, number] = currentPoint
      ? [currentPoint.lat, currentPoint.lon]
      : points.length > 0 ? [points[0].lat, points[0].lon] : [51.505, -0.09];

    mapRef.current = L.map(containerRef.current, {
      zoomControl: interactive, attributionControl: false,
      dragging: interactive, scrollWheelZoom: interactive,
      touchZoom: interactive, doubleClickZoom: false,
    }).setView(initialCenter, 15);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 })
      .addTo(mapRef.current);

    polylineRef.current = L.polyline([], {
      color: '#8b5cf6', weight: 4, opacity: 0.9, smoothFactor: 1,
    }).addTo(mapRef.current);

    return () => { mapRef.current?.remove(); mapRef.current = null; };
  }, [interactive]);

  useEffect(() => {
    if (!mapRef.current || !polylineRef.current || points.length === 0) return;
    const latLngs = points.map(p => [p.lat, p.lon] as [number, number]);
    polylineRef.current.setLatLngs(latLngs);

    if (currentPoint) {
      if (!markerRef.current) {
        markerRef.current = L.circleMarker([currentPoint.lat, currentPoint.lon], {
          radius: 8, color: '#8b5cf6', fillColor: '#a78bfa', fillOpacity: 1, weight: 3,
        }).addTo(mapRef.current);
      } else {
        markerRef.current.setLatLng([currentPoint.lat, currentPoint.lon]);
      }
      mapRef.current.panTo([currentPoint.lat, currentPoint.lon], { animate: true });
    }

    if (!currentPoint && points.length > 1) {
      mapRef.current.fitBounds(polylineRef.current.getBounds(), { padding: [20, 20] });
    }
  }, [points, currentPoint]);

  return <div ref={containerRef} className={`w-full ${height} rounded-xl overflow-hidden`} />;
}
