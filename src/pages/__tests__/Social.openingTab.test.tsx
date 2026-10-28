/**
 * Which tab Social opens on (Mob2 call 6): Feed once the viewer follows
 * anyone, Together until then, and an explicit ?tab= always wins. The
 * choice is made once a visit: a follow made during it doesn't move the
 * page. Firestore is the one fake (ADR-0009), with follows seeded as the
 * app writes them; the two tab views only say whether they are showing.
 */
import { vi, expect, it, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({
  db: {},
  auth: { currentUser: { uid: "viewer" } },
}));
vi.mock("@/lib/auth", () => ({ useUid: () => "viewer" }));
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
  default: ({ active }: { active: boolean }) =>
    active ? <p>Together showing</p> : null,
}));
vi.mock("@/components/social/views/FeedView", () => ({
  default: ({ active }: { active: boolean }) =>
    active ? <p>Feed showing</p> : null,
}));
vi.mock("@/components/social/views/PeopleView", () => ({
  default: () => null,
}));
vi.mock("@/lib/socialAnalytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

import Social from "@/pages/Social";
import { Timestamp } from "firebase/firestore";
import {
  failNextFirestore,
  flushSnapshots,
  resetFirestore,
  seedFirestore,
  unfiredFailures,
} from "@/test/firestoreHarness";
import { doc } from "firebase/firestore";
import { setDocGuarded } from "@/lib/firestoreWrite";

const follow = (target: string) => ({
  [`following/viewer/users/${target}`]: { followedAt: Timestamp.now() },
});

function Where() {
  return <output data-testid="where">{useLocation().search}</output>;
}

function open(url = "/social") {
  render(
    <MemoryRouter initialEntries={[url]}>
      <Social />
      <Where />
    </MemoryRouter>
  );
}

afterEach(cleanup);
beforeEach(() => resetFirestore());

it("opens on Feed for someone who follows anyone", async () => {
  seedFirestore(follow("friend"));
  open();
  expect(await screen.findByText("Feed showing")).toBeInTheDocument();
  expect(screen.queryByText("Together showing")).toBeNull();
  expect(screen.getByRole("radio", { name: "Feed" })).toBeChecked();
});

it("opens on Together for someone who follows nobody yet", async () => {
  open();
  expect(await screen.findByText("Together showing")).toBeInTheDocument();
  expect(screen.queryByText("Feed showing")).toBeNull();
});

it("opens on Together when the follow count cannot be read", async () => {
  failNextFirestore("onSnapshot", { code: "unavailable" });
  seedFirestore(follow("friend"));
  open();
  expect(await screen.findByText("Together showing")).toBeInTheDocument();
  expect(unfiredFailures()).toEqual([]);
});

it.each([
  ["/social?tab=together", "Together showing"],
  ["/social?tab=crews", "Together showing"],
  ["/social?circleCreate=race&circleTitle=Berlin", "Together showing"],
])("an explicit %s wins over the follows", async (url, showing) => {
  seedFirestore(follow("friend"));
  open(url);
  expect(await screen.findByText(showing)).toBeInTheDocument();
  expect(screen.queryByText("Feed showing")).toBeNull();
});

it("an explicit ?tab=feed wins for someone who follows nobody", async () => {
  open("/social?tab=feed");
  expect(await screen.findByText("Feed showing")).toBeInTheDocument();
});

it("stays on Together when the first follow lands during the visit", async () => {
  open();
  expect(await screen.findByText("Together showing")).toBeInTheDocument();
  await act(async () => {
    await setDocGuarded(
      doc({} as never, "following", "viewer", "users", "friend"),
      {
        followedAt: Timestamp.now(),
      }
    );
    await flushSnapshots();
  });
  expect(screen.getByText("Together showing")).toBeInTheDocument();
  expect(screen.queryByText("Feed showing")).toBeNull();
});

it("choosing Together from Feed says so in the address", async () => {
  seedFirestore(follow("friend"));
  open();
  await screen.findByText("Feed showing");
  act(() => screen.getByRole("radio", { name: "Together" }).click());
  expect(await screen.findByText("Together showing")).toBeInTheDocument();
  expect(screen.getByTestId("where")).toHaveTextContent("?tab=together");
});
