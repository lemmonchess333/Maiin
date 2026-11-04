/**
 * The trophy case on a profile (Soc15): drawn from the public summary,
 * newest first, two rows then "See all"; no section on someone else's
 * profile with no medals, one quiet line on your own; and a medal tapped
 * opens its sheet, the figure in the READER's units.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";

const unit = vi.hoisted(() => ({ distance: "km" as "km" | "mi" }));
vi.mock("@/hooks/useDistanceUnit", () => ({
  useDistanceUnit: () => unit.distance,
}));

import TrophyCase, { TROPHY_CASE_SHOWN } from "../TrophyCase";
import { parseMedalSummary } from "../medals";

afterEach(() => {
  cleanup();
  unit.distance = "km";
});

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** One Mileage medal a month, `count` months back from November 2026. */
function summary(count: number) {
  const out: Record<string, unknown> = {};
  for (let i = 0; i < count; i++) {
    const start = new Date(Date.UTC(2026, 10 - i, 1));
    const end = new Date(Date.UTC(2026, 11 - i, 1));
    out[`monthly-${i}`] = {
      tier: i % 3 === 0 ? "gold" : i % 3 === 1 ? "silver" : "bronze",
      name: `${MONTHS[start.getUTCMonth()]} Mileage`,
      metric: "total_km",
      type: "monthly",
      value: 52.4,
      goal: 50,
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
    };
  }
  return parseMedalSummary(out);
}

describe("TrophyCase", () => {
  it("draws the medals newest first", () => {
    render(<TrophyCase medals={summary(3)} isOwn={false} />);
    const list = screen.getByRole("list", { name: "Medals" });
    const names = within(list)
      .getAllByRole("button")
      .map((b) => b.textContent);
    expect(names[0]).toMatch(/November Mileage.*Gold · Nov 2026/);
    expect(names[1]).toMatch(/October Mileage.*Silver · Oct 2026/);
    expect(names[2]).toMatch(/September Mileage.*Bronze/);
  });

  it("shows two rows, then all of them on See all", async () => {
    render(<TrophyCase medals={summary(9)} isOwn={false} />);
    const list = () => screen.getByRole("list", { name: "Medals" });
    expect(within(list()).getAllByRole("button")).toHaveLength(
      TROPHY_CASE_SHOWN
    );
    fireEvent.click(screen.getByRole("button", { name: "See all 9" }));
    expect(within(list()).getAllByRole("button")).toHaveLength(9);
    expect(screen.getByRole("button", { name: "Show fewer" })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
  });

  it("offers no See all when everything fits", () => {
    render(<TrophyCase medals={summary(TROPHY_CASE_SHOWN)} isOwn={false} />);
    expect(screen.queryByRole("button", { name: /See all/ })).toBeNull();
  });

  it("is not there on someone else's profile with no medals", () => {
    const { container } = render(<TrophyCase medals={[]} isOwn={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("says how a medal comes on your own profile with none", () => {
    render(<TrophyCase medals={[]} isOwn />);
    expect(screen.getByRole("heading", { name: "Medals" })).toBeInTheDocument();
    expect(
      screen.getByText("Finish a challenge to earn its medal.")
    ).toBeInTheDocument();
  });

  it("opens a medal's sheet, with its dates and its figure in the reader's units", async () => {
    unit.distance = "mi";
    render(<TrophyCase medals={summary(1)} isOwn={false} />);
    fireEvent.click(
      within(screen.getByRole("list", { name: "Medals" })).getByRole("button")
    );
    const sheet = await screen.findByRole("dialog");
    expect(
      within(sheet).getByText("Gold · November Mileage")
    ).toBeInTheDocument();
    expect(within(sheet).getByText("1–30 November 2026")).toBeInTheDocument();
    // 52.4 km, read in miles.
    expect(sheet.textContent).toMatch(/32\.6\s*mi/);
    expect(within(sheet).getByText("Gold was 31.1 mi.")).toBeInTheDocument();
  });
});
