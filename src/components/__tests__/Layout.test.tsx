import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { lazy, Suspense } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import Layout from "../Layout";
import { preloadTab } from "@/lib/preloadTab";

/* Layout pulls in several side-effecting hooks; stub them so the test
 * isolates the bottom-nav retap behaviour. */
vi.mock("@/hooks/useOnlineStatus", () => ({
  useOnlineStatus: () => ({ isOnline: true, wasOffline: false }),
}));
/* The tray's reader, as the Social tab's dot reads it: `unread` is what
   the tray holds unread, and `markAllSeen` is what opening it calls. */
const tray = vi.hoisted(() => ({ unread: 0, markAllSeen: vi.fn() }));
vi.mock("@/hooks/useNotifications", () => ({
  useNotifications: () => ({
    unreadCount: tray.unread,
    markAllSeen: tray.markAllSeen,
  }),
}));
vi.mock("@/lib/offlineQueue", () => ({
  getQueueLength: () => 0,
  getFailedWorkoutCompletionCount: () => 0,
  getFailedRunSaveCount: () => 0,
  getFailedMealSaveCount: () => 0,
  getRefusedSaveCount: () => 0,
  discardRefusedSaves: vi.fn(),
  subscribeQueuedWrites: () => () => {},
  flushQueue: vi.fn(),
}));
// The pending-sync badge counts THIS account's queued work (uid-scoped).
vi.mock("@/lib/auth", () => ({ useUid: () => "u-test" }));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/preloadTab", () => ({ preloadTab: vi.fn() }));
/* reduced-motion ON keeps framer-motion deterministic under jsdom */
vi.mock("@/hooks/useReducedMotion", () => ({ useReducedMotion: () => true }));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<div>home</div>} />
          <Route path="/program" element={<div>program</div>} />
          <Route path="/food" element={<div>food</div>} />
          <Route path="/social" element={<div>social</div>} />
          <Route path="/history" element={<div>history</div>} />
          <Route path="/user/:uid" element={<div>profile</div>} />
          <Route path="/league" element={<div>league</div>} />
          <Route path="/space/:spaceId" element={<div>space</div>} />
          <Route
            path="/space/:spaceId/post/:postId"
            element={<div>space post</div>}
          />
          <Route path="/settings" element={<div>settings</div>} />
          <Route path="/upgrade" element={<div>offer</div>} />
          <Route path="/run" element={<div>run</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe("Layout bottom-nav retap", () => {
  let scrollSpy: ReturnType<typeof vi.fn>;
  let dispatchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    scrollSpy = vi.fn();
    // jsdom doesn't implement scrollTo
    window.scrollTo = scrollSpy as unknown as typeof window.scrollTo;
    dispatchSpy = vi.spyOn(window, "dispatchEvent");
  });

  afterEach(() => {
    vi.clearAllMocks();
    dispatchSpy.mockRestore();
  });

  it("scrolls to top when the already-active tab is tapped (non-Social)", () => {
    renderAt("/food");
    fireEvent.click(screen.getByLabelText("Food"));
    expect(scrollSpy).toHaveBeenCalled();
    expect(scrollSpy).toHaveBeenCalledWith({ top: 0, behavior: "instant" });
    // Soc5: the feed-refresh event must NOT fire for non-Social tabs
    const retapFired = dispatchSpy.mock.calls.some(
      ([e]: [Event]) =>
        e instanceof CustomEvent && e.type === "tropos:social-tab-retap"
    );
    expect(retapFired).toBe(false);
  });

  it("scrolls to top AND fires the refresh event when active Social tab is tapped", () => {
    renderAt("/social");
    fireEvent.click(screen.getByLabelText("Social"));
    expect(scrollSpy).toHaveBeenCalled();
    const retapFired = dispatchSpy.mock.calls.some(
      ([e]: [Event]) =>
        e instanceof CustomEvent && e.type === "tropos:social-tab-retap"
    );
    expect(retapFired).toBe(true);
  });

  it("does not scroll when tapping a tab that is not the active one", () => {
    renderAt("/food");
    fireEvent.click(screen.getByLabelText("Home"));
    expect(scrollSpy).not.toHaveBeenCalled();
  });

  it("announces Social as current on a profile reached from Social", () => {
    renderAt("/user/preview");
    expect(screen.getByRole("link", { name: "Social" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(
      screen
        .getAllByRole("link")
        .filter((link) => link.getAttribute("aria-current") === "page")
    ).toHaveLength(1);
  });

  it("keeps all destinations available without a false active tab in settings", () => {
    renderAt("/settings");
    expect(screen.getAllByRole("link")).toHaveLength(5);
    for (const link of screen.getAllByRole("link")) {
      expect(link).not.toHaveAttribute("aria-current");
    }
  });

  it.each([
    "/league",
    "/space/london-marathon",
    "/space/london-marathon/post/post-123",
  ])(
    "keeps Social selected on %s and returns to its main page on tap",
    (path) => {
      renderAt(path);
      expect(screen.getByRole("link", { name: "Social" })).toHaveAttribute(
        "aria-current",
        "page"
      );
      expect(
        screen
          .getAllByRole("link")
          .filter((link) => link.getAttribute("aria-current") === "page")
      ).toHaveLength(1);

      fireEvent.click(screen.getByRole("link", { name: "Social" }));
      expect(screen.getByText("social")).toBeInTheDocument();
      // A selected child route is still navigation, not a root-tab retap.
      expect(scrollSpy).not.toHaveBeenCalled();
      expect(
        dispatchSpy.mock.calls.some(
          ([event]: [Event]) =>
            event instanceof CustomEvent &&
            event.type === "tropos:social-tab-retap"
        )
      ).toBe(false);

      fireEvent.click(screen.getByRole("link", { name: "Food" }));
      expect(screen.getByRole("link", { name: "Food" })).toHaveAttribute(
        "aria-current",
        "page"
      );
      expect(screen.getByRole("link", { name: "Social" })).not.toHaveAttribute(
        "aria-current"
      );
    }
  );

  it("waits for a destination to be touched or focused before preloading it", () => {
    renderAt("/");
    expect(preloadTab).not.toHaveBeenCalled();
    fireEvent.pointerDown(screen.getByRole("link", { name: "Home" }));
    expect(preloadTab).not.toHaveBeenCalled();
    fireEvent.pointerDown(screen.getByRole("link", { name: "Food" }), {
      pointerType: "touch",
    });
    expect(preloadTab).toHaveBeenCalledExactlyOnceWith("/food");
    expect(screen.getByText("home")).toBeInTheDocument();
    fireEvent.focus(screen.getByRole("link", { name: "Train" }));
    expect(preloadTab).toHaveBeenLastCalledWith("/program");
  });

  it("keeps navigation available while a tab's code is loading", () => {
    const PendingPage = lazy(
      () => new Promise<{ default: () => null }>(() => {})
    );
    render(
      <MemoryRouter initialEntries={["/program"]}>
        <Suspense fallback={<div>Whole app loading</div>}>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/program" element={<PendingPage />} />
              <Route path="/" element={<div>home</div>} />
            </Route>
          </Routes>
        </Suspense>
      </MemoryRouter>
    );
    expect(screen.queryByText("Whole app loading")).toBeNull();
    expect(
      screen.getByRole("navigation", { name: "Main navigation" })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "Home" }));
    expect(screen.getByText("home")).toBeInTheDocument();
  });
});

