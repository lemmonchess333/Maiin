import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

import FoodTargetsLink from "../FoodTargetsLink";

describe("FoodTargetsLink", () => {
  it("deep-links to the focused nutrition editor, not the Settings list", () => {
    render(
      <MemoryRouter>
        <FoodTargetsLink />
      </MemoryRouter>
    );
    const gear = screen.getByRole("link", {
      name: /adjust nutrition targets/i,
    });
    expect(gear).toHaveAttribute("href", "/settings/nutrition");
  });

  it("is a 44px target, in px so large text cannot grow it off the row", () => {
    render(
      <MemoryRouter>
        <FoodTargetsLink />
      </MemoryRouter>
    );
    // 44px is the floor for anything tapped (DESIGN_GUIDE §0).
    expect(
      screen.getByRole("link", { name: /adjust nutrition targets/i })
    ).toHaveClass("size-[44px]");
  });
});
