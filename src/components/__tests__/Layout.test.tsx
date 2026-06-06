import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import Layout from "../Layout";

/* Layout pulls in several side-effecting hooks; stub them so the test
 * isolates the bottom-nav retap behaviour. */
vi.mock("@/hooks/useOnlineStatus", () => ({
  useOnlineStatus: () => ({ isOnline: true, wasOffline: false }),
}));
const markSeen = vi.fn();
vi.mock("@/hooks/useUnreadCount", () => ({
  useUnreadCount: () => ({ count: 0, markSeen }),
}));
vi.mock("@/lib/offlineQueue", () => ({ getQueueLength: () => 0 }));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
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
});
