/**
 * Races & Events directory section (races plan PR2) — pins the
 * kind-split composition: interest carousel + a Races & Events row in
 * the full directory, race-card anatomy (RACE chip, date + city), and
 * the Q6 gate (compact Feed row never requests races).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { SpaceDirectoryEntry } from "../useSpacesDirectory";

const mockUseSpacesDirectory = vi.fn();
vi.mock("../useSpacesDirectory", () => ({
  useSpacesDirectory: (includeRaces: boolean) =>
    mockUseSpacesDirectory(includeRaces),
}));

import SpacesDirectory from "../SpacesDirectory";

const INTEREST: SpaceDirectoryEntry = {
  def: {
    id: "runners",
    name: "Runners",
    tagline: "t",
    kind: "interest",
    accent: "running",
    icon: "footprints",
  },
  memberCount: 12,
  joined: false,
};

const RACE: SpaceDirectoryEntry = {
  def: {
    id: "great-north-run",
    name: "Great North Run",
    tagline: "t",
    kind: "race",
    accent: "running",
    icon: "flag",
    event: {
      dateKey: "2026-09-13",
      distance: "half",
      city: "Newcastle",
      countryFlag: "🇬🇧",
      websiteUrl: "https://www.greatrun.org/events/great-north-run/",
    },
  },
  memberCount: 2,
  joined: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUseSpacesDirectory.mockReturnValue({
    entries: [INTEREST, RACE],
    refresh: vi.fn(),
  });
});

function renderDirectory(props = {}) {
  return render(
    <MemoryRouter>
      <SpacesDirectory {...props} />
    </MemoryRouter>
  );
}

describe("SpacesDirectory — Races & Events", () => {
  it("full directory requests races and renders them in their own row", () => {
    renderDirectory();
    expect(mockUseSpacesDirectory).toHaveBeenCalledWith(true);
    expect(screen.getByText("Races & Events")).toBeInTheDocument();
    expect(screen.getByText("Great North Run")).toBeInTheDocument();
    // Interest row unchanged alongside
    expect(screen.getByText("Spaces")).toBeInTheDocument();
    expect(screen.getByText("Runners")).toBeInTheDocument();
  });

  it("race card shows RACE chip + date · city, not a member count", () => {
    renderDirectory();
    expect(screen.getByText("Race")).toBeInTheDocument();
    expect(screen.getByText(/13 Sep 2026/)).toBeInTheDocument();
    expect(screen.getByText(/Newcastle/)).toBeInTheDocument();
    // Density gate stays interest-only territory: the race card never
    // renders a count line, whatever its membership.
    expect(screen.queryByText("2 members")).not.toBeInTheDocument();
  });

  it("each carousel row opts out of page-swipe navigation (data-no-page-swipe)", () => {
    // Regression guard: a horizontal swipe to scroll the Spaces / Races
    // carousels must NOT trigger the page/tab swipe-nav gesture.
    renderDirectory();
    const rows = screen.getAllByRole("list");
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row).toHaveAttribute("data-no-page-swipe");
    }
  });

  it("compact row never requests races (Q6 calm-feed lock)", () => {
    mockUseSpacesDirectory.mockReturnValue({
      entries: [INTEREST],
      refresh: vi.fn(),
    });
    renderDirectory({ compact: true, title: "Spaces for you" });
    expect(mockUseSpacesDirectory).toHaveBeenCalledWith(false);
    expect(screen.queryByText("Races & Events")).not.toBeInTheDocument();
  });

  it("races row collapses when no upcoming races are in the entries", () => {
    mockUseSpacesDirectory.mockReturnValue({
      entries: [INTEREST],
      refresh: vi.fn(),
    });
    renderDirectory();
    expect(screen.queryByText("Races & Events")).not.toBeInTheDocument();
    expect(screen.getByText("Runners")).toBeInTheDocument();
  });
});
