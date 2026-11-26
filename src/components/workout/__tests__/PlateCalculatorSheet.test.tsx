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

  it("expands a warm-up ramp with per-side plates and updates when switching bars", () => {
    render(<PlateCalculatorSheet open onClose={() => {}} weightKg={100} />);
    const toggle = screen.getByRole("button", { name: /warm-up ramp/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Bar only")).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("20 kg × 8")).toBeInTheDocument();
    expect(screen.getByText("Bar only")).toBeInTheDocument();
    expect(screen.getByText("50 kg × 5")).toBeInTheDocument();
    expect(screen.getByText("70 kg × 3")).toBeInTheDocument();
    expect(screen.getByText("85 kg × 1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /15 kg bar/i }));
    expect(screen.getByText("15 kg × 8")).toBeInTheDocument();
  });

  it("omits the warm-up ramp when working weight is at or below the bar", () => {
    render(<PlateCalculatorSheet open onClose={() => {}} weightKg={20} />);
    expect(
      screen.queryByRole("button", { name: /warm-up ramp/i })
    ).not.toBeInTheDocument();
  });
});
