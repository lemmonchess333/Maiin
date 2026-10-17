import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import CollectivePulse from "../CollectivePulse";
import type { Challenge, ChallengeParticipant } from "../useChallenges";

let unit: "km" | "mi" = "km";
vi.mock("@/hooks/useDistanceUnit", () => ({ useDistanceUnit: () => unit }));

/* Together pass: the community total reads in the reader's distance unit.
   The board stores kilometres. */
const challenge = {
  id: "group-goal",
  name: "Together",
  metric: "total_km",
  collectiveTarget: 1000,
  tiers: { bronze: 1000, silver: 1000, gold: 1000 },
} as unknown as Challenge;
const board = [
  { uid: "a", currentValue: 300 },
  { uid: "b", currentValue: 100 },
] as unknown as ChallengeParticipant[];

const text = () =>
  render(<CollectivePulse challenge={challenge} leaderboard={board} />)
    .container.textContent ?? "";

describe("CollectivePulse", () => {
  it("reads km for a km reader", () => {
    unit = "km";
    expect(text()).toMatch(/400\.0\s*of\s*1.000\s*km/);
  });

  it("reads miles for a miles reader", () => {
    unit = "mi";
    expect(text()).toMatch(/248\.5\s*of\s*621\s*mi/);
    expect(text()).not.toMatch(/\bkm\b/);
  });
});
