/**
 * Social & privacy's explanation for a restricted account (S4e D6): what
 * is stopped, what still works, and the way to support. Nothing for
 * anyone else.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const status = vi.hoisted(() => ({ isRestricted: false, loading: false }));
vi.mock("@/hooks/useRestrictedStatus", () => ({
  useRestrictedStatus: () => status,
}));

import RestrictionExplainer from "../RestrictionExplainer";

afterEach(() => {
  cleanup();
  status.isRestricted = false;
});

describe("RestrictionExplainer", () => {
  it("says what is stopped, what still works, and how to reach support", () => {
    status.isRestricted = true;
    render(<RestrictionExplainer uid="sam" />);
    expect(screen.getByText("Your account is restricted")).toBeInTheDocument();
    expect(
      screen.getByText(/you can't post, comment, give props or likes/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Everything else works as normal/)
    ).toBeInTheDocument();
    const support = screen.getByRole("link", { name: "Contact support" });
    expect(support.getAttribute("href")).toMatch(
      /^mailto:support@troposfit\.com\?/
    );
  });

  it("names no end date or strike count, since neither exists yet", () => {
    status.isRestricted = true;
    const { container } = render(<RestrictionExplainer uid="sam" />);
    expect(container.textContent).not.toMatch(/strike|until \d|days/i);
  });

  it("shows nothing for an account that is not restricted", () => {
    const { container } = render(<RestrictionExplainer uid="alex" />);
    expect(container).toBeEmptyDOMElement();
  });
});
