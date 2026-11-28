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

  /* One ramp on one screen (Lift4 (5)): the sheet plates up the warm-up
     sets the session lists, and works out none of its own. It used to:
     for 100 kg × 8 the session listed bar × 10, 50 × 5 and 70 × 3 while
     the sheet on top of it listed bar × 8, 50 × 5, 70 × 3 and 85 × 1. */
  const SESSION_RAMP = [
    { weight: 20, reps: 10 },
    { weight: 50, reps: 5 },
    { weight: 70, reps: 3 },
  ];

  it("plates up the session's own warm-up sets and adds none", () => {
    render(
      <PlateCalculatorSheet
        open
        onClose={() => {}}
        weightKg={100}
        warmups={SESSION_RAMP}
      />
    );
    const toggle = screen.getByRole("button", { name: /warm-up ramp/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveTextContent("3 sets");
    expect(screen.queryByText("Bar only")).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const rows = screen.getAllByRole("listitem");
    expect(rows.map((row) => row.textContent)).toEqual([
      "20 kg × 10Bar only",
      "50 kg × 51×15",
      "70 kg × 31×25",
    ]);
    expect(screen.queryByText(/85 kg/)).not.toBeInTheDocument();

    // The bar changes the plates, never the session's weights.
    fireEvent.click(screen.getByRole("button", { name: /15 kg bar/i }));
    expect(
      screen.getAllByRole("listitem").map((row) => row.textContent)
    ).toEqual([
      "20 kg × 101×2.5",
      "50 kg × 51×15 + 1×2.5",
      "70 kg × 31×25 + 1×2.5",
    ]);
  });

  it("draws no ramp for an exercise the session gives no warm-up", () => {
    render(<PlateCalculatorSheet open onClose={() => {}} weightKg={100} />);
    expect(screen.getByText("1 × 25")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /warm-up ramp/i })
    ).not.toBeInTheDocument();
  });

  it("plates up a pound kit's warm-ups in pounds", () => {
    unitMock.current = "lbs";
    render(
      <PlateCalculatorSheet
        open
        onClose={() => {}}
        weightKg={lbToKg(225)}
        warmups={[
          { weight: lbToKg(45), reps: 10 },
          { weight: lbToKg(115), reps: 5 },
          { weight: lbToKg(160), reps: 3 },
        ]}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /warm-up ramp/i }));
    expect(
      screen.getAllByRole("listitem").map((row) => row.textContent)
    ).toEqual([
      "45 lb × 10Bar only",
      "115 lb × 51×35",
      "160 lb × 31×45 + 1×10 + 1×2.5",
    ]);
  });
});
