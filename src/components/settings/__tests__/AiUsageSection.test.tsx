/**
 * F1b lock pin #6 — Settings daily-usage pill tests.
 *
 * Pinned behaviours:
 *   1. Free user — no counters (no AI on the free plan, #1102); says AI
 *      food logging is part of Pro.
 *   2. Free user — whole row is a button; tap routes to /upgrade.
 *   3. Pro user — shows both counters; no upgrade CTA.
 *   4. Pro user — row is non-interactive (no button role).
 *   5. Trial user — same as Pro (isUnlimited is true).
 *   6. Loading state renders a skeleton with aria-busy.
 *   7. Counters render with tabular-nums for alignment.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Hook mock — varies per test via the shared ref pattern.
const useScanUsageMock = vi.fn<
  (action?: "text_ai" | "image_ai") => {
    used: number;
    limit: number;
    remaining: number;
    loading: boolean;
    resetDate: Date;
    isUnlimited: boolean;
    action: "text_ai" | "image_ai";
  }
>();

vi.mock("@/hooks/useScanUsage", () => ({
  useScanUsage: (action?: "text_ai" | "image_ai") =>
    useScanUsageMock(action ?? "image_ai"),
}));

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom"
    );
  return { ...actual, useNavigate: () => navigateMock };
});

import AiUsageSection from "../AiUsageSection";

function renderSection() {
  return render(
    <MemoryRouter>
      <AiUsageSection />
    </MemoryRouter>
  );
}

function makeUsage(
  overrides: Partial<{
    used: number;
    limit: number;
    isUnlimited: boolean;
    loading: boolean;
  }> = {},
  action: "text_ai" | "image_ai" = "image_ai"
) {
  const used = overrides.used ?? 0;
  const limit = overrides.limit ?? 0;
  return {
    used,
    limit,
    remaining: Math.max(0, limit - used),
    loading: overrides.loading ?? false,
    resetDate: new Date("2026-05-26T00:00:00Z"),
    isUnlimited: overrides.isUnlimited ?? false,
    action,
  };
}

beforeEach(() => {
  useScanUsageMock.mockReset();
  navigateMock.mockReset();
});

afterEach(cleanup);

describe("AiUsageSection — Sub1a F1b lock pin #6", () => {
  it("Cycle 1: free user sees that AI food logging is part of Pro, with no counters", () => {
    useScanUsageMock.mockImplementation((action) =>
      makeUsage({ used: 0, limit: 0 }, action)
    );
    renderSection();
    expect(screen.getByText("AI food logging")).toBeTruthy();
    expect(screen.getByText(/is part of Pro/)).toBeTruthy();
    expect(screen.queryByText(/Text:/)).toBeNull();
    expect(screen.queryByText(/ \/ 0/)).toBeNull();
  });

  it("Cycle 2: free user — whole row is a button; tap navigates to the offer page, tagged as Settings", () => {
    useScanUsageMock.mockImplementation((action) =>
      makeUsage({ used: 0, limit: 0 }, action)
    );
    renderSection();
    const row = screen.getByRole("button", { name: /AI food logging/ });
    fireEvent.click(row);
    expect(navigateMock).toHaveBeenCalledWith("/upgrade?from=settings");
  });

  it("Cycle 3: pro user shows both counters; no upgrade CTA", () => {
    useScanUsageMock.mockImplementation((action) =>
      makeUsage(
        action === "text_ai"
          ? { used: 12, limit: 100, isUnlimited: true }
          : { used: 4, limit: 100, isUnlimited: true },
        action
      )
    );
    renderSection();
    expect(screen.getByText(/Text: 12 \/ 100/)).toBeTruthy();
    expect(screen.getByText(/Image: 4 \/ 100/)).toBeTruthy();
  });

  it("Cycle 4: pro user — row is non-interactive (no button role)", () => {
    useScanUsageMock.mockImplementation((action) =>
      makeUsage({ used: 0, limit: 100, isUnlimited: true }, action)
    );
    renderSection();
    expect(screen.queryByRole("button")).toBeNull();
    // Group landmark for screen readers — the row groups text + image
    // counters together so a screen reader announces them as one unit.
    expect(screen.getByRole("group", { name: /AI usage today/ })).toBeTruthy();
  });

  it("Cycle 5: trial user (isUnlimited=true from hook) sees the Pro view", () => {
    // Trial bypass goes through useScanUsage's isUnlimited = isPro || isInTrial.
    // We assert by hook output (isUnlimited=true) so the trial mapping is
    // pinned at the hook layer where it belongs, not duplicated here.
    useScanUsageMock.mockImplementation((action) =>
      makeUsage({ used: 0, limit: 100, isUnlimited: true }, action)
    );
    renderSection();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText(/Image: 0 \/ 100/)).toBeTruthy();
  });

  it("Cycle 6: loading state renders a skeleton with aria-busy", () => {
    useScanUsageMock.mockImplementation((action) =>
      makeUsage({ loading: true }, action)
    );
    const { container } = renderSection();
    const skeleton = container.querySelector("[aria-busy='true']");
    expect(skeleton).toBeTruthy();
    // No counter text rendered during load.
    expect(screen.queryByText(/Text:/)).toBeNull();
  });

  it("Cycle 7: counter text uses tabular-nums for alignment", () => {
    useScanUsageMock.mockImplementation((action) =>
      makeUsage(
        action === "text_ai"
          ? { used: 3, limit: 100, isUnlimited: true }
          : { used: 0, limit: 100, isUnlimited: true },
        action
      )
    );
    renderSection();
    const counter = screen.getByText(/Text: 3 \/ 100/);
    expect(counter.className).toMatch(/tabular-nums/);
  });
});
