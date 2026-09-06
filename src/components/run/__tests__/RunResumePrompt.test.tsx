import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import RunResumePrompt from "../RunResumePrompt";
import { useDistanceUnit } from "@/hooks/useDistanceUnit";

vi.mock("@/hooks/useDistanceUnit", () => ({ useDistanceUnit: vi.fn() }));

beforeEach(() => vi.mocked(useDistanceUnit).mockReturnValue("km"));
afterEach(cleanup);

function setup() {
  const actions = {
    onResume: vi.fn(),
    onStartNew: vi.fn(),
    onDiscard: vi.fn(),
    onBack: vi.fn(),
  };
  render(
    <RunResumePrompt
      accumulatedSeconds={185}
      distanceMeters={1609.344}
      startedAt={Date.now() - 60000}
      {...actions}
    />
  );
  return actions;
}

describe("Run recovery choices", () => {
  it.each(["km", "mi"] as const)(
    "labels the converted distance in %s",
    (unit) => {
      vi.mocked(useDistanceUnit).mockReturnValue(unit);
      setup();
      expect(
        screen.getByText(unit === "mi" ? "1.00 mi" : "1.61 km")
      ).toBeInTheDocument();
      expect(screen.getByText("3:05")).toBeInTheDocument();
    }
  );

  it("resumes directly without invoking a destructive action", () => {
    const actions = setup();
    fireEvent.click(screen.getByRole("button", { name: "Resume run" }));
    expect(actions.onResume).toHaveBeenCalledOnce();
    expect(actions.onStartNew).not.toHaveBeenCalled();
    expect(actions.onDiscard).not.toHaveBeenCalled();
  });

  it.each(["button", "escape"])("leaves safely via %s", (method) => {
    const actions = setup();
    if (method === "button")
      fireEvent.click(screen.getByRole("button", { name: "Back to Run" }));
    else fireEvent.keyDown(document, { key: "Escape" });
    expect(actions.onBack).toHaveBeenCalledOnce();
    expect(actions.onResume).not.toHaveBeenCalled();
    expect(actions.onStartNew).not.toHaveBeenCalled();
    expect(actions.onDiscard).not.toHaveBeenCalled();
  });

  it.each([
    ["Start new run", "Discard and start new", "onStartNew"],
    ["Discard previous run", "Discard run", "onDiscard"],
  ] as const)(
    "confirms before %s clears the previous run",
    (initial, confirm, callback) => {
      const actions = setup();
      fireEvent.click(screen.getByRole("button", { name: initial }));
      expect(actions.onStartNew).not.toHaveBeenCalled();
      expect(actions.onDiscard).not.toHaveBeenCalled();
      expect(screen.getByRole("alertdialog")).toHaveTextContent(
        "without being saved to your history"
      );
      fireEvent.click(
        screen.getByRole("button", { name: "Keep previous run" })
      );
      expect(
        screen.getByRole("button", { name: "Resume run" })
      ).toBeInTheDocument();
      expect(actions[callback]).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: initial }));
      fireEvent.click(screen.getByRole("button", { name: confirm }));
      expect(actions[callback]).toHaveBeenCalledOnce();
      expect(actions.onBack).not.toHaveBeenCalled();
    }
  );

  it("Escape from confirmation keeps the run and returns to the chooser", () => {
    const actions = setup();
    fireEvent.click(screen.getByRole("button", { name: "Start new run" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(
      screen.getByRole("button", { name: "Resume run" })
    ).toBeInTheDocument();
    expect(actions.onBack).not.toHaveBeenCalled();
    expect(actions.onStartNew).not.toHaveBeenCalled();
  });
});
