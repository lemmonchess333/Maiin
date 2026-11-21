/**
 * The run panel on the iPhone Duo's inner display open on its side
 * (index.css `split`): docked beside the map, always showing the figures,
 * not dragged. Folding the phone mid-run is a resize of the same page, so
 * the panel changes its props, never its identity: the snap the runner
 * left it at is kept for when the phone folds back.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { SPLIT_QUERY } from "@/lib/wideScreen";

vi.mock("@/hooks/useDistanceUnit", () => ({
  useDistanceUnit: () => "km" as const,
}));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

import RunBottomSheet from "../RunBottomSheet";

const original = window.matchMedia;
afterEach(() => {
  cleanup();
  window.matchMedia = original;
});

/** matchMedia answering `split` as the test says, and telling on change. */
function unfoldable(open: boolean) {
  let split = open;
  const listeners = new Set<() => void>();
  window.matchMedia = ((query: string) => ({
    get matches() {
      return query === SPLIT_QUERY ? split : false;
    },
    media: query,
    // Only the split query changes here, so only its listeners hear.
    addEventListener: (_: string, fn: () => void) => {
      if (query === SPLIT_QUERY) listeners.add(fn);
    },
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  })) as unknown as typeof window.matchMedia;
  return (next: boolean) =>
    act(() => {
      split = next;
      for (const fn of listeners) fn();
    });
}

function sheet() {
  return render(
    <RunBottomSheet
      elapsed={754}
      distance={2140}
      points={[]}
      formatTime={(s: number) =>
        `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
      }
      onPause={vi.fn()}
      onLock={vi.fn()}
      isPaused={false}
      onResume={vi.fn()}
      onStop={vi.fn()}
      onDiscard={vi.fn()}
      weightKg={72}
    />
  );
}

describe("RunBottomSheet — docked on the Duo's inner display", () => {
  it("shows the figures however the runner had lowered it, and keeps that for the fold back", () => {
    const setOpen = unfoldable(false);
    sheet();
    const grip = screen.getByRole("button", {
      name: "Drag to resize the run panel",
    });
    // Lowered to the splits view on the outer display.
    fireEvent.keyDown(grip, { key: "ArrowDown" });
    expect(screen.queryByTestId("run-hud-time")).not.toBeInTheDocument();

    // Unfolded: docked, the clock back on screen, the same element.
    const panel = grip.parentElement as HTMLElement;
    setOpen(true);
    expect(panel).toHaveAttribute("data-docked");
    expect(screen.getByTestId("run-hud-time")).toHaveTextContent("12:34");
    expect(grip.parentElement).toBe(panel);

    // Folded again: where the runner left it.
    setOpen(false);
    expect(panel).not.toHaveAttribute("data-docked");
    expect(screen.queryByTestId("run-hud-time")).not.toBeInTheDocument();
  });

  it("is not dragged while docked", () => {
    unfoldable(true);
    sheet();
    const panel = screen.getByTestId("run-hud-time").closest("[data-docked]");
    expect(panel).not.toBeNull();
    // A drag down the docked panel leaves the figures where they are.
    fireEvent.pointerDown(panel as Element, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(panel as Element, { clientY: 700, pointerId: 1 });
    fireEvent.pointerUp(panel as Element, { clientY: 700, pointerId: 1 });
    expect(screen.getByTestId("run-hud-time")).toBeInTheDocument();
  });
});
