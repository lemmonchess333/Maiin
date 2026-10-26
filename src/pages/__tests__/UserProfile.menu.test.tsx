/**
 * A profile's "More options" menu, as a screen reader and a keyboard meet
 * it: a menu button, a menu that takes focus and the arrow keys, Escape
 * back to the button, and a backdrop that is not a control.
 *
 * Its own file beside `UserProfile.test.tsx`, which pins what the page
 * reads; this one pins only the menu.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/auth", () => ({ useUid: () => "viewer" }));
vi.mock("@/lib/socialApi", () => ({
  getFollowerCount: async () => 0,
  getFollowingCount: async () => 0,
  batchGetKudos: async () => ({}),
  blockUser: vi.fn(),
  unblockUser: vi.fn(async () => {}),
  getBlockedUsers: async () => [],
  hasFollowRequestFrom: async () => false,
  acceptFollowRequest: vi.fn(),
  declineFollowRequest: vi.fn(),
}));
vi.mock("@/hooks/useDistanceUnit", () => ({
  useDistanceUnit: () => "km" as const,
}));
vi.mock("@/components/social/FollowButton", () => ({
  default: () => <button type="button">Follow</button>,
}));
vi.mock("@/features/partnerStreak/PartnerStreakCard", () => ({
  default: () => null,
}));
vi.mock("@/features/spaces/TrainingForChip", () => ({ default: () => null }));
vi.mock("@/components/social/ActivityCard", () => ({ default: () => null }));
/* What the report sheet does is its own suite's; here it only has to
   open, and give focus back when it closes. */
vi.mock("@/components/social/ReportModal", () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="Report">
      <button type="button" onClick={onClose}>
        Close report
      </button>
    </div>
  ),
}));

import UserProfile from "../UserProfile";
import { resetFirestore, seedFirestore } from "@/test/firestoreHarness";

async function openProfile() {
  seedFirestore({ "users/alice/public/profile": { displayName: "Alice" } });
  render(
    <MemoryRouter initialEntries={["/user/alice"]}>
      <Routes>
        <Route path="/user/:uid" element={<UserProfile />} />
      </Routes>
    </MemoryRouter>
  );
  return screen.findByRole("button", { name: "More options" });
}

beforeEach(() => resetFirestore());
afterEach(() => cleanup());

describe("a profile's More options menu", () => {
  it("is a menu button that says whether its menu is open", async () => {
    const button = await openProfile();
    expect(button).toHaveAttribute("aria-haspopup", "menu");
    expect(button).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    const menu = screen.getByRole("menu", { name: "More options" });
    expect(button).toHaveAttribute("aria-controls", menu.id);
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent)
    ).toEqual(["Report user", "Block user"]);
  });

  it("puts focus on the first item, and the arrow keys move between them", async () => {
    fireEvent.click(await openProfile());
    const menu = screen.getByRole("menu");
    const [report, block] = within(menu).getAllByRole("menuitem");
    expect(report).toHaveFocus();
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(block).toHaveFocus();
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(report).toHaveFocus();
    fireEvent.keyDown(menu, { key: "ArrowUp" });
    expect(block).toHaveFocus();
    fireEvent.keyDown(menu, { key: "Home" });
    expect(report).toHaveFocus();
    fireEvent.keyDown(menu, { key: "End" });
    expect(block).toHaveFocus();
  });

  it("closes on Escape, with focus back on the button", async () => {
    const button = await openProfile();
    fireEvent.click(button);
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveFocus();
  });

  it("closes on a tap outside, on a backdrop that is no control", async () => {
    const button = await openProfile();
    fireEvent.click(button);
    // The only controls while it is open are the page's and the menu's:
    // no screen-sized "Close menu" button, and no tab stop for one.
    expect(screen.queryByRole("button", { name: /close menu/i })).toBeNull();
    const backdrop = screen.getByRole("menu").previousElementSibling!;
    expect(backdrop).toHaveAttribute("aria-hidden", "true");
    expect(backdrop).not.toHaveAttribute("tabindex");
    fireEvent.click(backdrop);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(button).toHaveFocus();
  });

  it("gives focus back to the button when what an item opened closes", async () => {
    const button = await openProfile();
    fireEvent.click(button);
    fireEvent.click(screen.getByRole("menuitem", { name: "Report user" }));
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Close report" }));
    expect(button).toHaveFocus();

    // The block question is the app's own dialog, which hands focus back
    // to whatever had it when it opened: the button, not a gone item.
    fireEvent.click(button);
    fireEvent.click(screen.getByRole("menuitem", { name: "Block user" }));
    const question = await screen.findByRole("alertdialog");
    expect(question).toContainElement(document.activeElement as HTMLElement);
    fireEvent.click(within(question).getByRole("button", { name: "Cancel" }));
    expect(button).toHaveFocus();
  });
});
