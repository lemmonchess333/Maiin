import { describe, it, expect } from "vitest";
import { validateCableLadder, type CableMachineLadder } from "../formArtCable";
const ladder = (ratio = 1): CableMachineLadder => ({
  routing: "One fixed high pulley",
  payoutPerStackRise: ratio,
  initialStackLiftMm: 20,
  totalPlates: 12,
  selectedPlates: 4,
  states: [0, 20, 100, 200, 300, 80].map((payoutMm) => ({
    payoutMm,
    stackLiftMm: 20 + payoutMm / ratio,
  })),
});
describe("cable/stack physical ladder", () => {
  it("handles direct and mechanical-advantage routing including the return", () => {
    expect(validateCableLadder(ladder())).toEqual([]);
    expect(validateCableLadder(ladder(2))).toEqual([]);
  });
  it("rejects reversed or frozen stack movement", () => {
    const plan = ladder();
    plan.states[4].stackLiftMm = 20;
    expect(validateCableLadder(plan)).toContain(
      "Frame 5: stack gap contradicts cable payout."
    );
  });
  it("rejects impossible plate counts, invalid values and incomplete ladders", () => {
    for (const plan of [
      { ...ladder(), selectedPlates: 13 },
      { ...ladder(), payoutPerStackRise: 0 },
      { ...ladder(), initialStackLiftMm: NaN },
      { ...ladder(), states: [] },
    ])
      expect(validateCableLadder(plan).length).toBeGreaterThan(0);
  });
});
