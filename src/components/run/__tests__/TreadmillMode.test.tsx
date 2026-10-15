import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import TreadmillMode from "../TreadmillMode";

const h = vi.hoisted(() => ({ unit: "km" as "km" | "mi" }));
vi.mock("@/hooks/useDistanceUnit", () => ({ useDistanceUnit: () => h.unit }));
afterEach(cleanup);

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
