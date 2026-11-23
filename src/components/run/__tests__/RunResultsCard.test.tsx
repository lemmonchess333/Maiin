/**
 * A run's results on the run finish, one block as Strava's Results: your
 * top three (Run29), the distances the run placed 1st to 3rd at, then its
 * segments that placed (Run30 call 1), each with its numbered disc, its
 * time and your best, and at most one sentence (DESIGN_GUIDE rule 30).
 */
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ComponentProps } from "react";
import RunResultsCard from "../RunResultsCard";
import type { SegmentPlacing } from "@/lib/segments";

afterEach(() => cleanup());

const renderCard = (props: ComponentProps<typeof RunResultsCard>) =>
  render(
    <MemoryRouter>
      <RunResultsCard {...props} />
    </MemoryRouter>
  );

const segment = (
  segmentId: string,
  name: string,
  place: 1 | 2 | 3,
  seconds: number,
  bestSeconds: number
): SegmentPlacing => ({
  segmentId,
  name,
  lengthMeters: 1200,
  seconds,
  place,
  bestSeconds,
});

const rowsOf = (card: HTMLElement) =>
  within(card)
    .getAllByRole("listitem")
    .map((row) => row.textContent);

describe("RunResultsCard", () => {
  it("lists a 2nd at 5K and a 3rd at 1K, and says the best placing", () => {
    renderCard({
      placings: [
        { meters: 1000, seconds: 262, place: 3, bestSeconds: 248 },
        { meters: 5000, seconds: 1541, place: 2, bestSeconds: 1510 },
      ],
    });
    const card = screen.getByRole("region", { name: "Results" });
    expect(card.textContent).toContain("Ran 5K in 25:41, your 2nd fastest.");
    // The disc is read as its place; its numeral alone is hidden.
    expect(rowsOf(card)).toEqual([
      "33rd fastest1K4:22best 4:08",
      "22nd fastest5K25:41best 25:10",
    ]);
  });

  it("keeps a 1st in the list and leaves its sentence to the reward", () => {
    renderCard({
      placings: [
        { meters: 1000, seconds: 240, place: 1, bestSeconds: 248 },
        { meters: 5000, seconds: 1541, place: 2, bestSeconds: 1510 },
      ],
    });
    const card = screen.getByRole("region", { name: "Results" });
    expect(card.querySelector("p")).toBeNull();
    expect(within(card).getAllByRole("listitem")[0].textContent).toContain(
      "New best"
    );
  });

  it("says no sentence of its own under the hero's reward, and keeps the rows", () => {
    /* A first 10K, a streak or the longest run is the hero's sentence;
       a finish says one (DESIGN_GUIDE rule 30). */
    renderCard({
      rewardAbove: true,
      placings: [
        { meters: 1000, seconds: 262, place: 3, bestSeconds: 248 },
        { meters: 5000, seconds: 1541, place: 2, bestSeconds: 1510 },
      ],
      segments: [segment("s1", "Hill Road", 2, 217, 209)],
    });
    const card = screen.getByRole("region", { name: "Results" });
    expect(card.querySelector("p")).toBeNull();
    expect(rowsOf(card)).toHaveLength(3);
  });

  it("lists the segments after the distances, each opening its segment", () => {
    renderCard({
      placings: [{ meters: 5000, seconds: 1541, place: 2, bestSeconds: 1510 }],
      segments: [
        segment("s1", "Hill Road", 1, 205, 209),
        segment("s2", "River path", 3, 300, 280),
      ],
    });
    const card = screen.getByRole("region", { name: "Results" });
    expect(rowsOf(card)).toEqual([
      "22nd fastest5K25:41best 25:10",
      "1FastestHill Road1.2 km3:25New best",
      "33rd fastestRiver path1.2 km5:00best 4:40",
    ]);
    expect(
      within(card).getByRole("link", { name: /Hill Road/ })
    ).toHaveAttribute("href", "/segment/s1");
    // One sentence: the strongest place, the segment's 1st.
    expect(card.querySelectorAll("p")).toHaveLength(1);
    expect(card.textContent).toContain(
      "Ran Hill Road in 3:25, your fastest yet."
    );
  });

  it("names the first segment when no distance placed", () => {
    renderCard({
      placings: [],
      segments: [segment("s1", "Hill Road", 2, 217, 209)],
    });
    const card = screen.getByRole("region", { name: "Results" });
    expect(card.textContent).toContain(
      "Ran Hill Road in 3:37, your 2nd fastest."
    );
  });

  it("leads with a segment's 1st over a 5K 2nd: the strongest place", () => {
    renderCard({
      placings: [{ meters: 5000, seconds: 1541, place: 2, bestSeconds: 1510 }],
      segments: [segment("s1", "Tooting Bec hill", 1, 147, 151)],
    });
    const card = screen.getByRole("region", { name: "Results" });
    expect(card.querySelectorAll("p")).toHaveLength(1);
    expect(card.textContent).toContain(
      "Ran Tooting Bec hill in 2:27, your fastest yet."
    );
    expect(card.textContent).not.toContain("your 2nd fastest.");
  });

  it("says a segment's 1st when nothing above has a reward", () => {
    renderCard({
      placings: [],
      segments: [segment("s1", "Hill Road", 1, 205, 209)],
    });
    expect(
      screen.getByRole("region", { name: "Results" }).textContent
    ).toContain("Ran Hill Road in 3:25, your fastest yet.");
  });

  it("lists three segments and sends the rest to the run's page", () => {
    renderCard({
      placings: [],
      runId: "run-9",
      segments: [
        segment("s1", "One", 1, 100, 110),
        segment("s2", "Two", 1, 100, 110),
        segment("s3", "Three", 2, 120, 110),
        segment("s4", "Four", 3, 130, 110),
        segment("s5", "Five", 3, 130, 110),
      ],
    });
    const card = screen.getByRole("region", { name: "Results" });
    expect(within(card).getAllByRole("listitem")).toHaveLength(3);
    expect(
      within(card).getByRole("link", {
        name: "2 more segments on the run’s page",
      })
    ).toHaveAttribute("href", "/run/run-9");
  });

  it("renders nothing when the run placed nowhere", () => {
    const { container } = renderCard({ placings: [], segments: [] });
    expect(container).toBeEmptyDOMElement();
  });
});
