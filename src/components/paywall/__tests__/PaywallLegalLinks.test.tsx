import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PaywallLegalLinks } from "../PaywallLegalLinks";

/** Guideline 3.1.2 pin: purchase surfaces carry functional legal links. */
describe("PaywallLegalLinks", () => {
  it("links Terms and Privacy to the in-app legal routes", () => {
    render(
      <MemoryRouter>
        <PaywallLegalLinks />
      </MemoryRouter>
    );
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute(
      "href",
      "/terms"
    );
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute(
      "href",
      "/privacy"
    );
  });
});
