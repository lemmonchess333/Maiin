import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { lbToKg } from "@/lib/weightUnits";

const unitMock = vi.hoisted(() => ({ current: "kg" as "kg" | "lbs" }));
vi.mock("@/hooks/useLiftUnit", () => ({
  useLiftUnit: () => unitMock.current,
}));

import PlateCalculatorSheet from "../PlateCalculatorSheet";

afterEach(() => {
  cleanup();
  unitMock.current = "kg";
});

describe("PlateCalculatorSheet", () => {
  it("loads fractional metric weights exactly when smallPlates is enabled", () => {
    render(
      <PlateCalculatorSheet
        open
        onClose={() => {}}
        weightKg={61.25}
        smallPlates
      />
    );
    expect(
      screen.getByText(/20 kg bar · per side · small plates/)
    ).toBeInTheDocument();
    expect(screen.getByText("1 × 20")).toBeInTheDocument();
    expect(screen.getByText("1 × 0.625")).toBeInTheDocument();
    expect(screen.queryByText(/can’t be loaded/)).not.toBeInTheDocument();
  });

  it("switches cleanly between the 20 kg and 15 kg bar", () => {
    render(<PlateCalculatorSheet open onClose={() => {}} weightKg={55} />);
    expect(screen.getByText("1 × 15")).toBeInTheDocument();
    expect(screen.getByText("1 × 2.5")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /15 kg bar/i }));
    expect(screen.getByText(/15 kg bar · per side/)).toBeInTheDocument();
    expect(screen.getByText("1 × 20")).toBeInTheDocument();
    expect(screen.queryByText("1 × 2.5")).not.toBeInTheDocument();
  });

  it("supports lb kits with 45/35 lb bar toggle and small plates", () => {
    unitMock.current = "lbs";
    render(
      <PlateCalculatorSheet
        open
        onClose={() => {}}
        weightKg={lbToKg(137.5)}
        smallPlates
      />
    );
    expect(screen.getByText("1 × 45")).toBeInTheDocument();
    expect(screen.getByText("1 × 1.25")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /35 lb bar/i }));
    expect(
      screen.getByText(/35 lb bar · per side · small plates/)
    ).toBeInTheDocument();
  });
});
