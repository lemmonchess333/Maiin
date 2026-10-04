/**
 * The numbered markers along a run's route count the laps the splits
 * under the map count: kilometres, or miles for a runner who reads miles.
 * They were placed every kilometre for everyone, so a mile runner's map
 * said "3" where their splits table had reached mile 2.
 */
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { GPSPoint } from "@/lib/gps";

const state = vi.hoisted(() => ({
  load: [] as (() => void)[],
  markers: [] as { label: string; removed: boolean }[],
}));
vi.mock("maplibre-gl", () => ({
  setWorkerUrl: vi.fn(),
  Map: class {
    on(event: string, fn: () => void) {
      if (event === "load") state.load.push(fn);
      return this;
    }
    off() {
      return this;
    }
    addSource() {}
    getSource() {
      return { setData: vi.fn() };
    }
    addLayer() {}
    setLayoutProperty() {}
    loaded() {
      return false;
    }
    fitBounds() {}
    remove() {}
  },
  Marker: class {
    record: { label: string; removed: boolean };
    constructor(options?: { element?: HTMLElement }) {
      this.record = {
        label: options?.element?.textContent ?? "",
        removed: false,
      };
      state.markers.push(this.record);
    }
    setLngLat() {
      return this;
    }
    addTo() {
      return this;
    }
    remove() {
      this.record.removed = true;
    }
  },
}));
import RunMap from "../RunMap";

/** About 3.5 km due east, a fix every ~70 m. */
const route: GPSPoint[] = Array.from({ length: 51 }, (_, i) => ({
  lat: 51.5,
  lon: i * 0.001,
  rawLat: 51.5,
  rawLon: i * 0.001,
  timestamp: 1_700_000_000_000 + i * 20_000,
  altitude: 10,
  accuracy: 5,
  speed: 3,
}));

/** The numbered markers on the map, in the order they were placed. */
const lapMarkers = () =>
  state.markers
    .filter((marker) => !marker.removed && /^\d+$/.test(marker.label))
    .map((marker) => marker.label);

afterEach(() => {
  cleanup();
  state.load = [];
  state.markers = [];
});

it("numbers each kilometre for a runner who reads kilometres", () => {
  render(<RunMap points={route} currentPoint={null} distanceMarkers />);
  act(() => state.load.forEach((fn) => fn()));
  expect(lapMarkers()).toEqual(["1", "2", "3"]);
});

it("numbers each mile for a runner who reads miles", () => {
  render(
    <RunMap
      points={route}
      currentPoint={null}
      distanceMarkers
      markerUnit="mi"
    />
  );
  act(() => state.load.forEach((fn) => fn()));
  expect(lapMarkers()).toEqual(["1", "2"]);
});

it("starts the count over when the unit changes", () => {
  const { rerender } = render(
    <RunMap points={route} currentPoint={null} distanceMarkers />
  );
  act(() => state.load.forEach((fn) => fn()));
  expect(lapMarkers()).toEqual(["1", "2", "3"]);
  rerender(
    <RunMap
      points={route}
      currentPoint={null}
      distanceMarkers
      markerUnit="mi"
    />
  );
  act(() => state.load.forEach((fn) => fn()));
  expect(lapMarkers()).toEqual(["1", "2"]);
});
