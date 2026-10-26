import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import CollectivePulse from "../CollectivePulse";
import type { Challenge, ChallengeParticipant } from "../useChallenges";
import { groupText } from "@/test/localeGrouping";

let unit: "km" | "mi" = "km";
vi.mock("@/hooks/useDistanceUnit", () => ({ useDistanceUnit: () => unit }));

/* The community total reads in the reader's distance unit, and the line
   under the name is the figure alone. The board stores kilometres. */
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

const text = (leaderboard: ChallengeParticipant[]) =>
  (
    render(<CollectivePulse challenge={challenge} leaderboard={leaderboard} />)
      .container.textContent ?? ""
  ).replace(/\s+/g, " ");

describe("CollectivePulse", () => {
  it("reads km for a km reader", () => {
    unit = "km";
    expect(text(board)).toContain(`400 of ${groupText(1000)} km`);
  });

  it("reads miles for a miles reader", () => {
    unit = "mi";
    // A tenth, in the runtime's own decimal mark (de-DE writes "248,5").
    const tenth = (248.5).toLocaleString(undefined, {
      maximumFractionDigits: 1,
    });
    expect(text(board)).toContain(`${tenth} of 621 mi`);
    expect(text(board)).not.toMatch(/\bkm\b/);
  });

  it("shows the figure from the first kilometre, with no explanation", () => {
    unit = "km";
    const line = text([]);
    expect(line).toContain(`0 of ${groupText(1000)} km`);
    expect(line).not.toMatch(/every run counts|starts the board/i);
    expect(line).not.toContain("—");
  });
});
