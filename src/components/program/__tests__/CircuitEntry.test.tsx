import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

import CircuitEntry from "../CircuitEntry";

describe("CircuitEntry (Circ1 (8))", () => {
  it("opens circuit mode from Train, beside Empty workout", () => {
    render(
      <MemoryRouter>
        <CircuitEntry />
      </MemoryRouter>
    );
    // Named by its words as drawn, the title first (WCAG 2.5.3): axe's
    // label-content-name-mismatch refused a name of the title alone.
    const entry = screen.getByRole("link", {
      name: "Circuit Work and rest on a clock, 10 to 30 min.",
    });
    expect(entry).toHaveAttribute("href", "/circuit");
  });
});
