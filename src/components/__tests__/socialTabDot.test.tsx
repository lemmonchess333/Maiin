/**
 * The Social tab's dot (App1 Q34): someone did something for you.
 *
 * It reads the notification tray's own unread count, so the dot and the
 * bell on Social always agree, and it clears when the tray is opened, not
 * when the tab is tapped: tapping Social to read the feed has not shown
 * anyone their props or comments. The tab's name carries what the dot
 * says, since a dot alone says nothing to VoiceOver (DESIGN_GUIDE §10).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  act,
  cleanup,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const viewer = vi.hoisted(() => ({ uid: "dot-viewer" }));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { uid: viewer.uid } }),
  useUid: () => viewer.uid,
}));
vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/preloadTab", () => ({ preloadTab: vi.fn() }));
vi.mock("@/hooks/useReducedMotion", () => ({ useReducedMotion: () => true }));

import { Timestamp } from "firebase/firestore";
import BottomNavigation, {
  SOCIAL_NEW_ACTIVITY,
} from "@/components/BottomNavigation";
import { useNotifications } from "@/hooks/useNotifications";
import { resetFirestore, seedFirestore } from "@/test/firestoreHarness";
import {
  HomeTabIcon,
  SocialTabIcon,
  TrainTabIcon,
} from "@/components/icons/TabIcons";

const TABS = [
  { to: "/", icon: HomeTabIcon, label: "Home" },
  { to: "/program", icon: TrainTabIcon, label: "Train" },
  { to: "/social", icon: SocialTabIcon, label: "Social" },
];

function renderBar(socialNewActivity: boolean) {
  return render(
    <MemoryRouter>
      <BottomNavigation
        tabs={TABS}
        pathname="/"
        socialNewActivity={socialNewActivity}
      />
    </MemoryRouter>
  );
}

beforeEach(() => {
  resetFirestore();
  window.localStorage.clear();
});
afterEach(cleanup);

describe("the tab bar draws the dot", () => {
  it("with new activity: a dot on Social, and its name says so", () => {
    const { container } = renderBar(true);
    const social = screen.getByRole("link", {
      name: `Social, ${SOCIAL_NEW_ACTIVITY}`,
    });
    expect(social.querySelector("[data-new-activity]")).not.toBeNull();
    // Only Social carries it.
    expect(container.querySelectorAll("[data-new-activity]")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Home" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Train" })).toBeInTheDocument();
  });

  it("with nothing new: no dot, and the tab is just Social", () => {
    const { container } = renderBar(false);
    expect(screen.getByRole("link", { name: "Social" })).toBeInTheDocument();
    expect(container.querySelector("[data-new-activity]")).toBeNull();
  });
});

describe("the dot is the tray's", () => {
  const kudos = (fromUserId: string) => ({
    type: "kudos",
    fromUserId,
    fromName: "Friend",
    createdAt: Timestamp.fromDate(new Date(Date.now() - 60_000)),
  });

  it("opening the tray clears every reader at once", () => {
    viewer.uid = "dot-viewer-1";
    seedFirestore({
      [`notifications/${viewer.uid}/items/n1`]: kudos("friend"),
    });
    // The tab bar's reader (Layout) and the bell's (Social), as the app
    // mounts them: two hooks, one tray.
    const tab = renderHook(() => useNotifications());
    const bell = renderHook(() => useNotifications());
    expect(tab.result.current.unreadCount).toBe(1);
    expect(bell.result.current.unreadCount).toBe(1);

    act(() => bell.result.current.markAllSeen());
    expect(bell.result.current.unreadCount).toBe(0);
    expect(tab.result.current.unreadCount).toBe(0);
  });

  it("one account opening its tray leaves another's dot alone", () => {
    viewer.uid = "dot-viewer-2";
    seedFirestore({
      [`notifications/${viewer.uid}/items/n1`]: kudos("friend"),
    });
    const tab = renderHook(() => useNotifications());
    expect(tab.result.current.unreadCount).toBe(1);
    // The same event, from another account's tray on this device.
    act(() => {
      window.dispatchEvent(
        new CustomEvent("tropos:notifications-seen", {
          detail: { uid: "someone-else", ms: Date.now() },
        })
      );
    });
    expect(tab.result.current.unreadCount).toBe(1);
  });
});
