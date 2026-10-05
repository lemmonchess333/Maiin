import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import CalorieRing from "../CalorieRing";

vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

/**
 * The compact ring is Home's: the Food page's ring at a smaller size, so
 * the two screens draw the same object. The box and the number step
 * down; the label keeps its 12px text, which is the floor.
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
    const label = screen.getByText("kcal left");
    return {
      ring: ring.className,
      number: number.className,
      label: label.className,
    };
  }

  it("keeps the Food page's ring as the default", () => {
    const hero = draw();
    expect(hero.ring).toContain("w-40");
    expect(hero.number).toContain("text-4xl");
    expect(hero.label).toContain("text-xs");
  });

  it("draws Home's ring smaller, with the label still at 12px", () => {
    const compact = draw("compact");
    expect(compact.ring).toContain("w-26");
    expect(compact.ring).not.toContain("w-40");
    expect(compact.number).toContain("text-2xl");
    expect(compact.label).toContain("text-xs");
  });
});
