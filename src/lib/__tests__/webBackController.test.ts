/**
 * webBackController — the pure sentinel-accounting brain for the WEB back-to-
 * dismiss path. These tests validate every event interleaving deterministically
 * (a mis-count would mis-navigate real users, and jsdom can't replay real
 * popstate timing, so the logic is pinned here in isolation). End-to-end
 * behaviour in a real browser is validated separately by a Playwright E2E.
 */
import { describe, it, expect } from "vitest";
import {
  createWebBackController,
  type HistoryPort,
} from "../webBackController";

function fakePort() {
  const port: HistoryPort & { pushes: number; backs: number } = {
    pushes: 0,
    backs: 0,
    pushSentinel() {
      this.pushes++;
    },
    back() {
      this.backs++;
    },
  };
  return port;
}

describe("webBackController", () => {
  it("open → user back closes the top and nets zero sentinels", () => {
    const port = fakePort();
    const c = createWebBackController(port);
    c.onOpen();
    expect(port.pushes).toBe(1);
    expect(c._count()).toBe(1);

    // User presses browser back → a sentinel is popped.
    expect(c.onPop()).toBe("close-top");
    expect(c._count()).toBe(0);
    // The overlay then closes as a result of that back.
    c.onClose(true, false);
    expect(c._count()).toBe(0);
    expect(port.backs).toBe(0); // user consumed it; we didn't
  });

  it("open → in-place close consumes the sentinel via back(), and the self-pop is ignored", () => {
    const port = fakePort();
    const c = createWebBackController(port);
    c.onOpen();
    // Close via X / backdrop / drag (not back, not navigation).
    c.onClose(false, false);
    expect(port.backs).toBe(1); // consumed the dangling sentinel
    expect(c._count()).toBe(0);
    // The history.back() we issued fires a popstate — it must be ignored.
    expect(c.onPop()).toBe("ignore");
    expect(c._count()).toBe(0);
  });

  it("nested overlays close LIFO, one sentinel each", () => {
    const port = fakePort();
    const c = createWebBackController(port);
    c.onOpen();
    c.onOpen();
    expect(port.pushes).toBe(2);
    expect(c._count()).toBe(2);

    expect(c.onPop()).toBe("close-top"); // back closes the inner
    c.onClose(true, false);
    expect(c._count()).toBe(1);

    expect(c.onPop()).toBe("close-top"); // back closes the outer
    c.onClose(true, false);
    expect(c._count()).toBe(0);

    // Nothing left → next back is a real navigation.
    expect(c.onPop()).toBe("ignore");
    expect(port.backs).toBe(0);
  });

  it("navigate-from-overlay does NOT consume the sentinel (no undo of the nav)", () => {
    const port = fakePort();
    const c = createWebBackController(port);
    c.onOpen();
    // Overlay closed because the app navigated to a new route.
    c.onClose(false, true);
    expect(port.backs).toBe(0); // must NOT back() — that would undo the navigation
    expect(c._count()).toBe(0);
    // The ghost sentinel self-consumes on a later back (treated as real nav).
    expect(c.onPop()).toBe("ignore");
  });

  it("a back with no overlay open is a real navigation (ignored)", () => {
    const port = fakePort();
    const c = createWebBackController(port);
    expect(c.onPop()).toBe("ignore");
  });

  it("interleaved: open A, open B, in-place close B, back closes A", () => {
    const port = fakePort();
    const c = createWebBackController(port);
    c.onOpen(); // A
    c.onOpen(); // B
    c.onClose(false, false); // B closed in place → consumes one sentinel
    expect(port.backs).toBe(1);
    expect(c._count()).toBe(1);
    expect(c.onPop()).toBe("ignore"); // B's self-pop
    // Now user backs → closes A.
    expect(c.onPop()).toBe("close-top");
    c.onClose(true, false);
    expect(c._count()).toBe(0);
  });
});
