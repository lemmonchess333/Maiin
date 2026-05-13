/**
 * Phase B3 — pins the useGPS rehydration contract: appendPoints
 * restores the persisted trail, rebuilds cumulative distance via
 * haversine, and updates lastFixAt/currentPoint to match the last
 * restored point. The live GPS / watchPosition path is intentionally
 * untouched — it requires a navigator.geolocation mock that the
 * existing useRunTimer tests don't carry, and Phase B3 only depends
 * on the rehydration semantics.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGPS } from '../useGPS';
import type { GPSPoint } from '../../lib/gps';

function makePoint(lat: number, lon: number, ts: number): GPSPoint {
  return {
    lat,
    lon,
    altitude: null,
    accuracy: 5,
    speed: null,
    timestamp: ts,
    rawLat: lat,
    rawLon: lon,
  };
}

describe('useGPS — appendPoints (Phase B3 rehydration)', () => {
  beforeEach(() => {
    // The hook reads navigator.geolocation only inside start(); we
    // never call start() in these tests, so no mock is needed.
  });

  it('is a no-op on an empty array', () => {
    const { result } = renderHook(() => useGPS());
    act(() => result.current.appendPoints([]));
    expect(result.current.points).toEqual([]);
    expect(result.current.distance).toBe(0);
    expect(result.current.currentPoint).toBeNull();
    expect(result.current.lastFixAt).toBeNull();
  });

  it('appends a single point with zero added distance', () => {
    const { result } = renderHook(() => useGPS());
    const p = makePoint(51.5, -0.12, 1_000_000);
    act(() => result.current.appendPoints([p]));
    expect(result.current.points).toHaveLength(1);
    expect(result.current.distance).toBe(0);
    expect(result.current.currentPoint?.lat).toBe(51.5);
    expect(result.current.lastFixAt).toBe(1_000_000);
  });

  it('rebuilds cumulative distance across the restored trail', () => {
    // Two ~111km moves along the equator (1° lat). The haversine
    // sum must be > 0 and roughly ~222km. Generous bounds keep the
    // test resilient to haversine constant tweaks.
    const { result } = renderHook(() => useGPS());
    const trail = [
      makePoint(0, 0, 1_000_000),
      makePoint(1, 0, 1_001_000),
      makePoint(2, 0, 1_002_000),
    ];
    act(() => result.current.appendPoints(trail));
    expect(result.current.points).toHaveLength(3);
    expect(result.current.distance).toBeGreaterThan(200_000); // > 200km
    expect(result.current.distance).toBeLessThan(250_000); // < 250km
    expect(result.current.lastFixAt).toBe(1_002_000);
  });

  it('sets currentPoint to the last restored point', () => {
    const { result } = renderHook(() => useGPS());
    const trail = [
      makePoint(51.5, -0.12, 1_000_000),
      makePoint(51.51, -0.13, 1_001_000),
    ];
    act(() => result.current.appendPoints(trail));
    expect(result.current.currentPoint?.lat).toBe(51.51);
    expect(result.current.currentPoint?.lon).toBe(-0.13);
  });

  it('append after append concatenates and accumulates distance', () => {
    const { result } = renderHook(() => useGPS());
    const trail1 = [
      makePoint(0, 0, 1_000_000),
      makePoint(1, 0, 1_001_000),
    ];
    const trail2 = [
      makePoint(2, 0, 1_002_000),
    ];
    act(() => result.current.appendPoints(trail1));
    const distAfterFirst = result.current.distance;
    act(() => result.current.appendPoints(trail2));
    expect(result.current.points).toHaveLength(3);
    // Distance after the second append is the first trail's
    // distance PLUS the second trail's internal distance (0 — a
    // single point). The cross-segment gap between trail1's last
    // and trail2's only point is intentionally NOT counted —
    // appendPoints rebuilds distance from each restored array
    // internally; cross-restore stitching is by design left to a
    // future patch since a partial-resume scenario is the only
    // case where it would matter and our snapshot writes are
    // monolithic today.
    expect(result.current.distance).toBe(distAfterFirst);
  });
});
