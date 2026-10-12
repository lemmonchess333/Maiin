/**
 * The run maps draw OpenFreeMap's basemap and carry its credit, in a
 * corner the page's own controls leave clear.
 *
 * The live run's sheet covers the bottom of its map in every snap, so its
 * credit goes top-right; every other run map keeps the bottom-left clear
 * (RunDetail's Replay button sits bottom-right).
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  options: [] as { style?: string; attributionControl?: unknown }[],
  corners: [] as string[],
}));
vi.mock("maplibre-gl", () => ({
  setWorkerUrl: vi.fn(),
  AttributionControl: class {},
  Map: class {
    constructor(options: { style?: string; attributionControl?: unknown }) {
      state.options.push(options);
    }
    on() {
      return this;
    }
    once() {
      return this;
    }
    off() {
      return this;
    }
    addControl(_control: unknown, corner: string) {
      state.corners.push(corner);
      return this;
    }
    loaded() {
      return false;
    }
    remove() {}
  },
}));
import RunMap from "../RunMap";

afterEach(() => {
  cleanup();
  state.options = [];
  state.corners = [];
});

it("draws the dark OpenFreeMap style with MapLibre's own credit off", () => {
  render(<RunMap points={[]} currentPoint={null} darkMode />);
  expect(state.options).toHaveLength(1);
  expect(state.options[0].style).toBe(
    "https://tiles.openfreemap.org/styles/dark"
  );
  // Off, so the one credit is the one placed below rather than a second
  // in MapLibre's default corner.
  expect(state.options[0].attributionControl).toBe(false);
});

it("draws the light style on a light map", () => {
  render(<RunMap points={[]} currentPoint={null} darkMode={false} />);
  expect(state.options[0].style).toBe(
    "https://tiles.openfreemap.org/styles/positron"
  );
});

it("puts the live run's credit top-right, clear of the sheet", () => {
  render(<RunMap points={[]} currentPoint={null} interactive liveControls />);
  expect(state.corners).toEqual(["top-right"]);
});

it("puts a saved run's credit bottom-left, clear of Replay", () => {
  render(<RunMap points={[]} currentPoint={null} interactive />);
  expect(state.corners).toEqual(["bottom-left"]);
});

it("marks which basemap it draws, for the credit's dark styling", () => {
  const dark = render(<RunMap points={[]} currentPoint={null} darkMode />);
  expect(
    dark.container
      .querySelector("[data-map-theme]")
      ?.getAttribute("data-map-theme")
  ).toBe("dark");
  dark.unmount();
  const light = render(
    <RunMap points={[]} currentPoint={null} darkMode={false} />
  );
  expect(
    light.container
      .querySelector("[data-map-theme]")
      ?.getAttribute("data-map-theme")
  ).toBe("light");
});
