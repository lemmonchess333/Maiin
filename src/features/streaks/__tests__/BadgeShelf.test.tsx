/**
 * The badge shelf on a profile (Trim1 call 3(c)): a person's newest
 * badges above their medals, and on your own profile the whole
 * collection behind "See all". The collection was a tab under Analytics.
 *
 * What is yours alone (the next badge, your streaks, each badge's
 * progress) is never drawn on someone else's profile: these tests hold
 * that from both sides.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  within,
  fireEvent,
} from "@testing-library/react";

/* The collection has its own tests (BadgeGrid.states). Here it is a
   marker, so this file is about the shelf and its fold. */
vi.mock("../BadgeGrid", () => ({
  BadgeGrid: () => <div data-testid="badge-collection" />,
}));

import BadgeShelf from "../BadgeShelf";
import { BADGE_DEFINITIONS, type EarnedBadge } from "../badges";

const earned = (...ids: string[]): EarnedBadge[] =>
  ids.map((id, i) => {
    const def = BADGE_DEFINITIONS.find((b) => b.id === id);
    if (!def) throw new Error(`no badge ${id}`);
    return { ...def, earnedAt: `2026-0${i + 1}-01` };
  });

const TWO = earned("first_step", "week_warrior");

const scrolled = vi.fn();
beforeEach(() => {
  scrolled.mockReset();
  Element.prototype.scrollIntoView = scrolled;
});
afterEach(cleanup);

function shelf(props: Partial<React.ComponentProps<typeof BadgeShelf>> = {}) {
  return render(
    <BadgeShelf badges={TWO} failed={false} ready isOwn={false} {...props} />
  );
}

describe("someone else's profile", () => {
  it("shows their newest badges under a heading, with nothing to open", () => {
    shelf();
    const section = screen.getByRole("region", { name: "Badges" });
    expect(
      within(section)
        .getAllByRole("listitem")
        .map((li) => li.textContent)
    ).toEqual(["First Step", "Week Warrior"]);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("never draws the collection, even asked to", () => {
    // `?badges=all` on another person's profile must open nothing: the
    // collection reads the viewer's own streaks and progress.
    shelf({ open: true });
    expect(screen.queryByTestId("badge-collection")).toBeNull();
    expect(screen.getByRole("list", { name: "Recent badges" })).toBeTruthy();
  });

  it("has no section when they have earned none", () => {
    const { container } = shelf({ badges: [] });
    expect(container).toBeEmptyDOMElement();
  });
});

describe("your own profile", () => {
  it("offers the whole collection, closed until asked for", () => {
    const onToggle = vi.fn();
    shelf({ isOwn: true, onToggle });
    const all = screen.getByRole("button", { name: "See all" });
    expect(all).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("list", { name: "Recent badges" })).toBeTruthy();
    expect(screen.queryByTestId("badge-collection")).toBeNull();
    fireEvent.click(all);
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it("opens the collection in place of the newest few", async () => {
    const onToggle = vi.fn();
    shelf({ isOwn: true, open: true, onToggle });
    expect(await screen.findByTestId("badge-collection")).toBeTruthy();
    // The page shows your profile as others see it; this part they do not.
    expect(
      screen.getByText(
        "Only you see this. Other people see the badges you have earned."
      )
    ).toBeTruthy();
    // The collection holds every badge: the newest are not listed twice.
    expect(screen.queryByRole("list", { name: "Recent badges" })).toBeNull();
    const fewer = screen.getByRole("button", { name: "Show fewer" });
    expect(fewer).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(fewer);
    expect(onToggle).toHaveBeenCalledWith(false);
  });

  it("says how the first one comes, once it knows there are none", () => {
    shelf({ isOwn: true, badges: [] });
    expect(
      screen.getByText("Log a meal or a workout to earn your first.")
    ).toBeTruthy();
    // The way to see what else there is stays.
    expect(screen.getByRole("button", { name: "See all" })).toBeTruthy();
  });

  it("does not say there are none while the badges are still being read", () => {
    // An empty list before the read answers says nothing. Someone with
    // thirty badges was otherwise told to earn their first, for a moment.
    shelf({ isOwn: true, badges: [], ready: false });
    expect(screen.queryByText(/earn your first/)).toBeNull();
    expect(screen.getByRole("heading", { name: "Badges" })).toBeTruthy();
  });

  it("says a failed read failed, not that there are none", () => {
    shelf({ isOwn: true, badges: [], failed: true });
    expect(screen.getByText("Couldn’t load badges.")).toBeTruthy();
    expect(screen.queryByText(/earn your first/)).toBeNull();
  });
});

describe("arriving on the open collection", () => {
  it("brings the shelf to the top, since it sits under the header and the week", () => {
    shelf({ isOwn: true, open: true });
    expect(scrolled).toHaveBeenCalledTimes(1);
    // No behaviour passed: the stylesheet decides, so Reduce Motion holds.
    expect(scrolled).toHaveBeenCalledWith({ block: "start" });
  });

  it("waits until what is above it has settled, and then moves once", () => {
    // The profile's week card changes height when its sessions arrive; a
    // scroll made before that landed the heading about 25 px off.
    const view = shelf({ isOwn: true, open: true, settled: false });
    expect(scrolled).not.toHaveBeenCalled();
    view.rerender(
      <BadgeShelf badges={TWO} failed={false} ready isOwn open settled />
    );
    expect(scrolled).toHaveBeenCalledTimes(1);
    view.rerender(
      <BadgeShelf
        badges={TWO}
        failed={false}
        ready
        isOwn
        open
        settled={false}
      />
    );
    view.rerender(
      <BadgeShelf badges={TWO} failed={false} ready isOwn open settled />
    );
    expect(scrolled).toHaveBeenCalledTimes(1);
  });

  it("moves nothing when it is opened by hand", () => {
    const view = shelf({ isOwn: true });
    view.rerender(<BadgeShelf badges={TWO} failed={false} ready isOwn open />);
    expect(scrolled).not.toHaveBeenCalled();
  });

  it("moves nothing on a closed shelf or on someone else's profile", () => {
    shelf({ isOwn: true });
    cleanup();
    shelf({ open: true });
    expect(scrolled).not.toHaveBeenCalled();
  });
});
