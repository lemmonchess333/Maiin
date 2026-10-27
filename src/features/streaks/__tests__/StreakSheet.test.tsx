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
  active: new Set<string>(),
  bridged: [] as string[],
  today: "2026-10-27",
}));
vi.mock("../useStreaks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../useStreaks")>()),
  useStreaks: () => ({
    currentStreak: h.streak,
    activeDates: h.active,
    bridgedDates: h.bridged,
  }),
}));
vi.mock("@/hooks/useLocalDateKey", () => ({
  useLocalDateKey: () => h.today,
}));

import StreakSheet from "../StreakSheet";

function open() {
  return render(
    <MemoryRouter>
      <StreakSheet open onOpenChange={vi.fn()} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  h.streak = 12;
  // 16 to 27 October, with the 26th covered.
  h.active = new Set(
    Array.from({ length: 12 }, (_, i) => `2026-10-${String(16 + i)}`).filter(
      (d) => d !== "2026-10-26"
    )
  );
  h.bridged = ["2026-10-26"];
  h.today = "2026-10-27";
});
afterEach(cleanup);

describe("StreakSheet", () => {
  it("is named by the streak, and says yesterday's rest day is covered", () => {
    open();
    const sheet = screen.getByRole("dialog", { name: "12-day streak" });
    expect(
      within(sheet).getByText(
        "Yesterday's rest day is covered. Still on a 12-day streak."
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

  it("keeps the badges a tap away", () => {
    open();
    expect(
      screen.getByRole("link", { name: "See your badges" })
    ).toHaveAttribute("href", "/history?tab=badges");
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
});
