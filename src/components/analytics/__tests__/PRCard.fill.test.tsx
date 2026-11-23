import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import PRCard from "../PRCard";

/**
 * The personal-records card draws as a card. Its gold tint was set with
 * the `background` shorthand, which resets the colour `bg-card` sets, so
 * the card had no fill: on dark the lit edge (DS6) framed the page's own
 * colour, and on light it was the page with no white card, unlike the
 * records table beside it (PRsTab).
 */
const prs = [
  { label: "Longest run", value: "21.1 km", date: "22 Aug" },
  { label: "Fastest 5K", value: "24:10", date: "18 Aug" },
];

function card() {
  render(<PRCard title="Running bests" prs={prs} />);
  return screen
    .getByRole("heading", { name: "Running bests" })
    .closest(".bg-card") as HTMLElement;
}

describe("PRCard keeps its fill", () => {
  it("sets its tint as an image over the card's colour, never the shorthand", () => {
    const el = card();
    expect(el).not.toBeNull();
    const style = el.getAttribute("style") ?? "";
    expect(style).toMatch(/background-image:\s*linear-gradient/);
    // The shorthand would reset background-color and wipe bg-card.
    expect(style).not.toMatch(/(^|;)\s*background:/);
  });

  it("is drawn as the records table beside it: radius and shadow in both themes", () => {
    const el = card();
    expect(el.className).toContain("rounded-2xl");
    expect(el.className.split(/\s+/)).toContain("card-shadow");
  });
});
