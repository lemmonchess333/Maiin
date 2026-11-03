/**
 * The medal's drawing (Soc15): the tier's metal from the badges' own
 * palette, the ribbon in the sport's colour, the goal and the edition on
 * it, and hidden from assistive technology unless it is given a name.
 */
import { describe, it, expect } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import MedalArt from "../MedalArt";
import { TIER_PALETTES } from "@/features/streaks/tierPalettes";
import { SPORT_ACCENT } from "../challengeSport";

const props = {
  tier: "gold" as const,
  sport: "running" as const,
  figure: "50",
  unit: "km",
  edition: "Nov 2026",
};

describe("MedalArt", () => {
  it("is struck in the tier's metal, on a ribbon in the sport's colour", () => {
    const { container } = render(<MedalArt {...props} />);
    const stops = [...container.querySelectorAll("stop")].map((s) =>
      s.getAttribute("stop-color")
    );
    expect(stops).toEqual(
      expect.arrayContaining([
        TIER_PALETTES.gold.highlight,
        TIER_PALETTES.gold.base,
        TIER_PALETTES.gold.edge,
      ])
    );
    const fills = [...container.querySelectorAll("polygon")].map((p) =>
      p.getAttribute("fill")
    );
    expect(fills).toContain(SPORT_ACCENT.running);
  });

  it("carries the goal and the edition", () => {
    const { container } = render(<MedalArt {...props} />);
    const words = [...container.querySelectorAll("text")].map(
      (t) => t.textContent
    );
    expect(words).toEqual(["50", "km", "NOV 2026"]);
  });

  it("is hidden from assistive technology unless named", () => {
    const { container, rerender } = render(<MedalArt {...props} />);
    expect(container.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true"
    );
    rerender(<MedalArt {...props} label="Gold medal, November Mileage" />);
    expect(
      screen.getByRole("img", { name: "Gold medal, November Mileage" })
    ).toBeInTheDocument();
  });

  it("draws the illustration when there is one, with the goal and the edition over it", () => {
    const { container } = render(
      <MedalArt {...props} imageSrc="/medals/monthly-mileage-gold.webp" />
    );
    const image = container.querySelector("image");
    expect(image).toHaveAttribute("href", "/medals/monthly-mileage-gold.webp");
    expect(container.firstElementChild).toHaveAttribute(
      "data-medal-art",
      "image"
    );
    // The art carries its own emblem, so the sport's icon is not drawn.
    expect(container.querySelectorAll("svg svg")).toHaveLength(0);
    const words = [...container.querySelectorAll("svg > text")].map(
      (t) => t.textContent
    );
    expect(words).toEqual(["50km", "NOV 2026"]);
    expect(container.querySelector("tspan")).toHaveTextContent("km");
  });

  it("falls back to the drawn medal when the illustration fails to load", () => {
    const { container } = render(
      <MedalArt {...props} imageSrc="/medals/missing.webp" />
    );
    fireEvent.error(container.querySelector("image")!);
    expect(container.querySelector("image")).toBeNull();
    expect(container.firstElementChild).toHaveAttribute(
      "data-medal-art",
      "drawn"
    );
    expect(container.querySelectorAll("svg svg")).toHaveLength(1);
  });

  it("keeps its 3:4 size in px", () => {
    const { container } = render(<MedalArt {...props} size={60} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("width")).toBe("60");
    expect(svg.getAttribute("height")).toBe("80");
  });
});