describe("Layout — where the tab bar is not", () => {
  it("renders no tab bar under the Pro offer or the live run, and keeps it everywhere else", () => {
    const nav = () =>
      screen.queryByRole("navigation", { name: /main navigation/i });
    const { unmount } = renderAt("/upgrade");
    expect(screen.getByText("offer")).toBeInTheDocument();
    expect(nav()).toBeNull();
    unmount();

    const run = renderAt("/run");
    expect(nav()).toBeNull();
    run.unmount();

    renderAt("/settings");
    expect(nav()).toBeInTheDocument();
  });
});

describe("Layout — the Social tab's dot (App1 Q34)", () => {
  beforeEach(() => {
    window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  });
  afterEach(() => {
    tray.unread = 0;
    vi.clearAllMocks();
  });

  it("shows when the tray holds something unread, and says so", () => {
    tray.unread = 3;
    renderAt("/");
    const social = screen.getByRole("link", { name: "Social, new activity" });
    expect(social.querySelector("[data-new-activity]")).not.toBeNull();
  });

  it("is not there when the tray has nothing new", () => {
    renderAt("/");
    const social = screen.getByRole("link", { name: "Social" });
    expect(social.querySelector("[data-new-activity]")).toBeNull();
  });

  it("stays after the tab is tapped: only opening the tray clears it", () => {
    tray.unread = 1;
    renderAt("/");
    fireEvent.click(screen.getByRole("link", { name: "Social, new activity" }));
    expect(screen.getByText("social")).toBeInTheDocument();
    expect(tray.markAllSeen).not.toHaveBeenCalled();
    expect(
      screen.getByRole("link", { name: "Social, new activity" })
    ).toBeInTheDocument();
  });
});
