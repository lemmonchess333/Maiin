/**
 * The streak sheet (Mob1 call 4): a month of logged and covered days,
 * each with its own words for a screen reader, the reassurance after a
 * covered day, and the way to the badges. Streak1's register: no
 * freezes, shields or tokens, and no streak at risk.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const h = vi.hoisted(() => ({
  streak: 12,
  longest: 21,
  earned: ["first_step", "three_day", "week_warrior"] as string[],
  active: new Set<string>(),
  bridged: [] as string[],
  rested: [] as string[],
  plan: false,
  today: "2026-10-27",
}));
vi.mock("../useStreaks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../useStreaks")>()),
  useStreaks: () => ({
    currentStreak: h.streak,
    longestStreak: h.longest,
    allBadges: h.earned.map((id) => ({ id, earnedAt: "2026-10-01" })),
    activeDates: h.active,
    bridgedDates: h.bridged,
    restDates: h.rested,
    coversRestDays: h.plan,
  }),
}));
vi.mock("@/hooks/useLocalDateKey", () => ({
  useLocalDateKey: () => h.today,
}));

import StreakSheet from "../StreakSheet";

function open() {
  return render(
    <MemoryRouter>
      <StreakSheet open onOpenChange={vi.fn()} badgesTo="/user/me?badges=all" />
    </MemoryRouter>
  );
}

beforeEach(() => {
  h.streak = 12;
  h.longest = 21;
  h.earned = ["first_step", "three_day", "week_warrior"];
  // 16 to 27 October, with the 26th covered.
  h.active = new Set(
    Array.from({ length: 12 }, (_, i) => `2026-10-${String(16 + i)}`).filter(
      (d) => d !== "2026-10-26"
    )
  );
  h.bridged = ["2026-10-26"];
  h.rested = [];
  h.plan = false;
  h.today = "2026-10-27";
});
afterEach(cleanup);

describe("StreakSheet", () => {
  it("is named by the streak, and says yesterday's rest day is covered", () => {
    open();
    const sheet = screen.getByRole("dialog", { name: "12-day streak" });
    expect(
      within(sheet).getByText(
        "Yesterday’s rest day is covered. Still on a 12-day streak."
      )
    ).toBeInTheDocument();
  });

  it("gives every day words: logged, covered or nothing logged", () => {
    open();
    const month = screen.getByRole("list", { name: "October 2026" });
    expect(within(month).getAllByRole("listitem")).toHaveLength(31);
    expect(
      within(month).getByText("Sunday 25 October, logged")
    ).toBeInTheDocument();
    expect(
      within(month).getByText("Monday 26 October, covered")
    ).toBeInTheDocument();
    expect(
      within(month).getByText("Thursday 15 October, nothing logged")
    ).toBeInTheDocument();
    expect(
      within(month).getByText("Tuesday 27 October, today, logged")
    ).toBeInTheDocument();
    // A day ahead is only its date.
    expect(within(month).getByText("Wednesday 28 October")).toBeInTheDocument();
  });

  it("goes back as far as the streak reads, and no further", () => {
    open();
    const back = screen.getByRole("button", { name: "Previous month" });
    const forward = screen.getByRole("button", { name: "Next month" });
    expect(forward).toBeDisabled();
    for (const title of ["September 2026", "August 2026", "July 2026"]) {
      fireEvent.click(back);
      expect(screen.getByRole("list", { name: title })).toBeInTheDocument();
    }
    // 90 days before 27 October is in July.
    expect(back).toBeDisabled();
    fireEvent.click(forward);
    expect(
      screen.getByRole("list", { name: "August 2026" })
    ).toBeInTheDocument();
  });

  it("keeps the badges a tap away, where its host says they are", () => {
    // They are on the person's own profile (Trim1 call 3(c)); the sheet
    // is told the address, since its host knows whose profile.
    open();
    expect(
      screen.getByRole("link", { name: "See your badges" })
    ).toHaveAttribute("href", "/user/me?badges=all");
  });

  it("rings the plan's rest days as covered, with no line of reassurance (App1 Q32)", () => {
    // A lifter on Mondays, Wednesdays and Fridays who logs only lifts:
    // the days between are the plan's, and need no comfort.
    h.streak = 9;
    h.active = new Set([
      "2026-10-19",
      "2026-10-21",
      "2026-10-23",
      "2026-10-26",
    ]);
    h.bridged = [];
    h.rested = [
      "2026-10-27",
      "2026-10-25",
      "2026-10-24",
      "2026-10-22",
      "2026-10-20",
    ];
    h.plan = true;
    open();
    const sheet = screen.getByRole("dialog", { name: "9-day streak" });
    const month = within(sheet).getByRole("list", { name: "October 2026" });
    expect(
      within(month).getByText("Tuesday 20 October, covered")
    ).toBeInTheDocument();
    expect(
      within(month).getByText("Tuesday 27 October, today, covered")
    ).toBeInTheDocument();
    expect(sheet.textContent).not.toMatch(/is covered\. Still on/);
    expect(
      within(sheet).getByText(
        "A workout, a run or a meal logged keeps the streak going, and so do your plan’s rest days. One other day off in any seven is covered."
      )
    ).toBeInTheDocument();
  });

  it("with no plan, says what keeps the streak as before", () => {
    open();
    expect(
      screen.getByText(
        "A workout, a run or a meal logged keeps the streak going. One rest day in any seven is covered."
      )
    ).toBeInTheDocument();
  });

  it("says nothing of freezes, shields, tokens or a streak at risk", () => {
    // Today with nothing logged yet is the day a token economy would warn.
    h.active.delete("2026-10-27");
    h.bridged = [];
    open();
    const sheet = screen.getByRole("dialog", { name: "12-day streak" });
    expect(sheet.textContent).not.toMatch(
      /freeze|shield|token|at risk|danger|lose/i
    );
    expect(
      within(sheet).getByText("Tuesday 27 October, today")
    ).toBeInTheDocument();
  });

  describe("the count against something (DS5 rule 46)", () => {
    it("shows the longest streak and how far off beating it is", () => {
      open();
      const sheet = screen.getByRole("dialog", { name: "12-day streak" });
      expect(within(sheet).getByText("Longest")).toBeInTheDocument();
      expect(sheet.textContent).toContain("21 days");
      expect(sheet.textContent).toContain("10 days to beat it");
    });

    it("says when this streak is the longest", () => {
      h.longest = 12;
      open();
      const sheet = screen.getByRole("dialog", { name: "12-day streak" });
      expect(within(sheet).getByText("This streak")).toBeInTheDocument();
      expect(sheet.textContent).not.toMatch(/to beat it/);
    });

    it("names the next tier, its badge and the days to it, drawn locked with its progress", () => {
      open();
      const sheet = screen.getByRole("dialog", { name: "12-day streak" });
      expect(within(sheet).getByText("Next")).toBeInTheDocument();
      expect(within(sheet).getByText("Two Week Wonder")).toBeInTheDocument();
      expect(sheet.textContent).toContain("14 days");
      expect(sheet.textContent).toContain("2 days to go");
      const art = sheet.querySelector("[data-next-tier]");
      expect(art?.getAttribute("data-next-tier")).toBe("locked");
    });

    it("draws a tier already held as earned, with no progress ring", () => {
      // Longest 40, five days into a new streak: Week Warrior is two days
      // off and was earned on the long one.
      h.streak = 5;
      h.longest = 40;
      h.earned = ["first_step", "three_day", "week_warrior", "two_week"];
      h.active = new Set(
        Array.from({ length: 5 }, (_, i) => `2026-10-${String(23 + i)}`)
      );
      h.bridged = [];
      open();
      const sheet = screen.getByRole("dialog", { name: "5-day streak" });
      expect(within(sheet).getByText("Week Warrior")).toBeInTheDocument();
      expect(sheet.textContent).toContain("2 days to go");
      const art = sheet.querySelector("[data-next-tier]");
      expect(art?.getAttribute("data-next-tier")).toBe("earned");
      expect(art?.querySelector("svg circle")).toBeNull();
    });

    it("past the last tier, shows the longest alone", () => {
      h.streak = 400;
      h.longest = 400;
      open();
      const sheet = screen.getByRole("dialog", { name: "400-day streak" });
      expect(within(sheet).queryByText("Next")).toBeNull();
      expect(within(sheet).getByText("This streak")).toBeInTheDocument();
    });

    it("never draws it in gold, which means a new best", () => {
      open();
      const sheet = screen.getByRole("dialog", { name: "12-day streak" });
      expect(sheet.innerHTML).not.toMatch(/achievement/);
    });
  });
});
