/**
 * The paused run screen's two controls. Resume is the coral fill; Stop is
 * a grey ring like Pause and Lock. It was a red ring, which put red beside
 * the coral and called stopping destructive, though stopping keeps the run
 * (red belongs to Discard, inside Stop's confirm).
 *
 * Stop is a hold, as Finish is on the running screen (RunFast1 (6)): a
 * hold ends the run, and a tap, a key or a screen reader's activation
 * opens "End run?", which keeps Discard and Keep going.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/hooks/useDistanceUnit", () => ({
  useDistanceUnit: () => "km" as const,
}));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

import RunBottomSheet from "../RunBottomSheet";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const STOP = "Hold to stop run";

function renderPaused() {
  const onStop = vi.fn();
  render(
    <RunBottomSheet
      elapsed={600}
      distance={1800}
      points={[]}
      formatTime={(s: number) =>
        `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
      }
      onPause={vi.fn()}
      onLock={vi.fn()}
      isPaused
      onResume={vi.fn()}
      onStop={onStop}
      onDiscard={vi.fn()}
      weightKg={72}
    />
  );
  return { onStop };
}

describe("RunBottomSheet — the paused controls", () => {
  it("draws Stop as a grey ring, with no red", () => {
    renderPaused();
    const stop = screen.getByRole("button", { name: STOP });
    const style = stop.getAttribute("style") ?? "";
    expect(style).toMatch(/rgba\(255,\s*255,\s*255/);
    expect(stop.outerHTML).not.toMatch(/239,\s*68,\s*68|#EF4444|destructive/i);
  });

  it("greys the clock and says it is paused", () => {
    renderPaused();
    const time = screen.getByTestId("run-hud-time");
    const style = time.getAttribute("style") ?? "";
    expect(style).not.toContain("rgb(212, 99, 122)");
    expect(style).not.toMatch(/text-shadow/);
    expect(screen.getAllByText("Paused").length).toBeGreaterThan(0);
    expect(screen.queryByText("Time")).toBeNull();
    // The calories say the unit the summary and the run page say.
    expect(screen.getByText("kcal")).toBeInTheDocument();
    expect(screen.queryByText("cal")).toBeNull();
  });

  it("leaves Resume the one coral fill", () => {
    renderPaused();
    const resume = screen.getByRole("button", { name: "Resume run" });
    expect(resume.getAttribute("style")).toContain("rgb(212, 99, 122)");
    const stop = screen.getByRole("button", { name: STOP });
    expect(stop.getAttribute("style")).not.toContain("rgb(212, 99, 122)");
  });
});

describe("RunBottomSheet — the paused Stop is a hold", () => {
  it("names the gesture and keeps the word on screen in its name", () => {
    renderPaused();
    const stop = screen.getByRole("button", { name: STOP });
    // The caption under it says Stop, and the name holds the word.
    expect(screen.getByText("Stop")).toBeInTheDocument();
    expect(stop.getAttribute("aria-label")?.toLowerCase()).toContain("stop");
    expect(screen.queryByRole("button", { name: "Stop run" })).toBeNull();
  });

  it("ends the run on a full hold, with no dialog", () => {
    let now = 0;
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("performance", { now: () => now });
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    const { onStop } = renderPaused();
    const stop = screen.getByRole("button", { name: STOP });
    fireEvent.pointerDown(stop);
    now = 1600;
    frames.shift()?.(0);
    expect(onStop).toHaveBeenCalledTimes(1);
    fireEvent.pointerUp(stop);
    fireEvent.click(stop);
    expect(screen.queryByText("End run?")).toBeNull();
  });

  it("opens End run? on a tap, as it always has", () => {
    const { onStop } = renderPaused();
    fireEvent.click(screen.getByRole("button", { name: STOP }));
    expect(screen.getByText("End run?")).toBeInTheDocument();
    expect(onStop).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "End run" }));
    expect(onStop).toHaveBeenCalledTimes(1);
  });
});
