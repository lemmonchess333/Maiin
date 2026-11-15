import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { GPSPoint } from "@/lib/gps";

const state = vi.hoisted(() => ({
  load: [] as (() => void)[],
  sources: {} as Record<string, { setData: ReturnType<typeof vi.fn> }>,
  markers: [] as [number, number][],
}));
vi.mock("maplibre-gl", () => ({
  setWorkerUrl: vi.fn(),
  AttributionControl: class {},
  Map: class {
    on(event: string, fn: () => void) {
      if (event === "load") state.load.push(fn);
      return this;
    }
    once() {
      return this;
    }
    off() {
      return this;
    }
    addControl() {
      return this;
    }
    addSource(name: string) {
      state.sources[name] = { setData: vi.fn() };
    }
    getSource(name: string) {
      return state.sources[name];
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
    setLngLat(at: [number, number]) {
      state.markers.push(at);
      return this;
    }
    addTo() {
      return this;
    }
    remove() {}
  },
}));
import RunMap from "../RunMap";
const p = (lon: number, timestamp: number, breakBefore = false): GPSPoint => ({
  lat: 51.5,
  lon,
  rawLat: 51.5,
  rawLon: lon,
  timestamp,
  breakBefore,
  altitude: 10,
  accuracy: 5,
  speed: 3,
});
afterEach(() => {
  cleanup();
  state.load = [];
  state.sources = {};
  state.markers = [];
});

it("draws actual gaps in both the base route and pace overlay", () => {
  const points = [
    p(-0.01, 1000),
    p(-0.005, 2000),
    p(0.005, 3000, true),
    p(0.01, 4000),
  ];
  render(
    <RunMap
      points={points}
      currentPoint={null}
      paceColored
      avgPaceSecPerKm={300}
      targetRoute={points}
    />
  );
  act(() => state.load.forEach((fn) => fn()));
  const route = state.sources.route.setData.mock.calls.at(-1)![0];
  expect(route.geometry).toEqual({
    type: "MultiLineString",
    coordinates: [
      [
        [-0.01, 51.5],
        [-0.005, 51.5],
      ],
      [
        [0.005, 51.5],
        [0.01, 51.5],
      ],
    ],
  });
  const pace = state.sources["pace-segments"].setData.mock.calls.at(-1)![0];
  expect(pace.features).toHaveLength(2);
  expect(
    pace.features.map(
      (feature: { geometry: { coordinates: number[][] } }) =>
        feature.geometry.coordinates
    )
  ).toEqual(route.geometry.coordinates);
  expect(
    state.sources["target-route"].setData.mock.calls.at(-1)![0].geometry
  ).toEqual(route.geometry);
});

it("puts no start or finish dot on a route whose ends were cut off", () => {
  // A public post's map (App1 Q51): the line's ends are not where the run
  // began or finished, so no dot says they are.
  const points = [p(-0.01, 1000), p(0, 2000), p(0.01, 3000)];
  render(<RunMap points={points} currentPoint={null} endMarkers={false} />);
  act(() => state.load.forEach((fn) => fn()));
  // Anchored: the route itself was drawn.
  expect(state.sources.route.setData).toHaveBeenCalled();
  expect(state.markers).toEqual([]);
});

it("marks a finished route's start and finish by default", () => {
  const points = [p(-0.01, 1000), p(0, 2000), p(0.01, 3000)];
  render(<RunMap points={points} currentPoint={null} />);
  act(() => state.load.forEach((fn) => fn()));
  expect(state.markers).toEqual([
    [-0.01, 51.5],
    [0.01, 51.5],
  ]);
});
