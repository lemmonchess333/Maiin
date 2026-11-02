/**
 * The live pace while the clock is held. Auto-paused at a junction, the
 * sheet read "0:35 /km": the last half-minute of moving time ended where
 * the runner stopped, and a GPS step in it made a pace no one runs. While
 * the clock is held there is no live pace to show.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { GPSPoint } from "@/lib/gps";

vi.mock("@/hooks/useDistanceUnit", () => ({
  useDistanceUnit: () => "km" as const,
}));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

import RunBottomSheet from "../RunBottomSheet";

afterEach(() => cleanup());

/** A steady 6:00 /km: about 2.78 m north every second for a minute. */
function steadyRun(): GPSPoint[] {
  const start = Date.UTC(2026, 10, 2, 8, 0, 0);
  return Array.from({ length: 61 }, (_, i) => ({
    lat: 51.44 + (i * 2.778) / 111_320,
    lon: -0.15,
    altitude: 20,
    accuracy: 5,
    timestamp: start + i * 1000,
    speed: 2.778,
  })) as GPSPoint[];
}

function sheet(paceHeld: boolean) {
  return render(
    <RunBottomSheet
      elapsed={60}
      distance={167}
      points={steadyRun()}
      formatTime={(s: number) =>
        `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
      }
      onPause={vi.fn()}
      onLock={vi.fn()}
      isPaused={false}
      paceHeld={paceHeld}
      onResume={vi.fn()}
      onStop={vi.fn()}
      onDiscard={vi.fn()}
      weightKg={72}
    />
  );
}

describe("RunBottomSheet — the live pace", () => {
  it("shows the last half-minute's pace while running", () => {
    sheet(false);
    expect(screen.getAllByText(/^6:0\d$/).length).toBeGreaterThan(0);
    expect(screen.queryByText("--:--")).not.toBeInTheDocument();
  });

  it("shows no pace while the clock is held", () => {
    sheet(true);
    expect(screen.getAllByText("--:--").length).toBeGreaterThan(0);
    expect(screen.queryByText(/^6:0\d$/)).not.toBeInTheDocument();
  });
});
