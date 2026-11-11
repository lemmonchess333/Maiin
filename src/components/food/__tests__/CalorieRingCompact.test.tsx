import { describe, it, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import CalorieRing from "../CalorieRing";

vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

/**
 * The compact ring is Home's: the Food page's wheel at a smaller size, so
 * the two screens draw the same object. The box and the number step
 * down; the label keeps its 12px text, which is the floor.
 *
 * Food's own is 264px on the page since Food11 call 2. The 176px ring it
 * drew in its card until then is `size="card"`, which the paywall's scan
 * demo still draws.
 */
describe("CalorieRing — the three sizes", () => {
  function draw(size?: "hero" | "card" | "compact") {
    render(
      <CalorieRing
        consumed={1285}
        target={2350}
        mode="left"
        onToggleMode={() => {}}
        trajectoryLabel={null}
        size={size}
      />
    );
    const ring = screen.getByRole("button");
    const [number, label] = Array.from(ring.querySelectorAll("p"));
    const out = {
      ring: ring.className,
      number: number.className,
      label: label.className,
    };
    cleanup();
    return out;
  }

  it("keeps the Food page's wheel as the default, its figure the largest text", () => {
    // 264px, the figure sized from the ring up to the display size.
    const hero = draw();
    expect(hero.ring).toContain("w-[264px]");
    expect(hero.ring).toContain("max-w-full");
    expect(hero.number).toContain("var(--text-display)");
    expect(hero.label).toContain("text-sm");
  });

  it("keeps the 176px ring for a card, with the 12px label", () => {
    const card = draw("card");
    expect(card.ring).toContain("w-44");
    expect(card.ring).not.toContain("w-[264px]");
    expect(card.number).toContain("var(--text-display)");
    expect(card.label).toContain("text-xs");
  });

  it("draws Home's ring smaller, with the label still at 12px", () => {
    const compact = draw("compact");
    expect(compact.ring).toContain("w-26");
    expect(compact.ring).not.toContain("w-44");
    expect(compact.number).toContain("text-2xl");
    expect(compact.label).toContain("text-xs");
  });
});
