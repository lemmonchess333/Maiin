import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import CalorieRing from "../CalorieRing";

vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

/**
 * The compact ring is Home's: the Food page's ring at a smaller size, so
 * the two screens draw the same object. The box and the number step
 * down; the mode pill keeps its 11px caption, which is the floor.
 */
describe("CalorieRing — compact size", () => {
  function draw(size?: "hero" | "compact") {
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
    const number = ring.querySelector("p")!;
    const pill = screen.getByText("kcal left");
    return {
      ring: ring.className,
      number: number.className,
      pill: pill.className,
    };
  }

  it("keeps the Food page's ring as the default", () => {
    const hero = draw();
    expect(hero.ring).toContain("size-40");
    expect(hero.number).toContain("text-4xl");
  });

  it("draws Home's ring smaller, with the pill still at the caption size", () => {
    const compact = draw("compact");
    expect(compact.ring).toContain("size-26");
    expect(compact.ring).not.toContain("size-40");
    expect(compact.number).toContain("text-2xl");
    expect(compact.pill).toContain("text-caption");
  });
});
