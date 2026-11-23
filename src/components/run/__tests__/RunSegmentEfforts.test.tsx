/**
 * A run's segment efforts (Run26 call 3): each segment the run was timed
 * on, its time and its place among the runner's own efforts there, opening
 * the segment's page; nothing at all for a run timed on none. The efforts
 * come from useRunSegmentEfforts (its own tests), stubbed here.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { RunSegmentEffort } from "@/hooks/useRunSegmentEfforts";

const H = vi.hoisted(() => ({
  state: { loading: false, failed: false, rows: [] as RunSegmentEffort[] },
}));
vi.mock("@/hooks/useRunSegmentEfforts", () => ({
  useRunSegmentEfforts: () => H.state,
}));

import RunSegmentEfforts from "../RunSegmentEfforts";

const row = (
  id: string,
  name: string,
  elapsedSeconds: number,
  rank: number,
  of: number,
  lengthMeters = 1200
): RunSegmentEffort => ({
  effort: {
    id: `run-1_${id}_1`,
    segmentId: id,
    runId: "run-1",
    lap: 1,
    elapsedSeconds,
    startedAtMs: 1,
    day: "2026-11-10",
  },
  segment: { id, name, lengthMeters, points: [] },
  rank,
  of,
  own: [],
});

const renderCard = (unit: "km" | "mi" = "km") =>
  render(
    <MemoryRouter>
      <RunSegmentEfforts uid="me" runId="run-1" unit={unit} />
    </MemoryRouter>
  );

afterEach(() => cleanup());

describe("RunSegmentEfforts", () => {
  it("lists each segment with its time and its place among your own", () => {
    H.state = {
      loading: false,
      failed: false,
      rows: [
        row("hill", "Common hill", 251, 1, 4, 800),
        row("flat", "Long flat", 3725, 3, 3),
        row("new", "New loop", 300, 1, 1),
      ],
    };
    renderCard();
    const card = screen.getByRole("region", { name: "Segments" });
    const links = within(card).getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/segment/hill",
      "/segment/flat",
      "/segment/new",
    ]);
    expect(links[0]).toHaveTextContent("Common hill800 m4:11Your best");
    expect(links[1]).toHaveTextContent("Long flat1.2 km1:02:05Your 3rd best");
    expect(links[2]).toHaveTextContent("Your first time");
  });

  it("gives the lengths in miles to a reader in miles", () => {
    H.state = {
      loading: false,
      failed: false,
      rows: [row("flat", "Long flat", 600, 1, 2, 3219)],
    };
    renderCard("mi");
    expect(screen.getByRole("link")).toHaveTextContent("2.0 mi");
  });

  it("draws nothing for a run timed on no segment, and nothing while it loads", () => {
    H.state = { loading: false, failed: false, rows: [] };
    const { container, unmount } = renderCard();
    expect(container).toBeEmptyDOMElement();
    unmount();
    H.state = { loading: true, failed: false, rows: [] };
    expect(renderCard().container).toBeEmptyDOMElement();
  });

  it("says when the segments could not be read", () => {
    H.state = { loading: false, failed: true, rows: [] };
    renderCard();
    expect(
      screen.getByText("Couldn’t load this run’s segments.")
    ).toBeVisible();
  });
});
