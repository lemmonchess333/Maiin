import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import AnalyticsGoDeeper, { AnalyticsBackRow } from "../AnalyticsGoDeeper";

vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

describe("AnalyticsGoDeeper — the way into the four pages (DS3)", () => {
  it("offers Lifting, Running, Body and Food, in that order", () => {
    render(<AnalyticsGoDeeper onOpen={() => {}} />);
    const names = screen
      .getAllByRole("button")
      .map((button) => button.textContent);
    expect(names).toEqual([
      "LiftingVolume, sessions, muscles",
      "RunningDistance, pace, races",
      "BodyWeight trend",
      "FoodCalories, macros, balance",
    ]);
  });

  it("says what a page holds for this user when it has something, and what it holds otherwise", () => {
    render(
      <AnalyticsGoDeeper
        onOpen={() => {}}
        lines={{
          lifting: "2 new bests this week",
          body: "Down 0.33 kg a week",
        }}
      />
    );
    const names = screen
      .getAllByRole("button")
      .map((button) => button.textContent);
    expect(names).toEqual([
      "Lifting2 new bests this week",
      "RunningDistance, pace, races",
      "BodyDown 0.33 kg a week",
      "FoodCalories, macros, balance",
    ]);
  });

  it("opens the page its tile names", () => {
    const onOpen = vi.fn();
    render(<AnalyticsGoDeeper onOpen={onOpen} />);
    fireEvent.click(screen.getByRole("button", { name: /^Running/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Food/ }));
    expect(onOpen.mock.calls).toEqual([["running"], ["food"]]);
  });

  it("has a heading, so the overview's sections read in order", () => {
    render(<AnalyticsGoDeeper onOpen={() => {}} />);
    expect(
      screen.getByRole("heading", { name: "Go deeper" })
    ).toBeInTheDocument();
  });
});

describe("AnalyticsBackRow", () => {
  it("goes back to the overview", () => {
    const onBack = vi.fn();
    render(<AnalyticsBackRow onBack={onBack} />);
    fireEvent.click(screen.getByRole("button", { name: "Overview" }));
    expect(onBack).toHaveBeenCalled();
  });
});
