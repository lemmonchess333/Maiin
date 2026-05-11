/**
 * Sprint 1 — Button + IconButton primitive tests.
 *
 * Pin the contract so a future refactor can't silently drop the
 * scale animation, focus ring, touch-target floor, or loading-state
 * a11y semantics.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "../Button";
import { IconButton } from "../IconButton";

describe("Button — base contract", () => {
  it("renders a button with type=button by default (so it doesn't submit forms)", () => {
    render(<Button>Press</Button>);
    const btn = screen.getByRole("button", { name: "Press" });
    expect(btn.getAttribute("type")).toBe("button");
  });

  it("respects an explicit type=submit", () => {
    render(<Button type="submit">Submit</Button>);
    expect(screen.getByRole("button").getAttribute("type")).toBe("submit");
  });

  it("applies the canonical 0.97 press scale", () => {
    render(<Button>Press</Button>);
    expect(screen.getByRole("button").className).toContain("active:scale-[0.97]");
  });

  it("applies the canonical rounded-xl shape", () => {
    render(<Button>Press</Button>);
    expect(screen.getByRole("button").className).toContain("rounded-xl");
  });

  it("applies the focus-visible ring (mouse clicks don't draw the ring)", () => {
    render(<Button>Press</Button>);
    const cls = screen.getByRole("button").className;
    expect(cls).toContain("focus-visible:ring-2");
    expect(cls).toContain("focus-visible:ring-primary/40");
  });

  it("md size meets the 44px touch-target floor", () => {
    render(<Button>Press</Button>);
    expect(screen.getByRole("button").className).toContain("min-h-[44px]");
  });
});

describe("Button — variants", () => {
  it("primary uses bg-primary-strong (the WCAG-AA filled brand colour)", () => {
    render(<Button variant="primary">Go</Button>);
    expect(screen.getByRole("button").className).toContain("bg-primary-strong");
  });

  it("destructive uses the Sprint 0 bg-destructive token (NOT a hardcoded red)", () => {
    render(<Button variant="destructive">Delete</Button>);
    const cls = screen.getByRole("button").className;
    expect(cls).toContain("bg-destructive");
    expect(cls).toContain("text-destructive-foreground");
  });

  it("ghost uses transparent background with hover tint", () => {
    render(<Button variant="ghost">Ghost</Button>);
    const cls = screen.getByRole("button").className;
    expect(cls).toContain("bg-transparent");
    expect(cls).toContain("hover:bg-muted");
  });

  it("outline has a border-border class", () => {
    render(<Button variant="outline">Outline</Button>);
    expect(screen.getByRole("button").className).toContain("border-border");
  });
});

describe("Button — sizes", () => {
  it("sm is under the touch-target floor (36px — explicit accept)", () => {
    render(<Button size="sm">Small</Button>);
    expect(screen.getByRole("button").className).toContain("min-h-[36px]");
  });

  it("md is 44px (default)", () => {
    render(<Button size="md">Medium</Button>);
    expect(screen.getByRole("button").className).toContain("min-h-[44px]");
  });

  it("lg is 52px (hero)", () => {
    render(<Button size="lg">Large</Button>);
    expect(screen.getByRole("button").className).toContain("min-h-[52px]");
  });
});

describe("Button — loading state", () => {
  it("renders aria-busy=true when loading", () => {
    render(<Button loading>Saving</Button>);
    expect(screen.getByRole("button").getAttribute("aria-busy")).toBe("true");
  });

  it("disables interaction when loading (so double-clicks can't fire)", () => {
    render(<Button loading>Saving</Button>);
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
  });

  it("does NOT set aria-busy when not loading", () => {
    render(<Button>Idle</Button>);
    expect(screen.getByRole("button").getAttribute("aria-busy")).toBeNull();
  });

  it("hides the label text and shows a spinner with aria-hidden", () => {
    render(<Button loading>Saving</Button>);
    const btn = screen.getByRole("button");
    // The label text is replaced by the spinner. Screen-readers
    // announce the parent's aria-busy state, not the spinner svg.
    expect(btn.textContent).not.toContain("Saving");
    const spinner = btn.querySelector("svg");
    expect(spinner?.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("Button — disabled state", () => {
  it("respects the disabled prop", () => {
    render(<Button disabled>Cannot</Button>);
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
  });

  it("applies the disabled visual class so opacity reduces", () => {
    render(<Button disabled>Cannot</Button>);
    expect(screen.getByRole("button").className).toContain("disabled:opacity-50");
  });
});

describe("Button — composition", () => {
  it("renders leftIcon then children then rightIcon in order", () => {
    render(
      <Button
        leftIcon={<span data-testid="left">L</span>}
        rightIcon={<span data-testid="right">R</span>}
      >
        Label
      </Button>,
    );
    const left = screen.getByTestId("left");
    const right = screen.getByTestId("right");
    expect(left).toBeTruthy();
    expect(right).toBeTruthy();
    // Children element order: left → "Label" → right
    const btn = screen.getByRole("button");
    expect(btn.textContent).toContain("Label");
    expect(btn.textContent?.indexOf("L")).toBeLessThan(btn.textContent?.indexOf("Label") ?? 0);
  });

  it("fullWidth applies w-full", () => {
    render(<Button fullWidth>Wide</Button>);
    expect(screen.getByRole("button").className).toContain("w-full");
  });

  it("custom className composes with the variant/size classes (cn merges)", () => {
    render(<Button className="my-custom-class">Press</Button>);
    expect(screen.getByRole("button").className).toContain("my-custom-class");
  });
});

describe("IconButton — base contract", () => {
  it("renders the provided icon with aria-label as the accessible name", () => {
    render(
      <IconButton
        aria-label="Close dialog"
        icon={<svg data-testid="close-icon" />}
      />,
    );
    const btn = screen.getByRole("button", { name: "Close dialog" });
    expect(btn).toBeTruthy();
    expect(screen.getByTestId("close-icon")).toBeTruthy();
  });

  it("defaults to ghost variant (transparent — the dominant header use case)", () => {
    render(<IconButton aria-label="X" icon={<svg />} />);
    expect(screen.getByRole("button").className).toContain("bg-transparent");
  });

  it("md size produces a 44x44 square touch target", () => {
    render(<IconButton aria-label="X" icon={<svg />} />);
    const cls = screen.getByRole("button").className;
    expect(cls).toContain("w-11");
    expect(cls).toContain("h-11");
  });

  it("applies the same focus ring + press scale + rounded-xl as Button", () => {
    render(<IconButton aria-label="X" icon={<svg />} />);
    const cls = screen.getByRole("button").className;
    expect(cls).toContain("focus-visible:ring-2");
    expect(cls).toContain("active:scale-[0.97]");
    expect(cls).toContain("rounded-xl");
  });

  it("wraps the icon in an aria-hidden span (so SR reads aria-label only)", () => {
    render(<IconButton aria-label="Close" icon={<svg data-testid="ic" />} />);
    const wrapper = screen.getByTestId("ic").parentElement;
    expect(wrapper?.getAttribute("aria-hidden")).toBe("true");
  });

  it("loading state shows spinner + aria-busy", () => {
    render(<IconButton aria-label="Saving" icon={<svg />} loading />);
    const btn = screen.getByRole("button");
    expect(btn.getAttribute("aria-busy")).toBe("true");
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it("destructive variant pipes through to bg-destructive", () => {
    render(<IconButton aria-label="Delete" variant="destructive" icon={<svg />} />);
    const cls = screen.getByRole("button").className;
    expect(cls).toContain("bg-destructive");
    expect(cls).toContain("text-destructive-foreground");
  });
});
