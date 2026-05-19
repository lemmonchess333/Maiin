/**
 * SettingsSection contract — Set1.1.
 *
 * Pin the back-arrow behaviour, accessible label, title rendering,
 * and children pass-through so a refactor can't silently break the
 * nested-page chrome the Set1 IA depends on.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

import SettingsSection from "../SettingsSection";

function renderWith(node: React.ReactElement) {
  return render(<MemoryRouter>{node}</MemoryRouter>);
}

describe("SettingsSection — page chrome", () => {
  it("renders the title as a top-level h1", () => {
    renderWith(<SettingsSection title="Training">child</SettingsSection>);
    expect(screen.getByRole("heading", { level: 1, name: /training/i })).toBeInTheDocument();
  });

  it("renders the optional subtitle when provided", () => {
    renderWith(
      <SettingsSection title="Training" subtitle="Programme structure">
        child
      </SettingsSection>,
    );
    expect(screen.getByText(/Programme structure/i)).toBeInTheDocument();
  });

  it("omits the subtitle block when not provided", () => {
    renderWith(<SettingsSection title="Training">child</SettingsSection>);
    // Only the title paragraph should be inside the header. No empty
    // subtitle paragraph rendered.
    const header = screen.getByRole("heading", { level: 1 }).closest("header");
    expect(header?.querySelectorAll("p").length).toBe(0);
  });

  it("renders children below the header", () => {
    renderWith(
      <SettingsSection title="Training">
        <div data-testid="content">section body</div>
      </SettingsSection>,
    );
    expect(screen.getByTestId("content")).toBeInTheDocument();
  });
});

describe("SettingsSection — back-arrow behaviour", () => {
  it("renders a back-arrow button labelled 'Back to Settings'", () => {
    renderWith(<SettingsSection title="Training">child</SettingsSection>);
    expect(
      screen.getByRole("button", { name: /Back to Settings/i }),
    ).toBeInTheDocument();
  });

  it("navigates to /settings (not browser back) when the arrow is tapped", () => {
    navigateMock.mockClear();
    renderWith(<SettingsSection title="Training">child</SettingsSection>);
    fireEvent.click(screen.getByRole("button", { name: /Back to Settings/i }));
    // Always /settings — deeplinks from Programme should pop to the
    // index, not back to Programme.
    expect(navigateMock).toHaveBeenCalledWith("/settings");
  });

  it("back button meets the 44px touch-target floor", () => {
    renderWith(<SettingsSection title="Training">child</SettingsSection>);
    const btn = screen.getByRole("button", { name: /Back to Settings/i });
    expect(btn.className).toContain("min-h-[44px]");
  });
});
