/**
 * /followers and /following — your own lists (Mob2 call 7). Each row is
 * the person, with Follow; your followers each have Remove follower, which
 * asks first and takes the row away. Someone blocked either way is left
 * out. Firestore runs on the one fake (ADR-0009); the callable and the
 * Follow button are stubbed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const H = vi.hoisted(() => ({
  blocked: new Set<string>(),
  remove: vi.fn(async (_uid: string) => {}),
}));

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {}, functions: {} }));
vi.mock("@/lib/auth", () => ({ useUid: () => "me" }));
vi.mock("@/hooks/useBlockedUsers", () => ({
  useBlockedUsers: () => ({
    blocked: H.blocked,
    youBlocked: new Set(),
    blockedYou: new Set(),
    ready: true,
    addBlocked: () => {},
    removeBlocked: () => {},
  }),
}));
vi.mock("@/lib/followLists", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/followLists")>()),
  removeFollower: (uid: string) => H.remove(uid),
}));
vi.mock("@/components/social/FollowButton", () => ({
  default: ({ targetUid }: { targetUid: string }) => (
    <button type="button">{`Follow ${targetUid}`}</button>
  ),
}));
vi.mock("@/components/social/BlockAwareAvatar", () => ({
  default: () => null,
}));

import { Timestamp } from "firebase/firestore";
import FollowList from "../FollowList";
import { resetFirestore, seedFirestore } from "@/test/firestoreHarness";

const at = (minutes: number) =>
  Timestamp.fromMillis(Date.UTC(2026, 9, 1) + minutes * 60_000);

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/followers" element={<FollowList kind="followers" />} />
        <Route path="/following" element={<FollowList kind="following" />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  resetFirestore();
  H.blocked = new Set();
  H.remove.mockReset();
  H.remove.mockResolvedValue(undefined);
  seedFirestore({
    "followers/me/users/ann": { followedAt: at(1) },
    "followers/me/users/bo": { followedAt: at(2), fromRequest: true },
    "following/me/users/cy": { followedAt: at(3) },
    "users/ann/public/profile": { displayName: "Ann" },
    "users/bo/public/profile": { displayName: "Bo" },
    "users/cy/public/profile": { displayName: "Cy" },
  });
});
afterEach(() => cleanup());

describe("your followers", () => {
  it("lists each follower with their name, a link to them and Follow", async () => {
    renderAt("/followers");
    const list = await screen.findByRole("list", { name: "Followers" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("Bo"),
      expect.stringContaining("Ann"),
    ]);
    expect(within(rows[0]).getByRole("link", { name: "Bo" })).toHaveAttribute(
      "href",
      "/user/bo"
    );
    expect(
      within(rows[0]).getByRole("button", { name: "Follow bo" })
    ).toBeVisible();
  });

  it("leaves out someone blocked either way", async () => {
    H.blocked = new Set(["bo"]);
    renderAt("/followers");
    const list = await screen.findByRole("list", { name: "Followers" });
    expect(within(list).getByText("Ann")).toBeVisible();
    expect(within(list).queryByText("Bo")).toBeNull();
  });

  it("removes a follower after asking, and takes the row away", async () => {
    renderAt("/followers");
    fireEvent.click(
      await screen.findByRole("button", { name: "Remove Bo as a follower" })
    );
    const dialog = await screen.findByRole("alertdialog", {
      name: "Remove Bo?",
    });
    expect(H.remove).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));
    });
    expect(H.remove).toHaveBeenCalledWith("bo");
    const list = screen.getByRole("list", { name: "Followers" });
    expect(within(list).queryByText("Bo")).toBeNull();
    expect(within(list).getByText("Ann")).toBeVisible();
  });

  it("puts the row back when the server refuses", async () => {
    H.remove.mockRejectedValue(new Error("unavailable"));
    renderAt("/followers");
    fireEvent.click(
      await screen.findByRole("button", { name: "Remove Bo as a follower" })
    );
    await act(async () => {
      fireEvent.click(
        within(await screen.findByRole("alertdialog")).getByRole("button", {
          name: "Remove",
        })
      );
    });
    expect(
      within(screen.getByRole("list", { name: "Followers" })).getByText("Bo")
    ).toBeVisible();
  });
});

describe("who you follow", () => {
  it("lists them with Follow and no Remove", async () => {
    renderAt("/following");
    const list = await screen.findByRole("list", { name: "Following" });
    expect(within(list).getByText("Cy")).toBeVisible();
    expect(screen.queryByRole("button", { name: /^Remove / })).toBeNull();
  });

  it("says so when you follow no one", async () => {
    resetFirestore();
    renderAt("/following");
    expect(
      await screen.findByText("You don't follow anyone yet")
    ).toBeVisible();
  });
});
