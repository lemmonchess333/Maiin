/**
 * Sprint 4 — EmptyState contract pin.
 *
 * EmptyState shipped pre-Sprint-4 with no tests; this pins the
 * shape so the Sprint 4 standardisation pass can refactor with
 * confidence. Tests cover:
 *   - role=status (announces when empty list appears)
 *   - title + description rendered
 *   - icon container is aria-hidden (decorative)
 *   - action button uses the Button primitive (when onClick)
 *   - action link uses <a href> (when href) — important because
 *     <a> can't be nested inside <button>, hence the duplicated
 *     class shape that EmptyState.tsx documents inline
 *   - accentColor drives the icon tint
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { EmptyState } from "../EmptyState";

function renderInRouter(ui: React.ReactNode) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("EmptyState — base contract", () => {
  it("renders as role=status (announces when an empty list appears)", () => {
    renderInRouter(
      <EmptyState icon={<svg />} title="No runs yet" description="Log your first run" />,
    );
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("renders the title and description", () => {
    renderInRouter(
      <EmptyState
        icon={<svg />}
        title="No runs yet"
        description="Log your first run to see it here"
      />,
    );
    expect(screen.getByText("No runs yet")).toBeTruthy();
    expect(screen.getByText("Log your first run to see it here")).toBeTruthy();
  });

  it("the icon container is aria-hidden (decorative — title carries meaning)", () => {
    const { container } = renderInRouter(
      <EmptyState icon={<svg data-testid="i" />} title="X" description="Y" />,
    );
    // The icon container has aria-hidden="true".
    const iconContainer = container.querySelector('[aria-hidden="true"]');
    expect(iconContainer).toBeTruthy();
  });

  it("renders no action element when action is omitted", () => {
    renderInRouter(<EmptyState icon={<svg />} title="X" description="Y" />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });
});

describe("EmptyState — action variants", () => {
  it("renders a Button when action.onClick is provided", () => {
    const handle = vi.fn();
    renderInRouter(
      <EmptyState
        icon={<svg />}
        title="X"
        description="Y"
        action={{ label: "Log a run", onClick: handle }}
      />,
    );
    const btn = screen.getByRole("button", { name: "Log a run" });
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(handle).toHaveBeenCalledTimes(1);
  });

  it("renders a Link when action.href is provided", () => {
    renderInRouter(
      <EmptyState
        icon={<svg />}
        title="X"
        description="Y"
        action={{ label: "Open settings", href: "/settings" }}
      />,
    );
    const link = screen.getByRole("link", { name: "Open settings" });
    expect(link).toBeTruthy();
    expect(link.getAttribute("href")).toBe("/settings");
  });

  it("the link is NOT nested inside a button (invalid HTML)", () => {
    // <a> inside <button> is invalid; EmptyState's inline-class-shape
    // pattern exists specifically to avoid this. Regression guard.
    renderInRouter(
      <EmptyState
        icon={<svg />}
        title="X"
        description="Y"
        action={{ label: "Settings", href: "/settings" }}
      />,
    );
    const link = screen.getByRole("link", { name: "Settings" });
    // Walk ancestors — there should be no <button> wrapping the link.
    let node: HTMLElement | null = link.parentElement;
    while (node) {
      expect(node.tagName.toLowerCase()).not.toBe("button");
      node = node.parentElement;
    }
  });
});

describe("EmptyState — accentColor", () => {
  it("applies the default purple accent when accentColor is omitted", () => {
    const { container } = renderInRouter(
      <EmptyState icon={<svg />} title="X" description="Y" />,
    );
    const iconBox = container.querySelector('[aria-hidden="true"]') as HTMLElement;
    // jsdom normalises `${accentColor}15` (8-bit alpha hex) into
    // rgba(r, g, b, alpha). #7B72E9 → rgb(123, 114, 233).
    expect(iconBox?.style.background).toContain("123, 114, 233");
  });

  it("applies a custom accentColor", () => {
    const { container } = renderInRouter(
      <EmptyState icon={<svg />} title="X" description="Y" accentColor="#D4637A" />,
    );
    const iconBox = container.querySelector('[aria-hidden="true"]') as HTMLElement;
    // #D4637A → rgb(212, 99, 122). Same normalisation as above.
    expect(iconBox?.style.background).toContain("212, 99, 122");
  });
});
