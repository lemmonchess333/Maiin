import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import BodyInputs from "../BodyInputs";
import { lbToKg } from "@/lib/weightUnits";
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

/* `answered: true` by default — the suite below is about unit conversion
   on figures the user has already given, which needs them in the boxes.
   The unanswered case has its own tests at the foot of the file. */
function setup(answered = true) {
  const changed = vi.fn();
  const valid = vi.fn();
  const answeredSpy = vi.fn();
  function Fixture() {
    const [weight, setWeight] = useState(lbToKg(180));
    const [height, setHeight] = useState(172.72);
    const [unit, setUnit] = useState<"kg" | "lbs" | "st">("lbs");
    const [heightUnit, setHeightUnit] = useState<"cm" | "ft">("cm");
    return (
      <BodyInputs
        answered={answered}
        onAnsweredChange={answeredSpy}
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
  return { changed, valid, answeredSpy };
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

/* A fresh account has not told us anything. The props still carry numbers —
   the dial needs a position and the earlier plan preview estimates against
   them — so the only thing separating "nobody has answered" from "the user
   happens to weigh 75 kg" is this flag. If it stops emptying the fields,
   tapping through writes a stranger's body to the profile. */
describe("body inputs before the user has answered", () => {
  it("renders both fields empty", () => {
    setup(false);
    expect(screen.getByLabelText("Weight (lb)")).toHaveValue("");
    expect(screen.getByLabelText("Height (cm)")).toHaveValue("");
  });

  it("reports not-valid, so the caller cannot advance", () => {
    const { valid } = setup(false);
    expect(valid).toHaveBeenCalledWith(false);
    expect(valid).not.toHaveBeenCalledWith(true);
  });

  it("does not fill the field from the anchor when the unit changes", () => {
    // The unit switch rewrites the field from the canonical kg. Unguarded,
    // it converts the anchor and hands the user a figure to tap past.
    setup(false);
    fireEvent.click(screen.getByRole("radio", { name: "kg" }));
    expect(screen.getByLabelText("Weight (kg)")).toHaveValue("");
  });

  it("becomes answered once both figures are given", () => {
    const { valid, answeredSpy } = setup(false);
    fireEvent.change(screen.getByLabelText("Weight (lb)"), {
      target: { value: "180" },
    });
    // One of two is not an answer.
    expect(answeredSpy).not.toHaveBeenCalledWith(true);
    fireEvent.change(screen.getByLabelText("Height (cm)"), {
      target: { value: "173" },
    });
    expect(answeredSpy).toHaveBeenCalledWith(true);
    expect(valid).toHaveBeenCalledWith(true);
  });

  it("counts a spin of the scale as answering the weight", () => {
    // Typing is not the only way in, and the dial writes the field itself.
    const { answeredSpy } = setup(false);
    fireEvent.change(screen.getByLabelText("Height (cm)"), {
      target: { value: "173" },
    });
    expect(answeredSpy).not.toHaveBeenCalledWith(true);
    fireEvent.change(screen.getByLabelText("Weight scale"), {
      target: { value: "82" },
    });
    expect(answeredSpy).toHaveBeenCalledWith(true);
  });

  it("goes back to unanswered when a field is cleared", () => {
    const { valid } = setup(true);
    valid.mockClear();
    fireEvent.change(screen.getByLabelText("Weight (lb)"), {
      target: { value: "" },
    });
    expect(valid).toHaveBeenLastCalledWith(false);
  });
});
