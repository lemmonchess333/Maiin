import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import CollectivePulse from "../CollectivePulse";
import type { Challenge } from "../useChallenges";
import { groupText } from "@/test/localeGrouping";

let unit: "km" | "mi" = "km";
vi.mock("@/hooks/useDistanceUnit", () => ({ useDistanceUnit: () => unit }));

/* The community total is the server's, kept on the goal in whole metres:
   every saved run in the month, joined or not. It reads in the reader's
   distance unit, with how many people ran it. */
const goal = (fields: Partial<Challenge> = {}) =>
  ({
    id: "group-goal",
    name: "Together",
    metric: "total_km",
    collectiveTarget: 1000,
    tiers: { bronze: 1000, silver: 1000, gold: 1000 },
    collectiveMeters: 400000,
    collectiveRunners: 7,
    ...fields,
  }) as unknown as Challenge;

const text = (challenge: Challenge) =>
  (
    render(<CollectivePulse challenge={challenge} />).container.textContent ??
    ""
  ).replace(/\s+/g, " ");

describe("CollectivePulse", () => {
  it("reads km for a km reader, with the people who ran it", () => {
    unit = "km";
    expect(text(goal())).toContain(`400 of ${groupText(1000)} km · 7 runners`);
  });

  it("reads miles for a miles reader", () => {
    unit = "mi";
    // A tenth, in the runtime's own decimal mark (de-DE writes "248,5").
    const tenth = (248.5).toLocaleString(undefined, {
      maximumFractionDigits: 1,
    });
    expect(text(goal())).toContain(`${tenth} of 621 mi`);
    expect(text(goal())).not.toMatch(/\bkm\b/);
  });

  it("counts one runner as one", () => {
    unit = "km";
    expect(text(goal({ collectiveRunners: 1 }))).toContain("· 1 runner");
    expect(text(goal({ collectiveRunners: 1 }))).not.toContain("runners");
  });

  it("is not drawn while nobody has added to it", () => {
    unit = "km";
    for (const fields of [
      { collectiveMeters: undefined, collectiveRunners: undefined },
      { collectiveMeters: 0, collectiveRunners: 0 },
    ]) {
      const { container, unmount } = render(
        <CollectivePulse challenge={goal(fields)} />
      );
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });

  it("shows the figure from the first kilometre, with no explanation", () => {
    unit = "km";
    const line = text(goal({ collectiveMeters: 1000, collectiveRunners: 1 }));
    expect(line).toContain(`1 of ${groupText(1000)} km`);
    expect(line).not.toMatch(/every run counts|starts the board/i);
    expect(line).not.toContain("—");
  });
});
