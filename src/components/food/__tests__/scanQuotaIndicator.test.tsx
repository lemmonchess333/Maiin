/**
 * The exhausted-quota line is a BUTTON, so it carries a button's floor.
 *
 * It renders as one 11px muted caption under the composer input, which is
 * how it was designed and how it should keep reading — but the exhausted
 * branch is a real action: it opens the upgrade path. With no padding and
 * no height of its own the tappable box was the line box, roughly 13px.
 * DESIGN_GUIDE §10 sets 44 CSS px for "anything interactive", with no
 * exception for a caption that happens to be a button.
 *
 * Why this is pinned as a class and not eyeballed: the same file's OTHER
 * branch is a `<p>` and needs no such floor, so a reader comparing the two
 * sees an inconsistency that looks deliberate. It is not — one is an
 * action and one is not, and only the action is held here.
 *
 * The 44px cannot be measured in jsdom (no layout), so the assertion is on
 * the class that produces it. That is a weaker pin than a rendered box, and
 * deliberately so: it fails loudly when someone strips the height, which is
 * the regression this exists to catch.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ScanQuotaIndicator from "../ScanQuotaIndicator";

const RESET = new Date(2026, 5, 10);

describe("ScanQuotaIndicator — the exhausted action clears the touch floor", () => {
  it("renders the upgrade action with a 44px minimum height", () => {
    render(
      <ScanQuotaIndicator remaining={0} resetDate={RESET} onUpgrade={vi.fn()} />
    );
    const action = screen.getByRole("button");
    expect(action.className).toMatch(/min-h-\[44px\]/);
    // Centred inside that box, so the line still reads as one caption
    // rather than text pinned to the top of a tall empty row.
    expect(action.className).toMatch(/items-center/);
  });

  it("still fires its upgrade action", () => {
    const onUpgrade = vi.fn();
    render(
      <ScanQuotaIndicator
        remaining={0}
        resetDate={RESET}
        onUpgrade={onUpgrade}
      />
    );
    screen.getByRole("button").click();
    expect(onUpgrade).toHaveBeenCalledTimes(1);
  });

  it("the last-scan branch is not a button, and needs no floor", () => {
    // The paired positive: it keeps this from passing because nothing
    // renders. remaining === 1 is informational copy, not an action.
    render(
      <ScanQuotaIndicator remaining={1} resetDate={RESET} onUpgrade={vi.fn()} />
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText(/1 free scan left/)).toBeTruthy();
  });

  it("dates the reset en-GB, day before month", () => {
    render(
      <ScanQuotaIndicator remaining={0} resetDate={RESET} onUpgrade={vi.fn()} />
    );
    expect(screen.getByRole("button").textContent).toContain("10 Jun");
  });
});
