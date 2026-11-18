/**
 * Races & Events directory section (races plan PR2) — pins the
 * kind-split composition: interest carousel + a Races & Events row,
 * race-card anatomy (RACE chip, date + city), and the race filter chips
 * (2026-10-01; two selects before). The Feed's compact row, and the Q6
 * gate that kept races out of it, went the same day with the row.
 *
 * Every Space is offered from a person's first day, however few people
 * are on Tropos (App1 Q6): one under the member count's floor says it is
 * filling up.
 *
 * Search (Run27 call 11): a query finds Spaces by name, or a race by its
 * city, among every Space and race whatever the chips say, and its
 * results stand in for the rows until it is cleared.
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
      dateKey: "2099-09-13",
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
    expect(screen.getByText(/13 Sept? 2099/)).toBeInTheDocument();
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

  it("an interest card shows a real member count from 5, and says it is filling up under 5 (App1 Q6)", () => {
    const at = (id: string, name: string, memberCount: number | null) => ({
      ...INTEREST,
      def: { ...INTEREST.def, id, name },
      memberCount,
    });
    mockUseSpacesDirectory.mockReturnValue({
      entries: [
        INTEREST,
        at("five", "Five", 5),
        at("four", "Four", 4),
        at("empty", "Empty", 0),
        at("unknown", "Unknown", null),
      ],
      upcomingRaces: [],
      refresh: vi.fn(),
    });
    renderDirectory();
    const card = (name: string) =>
      screen.getByRole("link", { name: new RegExp(`^${name}\\b`) }).textContent;
    expect(card("Runners")).toBe("Runners12 members");
    expect(card("Five")).toBe("Five5 members");
    expect(card("Four")).toBe("FourFilling up");
    expect(card("Empty")).toBe("EmptyFilling up");
    // A count still being read, or one that failed, claims neither.
    expect(card("Unknown")).toBe("Unknown");
    expect(screen.queryByText(/0 members|4 members/)).toBeNull();
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

it("keeps an expired race card visible with an honest awaiting-date label", () => {
  const past = {
    ...RACE,
    def: { ...RACE.def, event: { ...RACE.def.event!, dateKey: "2000-01-01" } },
  };
  mockUseSpacesDirectory.mockReturnValue({
    entries: [past],
    upcomingRaces: [past.def],
  });
  renderDirectory();
  expect(
    screen.getByRole("link", { name: "Great North Run space" })
  ).toBeInTheDocument();
  expect(screen.getByText(/Next date TBA/)).toBeInTheDocument();
  expect(screen.queryByText(/1 Jan 2000/)).not.toBeInTheDocument();
});

describe("SpacesDirectory on a new Tropos (App1 Q6)", () => {
  it("offers every Space and race to someone in none, with the chips and search", () => {
    mockUseSpacesDirectory.mockReturnValue({
      entries: [
        { ...INTEREST, memberCount: 0 },
        { ...RACE, memberCount: 0 },
      ],
      upcomingRaces: [RACE.def],
      refresh: vi.fn(),
    });
    renderDirectory();
    expect(
      screen.getByRole("heading", { name: "Races & events" })
    ).toBeInTheDocument();
    expect(screen.getByText("Great North Run")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Runners\b/ }).textContent).toBe(
      "RunnersFilling up"
    );
    expect(screen.getAllByRole("radio").length).toBeGreaterThan(0);
    expect(screen.getByRole("searchbox")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Your spaces" })).toBeNull();
  });
});

describe("searching Spaces (Run27 call 11)", () => {
  const BRIGHTON = spaceDef("brighton-marathon")!;
  const search = () => screen.getByRole("searchbox", { name: "Search spaces" });

  beforeEach(() => {
    mockUseSpacesDirectory.mockReturnValue({
      entries: [INTEREST, RACE],
      // Every race, whatever the chips say: Brighton is not in the rows.
      upcomingRaces: [RACE.def, BRIGHTON],
      refresh: vi.fn(),
    });
  });

  it("finds Brighton Marathon for “brighton”, and its results stand in for the rows", () => {
    renderDirectory();
    fireEvent.change(search(), { target: { value: "brighton" } });
    const found = screen.getByRole("list", { name: "Spaces found" });
    const link = within(found).getByRole("link", { name: /Brighton Marathon/ });
    expect(link).toHaveAttribute("href", "/space/brighton-marathon");
    expect(within(found).getAllByRole("listitem")).toHaveLength(1);
    // The rows and their chips give way while a query stands.
    expect(
      screen.queryByRole("heading", { name: "Races & events" })
    ).toBeNull();
    expect(screen.queryByText("Runners")).toBeNull();
    expect(screen.getByText("1 space found")).toBeInTheDocument();
  });

  it("is not fussy about case, and finds a race by its city", () => {
    renderDirectory();
    fireEvent.change(search(), { target: { value: "NEWCASTLE" } });
    expect(
      within(screen.getByRole("list", { name: "Spaces found" })).getByRole(
        "link",
        { name: /Great North Run/ }
      )
    ).toBeInTheDocument();
  });

  it("says when nothing matches, and Clear search brings the rows back", () => {
    renderDirectory();
    fireEvent.change(search(), { target: { value: "zzz" } });
    expect(screen.getByText("No matching spaces")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Clear search" })[0]);
    expect(search()).toHaveValue("");
    expect(
      screen.getByRole("heading", { name: "Races & events" })
    ).toBeInTheDocument();
  });

  it("a single letter searches nothing yet", () => {
    renderDirectory();
    fireEvent.change(search(), { target: { value: "b" } });
    expect(screen.queryByRole("list", { name: "Spaces found" })).toBeNull();
    expect(
      screen.getByRole("heading", { name: "Races & events" })
    ).toBeInTheDocument();
  });
});
