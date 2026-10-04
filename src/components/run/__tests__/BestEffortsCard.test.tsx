/**
 * Best efforts, as the finish screen and a saved run both list them.
 */
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import BestEffortsCard from "../BestEffortsCard";

afterEach(() => cleanup());

describe("BestEffortsCard", () => {
  it("lists each effort with its time, a 10K over the hour as h:mm:ss", () => {
    render(
      <BestEffortsCard
        efforts={[
          { distance: 1000, time: 292.4, label: "1K" },
          { distance: 5000, time: 1510, label: "5K" },
          { distance: 10000, time: 3750, label: "10K" },
        ]}
      />
    );
    const card = screen.getByRole("region", { name: "Best efforts" });
    const pairs = within(card)
      .getAllByRole("term")
      .map((term) => `${term.textContent} ${term.nextSibling?.textContent}`);
    // The old tiles printed a 62:30 10K as "62:30".
    expect(pairs).toEqual(["1K 4:52", "5K 25:10", "10K 1:02:30"]);
  });

  it("renders nothing when the run has no effort to list", () => {
    const { container } = render(<BestEffortsCard efforts={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
