/**
 * TrialEndedDialog — the trial-lapse prompt says what changed, names no
 * free feature as a reason to pay, and its two exits do what they say.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import TrialEndedDialog from "../TrialEndedDialog";

afterEach(cleanup);

describe("TrialEndedDialog", () => {
  it("says what the lapse changed, and what still works", () => {
    render(<TrialEndedDialog onDismiss={vi.fn()} onKeep={vi.fn()} />);
    expect(
      screen.getByRole("dialog", { name: "Your free trial has ended" })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Photo logging is paused and your calorie target/)
    ).toBeInTheDocument();
    expect(screen.getByText(/work as before/)).toBeInTheDocument();
  });

  it("names nothing that is free as a reason to pay", () => {
    // Performance insights, the PI and the week's verdict are free (Sub2).
    // The old copy promised "performance insights" for subscribing.
    const { container } = render(
      <TrialEndedDialog onDismiss={vi.fn()} onKeep={vi.fn()} />
    );
    expect(container.textContent).not.toMatch(/performance|insight|verdict/i);
  });

  it("Keep Pro and Not now each fire their own handler, once", () => {
    const onDismiss = vi.fn();
    const onKeep = vi.fn();
    render(<TrialEndedDialog onDismiss={onDismiss} onKeep={onKeep} />);
    fireEvent.click(screen.getByRole("button", { name: "Keep Pro" }));
    expect(onKeep).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onKeep).toHaveBeenCalledTimes(1);
  });

  it("Home sends Keep Pro to the offer page, tagged as the trial-end entry", () => {
    // Home owns the wiring (the surface slot, the one-time flag, the
    // navigate), and no Home suite stages the trial surface — so pin the
    // destination at source. `/upgrade` alone would land on the plans
    // untagged: the funnel could not tell this entry from any other.
    const home = readFileSync(
      resolve(__dirname, "../../../pages/Home.tsx"),
      "utf8"
    );
    const start = home.indexOf("<TrialEndedDialog");
    const block = home.slice(start, home.indexOf("</AnimatePresence>", start));
    expect(start).toBeGreaterThan(0);
    expect(block).toMatch(/navigate\("\/upgrade\?from=trial_end"\)/);
    expect(block).not.toMatch(/navigate\("\/upgrade"\)/);
  });

  it("tapping the backdrop dismisses", () => {
    const onDismiss = vi.fn();
    render(<TrialEndedDialog onDismiss={onDismiss} onKeep={vi.fn()} />);
    fireEvent.click(screen.getByTestId("trial-ended-backdrop"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
