/**
 * RoutePlannerSheet exit-affordance contract.
 *
 * Regression guard for "no way off this page": the planner opens on an empty
 * state (0 waypoints) and previously exposed NO visible dismiss control — the
 * Dialog's optional X wasn't enabled, and the only other in-panel buttons
 * (undo/clear) were shown-but-disabled, reading as broken navigation. These
 * pins the empty state: a working Close, and undo/clear absent until there's
 * a point to act on.
 *
 * maplibre-gl is mocked to a no-op map — the planner instantiates a real
 * GL map on open, which jsdom can't provide.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import RoutePlannerSheet from "../RoutePlannerSheet";

/* The planner shows its route length, so it reads the display unit — and
   `useAuth` throws outside an AuthProvider, which this suite doesn't
   render. Mocking the one-export hook keeps the blast radius at one
   symbol; metric is the default, so the assertions are unaffected. */
vi.mock("@/hooks/useDistanceUnit", () => ({
  useDistanceUnit: () => "km" as const,
}));

// The road-aware layer (Run11/Mapbox) reads Pro entitlement via
// useSubscription → useAuth, which needs AuthProvider. Mock it like the
// other useSubscription consumers (HeroDrillDownSheet.test.tsx) — these
// exit-affordance pins are entitlement-independent, and the road
// actions stay hidden anyway (VITE_ROUTE_PLANNING_ENABLED is unset).
vi.mock("@/lib/subscription", () => ({
  useSubscription: () => ({
    tier: "free",
    isInTrial: false,
    trialDaysLeft: 0,
    isPro: false,
  }),
}));

/** Every `new maplibregl.Map(...)` option bag, so the OPENING VIEW can be
 *  asserted — which is the thing that was broken and unpinned. */
const mapOpts = vi.hoisted(
  () => [] as { center: [number, number]; zoom: number }[]
);

vi.mock("maplibre-gl/dist/maplibre-gl.css", () => ({}));
vi.mock("maplibre-gl", () => {
  class FakeMap {
    constructor(opts: { center: [number, number]; zoom: number }) {
      mapOpts.push(opts);
    }
    on() {}
    once() {}
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
  return { default: { Map: FakeMap } };
});

afterEach(() => {
  cleanup();
  mapOpts.length = 0;
});

function setup(
  overrides: Partial<React.ComponentProps<typeof RoutePlannerSheet>> = {}
) {
  const onClose = vi.fn();
  render(
    <RoutePlannerSheet
      open
      onClose={onClose}
      initialCenter={{ lat: 51.5, lon: -0.12 }}
      onSave={vi.fn().mockResolvedValue(true)}
      onFollow={vi.fn()}
      {...overrides}
    />
  );
  return { onClose };
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
