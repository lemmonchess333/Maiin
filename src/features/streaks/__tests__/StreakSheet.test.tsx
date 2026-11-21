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
  loading: false,
  loadFailed: false,
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
    loading: h.loading,
    loadFailed: h.loadFailed,
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
  h.loading = false;
  h.loadFailed = false;
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
    it("names the next tier and the days to it, with how far along and the longest", () => {
      open();
      const sheet = screen.getByRole("dialog", { name: "12-day streak" });
      expect(
        within(sheet).getByText("Two Week Wonder in 2 days")
      ).toBeInTheDocument();
      expect(within(sheet).getByText("12 of 14 days")).toBeInTheDocument();
      expect(
        within(sheet).getByText("Longest 21 days, 10 days to pass it")
      ).toBeInTheDocument();
      const art = sheet.querySelector("[data-next-tier]");
      expect(art?.getAttribute("data-next-tier")).toBe("locked");
    });

    it("says when this streak is the longest", () => {
      h.longest = 12;
      open();
      const sheet = screen.getByRole("dialog", { name: "12-day streak" });
      expect(
        within(sheet).getByText("This is your longest")
      ).toBeInTheDocument();
      expect(sheet.textContent).not.toMatch(/to pass it/);
    });

    it("keeps its words smaller than the sheet's title, the one hero (DS4)", () => {
      open();
      const band = screen.getByRole("group", { name: /Two Week Wonder/ });
      // The title is the BottomSheet's heading; nothing in the band is
      // drawn at a heading's size or a figure's weight.
      expect(band.innerHTML).not.toMatch(/text-(lg|xl|2xl|3xl)\b/);
      expect(band.innerHTML).not.toMatch(/font-extrabold/);
    });

    it("draws a tier already held as earned, says so, and points at the length", () => {
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
      expect(
        within(sheet).getByText("2 days to a 7-day streak")
      ).toBeInTheDocument();
      expect(within(sheet).getByText("5 of 7 days")).toBeInTheDocument();
      expect(
        within(sheet).getByText("Week Warrior already earned")
      ).toBeInTheDocument();
      expect(
        within(sheet).getByText("Longest 40 days, 36 days to pass it")
      ).toBeInTheDocument();
      // Never "Week Warrior in 2 days", which reads as not yet earned.
      expect(sheet.textContent).not.toMatch(/Week Warrior in/);
      const art = sheet.querySelector("[data-next-tier]");
      expect(art?.getAttribute("data-next-tier")).toBe("earned");
      expect(art?.querySelector("svg circle")).toBeNull();
    });

    it("past the last tier, shows that badge and the longest, with no bar", () => {
      h.streak = 400;
      h.longest = 400;
      h.earned = ["first_step", "three_day", "week_warrior", "year_long"];
      open();
      const sheet = screen.getByRole("dialog", { name: "400-day streak" });
      expect(within(sheet).getByText("Year of Tropos")).toBeInTheDocument();
      expect(within(sheet).getByText("Already earned")).toBeInTheDocument();
      expect(
        within(sheet).getByText("This is your longest")
      ).toBeInTheDocument();
      expect(sheet.querySelector("[data-streak-bar]")).toBeNull();
      expect(sheet.textContent).not.toMatch(/tier/i);
    });

    it("past the last tier with its award not read yet, draws no ring to fill", () => {
      h.streak = 365;
      h.longest = 365;
      h.earned = ["first_step", "three_day", "week_warrior"];
      open();
      const sheet = screen.getByRole("dialog", { name: "365-day streak" });
      expect(within(sheet).getByText("Year of Tropos")).toBeInTheDocument();
      expect(within(sheet).queryByText("Already earned")).toBeNull();
      const art = sheet.querySelector("[data-next-tier]");
      expect(art?.querySelector("svg circle")).toBeNull();
    });

    it("draws the progress in the streak's purple, never a tier's gold", () => {
      // 20 days: the next tier is Month Master, a gold-tier badge. Gold
      // means a new best and nothing else (flameTiers.ts).
      h.streak = 20;
      h.longest = 20;
      open();
      const sheet = screen.getByRole("dialog", { name: "20-day streak" });
      expect(
        within(sheet).getByText("Month Master in 10 days")
      ).toBeInTheDocument();
      const arc = sheet.querySelectorAll("[data-next-tier] svg circle");
      expect(arc.length).toBeGreaterThan(0);
      for (const circle of arc)
        expect(circle.getAttribute("stroke")?.toUpperCase()).toMatch(
          /^#7B72E9/
        );
      const fill = sheet.querySelector<HTMLElement>("[data-streak-bar] > div");
      expect(fill?.style.background.toUpperCase().replace(/\s/g, "")).toMatch(
        /^(#7B72E9|RGB\(123,114,233\))/
      );
      expect(fill?.style.width).toBe(`${(20 / 30) * 100}%`);
      expect(sheet.innerHTML.toUpperCase()).not.toContain("#FFD700");
      expect(sheet.innerHTML).not.toMatch(/achievement/);
    });

    it("reads the band as one sentence", () => {
      open();
      expect(
        screen.getByRole("group", {
          name: "Two Week Wonder in 2 days. 12 of 14 days. Longest 21 days, 10 days to pass it.",
        })
      ).toBeInTheDocument();
    });

    it("reads a held badge as words, with no symbol in the sentence", () => {
      h.streak = 5;
      h.longest = 40;
      h.earned = ["first_step", "three_day", "week_warrior"];
      open();
      expect(
        screen.getByRole("group", {
          name: "2 days to a 7-day streak. 5 of 7 days. Week Warrior already earned. Longest 40 days, 36 days to pass it.",
        })
      ).toBeInTheDocument();
    });

    it("waits for the record: nothing while it loads or after a failed read", () => {
      // A failed read leaves the stored longest at 0 and every badge
      // locked, which is not this person's record.
      h.loadFailed = true;
      const { unmount } = open();
      expect(screen.queryByText(/Two Week Wonder/)).toBeNull();
      expect(screen.queryByText(/Longest/)).toBeNull();
      unmount();
      h.loadFailed = false;
      h.loading = true;
      open();
      expect(screen.queryByText(/Two Week Wonder/)).toBeNull();
      expect(screen.queryByText(/Longest/)).toBeNull();
    });
  });
});
