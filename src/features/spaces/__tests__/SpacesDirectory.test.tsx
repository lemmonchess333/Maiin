/**
 * Races & Events directory section (races plan PR2) — pins the
 * kind-split composition: interest carousel + a Races & Events row,
 * race-card anatomy (RACE chip, date + city), and the race filter chips
 * (2026-10-01; two selects before). The Feed's compact row, and the Q6
 * gate that kept races out of it, went the same day with the row.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { filterRaceDefs, type RaceBrowseFilters } from "../raceBrowse";
import { spaceDef } from "../spaceDefs";
import type { SpaceDirectoryEntry } from "../useSpacesDirectory";

const mockUseSpacesDirectory = vi.fn();
vi.mock("../useSpacesDirectory", () => ({
  useSpacesDirectory: (includeRaces: boolean, filters: RaceBrowseFilters) =>
    mockUseSpacesDirectory(includeRaces, filters),
}));

/* The real sheet animates out, and jsdom never ends the animation, so a
   closed sheet would keep the page hidden. Open or not is all this
   suite needs. */
vi.mock("@/components/ui/BottomSheet", () => ({
  BottomSheet: ({
    open,
    title,
    children,
  }: {
    open: boolean;
    title: string;
    children: React.ReactNode;
  }) =>
    open ? (
      <div role="dialog" aria-label={title}>
        {children}
      </div>
    ) : null,
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
      countryCode: "GB",
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
    upcomingRaces: [RACE.def],
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
    expect(mockUseSpacesDirectory).toHaveBeenCalledWith(true, {
      country: "GB",
      distance: "all",
    });
    // Section headings, as every other page's groups have (DS3): they were
    // 12px grey labels beside Social's own "Circles" heading.
    expect(
      screen.getByRole("heading", { name: "Races & events" })
    ).toBeInTheDocument();
    expect(screen.getByText("Great North Run")).toBeInTheDocument();
    // Interest row unchanged alongside
    expect(screen.getByRole("heading", { name: "Spaces" })).toBeInTheDocument();
    expect(screen.getByText("Runners")).toBeInTheDocument();
  });

  it("race card shows its distance chip + date · city, not a member count", () => {
    renderDirectory();
    expect(
      within(
        screen.getByRole("link", { name: "Great North Run space" })
      ).getByText("Half marathon")
    ).toBeInTheDocument();
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

  it("races row collapses when no upcoming races are in the entries", () => {
    mockUseSpacesDirectory.mockReturnValue({
      entries: [INTEREST],
      upcomingRaces: [],
      refresh: vi.fn(),
    });
    renderDirectory();
    expect(screen.queryByText("Races & events")).not.toBeInTheDocument();
    expect(screen.getByText("Runners")).toBeInTheDocument();
  });
});

it("keeps filters visible through no matches and recovers across countries", async () => {
  const berlin = spaceDef("berlin-marathon")!;
  mockUseSpacesDirectory.mockImplementation((_include, filters) => ({
    entries: [
      INTEREST,
      ...filterRaceDefs([RACE.def, berlin], filters).map((def) => ({
        def,
        memberCount: null,
        joined: false,
      })),
    ],
    upcomingRaces: [RACE.def, berlin],
    refresh: vi.fn(),
  }));
  renderDirectory();
  expect(
    screen.queryByRole("link", { name: "Berlin Marathon space" })
  ).not.toBeInTheDocument();
  // The country chip names the default and opens its sheet.
  fireEvent.click(
    screen.getByRole("button", { name: "Country: United Kingdom" })
  );
  fireEvent.click(
    within(screen.getByRole("radiogroup", { name: "Country" })).getByRole(
      "radio",
      { name: /Germany/ }
    )
  );
  // The sheet closes on the pick.
  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: "Country" })).toBeNull()
  );
  // Distances pick in place.
  const distance = screen.getByRole("radiogroup", { name: "Distance" });
  fireEvent.click(within(distance).getByRole("radio", { name: "Half" }));
  expect(within(distance).getByRole("radio", { name: "Half" })).toHaveAttribute(
    "aria-checked",
    "true"
  );
  expect(screen.getByText("No matching races")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Country: Germany" })
  ).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Runners space" })
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
  expect(
    screen.getByRole("link", { name: "Berlin Marathon space" })
  ).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Great North Run space" })
  ).toBeInTheDocument();
});
