/**
 * The live run map's GPS chip: four even bars and a word, the accuracy
 * only beside a warning (owner, 2026-10-16: the red "±52 m" on the map
 * "looks bad").
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import GpsSignalChip from "../GpsSignalChip";
import { gpsSignalBars } from "@/lib/gpsSignal";
import type { GPSSignalQuality } from "@/hooks/useGPS";

function chip(
  signalQuality: GPSSignalQuality,
  accuracy: number | null,
  pointCount = 12
) {
  const { container } = render(
    <GpsSignalChip
      accuracy={accuracy}
      isTracking
      pointCount={pointCount}
      signalQuality={signalQuality}
    />
  );
  const bars = [...container.querySelectorAll("[data-lit]")] as HTMLElement[];
  return {
    container,
    bars,
    lit: bars.filter((b) => b.dataset.lit === "true").length,
  };
}

describe("GpsSignalChip", () => {
  it("shows nothing while the GPS is not tracking", () => {
    const { container } = render(
      <GpsSignalChip
        accuracy={5}
        isTracking={false}
        pointCount={3}
        signalQuality="strong"
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("waits for the first fix with no bars lit", () => {
    const { lit } = chip("strong", 5, 0);
    expect(screen.getByText("Acquiring GPS")).toBeInTheDocument();
    expect(lit).toBe(0);
  });

  it.each([
    ["strong", 5, 4],
    ["good", 12, 3],
    ["fair", 22, 2],
  ] as const)(
    "a %s fix reads GPS with %i m kept off the chip",
    (quality, accuracy, bars) => {
      const { lit, container } = chip(quality, accuracy);
      expect(screen.getByText("GPS")).toBeInTheDocument();
      expect(lit).toBe(bars);
      expect(container.textContent).not.toContain("±");
    }
  );

  it("a weak fix says so, with the accuracy that makes it weak", () => {
    const { lit } = chip("weak", 52.4);
    expect(screen.getByText("Weak GPS")).toBeInTheDocument();
    expect(screen.getByText("±52 m")).toBeInTheDocument();
    expect(lit).toBe(1);
  });

  it("draws four bars of one width, rising evenly", () => {
    const { bars } = chip("strong", 5);
    expect(bars).toHaveLength(4);
    for (const bar of bars) expect(bar.className).toContain("w-[3px]");
    expect(bars.map((b) => b.style.height)).toEqual([
      "3px",
      "6px",
      "9px",
      "12px",
    ]);
  });

  it("lights its bars in the colour the waiting screen's bars use", () => {
    const { bars } = chip("fair", 22);
    const colour = document.createElement("span");
    colour.style.background = gpsSignalBars("fair").colour;
    expect(bars[0].style.background).toBe(colour.style.background);
  });
});
