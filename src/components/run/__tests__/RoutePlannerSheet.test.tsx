/**
 * RoutePlannerSheet — the exit affordance and the straight-line planner.
 *
 * Regression guard for "no way off this page": the planner opens on an empty
 * state (0 waypoints) and previously exposed NO visible dismiss control — the
 * Dialog's optional X wasn't enabled, and the only other in-panel buttons
 * (undo/clear) were shown-but-disabled, reading as broken navigation. These
 * pins the empty state: a working Close, and undo/clear absent until there's
 * a point to act on. The planner draws straight segments only (no road
 * routing), so the tapped points are exactly what it saves and follows.
 *
 * maplibre-gl is mocked to a no-op map that keeps its click handler — the
 * planner instantiates a real GL map on open, which jsdom can't provide.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  act,
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import RoutePlannerSheet from "../RoutePlannerSheet";

/* The planner shows its route length, so it reads the display unit — and
   `useAuth` throws outside an AuthProvider, which this suite doesn't
   render. Mocking the one-export hook keeps the blast radius at one
   symbol; metric is the default, so the assertions are unaffected. */
vi.mock("@/hooks/useDistanceUnit", () => ({
  useDistanceUnit: () => "km" as const,
}));

vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

/** Every `new maplibregl.Map(...)` option bag, so the OPENING VIEW can be
 *  asserted — which is the thing that was broken and unpinned. */
const mapOpts = vi.hoisted(
  () =>
    [] as {
      center: [number, number];
      zoom: number;
      style?: string;
      attributionControl?: unknown;
    }[]
);
/** The corner each control was added in. */
const controlCorners = vi.hoisted(() => [] as string[]);

const mapFailure = vi.hoisted(() => ({ enabled: false }));
/** The map's click handler, so a test can drop points as a tap would. */
const mapClick = vi.hoisted(() => ({
  handler: null as
    null | ((e: { lngLat: { lat: number; lng: number } }) => void),
}));

vi.mock("maplibre-gl/dist/maplibre-gl.css", () => ({}));
vi.mock("maplibre-gl", () => {
  class FakeMap {
    constructor(opts: { center: [number, number]; zoom: number }) {
      if (mapFailure.enabled) throw new Error("WebGL2 unavailable");
      mapOpts.push(opts);
    }
    on(event: string, handler: never) {
      if (event === "click") mapClick.handler = handler;
    }
    once() {}
    off() {}
    addControl(_control: unknown, corner: string) {
      controlCorners.push(corner);
    }
    addSource() {}
    addLayer() {}
    getSource() {
      return undefined;
    }
    isStyleLoaded() {
      return false;
    }
    flyTo() {}
    remove() {}
  }
  return {
    Map: FakeMap,
    AttributionControl: class {},
    setWorkerUrl: vi.fn(),
  };
});

afterEach(() => {
  cleanup();
  mapOpts.length = 0;
  controlCorners.length = 0;
  mapFailure.enabled = false;
  mapClick.handler = null;
});

function setup(
  overrides: Partial<React.ComponentProps<typeof RoutePlannerSheet>> = {}
) {
  const onClose = vi.fn();
  const onSave = vi.fn().mockResolvedValue(true);
  const onFollow = vi.fn();
  render(
    <RoutePlannerSheet
      open
      onClose={onClose}
      initialCenter={{ lat: 51.5, lon: -0.12 }}
      onSave={onSave}
      onFollow={onFollow}
      {...overrides}
    />
  );
  return { onClose, onSave, onFollow };
}

function tap(lat: number, lon: number) {
  act(() => mapClick.handler?.({ lngLat: { lat, lng: lon } }));
}

describe("RoutePlannerSheet — exit affordance", () => {
  it("renders a Close control that dismisses the planner", () => {
    const { onClose } = setup();
    const close = screen.getByRole("button", { name: "Close route planner" });
    fireEvent.click(close);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("hides undo/clear in the empty state (0 waypoints) so they can't read as broken navigation", () => {
    setup();
    expect(
      screen.queryByRole("button", { name: "Undo last point" })
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Clear route" })).toBeNull();
  });

  it("keeps Save & follow disabled with nothing planned", () => {
    setup();
    expect(
      screen.getByRole("button", { name: /Save & follow/ })
    ).toBeDisabled();
  });
});

describe("RoutePlannerSheet — the straight-line planner", () => {
  it("draws, undoes, closes the loop and saves the tapped points", async () => {
    const { onSave, onFollow } = setup();
    tap(51.5, -0.12);
    tap(51.509, -0.12);
    tap(51.509, -0.135);
    tap(51.52, -0.135);
    fireEvent.click(screen.getByRole("button", { name: "Undo last point" }));
    fireEvent.click(screen.getByRole("button", { name: "Close the loop" }));
    expect(
      screen.getByText("Point-to-point distance — segments don't follow roads.")
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Save & follow/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onFollow).toHaveBeenCalledOnce());

    const [, points] = onSave.mock.calls[0];
    expect(
      points.map((p: { lat: number; lon: number }) => [p.lat, p.lon])
    ).toEqual([
      [51.5, -0.12],
      [51.509, -0.12],
      [51.509, -0.135],
      [51.5, -0.12],
    ]);
    expect(onFollow).toHaveBeenCalledWith(points);
  });

  it("offers no road routing", () => {
    setup();
    tap(51.5, -0.12);
    tap(51.509, -0.12);
    expect(screen.queryByRole("button", { name: /roads|loop$/i })).toBeNull();
  });
});

describe("RoutePlannerSheet — where the map opens", () => {
  it("opens on the supplied position at a zoom you can draw a route at", () => {
    setup({ initialCenter: { lat: 51.5072, lon: -0.1276 } });
    expect(mapOpts).toHaveLength(1);
    expect(mapOpts[0].center).toEqual([-0.1276, 51.5072]);
    expect(mapOpts[0].zoom).toBeGreaterThanOrEqual(13);
  });

  it("falls back to the whole world only when it genuinely has no position", () => {
    /* Documents the fallback rather than endorsing it: zoom 2 is the honest
       "we don't know where you are" view, and the sheet fires a one-shot
       geolocation to escape it. The bug was never this branch — it was that
       EVERY user landed here, because no caller passed initialCenter. */
    setup({ initialCenter: null });
    expect(mapOpts[0].zoom).toBeLessThan(5);
  });
});

describe("RoutePlannerSheet — the basemap and its credit", () => {
  it("draws OpenFreeMap's style and puts the credit bottom-left, clear of Locate", () => {
    setup({ darkMode: true });
    expect(mapOpts[0].style).toBe("https://tiles.openfreemap.org/styles/dark");
    // MapLibre's default credit is off so the placed one is the only one.
    expect(mapOpts[0].attributionControl).toBe(false);
    expect(controlCorners).toEqual(["bottom-left"]);
  });

  it("uses the light style for a light planner", () => {
    setup({ darkMode: false });
    expect(mapOpts[0].style).toBe(
      "https://tiles.openfreemap.org/styles/positron"
    );
  });
});

it.each([true, false])(
  "keeps the planner dismissible when WebGL2 fails (dark mode: %s)",
  (darkMode) => {
    mapFailure.enabled = true;
    const { onClose } = setup({ darkMode });
    expect(screen.getByRole("status")).toHaveTextContent("Map unavailable");
    expect(
      screen.getByRole("button", { name: "Centre on my location" })
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /Save & follow/ })
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: "Close route planner" })
    );
    expect(onClose).toHaveBeenCalledOnce();
  }
);
