import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import BodyInputs from "../BodyInputs";
import { lbToKg } from "@/lib/weightUnits";
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

function setup() {
  const changed = vi.fn();
  const valid = vi.fn();
  function Fixture() {
    const [weight, setWeight] = useState(lbToKg(180));
    const [height, setHeight] = useState(172.72);
    const [unit, setUnit] = useState<"kg" | "lbs" | "st">("lbs");
    const [heightUnit, setHeightUnit] = useState<"cm" | "ft">("cm");
    return (
      <BodyInputs
        weightKg={weight}
        heightCm={height}
        weightUnit={unit}
        heightUnit={heightUnit}
        onWeight={(kg) => {
          changed(kg);
          setWeight(kg);
        }}
        onHeight={setHeight}
        onWeightUnit={setUnit}
        onHeightUnit={setHeightUnit}
        onValidityChange={valid}
      />
    );
  }
  render(<Fixture />);
  return { changed, valid };
}
describe("setup body inputs", () => {
  it("keeps canonical precision across pounds, kg and stone without an input write", () => {
    const { changed } = setup();
    fireEvent.click(screen.getByRole("radio", { name: "kg" }));
    fireEvent.click(screen.getByRole("radio", { name: "st" }));
    expect(screen.getByRole("textbox", { name: "Weight (st)" })).toHaveValue(
      "12"
    );
    expect(screen.getByRole("textbox", { name: "Pounds" })).toHaveValue("12");
    fireEvent.click(screen.getByRole("radio", { name: "lb" }));
    expect(screen.getByRole("textbox", { name: "Weight (lb)" })).toHaveValue(
      "180.0"
    );
    expect(changed).not.toHaveBeenCalled();
  });
  it("blocks invalid typing and recovers with a valid value", () => {
    const { changed, valid } = setup();
    fireEvent.change(screen.getByRole("textbox", { name: "Weight (lb)" }), {
      target: { value: "" },
    });
    expect(valid).toHaveBeenLastCalledWith(false);
    expect(changed).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("textbox", { name: "Weight (lb)" }), {
      target: { value: "181.5" },
    });
    expect(valid).toHaveBeenLastCalledWith(true);
    expect(changed).toHaveBeenLastCalledWith(lbToKg(181.5));
  });
  it("renders feet and inches with carry handled and allows direct height typing", () => {
    setup();
    fireEvent.click(screen.getByRole("radio", { name: "ft / in" }));
    expect(screen.getByLabelText("Height (ft)")).toHaveValue("5");
    expect(screen.getByRole("textbox", { name: "Inches" })).toHaveValue("8");
    fireEvent.change(screen.getByRole("textbox", { name: "Inches" }), {
      target: { value: "9" },
    });
    fireEvent.click(screen.getByRole("radio", { name: "cm" }));
    expect(screen.getByLabelText("Height (cm)")).toHaveValue("175.3");
  });
});
