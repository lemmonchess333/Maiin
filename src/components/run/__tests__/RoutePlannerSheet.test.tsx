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

vi.mock("maplibre-gl/dist/maplibre-gl.css", () => ({}));
vi.mock("maplibre-gl", () => {
  class FakeMap {
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

afterEach(() => cleanup());

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
