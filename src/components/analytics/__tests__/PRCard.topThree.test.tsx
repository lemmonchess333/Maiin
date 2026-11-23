/**
 * Your top three on Bests (Run29): under a Fastest row, your 2nd and 3rd
 * fastest at the distance, each with its numbered disc, opening its run.
 */
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import PRCard from "../PRCard";

afterEach(() => cleanup());

describe("PRCard's top three", () => {
  it("lists the 2nd and 3rd under the Fastest row, each opening its run", () => {
    render(
      <MemoryRouter>
        <PRCard
          title="Running bests"
          prs={[
            {
              label: "Fastest 5K",
              value: "24:10",
              date: "18 Aug",
              runId: "best",
              runnersUp: [
                {
                  place: 2,
                  label: "5K",
                  value: "25:10",
                  date: "2 Aug",
                  runId: "second",
                },
                {
                  place: 3,
                  label: "5K",
                  value: "25:41",
                  date: "14 Jul",
                  runId: "third",
                },
              ],
            },
            { label: "Longest run", value: "21.1 km", date: "22 Aug" },
          ]}
        />
      </MemoryRouter>
    );
    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.getAttribute("aria-label"))).toEqual([
      "Fastest 5K, 24:10, 18 Aug. View this run.",
      "5K, 2nd fastest, 25:10, 2 Aug. View this run.",
      "5K, 3rd fastest, 25:41, 14 Jul. View this run.",
    ]);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/run/best",
      "/run/second",
      "/run/third",
    ]);
    // The disc's numeral is drawn, and the link's name says the place.
    expect(links[1].querySelector('[aria-hidden="true"]')?.textContent).toBe(
      "2"
    );
    expect(screen.getByText("Longest run")).toBeInTheDocument();
  });
});
