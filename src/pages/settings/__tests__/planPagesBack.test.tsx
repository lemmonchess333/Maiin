/**
 * Lift plan and Run plan go back to Settings.
 *
 * Both are rows on the Settings list (Trim1 call 2). They sat under a
 * Programme page before, and went back to it; that page is gone, so a
 * back button still pointing at it would land on a redirect. The editors
 * themselves are mocked; this is about the page chrome.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    profile: { uid: "u1", runMode: "freeform" },
    updateProfile: vi.fn(),
    refreshProfile: vi.fn(),
  }),
}));
vi.mock("@/features/program/useProgram", () => ({
  useProgram: () => ({ programState: null }),
}));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/components/program/ProgrammeSettings", () => ({
  default: () => null,
}));
vi.mock("@/components/program/ScheduleLayoutSheet", () => ({
  default: () => null,
}));
vi.mock("@/components/program/RunPlanSettings", () => ({
  default: () => null,
}));
vi.mock("@/components/settings/RunFitnessSection", () => ({
  default: () => null,
}));
vi.mock("@/components/settings/HeartRateZonesSection", () => ({
  default: () => null,
}));
vi.mock("@/components/program/AdjustWeekSheet", () => ({
  default: () => null,
}));
vi.mock("@/components/settings/VoiceCuesPref", () => ({
  default: () => null,
}));

import SettingsLiftPlan from "../SettingsLiftPlan";
import SettingsRunPlan from "../SettingsRunPlan";

function Where() {
  return <div data-testid="where">{useLocation().pathname}</div>;
}

afterEach(cleanup);

describe("plan pages go back to Settings", () => {
  it.each([
    ["/settings/lift-plan", <SettingsLiftPlan key="lift" />],
    ["/settings/run-plan", <SettingsRunPlan key="run" />],
  ])("%s", (path, page) => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={path} element={page} />
          <Route path="*" element={null} />
        </Routes>
        <Where />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("button", { name: "Back to settings" }));
    expect(screen.getByTestId("where")).toHaveTextContent("/settings");
    expect(screen.getByTestId("where")).not.toHaveTextContent("/settings/");
  });
});
