/**
 * Sprint 7 — RunControlButton primitive tests.
 *
 * Pins the contract for the active-run surface: aria-label
 * required, calmer 0.92 press scale, 76px lg / 56px sm sizes,
 * label-below-button is decorative (aria-hidden), focus ring
 * present.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RunControlButton } from "../RunControlButton";

describe("RunControlButton — base contract", () => {
  it("renders aria-label as the accessible name", () => {
    render(
      <RunControlButton
        aria-label="Pause run"
        icon={<svg data-testid="icon" />}
      />
    );
    const btn = screen.getByRole("button", { name: "Pause run" });
    expect(btn).toBeTruthy();
  });

  it("default type=button (so it doesn't accidentally submit forms)", () => {
    render(<RunControlButton aria-label="X" icon={<svg />} />);
    expect(screen.getByRole("button").getAttribute("type")).toBe("button");
  });

  it("press scale is 0.92 (calmer than the regular Button's 0.97)", () => {
    render(<RunControlButton aria-label="X" icon={<svg />} />);
    expect(screen.getByRole("button").className).toContain(
      "active:scale-[0.92]"
    );
  });

  it("circular shape — rounded-full (not the app's rounded-xl)", () => {
    render(<RunControlButton aria-label="X" icon={<svg />} />);
    expect(screen.getByRole("button").className).toContain("rounded-full");
  });

  it("focus ring is present for keyboard navigation", () => {
    render(<RunControlButton aria-label="X" icon={<svg />} />);
    const cls = screen.getByRole("button").className;
    expect(cls).toContain("focus-visible:ring-2");
  });

  it("wraps the icon in aria-hidden (SR reads aria-label only)", () => {
    render(
      <RunControlButton aria-label="Pause" icon={<svg data-testid="i" />} />
    );
    const wrapper = screen.getByTestId("i").parentElement;
    expect(wrapper?.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("RunControlButton — sizes", () => {
  it("lg is the default (76px)", () => {
    render(<RunControlButton aria-label="X" icon={<svg />} />);
    expect(screen.getByRole("button").className).toContain("size-[76px]");
  });

  it("sm is 56px (size-14)", () => {
    render(<RunControlButton aria-label="X" icon={<svg />} size="sm" />);
    const cls = screen.getByRole("button").className;
    expect(cls).toContain("size-14");
  });
});

describe("RunControlButton — variants", () => {
  it("primary variant applies the teal background via inline style", () => {
    render(
      <RunControlButton aria-label="Resume" icon={<svg />} variant="primary" />
    );
    const style = screen.getByRole("button").getAttribute("style") || "";
    expect(style).toContain("rgb(82, 163, 189)");
  });

  it("danger variant applies the red border via inline style", () => {
    render(
      <RunControlButton aria-label="Stop" icon={<svg />} variant="danger" />
    );
    const style = screen.getByRole("button").getAttribute("style") || "";
    expect(style).toContain("rgb(239, 68, 68)");
  });

  it("neutral (default) variant has translucent white background", () => {
    render(<RunControlButton aria-label="X" icon={<svg />} />);
    const style = screen.getByRole("button").getAttribute("style") || "";
    expect(style).toMatch(/rgba\(255,\s*255,\s*255/);
  });

  it("glow prop is opt-in for variants other than primary", () => {
    // primary has glow always on; neutral/danger respect the prop
    render(
      <RunControlButton aria-label="X" icon={<svg />} variant="neutral" />
    );
    const styleNoGlow = screen.getByRole("button").getAttribute("style") || "";
    // neutral always has a drop-shadow but no teal-tinted glow
    expect(styleNoGlow).not.toMatch(/rgba\(82,\s*163,\s*189/);
  });
});

describe("RunControlButton — visible label (decorative)", () => {
  it("renders the visible label below the button when provided", () => {
    render(
      <RunControlButton aria-label="Pause run" label="PAUSE" icon={<svg />} />
    );
    expect(screen.getByText("PAUSE")).toBeTruthy();
  });

  it("the visible label is aria-hidden (decorative — accessible name is aria-label)", () => {
    render(
      <RunControlButton aria-label="Pause run" label="PAUSE" icon={<svg />} />
    );
    // The label <p> is aria-hidden so screen readers ignore it.
    const label = screen.getByText("PAUSE");
    expect(label.getAttribute("aria-hidden")).toBe("true");
  });

  it("omits the label element entirely when no label prop", () => {
    render(<RunControlButton aria-label="Lock" icon={<svg />} />);
    expect(screen.queryByText(/LOCK/i)).toBeNull();
  });
});

describe("RunControlButton — disabled state", () => {
  it("respects the disabled prop", () => {
    render(<RunControlButton aria-label="X" icon={<svg />} disabled />);
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(
      true
    );
  });

  it("applies the disabled visual class", () => {
    render(<RunControlButton aria-label="X" icon={<svg />} disabled />);
    expect(screen.getByRole("button").className).toContain(
      "disabled:opacity-50"
    );
  });
});
