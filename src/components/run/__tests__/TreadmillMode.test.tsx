import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import TreadmillMode from "../TreadmillMode";
import { formatClock } from "@/utils/formatters";

const h = vi.hoisted(() => ({ unit: "km" as "km" | "mi" }));
vi.mock("@/hooks/useDistanceUnit", () => ({ useDistanceUnit: () => h.unit }));
afterEach(cleanup);

it("distinguishes elapsed time from a matching session countdown", () => {
  const props = {
    formatTime: formatClock,
    onSave: vi.fn(),
    onDiscard: vi.fn(),
    sessionGuidance: <p>30:00</p>,
  };
  const view = render(<TreadmillMode {...props} elapsed={0} />);
  expect(screen.getByText("30:00")).toBeVisible();
  const elapsed = screen.getByRole("timer", { name: "Elapsed time" });
  expect(elapsed).toHaveTextContent(/^0:00$/);
  expect(elapsed).not.toHaveTextContent(/^30:\d\d$/);
  view.rerender(<TreadmillMode {...props} elapsed={1800} />);
  expect(screen.getAllByText("30:00")).toHaveLength(2);
  expect(screen.getByRole("timer", { name: "Elapsed time" })).toHaveTextContent(
    /^30:00$/
  );
});

describe("typed run distance", () => {
  it.each([
    ["km", "3.1", 3100, "0.04", "0.05"],
    ["mi", "3.1", 4988.9664, "0.03", "0.04"],
  ] as const)(
    "enters %s and hands the run metres with the same 50m floor",
    (unit, value, metres, tooShort, validMinimum) => {
      h.unit = unit;
      const onSave = vi.fn();
      render(
        <TreadmillMode
          elapsed={900}
          formatTime={String}
          onSave={onSave}
          onDiscard={vi.fn()}
        />
      );
      const input = screen.getByRole("spinbutton", {
        name: "Distance from treadmill",
      });
      const save = screen.getByRole("button", { name: "Save Treadmill Run" });
      expect(screen.getByText(unit)).toBeInTheDocument();
      expect(save).toBeDisabled();
      fireEvent.change(input, { target: { value: tooShort } });
      expect(save).toBeDisabled();
      expect(input).toHaveAttribute("aria-invalid", "true");
      fireEvent.change(input, { target: { value: validMinimum } });
      expect(save).toBeEnabled();
      fireEvent.change(input, { target: { value } });
      fireEvent.click(save);
      expect(onSave).toHaveBeenCalledOnce();
      expect(onSave.mock.calls[0][0]).toBeCloseTo(metres, 6);
      // Oversized / non-finite input cannot reach the save callback.
      fireEvent.change(input, { target: { value: "100001" } });
      expect(save).toBeDisabled();
      fireEvent.change(input, { target: { value: "1e999" } });
      expect(save).toBeDisabled();
      expect(onSave).toHaveBeenCalledOnce();
    }
  );
});
