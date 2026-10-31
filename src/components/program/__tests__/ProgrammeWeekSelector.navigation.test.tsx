import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ProgrammeWeekSelector, {
  type ProgrammeWeekSelectorCell,
} from "../ProgrammeWeekSelector";

vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

const cells: ProgrammeWeekSelectorCell[] = [
  {
    key: "0",
    center: "1",
    bottomLabel: "Push",
    status: "completed",
    isToday: false,
  },
  {
    key: "1",
    center: "2",
    bottomLabel: "Pull",
    status: "upcoming",
    isToday: true,
  },
  {
    key: "2",
    center: "3",
    bottomLabel: "Legs",
    status: "upcoming",
    isToday: false,
  },
];

function Selector() {
  const [selected, setSelected] = useState("1");
  return (
    <ProgrammeWeekSelector
      sport="lift"
      cells={cells}
      selectedKey={selected}
      onSelect={setSelected}
    />
  );
}

describe("Train day navigation", () => {
  it("keeps the selected day as the single tab stop", () => {
    render(<Selector />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([-1, 0, -1]);
    fireEvent.click(tabs[0]);
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1, -1]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
  });

  it("moves selection and focus with arrows, including across the end", () => {
    render(<Selector />);
    const tabs = screen.getAllByRole("tab");
    tabs[1].focus();
    fireEvent.keyDown(tabs[1], { key: "ArrowRight" });
    expect(tabs[2]).toHaveFocus();
    expect(tabs[2]).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(tabs[2], { key: "ArrowRight" });
    expect(tabs[0]).toHaveFocus();
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(tabs[0], { key: "ArrowLeft" });
    expect(tabs[2]).toHaveFocus();
    expect(tabs[2]).toHaveAttribute("aria-selected", "true");
  });

  it("supports Home and End without changing completion status", () => {
    render(<Selector />);
    const tabs = screen.getAllByRole("tab");
    fireEvent.keyDown(tabs[1], { key: "End" });
    expect(tabs[2]).toHaveFocus();
    fireEvent.keyDown(tabs[2], { key: "Home" });
    expect(tabs[0]).toHaveFocus();
    expect(tabs[0]).toHaveAccessibleName("Push, completed");
    expect(tabs[1]).toHaveAccessibleName("Pull, today");
  });
});
