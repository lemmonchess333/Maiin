/**
 * Banner primitive tests.
 *
 * Pin the Run7 Q10 contract:
 *   - info     → role="status"  + coral 6% tint + Info icon
 *   - warning  → role="alert"   + amber 8% tint + AlertTriangle icon
 *   - No `error` variant exists (errors are toasts, not banners).
 *   - Dismissibility is opt-in via `onDismiss` — required for action-
 *     prompting banners, omitted for state-derived ones.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Banner } from "../Banner";

describe("Banner — variants", () => {
  it("info variant uses role=status (polite live region)", () => {
    render(<Banner variant="info" title="Heads up" />);
    const banner = screen.getByRole("status");
    expect(banner.textContent).toContain("Heads up");
  });

  it("warning variant uses role=alert (assertive live region)", () => {
    render(<Banner variant="warning" title="Race day passed" />);
    const banner = screen.getByRole("alert");
    expect(banner.textContent).toContain("Race day passed");
  });

  it("info variant tints surface with running coral at 6% (hex 0F)", () => {
    render(<Banner variant="info" title="Recovering" />);
    const banner = screen.getByRole("status") as HTMLElement;
    // #D4637A with hex 0F alpha ≈ rgba(212, 99, 122, 0.06) once jsdom
    // normalises the 8-digit hex.
    expect(banner.style.background).toContain("rgba(212, 99, 122, 0.06)");
  });

  it("warning variant tints surface with amber at 8% (hex 14)", () => {
    render(<Banner variant="warning" title="Schedule compressed" />);
    const banner = screen.getByRole("alert") as HTMLElement;
    // #D97706 with hex 14 alpha ≈ rgba(217, 119, 6, 0.08).
    expect(banner.style.background).toContain("rgba(217, 119, 6, 0.08)");
  });
});

describe("Banner — content composition", () => {
  it("renders title + description + action in order", () => {
    render(
      <Banner
        variant="info"
        title="Recovering"
        description="3 days left until you're back to base."
        action={<button type="button">Skip early</button>}
      />,
    );
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Recovering");
    expect(status).toHaveTextContent("3 days left until you're back to base.");
    expect(screen.getByRole("button", { name: "Skip early" })).toBeInTheDocument();
  });

  it("omits the description block when description is not provided", () => {
    render(<Banner variant="info" title="No detail" />);
    // The title element is the only paragraph in the banner.
    const banner = screen.getByRole("status");
    expect(banner.querySelectorAll("p").length).toBe(1);
  });

  it("custom icon replaces the default lucide icon", () => {
    render(
      <Banner
        variant="info"
        title="With custom icon"
        icon={<span data-testid="custom-icon">★</span>}
      />,
    );
    expect(screen.getByTestId("custom-icon")).toBeInTheDocument();
  });
});

describe("Banner — dismiss affordance", () => {
  it("renders no close button when onDismiss is not provided (state-derived banners)", () => {
    render(<Banner variant="info" title="State-derived" />);
    expect(
      screen.queryByRole("button", { name: /dismiss/i }),
    ).not.toBeInTheDocument();
  });

  it("renders the close button when onDismiss is provided (action-prompting banners)", () => {
    const onDismiss = vi.fn();
    render(
      <Banner
        variant="warning"
        title="Race elapsed"
        onDismiss={onDismiss}
        dismissLabel="Dismiss race-elapsed banner"
      />,
    );
    const closeBtn = screen.getByRole("button", {
      name: "Dismiss race-elapsed banner",
    });
    fireEvent.click(closeBtn);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("falls back to 'Dismiss' aria-label when dismissLabel is not supplied", () => {
    render(<Banner variant="info" title="Generic" onDismiss={() => {}} />);
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
  });
});
