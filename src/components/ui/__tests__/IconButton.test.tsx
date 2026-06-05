/**
 * Tests for the `IconButton` primitive — design-system square-target
 * wrapper around a single Lucide icon. Used everywhere icon-only
 * buttons appear (header chrome, close buttons, inline affordances).
 *
 * The compile-time `aria-label` requirement is enforced by the type
 * signature; we don't test that here (would require a type-only
 * test). At runtime we pin:
 *   1. Renders the icon with aria-hidden so screen readers don't
 *      double-announce alongside the aria-label.
 *   2. Forwards aria-label, onClick, and the button HTML attrs.
 *   3. Size variants apply the expected square dimensions.
 *   4. Loading state swaps the icon for a spinner and sets aria-busy.
 *   5. disabled + loading both lock interaction.
 *   6. Defaults: variant=ghost, size=md, type=button.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { IconButton } from "../IconButton";

afterEach(() => cleanup());

function StubIcon() {
  return <svg data-testid="stub-icon" />;
}

describe("IconButton — defaults", () => {
  it("defaults to type='button' (prevents accidental form submit)", () => {
    render(<IconButton aria-label="Close" icon={<StubIcon />} />);
    const btn = screen.getByRole("button", { name: "Close" });
    expect(btn.getAttribute("type")).toBe("button");
  });

  it("respects an explicit type prop", () => {
    render(
      <IconButton aria-label="Submit" type="submit" icon={<StubIcon />} />
    );
    expect(
      screen.getByRole("button", { name: "Submit" }).getAttribute("type")
    ).toBe("submit");
  });

  it("applies default size=md classes (44px square)", () => {
    render(<IconButton aria-label="Menu" icon={<StubIcon />} />);
    const btn = screen.getByRole("button", { name: "Menu" });
    expect(btn.className).toContain("size-11");
  });
});

describe("IconButton — size variants", () => {
  it("size='sm' applies 36px (size-9)", () => {
    render(<IconButton aria-label="X" size="sm" icon={<StubIcon />} />);
    const btn = screen.getByRole("button", { name: "X" });
    expect(btn.className).toContain("size-9");
  });

  it("size='lg' applies 48px (size-12)", () => {
    render(<IconButton aria-label="X" size="lg" icon={<StubIcon />} />);
    const btn = screen.getByRole("button", { name: "X" });
    expect(btn.className).toContain("size-12");
  });
});

describe("IconButton — icon rendering", () => {
  it("renders the icon inside an aria-hidden wrapper", () => {
    render(<IconButton aria-label="Close" icon={<StubIcon />} />);
    /* The icon's wrapper (a <span>) carries aria-hidden so the
       label isn't double-announced. */
    const wrapper = screen.getByTestId("stub-icon").parentElement;
    expect(wrapper?.getAttribute("aria-hidden")).toBe("true");
  });

  it("exposes the aria-label to screen readers", () => {
    render(<IconButton aria-label="Close dialog" icon={<StubIcon />} />);
    expect(screen.getByRole("button", { name: "Close dialog" })).toBeDefined();
  });
});

describe("IconButton — loading state", () => {
  it("renders the spinner instead of the icon when loading", () => {
    render(<IconButton aria-label="X" loading icon={<StubIcon />} />);
    /* The Loader2 SVG replaces the icon when loading. */
    expect(screen.queryByTestId("stub-icon")).toBeNull();
  });

  it("sets aria-busy='true' when loading", () => {
    render(<IconButton aria-label="X" loading icon={<StubIcon />} />);
    const btn = screen.getByRole("button", { name: "X" });
    expect(btn.getAttribute("aria-busy")).toBe("true");
  });

  it("omits aria-busy when not loading", () => {
    render(<IconButton aria-label="X" icon={<StubIcon />} />);
    const btn = screen.getByRole("button", { name: "X" });
    /* The component renders `aria-busy={loading || undefined}` —
       undefined means the attribute is absent. */
    expect(btn.hasAttribute("aria-busy")).toBe(false);
  });

  it("becomes non-interactive while loading (disabled attr set)", () => {
    render(<IconButton aria-label="X" loading icon={<StubIcon />} />);
    const btn = screen.getByRole("button", { name: "X" });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("IconButton — disabled state", () => {
  it("sets disabled when the prop is true", () => {
    render(<IconButton aria-label="X" disabled icon={<StubIcon />} />);
    expect(
      (screen.getByRole("button", { name: "X" }) as HTMLButtonElement).disabled
    ).toBe(true);
  });

  it("does NOT fire onClick when disabled", () => {
    const onClick = vi.fn();
    render(
      <IconButton
        aria-label="X"
        disabled
        onClick={onClick}
        icon={<StubIcon />}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "X" }));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("IconButton — onClick", () => {
  it("calls onClick when the button is clicked", () => {
    const onClick = vi.fn();
    render(<IconButton aria-label="X" onClick={onClick} icon={<StubIcon />} />);
    fireEvent.click(screen.getByRole("button", { name: "X" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("IconButton — variants", () => {
  it("applies the destructive variant background class", () => {
    render(
      <IconButton
        aria-label="Delete"
        variant="destructive"
        icon={<StubIcon />}
      />
    );
    const btn = screen.getByRole("button", { name: "Delete" });
    expect(btn.className).toContain("bg-destructive");
  });

  it("sport variant fills via the bg-running token class", () => {
    render(
      <IconButton aria-label="Start" variant="sport" icon={<StubIcon />} />
    );
    const btn = screen.getByRole("button", { name: "Start" });
    // DS1b: sport resolves via the --running token, not inline style.
    expect(btn.className).toContain("bg-running");
  });
});

describe("IconButton — forwardRef", () => {
  it("forwards a ref to the underlying button element", () => {
    let captured: HTMLButtonElement | null = null;
    render(
      <IconButton
        aria-label="X"
        icon={<StubIcon />}
        ref={(el) => {
          captured = el;
        }}
      />
    );
    expect(captured).toBeInstanceOf(HTMLButtonElement);
  });
});
