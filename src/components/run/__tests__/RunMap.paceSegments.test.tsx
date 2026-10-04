/**
 * The pace-coloured route colours each stretch by its pace against the
 * run's average. Nothing is recorded while a run is paused, so the line
 * from where the runner stopped to where they set off was timed on the
 * wall clock and drawn as the slowest stretch of the run. It has no pace,
 * and gets no pace colour.
 */
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { GPSPoint } from "@/lib/gps";
import { THEME } from "@/lib/theme";

const state = vi.hoisted(() => ({
  load: [] as (() => void)[],
  sources: {} as Record<string, { setData: ReturnType<typeof vi.fn> }>,
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

/** A fix every 20 s, ~70 m apart (a 4:46 /km run), with the time held
 *  before it. */
const fix = (i: number, pausedMs = 0): GPSPoint => ({
  lat: 51.5,
  lon: i * 0.001,
  rawLat: 51.5,
  rawLon: i * 0.001,
  timestamp: 1_700_000_000_000 + i * 20_000 + pausedMs,
  altitude: 10,
  accuracy: 5,
  speed: 3,
  ...(pausedMs > 0 ? { pausedMs } : {}),
});

afterEach(() => {
  cleanup();
  state.load = [];
  state.sources = {};
});

it("gives the line across a pause no pace colour", () => {
  // Three stretches at an even pace, a five-minute pause, then two more.
  const held = 5 * 60_000;
  const points = [
    fix(0),
    fix(1),
    fix(2),
    fix(3),
    fix(4, held),
    fix(5, held),
    fix(6, held),
  ];
  render(
    <RunMap
      points={points}
      currentPoint={null}
      paceColored
      avgPaceSecPerKm={(20 / 69.4) * 1000}
    />
  );
  act(() => state.load.forEach((fn) => fn()));
  const pace = state.sources["pace-segments"].setData.mock.calls.at(-1)![0];
  const colours = pace.features.map(
    (feature: { properties: { color: string } }) => feature.properties.color
  );
  // Five run stretches, every one at the run's own pace, so every one in
  // the middle step; the sixth line, the one across the pause, is not
  // among them.
  expect(colours).toHaveLength(5);
  expect(new Set(colours)).toEqual(new Set([THEME.warning]));
});
