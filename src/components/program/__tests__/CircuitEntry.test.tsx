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
    const entry = screen.getByRole("link", { name: "Circuit" });
    expect(entry).toHaveAttribute("href", "/circuit");
    expect(entry).toHaveAccessibleDescription(
      "Work and rest on a clock, 10 to 30 min. Your plan stays as it is."
    );
  });
});
