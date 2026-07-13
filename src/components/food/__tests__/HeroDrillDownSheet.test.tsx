/**
 * HeroDrillDownSheet — training-aware fuel story + honest Pro gate.
 *
 * Pins that the drill-down explains WHY today's grams differ using the exact
 * delta the nutrition engine already computed (Pro), shows an honest
 * capability gate for free users (never claims an unapplied change), and opens
 * the contextual ProModal only after the BottomSheet has closed (no nested
 * focus traps).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { useState } from "react";
import HeroDrillDownSheet from "../HeroDrillDownSheet";
import type { EffectiveTargets } from "@/hooks/useEffectiveTargets";
import type { TrainingFuelAdjustment } from "@/hooks/useEffectiveTargets";

let mockIsPro = false;
vi.mock("@/lib/subscription", () => ({
  useSubscription: () => ({ isPro: mockIsPro }),
}));

// Stub ProModal so we can assert it mounts with the right feature key without
// dragging in its heavy dependency tree.
vi.mock("@/components/ProModal", () => ({
  default: ({ featureKey }: { featureKey?: string }) => (
    <div data-testid="pro-modal" data-feature={featureKey} />
  ),
}));

afterEach(() => {
  cleanup();
  mockIsPro = false;
});

const fuel = (o: Partial<TrainingFuelAdjustment>): TrainingFuelAdjustment => ({
  intensity: "HARD",
  eligible: true,
  applied: true,
  carbDeltaG: 0,
  fatDeltaG: 0,
  proteinDeltaG: 0,
  ...o,
});

function targets(o: Partial<EffectiveTargets> = {}): EffectiveTargets {
  return {
    baseTarget: 2500,
    dayType: "lift",
    isRunDay: false,
    actualBurn: 0,
    actualLiftBurn: 0,
    actualRunBurn: 0,
    hasCompletedActivity: false,
    finalTarget: 2500,
    adaptiveSource: "formula",
    showWarmup: false,
    warmupFraction: 0,
    adaptiveStalled: false,
    protein: 180,
    carbs: 300,
    fat: 60,
    annotation: "Hard session",
    caption: null,
    targetTooAggressive: false,
    taperActive: false,
    trainingFuel: fuel({ eligible: false, applied: false }),
    ...o,
  };
}

const totals = { calories: 0, protein: 0, carbs: 0, fat: 0 };

// Controlled wrapper so onOpenChange(false) actually closes the sheet (the
// queued-paywall flow depends on the `open` prop flipping to false).
function Harness({ dailyTargets }: { dailyTargets: EffectiveTargets }) {
  const [open, setOpen] = useState(true);
  return (
    <HeroDrillDownSheet
      open={open}
      onOpenChange={setOpen}
      selectedDate="2026-07-13"
      isToday
      dailyTotals={totals}
      dailyTargets={dailyTargets}
    />
  );
}

describe("HeroDrillDownSheet — training-aware fuel", () => {
  it("rest day: no training-fuel section", () => {
    render(<Harness dailyTargets={targets()} />);
    expect(screen.queryByLabelText("Training-aware fuel")).toBeNull();
  });

  it("Pro hard day: shows the exact -fat / +carbs delta", () => {
    mockIsPro = true;
    render(
      <Harness
        dailyTargets={targets({
          trainingFuel: fuel({
            carbDeltaG: 40,
            fatDeltaG: 18,
            proteinDeltaG: 0,
          }),
        })}
      />
    );
    const section = screen.getByLabelText("Training-aware fuel");
    expect(section.textContent).toContain("-18g fat");
    expect(section.textContent).toContain("+40g carbs");
    expect(
      screen.queryByRole("button", { name: /training-aware macros/i })
    ).toBeNull();
  });

  it("Pro constrained day: fat→protein protection copy, no fake carb claim", () => {
    mockIsPro = true;
    render(
      <Harness
        dailyTargets={targets({
          targetTooAggressive: true,
          trainingFuel: fuel({
            carbDeltaG: 0,
            fatDeltaG: 12,
            proteinDeltaG: 9,
          }),
        })}
      />
    );
    const section = screen.getByLabelText("Training-aware fuel");
    expect(section.textContent).toContain("-12g fat");
    expect(section.textContent).toContain("+9g protein");
    expect(section.textContent).not.toContain("+0g carbs");
  });

  it("free hard day: capability copy that never claims the shift happened", () => {
    render(
      <Harness
        dailyTargets={targets({ trainingFuel: fuel({ applied: false }) })}
      />
    );
    const section = screen.getByLabelText("Training-aware fuel");
    expect(section.textContent).toMatch(/Pro shifts carbs up and fat down/i);
    expect(section.textContent).not.toMatch(/Today uses/i); // no applied-change claim
    expect(
      screen.getByRole("button", { name: /See training-aware macros/i })
    ).toBeInTheDocument();
  });

  it("free CTA opens ProModal (adaptive_macros) only after the sheet closes", async () => {
    render(
      <Harness
        dailyTargets={targets({ trainingFuel: fuel({ applied: false }) })}
      />
    );
    // Not mounted before the request — the paywall is queued until the
    // controlled `open` prop is observed false (no nested focus traps).
    expect(screen.queryByTestId("pro-modal")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: /See training-aware macros/i })
    );
    const modal = await waitFor(() => screen.getByTestId("pro-modal"));
    expect(modal.getAttribute("data-feature")).toBe("adaptive_macros");
  });

  it("Pro user never sees the paywall CTA", () => {
    mockIsPro = true;
    render(
      <Harness
        dailyTargets={targets({
          trainingFuel: fuel({ carbDeltaG: 20, fatDeltaG: 9 }),
        })}
      />
    );
    expect(
      screen.queryByRole("button", { name: /training-aware macros/i })
    ).toBeNull();
  });
});
