/**
 * The paused run screen's two controls. Resume is the coral fill; Stop is
 * a grey ring like Pause and Lock. It was a red ring, which put red beside
 * the coral and called stopping destructive, though stopping keeps the run
 * (red belongs to Discard, inside Stop's confirm).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@/hooks/useDistanceUnit", () => ({
  useDistanceUnit: () => "km" as const,
}));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

import RunBottomSheet from "../RunBottomSheet";

afterEach(() => cleanup());

function renderPaused() {
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
      onStop={vi.fn()}
      onDiscard={vi.fn()}
      weightKg={72}
    />
  );
}

describe("RunBottomSheet — the paused controls", () => {
  it("draws Stop as a grey ring, with no red", () => {
    renderPaused();
    const stop = screen.getByRole("button", { name: "Stop run" });
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
    const stop = screen.getByRole("button", { name: "Stop run" });
    expect(stop.getAttribute("style")).not.toContain("rgb(212, 99, 122)");
  });
});
