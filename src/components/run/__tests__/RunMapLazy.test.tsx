import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  fail: true,
  map: { on: vi.fn(), off: vi.fn(), remove: vi.fn() },
}));
vi.mock("maplibre-gl", () => ({
  default: {
    Map: vi.fn(function () {
      if (h.fail) throw new Error("Failed to initialize WebGL");
      return h.map;
    }),
  },
}));
import RunMapLazy from "../RunMapLazy";

beforeEach(() => {
  h.fail = true;
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("optional run map", () => {
  it("contains a WebGL constructor failure without unmounting run controls", async () => {
    const pause = vi.fn();
    render(
      <>
        <RunMapLazy points={[]} currentPoint={null} liveControls />
        <button onClick={pause}>Pause run</button>
      </>
    );
    expect(await screen.findByText("Map unavailable")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Pause run" }));
    expect(pause).toHaveBeenCalledOnce();
    expect(
      screen.getByText(/depends on GPS permission and signal/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/still being recorded/)).not.toBeInTheDocument();
  });
  it("uses saved-run copy outside a live session", async () => {
    render(<RunMapLazy points={[]} currentPoint={null} height="h-44" />);
    expect(
      await screen.findByText("Your saved run details are still available.")
    ).toBeInTheDocument();
  });
  it("still mounts and cleans up a supported map", async () => {
    h.fail = false;
    const view = render(<RunMapLazy points={[]} currentPoint={null} />);
    // Suspense resolves the module; the map subscribes to its load event.
    await vi.waitFor(() =>
      expect(h.map.on).toHaveBeenCalledWith("load", expect.any(Function))
    );
    expect(screen.queryByText("Map unavailable")).not.toBeInTheDocument();
    view.unmount();
    expect(h.map.remove).toHaveBeenCalledOnce();
  });
});
