import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SettingsSummaryRow from "../SettingsSummaryRow";

function renderRow(ui: React.ReactNode) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("SettingsSummaryRow", () => {
  it("renders label, primary, and secondary copy", () => {
    renderRow(
      <SettingsSummaryRow
        label="Workout preferences"
        primary="Rest 1:30 · Auto-start on"
        secondary="Voice cues off"
      />,
    );

    expect(screen.getByText("Workout preferences")).toBeTruthy();
    expect(screen.getByText("Rest 1:30 · Auto-start on")).toBeTruthy();
    expect(screen.getByText("Voice cues off")).toBeTruthy();
  });

  it("renders an action link when action is provided", () => {
    renderRow(
      <SettingsSummaryRow
        label="Training defaults"
        primary="Hybrid programme"
        action={{ label: "Manage in Programme", to: "/program" }}
      />,
    );

    const link = screen.getByRole("link", { name: /Training defaults/i });
    expect(link.getAttribute("href")).toBe("/program");
    expect(screen.getByText("Manage in Programme")).toBeTruthy();
  });

  it("calls onPress from the row button", () => {
    const onPress = vi.fn();
    renderRow(
      <SettingsSummaryRow
        label="Nutrition defaults"
        primary="2,300 kcal"
        onPress={onPress}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Nutrition defaults/i }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("guards against providing action and onPress together", () => {
    expect(() => renderRow(
      <SettingsSummaryRow
        label="Invalid"
        primary="Bad props"
        action={{ label: "Open", to: "/settings" }}
        onPress={() => undefined}
      />,
    )).toThrow("either action or onPress");
  });
});
