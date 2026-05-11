/**
 * Sprint 4 — ErrorState primitive tests.
 *
 * Pins the contract: role=alert + aria-live=assertive (so SRs
 * announce when the failure appears), title rendered, optional
 * description, optional retry button delegated to Button primitive
 * with default label "Try again".
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ErrorState } from "../ErrorState";

describe("ErrorState — base contract", () => {
  it("renders as role=alert with aria-live=assertive", () => {
    render(<ErrorState title="Couldn't load" />);
    const alert = screen.getByRole("alert");
    expect(alert).toBeTruthy();
    expect(alert.getAttribute("aria-live")).toBe("assertive");
  });

  it("renders the title", () => {
    render(<ErrorState title="Couldn't load the feed" />);
    expect(screen.getByText("Couldn't load the feed")).toBeTruthy();
  });

  it("renders the description when provided", () => {
    render(
      <ErrorState
        title="Couldn't load"
        description="Check your connection and try again."
      />,
    );
    expect(screen.getByText("Check your connection and try again.")).toBeTruthy();
  });

  it("omits the description element entirely when not provided", () => {
    const { container } = render(<ErrorState title="Couldn't load" />);
    // Only the title <p> + the icon container; no description <p>.
    const ps = container.querySelectorAll("p");
    expect(ps.length).toBe(1);
  });

  it("the icon container is aria-hidden (decorative — the alert role provides context)", () => {
    const { container } = render(<ErrorState title="X" />);
    const iconWrap = container.querySelector('[aria-hidden="true"]');
    expect(iconWrap).toBeTruthy();
  });
});

describe("ErrorState — retry button", () => {
  it("renders no button when retry is omitted", () => {
    render(<ErrorState title="X" />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders a Try again button by default when retry.onClick is provided", () => {
    render(<ErrorState title="X" retry={{ onClick: () => {} }} />);
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("respects a custom retry.label", () => {
    render(
      <ErrorState
        title="X"
        retry={{ label: "Retry feed", onClick: () => {} }}
      />,
    );
    expect(screen.getByRole("button", { name: "Retry feed" })).toBeTruthy();
  });

  it("calls retry.onClick when the button is clicked", () => {
    const handle = vi.fn();
    render(<ErrorState title="X" retry={{ onClick: handle }} />);
    fireEvent.click(screen.getByRole("button"));
    expect(handle).toHaveBeenCalledTimes(1);
  });
});

describe("ErrorState — destructive accent", () => {
  it("the icon container uses the destructive token (Sprint 0)", () => {
    const { container } = render(<ErrorState title="X" />);
    const iconWrap = container.querySelector('[aria-hidden="true"]');
    expect(iconWrap?.className).toContain("bg-destructive/10");
  });

  it("the default icon glyph inherits destructive colour", () => {
    const { container } = render(<ErrorState title="X" />);
    // The wrapping span around the icon carries text-destructive.
    const colourWrap = container.querySelector(".text-destructive");
    expect(colourWrap).toBeTruthy();
  });
});
