import { vi, expect, it, afterEach, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { FeedSubTab } from "@/components/social/views/socialTabs";
import Social from "@/pages/Social";
vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({
  db: {},
  auth: { currentUser: { uid: "audit" } },
}));
vi.mock("@/lib/auth", () => ({ useUid: () => "audit" }));
vi.mock("@/lib/firestoreWrite", async () => {
  const { setDoc, deleteDoc } = await import("firebase/firestore");
  return { setDocGuarded: setDoc, deleteDocGuarded: deleteDoc };
});
import {
  resetFirestore,
  readDoc,
  seedFirestore,
  flushSnapshots,
} from "@/test/firestoreHarness";
import { __resetFollowStatesForTests } from "@/hooks/useFollowState";
vi.mock("@/hooks/useHiddenActivities", () => ({
  useHiddenActivities: () => ({ hidden: new Set() }),
}));
vi.mock("@/hooks/useBlockedUsers", () => ({
  useBlockedUsers: () => ({ blocked: new Set(), ready: true }),
}));
vi.mock("@/hooks/useNotifications", () => ({
  useNotifications: () => ({
    items: [],
    unreadCount: 0,
    loading: false,
    error: null,
    retry: vi.fn(),
    markAllSeen: vi.fn(),
  }),
}));
vi.mock("@/components/social/NotificationsSheet", () => ({
  default: () => null,
}));
vi.mock("@/components/social/views/CommunityView", () => ({
  default: () => null,
}));
vi.mock("@/components/social/views/FeedView", () => ({
  default: ({
    active,
    followingCount,
    feedSubTab,
    selectFeedSubTab,
  }: {
    active: boolean;
    followingCount: number;
    feedSubTab: string;
    selectFeedSubTab: (source: FeedSubTab) => void;
  }) =>
    active ? (
      <>
        <output data-testid="feed-state">
          {followingCount}:{feedSubTab}
        </output>
        <button onClick={() => selectFeedSubTab("explore")}>
          Choose Explore
        </button>
      </>
    ) : null,
}));
vi.mock("@/components/social/views/PeopleView", async () => {
  const { default: FollowButton } =
    await import("@/components/social/FollowButton");
  return { default: () => <FollowButton targetUid="friend" /> };
});
vi.mock("@/lib/socialAnalytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
afterEach(cleanup);
beforeEach(() => {
  resetFirestore();
  // FollowButton's follow state is a session cache; each test is a session.
  __resetFollowStatesForTests();
});

it("updates the Social shell after following and unfollowing the first person", async () => {
  render(
    <MemoryRouter initialEntries={["/social?tab=feed"]}>
      <Social />
    </MemoryRouter>
  );
  await waitFor(() =>
    expect(screen.getByTestId("feed-state")).toHaveTextContent("0:")
  );
  fireEvent.click(screen.getByRole("button", { name: "Find people" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Follow user" })).toBeEnabled()
  );
  fireEvent.click(screen.getByRole("button", { name: "Follow user" }));
  await screen.findByRole("button", { name: "Unfollow user" });
  expect(readDoc("following/audit/users/friend")).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "Close people search" }));
  expect(screen.getByTestId("feed-state")).toHaveTextContent("1:following");
  fireEvent.click(screen.getByRole("button", { name: "Find people" }));
  fireEvent.click(await screen.findByRole("button", { name: "Unfollow user" }));
  await screen.findByRole("button", { name: "Follow user" });
  fireEvent.click(screen.getByRole("button", { name: "Close people search" }));
  await waitFor(() =>
    expect(screen.getByTestId("feed-state")).toHaveTextContent("0:explore")
  );
});

it.each(["following", "communities", "explore"])(
  "preserves the explicit %s source as follows change",
  async (source) => {
    render(
      <MemoryRouter initialEntries={[`/social?tab=feed&feed=${source}`]}>
        <Social />
      </MemoryRouter>
    );
    await waitFor(() =>
      expect(screen.getByTestId("feed-state")).toHaveTextContent(`0:${source}`)
    );
    seedFirestore({ "following/audit/users/friend": { followedAt: 1 } });
    await flushSnapshots();
    expect(screen.getByTestId("feed-state")).toHaveTextContent(`1:${source}`);
  }
);

it("keeps a chosen default source after the first follow arrives", async () => {
  render(
    <MemoryRouter initialEntries={["/social?tab=feed"]}>
      <Social />
    </MemoryRouter>
  );
  await waitFor(() =>
    expect(screen.getByTestId("feed-state")).toHaveTextContent("0:explore")
  );
  fireEvent.click(screen.getByRole("button", { name: "Choose Explore" }));
  seedFirestore({ "following/audit/users/friend": { followedAt: 1 } });
  await flushSnapshots();
  expect(screen.getByTestId("feed-state")).toHaveTextContent("1:explore");
});
