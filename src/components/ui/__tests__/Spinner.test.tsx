/**
 * Sprint 4 — Spinner primitive tests.
 *
 * Pins the contract: role=status, aria-label (default "Loading",
 * overridable), aria-hidden glyph, animate-spin class, size +
 * variant Tailwind classes.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Spinner } from "../Spinner";

describe("Spinner — base contract", () => {
  it("renders role=status (screen readers announce as a live region)", () => {
    render(<Spinner />);
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("default aria-label is 'Loading'", () => {
    render(<Spinner />);
    expect(screen.getByRole("status").getAttribute("aria-label")).toBe("Loading");
  });

  it("accepts a custom aria-label", () => {
    render(<Spinner label="Loading runs" />);
    expect(screen.getByRole("status").getAttribute("aria-label")).toBe("Loading runs");
  });

  it("the glyph is aria-hidden (SR reads the wrapper's aria-label only)", () => {
    render(<Spinner />);
    const glyph = screen.getByRole("status").querySelector("svg");
    expect(glyph?.getAttribute("aria-hidden")).toBe("true");
  });

  it("applies animate-spin to the glyph", () => {
    render(<Spinner />);
    const glyph = screen.getByRole("status").querySelector("svg");
    expect(glyph?.getAttribute("class")).toContain("animate-spin");
  });

  it("merges a custom className onto the wrapper", () => {
    render(<Spinner className="my-custom-class" />);
    expect(screen.getByRole("status").className).toContain("my-custom-class");
  });
});

describe("Spinner — sizes", () => {
  it("sm is the default (16px)", () => {
    render(<Spinner />);
    const glyph = screen.getByRole("status").querySelector("svg");
    expect(glyph?.getAttribute("class")).toContain("w-4");
    expect(glyph?.getAttribute("class")).toContain("h-4");
  });

  it("xs is 12px", () => {
    render(<Spinner size="xs" />);
    const glyph = screen.getByRole("status").querySelector("svg");
    expect(glyph?.getAttribute("class")).toContain("w-3");
    expect(glyph?.getAttribute("class")).toContain("h-3");
  });

  it("md is 24px", () => {
    render(<Spinner size="md" />);
    const glyph = screen.getByRole("status").querySelector("svg");
    expect(glyph?.getAttribute("class")).toContain("w-6");
    expect(glyph?.getAttribute("class")).toContain("h-6");
  });

  it("lg is 32px", () => {
    render(<Spinner size="lg" />);
    const glyph = screen.getByRole("status").querySelector("svg");
    expect(glyph?.getAttribute("class")).toContain("w-8");
    expect(glyph?.getAttribute("class")).toContain("h-8");
  });
});

describe("Spinner — variants", () => {
  it("primary is the default (text-primary — purple brand)", () => {
    render(<Spinner />);
    const glyph = screen.getByRole("status").querySelector("svg");
    expect(glyph?.getAttribute("class")).toContain("text-primary");
  });

  it("inverse variant uses text-white (for dark surfaces)", () => {
    render(<Spinner variant="inverse" />);
    const glyph = screen.getByRole("status").querySelector("svg");
    expect(glyph?.getAttribute("class")).toContain("text-white");
  });

  it("muted variant uses text-muted-foreground", () => {
    render(<Spinner variant="muted" />);
    const glyph = screen.getByRole("status").querySelector("svg");
    expect(glyph?.getAttribute("class")).toContain("text-muted-foreground");
  });
});
