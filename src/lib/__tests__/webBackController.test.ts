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
  const deferred: (() => void)[] = [];
  const port: HistoryPort & {
    pushes: number;
    backs: number;
    href: string;
    /** Runs what was deferred: the end of the task, after its effects. */
    settle(): void;
  } = {
    pushes: 0,
    backs: 0,
    href: "/social",
    pushSentinel() {
      this.pushes++;
    },
    back() {
      this.backs++;
    },
    defer(fn) {
      deferred.push(fn);
    },
    url() {
      return this.href;
    },
    settle() {
      for (const fn of deferred.splice(0)) fn();
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
    expect(port.backs).toBe(0); // not before the task's opens have had it
    port.settle();
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
    port.settle();
    expect(port.backs).toBe(1);
    expect(c._count()).toBe(1);
    expect(c.onPop()).toBe("ignore"); // B's self-pop
    // Now user backs → closes A.
    expect(c.onPop()).toBe("close-top");
    c.onClose(true, false);
    expect(c._count()).toBe(0);
  });
  it("a sheet handing off to the next keeps one sentinel and pops nothing", () => {
    // A chooser closes and its form opens in the same commit. Consumed at
    // once, the close's back() ran after the form's pushState and landed on
    // the route's entry; the form's close then went back past the route.
    const port = fakePort();
    const c = createWebBackController(port);
    c.onOpen(); // the chooser
    c.onClose(false, false); // chosen: it closes…
    c.onOpen(); // …and the form opens
    port.settle();
    expect(port.pushes).toBe(1);
    expect(port.backs).toBe(0);
    expect(c._count()).toBe(1);

    // The form closes in place and hands off to its confirmation.
    c.onClose(false, false);
    c.onOpen();
    port.settle();
    expect(port.pushes).toBe(1);
    expect(port.backs).toBe(0);

    // The user's back closes the confirmation, and nothing is left.
    expect(c.onPop()).toBe("close-top");
    c.onClose(true, false);
    port.settle();
    expect(c._count()).toBe(0);
    expect(port.backs).toBe(0);
    expect(c.onPop()).toBe("ignore");
  });

  it("two closes and one open in a task pop one sentinel", () => {
    const port = fakePort();
    const c = createWebBackController(port);
    c.onOpen();
    c.onOpen();
    c.onClose(false, false);
    c.onClose(false, false);
    c.onOpen();
    port.settle();
    expect(port.pushes).toBe(2);
    expect(port.backs).toBe(1);
    expect(c._count()).toBe(1);
    expect(c.onPop()).toBe("ignore"); // that pop was ours
  });

  it("a navigation made after an in-place close is not undone", () => {
    const port = fakePort();
    const c = createWebBackController(port);
    c.onOpen();
    c.onClose(false, false); // closed in place…
    port.href = "/space/lifters"; // …then, in the same task, the app navigated
    port.settle();
    expect(port.backs).toBe(0);
    expect(c.onPop()).toBe("ignore"); // the sentinel rides as a middle entry
  });

  it("a user back that pops a sentinel not yet consumed closes nothing more", () => {
    const port = fakePort();
    const c = createWebBackController(port);
    c.onOpen();
    c.onClose(false, false);
    expect(c.onPop()).toBe("ignore"); // the user's back took the sentinel
    port.settle();
    expect(port.backs).toBe(0); // so nothing goes back past the route
  });
});
