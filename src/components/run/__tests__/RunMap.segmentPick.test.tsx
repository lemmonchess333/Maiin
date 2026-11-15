/**
 * The run's map while a segment is made (Run26 call 3): the stretch is drawn
 * over the route by point index, both ends included, and redrawn as its
 * ends move; a tap reports where it landed. A map with no stretch never
 * touches the layer. maplibre-gl is stood in, as in the other RunMap tests.
 */
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { GPSPoint } from "@/lib/gps";

const state = vi.hoisted(() => ({
  load: [] as (() => void)[],
  click: [] as ((e: { lngLat: { lat: number; lng: number } }) => void)[],
  sources: {} as Record<string, { setData: ReturnType<typeof vi.fn> }>,
  layers: [] as string[],
}));
vi.mock("maplibre-gl", () => ({
  setWorkerUrl: vi.fn(),
  AttributionControl: class {},
  Map: class {
    on(event: string, fn: never) {
      if (event === "load") state.load.push(fn);
      if (event === "click") state.click.push(fn);
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
    addLayer(layer: { id: string }) {
      state.layers.push(layer.id);
    }
    setLayoutProperty() {}
    loaded() {
      return state.load.length === 0;
    }
    fitBounds() {}
    remove() {}
  },
  Marker: class {
    setLngLat() {
      return this;
    }
    addTo() {
      return this;
    }
    remove() {}
  },
}));
import RunMap from "../RunMap";

const p = (i: number): GPSPoint => ({
  lat: 51.5,
  lon: i * 0.001,
  rawLat: 51.5,
  rawLon: i * 0.001,
  timestamp: i * 1000,
  altitude: 10,
  accuracy: 5,
  speed: 3,
});
const points = Array.from({ length: 6 }, (_, i) => p(i));

afterEach(() => {
  cleanup();
  state.load = [];
  state.click = [];
  state.sources = {};
  state.layers = [];
});

const loadMap = () =>
  act(() => {
    const fns = state.load;
    state.load = [];
    fns.forEach((fn) => fn());
  });

it("draws the stretch over the route, both ends included, and redraws it as they move", () => {
  const view = render(
    <RunMap
      points={points}
      currentPoint={null}
      highlight={{ from: 1, to: 3 }}
    />
  );
  loadMap();
  // Above the route's own lines.
  expect(state.layers.slice(-2)).toEqual([
    "segment-pick-casing",
    "segment-pick-line",
  ]);
  const drawn = () =>
    state.sources["segment-pick"].setData.mock.calls.at(-1)![0];
  expect(drawn().features[0].geometry.coordinates).toEqual([
    [0.001, 51.5],
    [0.002, 51.5],
    [0.003, 51.5],
  ]);

  view.rerender(
    <RunMap
      points={points}
      currentPoint={null}
      highlight={{ from: 2, to: 5 }}
    />
  );
  expect(drawn().features[0].geometry.coordinates).toHaveLength(4);

  // Closed: cleared.
  view.rerender(
    <RunMap points={points} currentPoint={null} highlight={null} />
  );
  expect(drawn().features).toEqual([]);
});

it("leaves the layer alone on a map that never had a stretch", () => {
  render(<RunMap points={points} currentPoint={null} />);
  loadMap();
  // POSITIVE anchor: the layer exists, ready for one.
  expect(state.sources["segment-pick"]).toBeDefined();
  expect(state.sources["segment-pick"].setData).not.toHaveBeenCalled();
});

it("reports where a tap landed", () => {
  const onMapTap = vi.fn();
  render(<RunMap points={points} currentPoint={null} onMapTap={onMapTap} />);
  // The map's own tap listener is the last one: the credit adds its first.
  act(() => state.click.at(-1)!({ lngLat: { lat: 51.5, lng: 0.004 } }));
  expect(onMapTap).toHaveBeenCalledWith({ lat: 51.5, lon: 0.004 });
});
