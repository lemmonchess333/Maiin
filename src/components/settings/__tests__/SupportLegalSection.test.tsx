import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SupportLegalSection from "../SupportLegalSection";

describe("SupportLegalSection", () => {
  it("offers help, reporting and the legal pages", () => {
    render(
      <MemoryRouter>
        <SupportLegalSection inline />
      </MemoryRouter>
    );
    expect(
      screen.getByRole("link", { name: /Help & support/ })
    ).toHaveAttribute("href", expect.stringMatching(/^mailto:/));
    expect(
      screen.getByRole("link", { name: /Report objectionable content/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Privacy Policy" })
    ).toHaveAttribute("href", "/privacy");
    expect(
      screen.getByRole("link", { name: "Terms of Service" })
    ).toHaveAttribute("href", "/terms");
  });

  /* Its "Show me around" replayed Home's first-visit walk, which went with
     the older first-week journey (App1, whole-app grill Q27). */
  it("no longer offers a walk through Home", () => {
    render(
      <MemoryRouter>
        <SupportLegalSection inline />
      </MemoryRouter>
    );
    expect(screen.queryByRole("link", { name: /Show me around/ })).toBeNull();
  });
});
