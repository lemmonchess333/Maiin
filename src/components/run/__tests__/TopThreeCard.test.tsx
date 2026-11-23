/**
 * Your top three on the run finish (Run29): only the distances the run
 * placed 1st to 3rd at, each with its numbered disc, its time and your
 * best, and one sentence on a 2nd or 3rd.
 */
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import TopThreeCard from "../TopThreeCard";

afterEach(() => cleanup());

describe("TopThreeCard", () => {
  it("lists a 2nd at 5K and a 3rd at 1K, and says the best placing", () => {
    render(
      <TopThreeCard
        placings={[
          { meters: 1000, seconds: 262, place: 3, bestSeconds: 248 },
          { meters: 5000, seconds: 1541, place: 2, bestSeconds: 1510 },
        ]}
      />
    );
    const card = screen.getByRole("region", { name: "Your top three" });
    expect(card.textContent).toContain("Ran 5K in 25:41, your 2nd fastest.");
    const rows = within(card)
      .getAllByRole("listitem")
      .map((row) => row.textContent);
    // The disc is read as its place; its numeral alone is hidden.
    expect(rows).toEqual([
      "33rd fastest1K4:22best 4:08",
      "22nd fastest5K25:41best 25:10",
    ]);
  });

  it("keeps a 1st in the list and leaves its sentence to the reward", () => {
    render(
      <TopThreeCard
        placings={[
          { meters: 1000, seconds: 240, place: 1, bestSeconds: 248 },
          { meters: 5000, seconds: 1541, place: 2, bestSeconds: 1510 },
        ]}
      />
    );
    const card = screen.getByRole("region", { name: "Your top three" });
    expect(card.querySelector("p")).toBeNull();
    expect(within(card).getAllByRole("listitem")[0].textContent).toContain(
      "New best"
    );
  });

  it("says no sentence of its own under the hero's reward, and keeps the rows", () => {
    /* A first 10K, a streak or the longest run is the hero's sentence;
       a finish says one (DESIGN_GUIDE rule 30). */
    render(
      <TopThreeCard
        rewardAbove
        placings={[
          { meters: 1000, seconds: 262, place: 3, bestSeconds: 248 },
          { meters: 5000, seconds: 1541, place: 2, bestSeconds: 1510 },
        ]}
      />
    );
    const card = screen.getByRole("region", { name: "Your top three" });
    expect(card.querySelector("p")).toBeNull();
    expect(card.textContent).not.toContain("your 2nd fastest.");
    expect(
      within(card)
        .getAllByRole("listitem")
        .map((row) => row.textContent)
    ).toEqual(["33rd fastest1K4:22best 4:08", "22nd fastest5K25:41best 25:10"]);
  });

  it("renders nothing when the run placed nowhere", () => {
    const { container } = render(<TopThreeCard placings={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
