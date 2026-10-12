/**
 * The bar under the live figures that fills to the next kilometre. The
 * sheet opens expanded, where its column is centred, and a centred column
 * sizes a row to its content: without `w-full` the bar had no width, and
 * its two labels sat side by side with nothing between them.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@/hooks/useDistanceUnit", () => ({
  useDistanceUnit: () => "km" as const,
}));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

import RunBottomSheet from "../RunBottomSheet";

afterEach(() => cleanup());

describe("RunBottomSheet — the km bar", () => {
  it("spans its row in the sheet a run opens on, between spaced labels", () => {
    render(
      <RunBottomSheet
        elapsed={58}
        distance={160}
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
    const row = screen.getByText("0 km").parentElement!;
    expect(screen.getByText("1 km").parentElement).toBe(row);
    expect(row.className).toMatch(/\bw-full\b/);
  });
});
