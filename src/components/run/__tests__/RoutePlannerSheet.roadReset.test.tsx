/**
 * RoutePlannerSheet — closing the planner discards the road layer.
 *
 * Today's parent mounts the sheet only while it is open, so closing
 * unmounts it and that alone throws the road route away. The sheet keeps
 * the invariant itself for a parent that holds it mounted across closes:
 * the road route and the in-flight marker are cleared on every open/close
 * change, so a re-opened planner starts from the straight draft. Driven
 * here as that parent would drive it, open → closed → open on one
 * instance.
 *
 * Separate from RoutePlannerSheet.test.tsx because the road layer has to
 * be ON (Pro + the planning flag), and that suite pins the planner with
 * it off.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import RoutePlannerSheet from "../RoutePlannerSheet";

vi.mock("@/hooks/useDistanceUnit", () => ({
  useDistanceUnit: () => "km" as const,
}));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/subscription", () => ({
  useSubscription: () => ({
    tier: "pro",
    isInTrial: false,
    trialDaysLeft: 0,
    isPro: true,
  }),
}));

const road = vi.hoisted(() => ({ align: vi.fn() }));
vi.mock("@/lib/routePlanningApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/routePlanningApi")>()),
  isRoutePlanningEnabled: () => true,
  alignRouteToRoads: (...args: unknown[]) => road.align(...args),
}));

/** The map's tap handlers, newest last — how a test drops a waypoint. */
const taps = vi.hoisted(
  () => [] as ((e: { lngLat: { lat: number; lng: number } }) => void)[]
);
vi.mock("maplibre-gl/dist/maplibre-gl.css", () => ({}));
vi.mock("maplibre-gl", () => {
  class FakeMap {
    on(event: string, handler: (typeof taps)[number]) {
      if (event === "click") taps.push(handler);
    }
    once() {}
    off() {}
    addControl() {}
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
  taps.length = 0;
  road.align.mockReset();
});

function tap(lat: number, lng: number) {
  act(() => {
    taps[taps.length - 1]({ lngLat: { lat, lng } });
  });
}

describe("RoutePlannerSheet — road layer across a close", () => {
  it("a re-opened planner starts from the straight draft, not the last road route", async () => {
    road.align.mockResolvedValue({
      points: [
        { lat: 51.5, lon: -0.12 },
        { lat: 51.505, lon: -0.125 },
        { lat: 51.51, lon: -0.13 },
      ],
      distanceM: 1800,
      durationS: null,
    });
    const props = {
      onClose: vi.fn(),
      initialCenter: { lat: 51.5, lon: -0.12 },
      onSave: vi.fn().mockResolvedValue(true),
      onFollow: vi.fn(),
    };
    const view = render(<RoutePlannerSheet open {...props} />);
    tap(51.5, -0.12);
    tap(51.51, -0.13);
    fireEvent.click(screen.getByRole("button", { name: "Align to roads" }));
    // POSITIVE anchor: the road route is showing.
    expect(
      await screen.findByText(/Road route via Mapbox/)
    ).toBeInTheDocument();

    view.rerender(<RoutePlannerSheet open={false} {...props} />);
    view.rerender(<RoutePlannerSheet open {...props} />);

    expect(screen.getByText(/Point-to-point distance/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Align to roads" })
    ).toBeInTheDocument();
  });
});
