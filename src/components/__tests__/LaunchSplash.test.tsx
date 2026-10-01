/**
 * The launch overlay: it takes over index.html's static first frame, stays
 * while the app loads, and leaves once the app is ready, by flying into
 * Home's header mark on Home and by fading anywhere else. It never shows
 * under automation. The flight's arithmetic is launchSplash.test.ts's.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const auth: {
  user: { uid: string } | null;
  profile: { onboardingComplete: boolean } | null;
  loading: boolean;
} = { user: null, profile: null, loading: true };
vi.mock("@/lib/auth", () => ({ useAuth: () => auth }));

import LaunchSplash from "../LaunchSplash";

const realMatchMedia = window.matchMedia;
function prefersReducedMotion(on: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: on && query.includes("prefers-reduced-motion"),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

function staticFrame() {
  const el = document.createElement("div");
  el.id = "boot-splash";
  document.body.appendChild(el);
  document.documentElement.classList.add("booting");
}

const overlay = () => document.querySelector("[data-launch-splash]");

function show(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LaunchSplash />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) =>
    window.setTimeout(() => cb(performance.now()), 16)
  );
  vi.stubGlobal("cancelAnimationFrame", (id: number) =>
    window.clearTimeout(id)
  );
  Object.assign(auth, { user: null, profile: null, loading: true });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.matchMedia = realMatchMedia;
  document.getElementById("boot-splash")?.remove();
  document.documentElement.classList.remove("booting", "launching");
});

describe("LaunchSplash", () => {
  it("takes over index.html's static first frame", () => {
    staticFrame();
    show();
    expect(document.getElementById("boot-splash")).toBeNull();
    expect(document.documentElement).not.toHaveClass("booting");
    expect(overlay()).toHaveAttribute("aria-hidden", "true");
    expect(overlay()).toHaveClass("launch-splash");
  });

  it("never shows when a test harness drives the browser", () => {
    Object.defineProperty(navigator, "webdriver", {
      value: true,
      configurable: true,
    });
    try {
      staticFrame();
      show();
      expect(overlay()).toBeNull();
      expect(document.getElementById("boot-splash")).toBeNull();
    } finally {
      delete (navigator as { webdriver?: boolean }).webdriver;
    }
  });

  it("raises the chevron into the hexagon, unless Reduce Motion is on", () => {
    // Framer writes an SVG element's opacity as an attribute.
    const chevron = () => overlay()!.querySelector("polyline") as SVGElement;
    prefersReducedMotion(false);
    show();
    expect(chevron()).toHaveAttribute("opacity", "0");
    expect(chevron().style.transform).toContain("translateY(70px)");
    cleanup();
    prefersReducedMotion(true);
    show();
    expect(chevron().getAttribute("opacity")).not.toBe("0");
    expect(chevron().style.transform).not.toContain("70px");
  });

  it("cuts the chevron out of the hexagon instead of painting it", () => {
    // A hole shows the launch ground, then the page as the ground fades:
    // what Home's mark shows when the flight lands on it, in either theme.
    show();
    const chevron = overlay()!.querySelector("polyline")!;
    const mask = chevron.closest("mask");
    expect(mask).not.toBeNull();
    expect(chevron).toHaveAttribute("stroke", "black");
    expect(overlay()!.querySelector("svg > polygon")).toHaveAttribute(
      "mask",
      `url(#${mask!.id})`
    );
  });

  it("stays while the app loads, then fades once it is ready", async () => {
    prefersReducedMotion(true);
    const { rerender } = show("/food");
    expect(overlay()).not.toBeNull();
    // Longer than its own fade and failsafe timer: loading holds it.
    await new Promise((r) => setTimeout(r, 800));
    expect(overlay()).not.toBeNull();

    Object.assign(auth, {
      user: { uid: "u1" },
      profile: { onboardingComplete: true },
      loading: false,
    });
    rerender(
      <MemoryRouter initialEntries={["/food"]}>
        <LaunchSplash />
      </MemoryRouter>
    );
    await waitFor(() => expect(overlay()).toBeNull(), { timeout: 2000 });
    expect(document.documentElement).not.toHaveClass("launching");
  });

  it("under Reduce Motion, still waits for Home, then fades", async () => {
    prefersReducedMotion(true);
    Object.assign(auth, {
      user: { uid: "u1" },
      profile: { onboardingComplete: true },
      loading: false,
    });
    const classes: string[] = [];
    const watch = new MutationObserver(() =>
      classes.push(document.documentElement.className)
    );
    watch.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    try {
      show("/");
      // Home has not drawn its header yet: the overlay holds.
      await new Promise((r) => setTimeout(r, 600));
      expect(overlay()).not.toBeNull();

      const header = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "svg"
      );
      header.setAttribute("data-brand-mark", "");
      document.body.appendChild(header);
      vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
        function (this: Element) {
          if (this === header) return new DOMRect(18, 97, 13.5, 16);
          if (this.closest("[data-launch-splash]"))
            return new DOMRect(150, 370, 90, 104);
          return new DOMRect(0, 0, 0, 0);
        }
      );
      try {
        await waitFor(() => expect(overlay()).toBeNull(), { timeout: 2000 });
        // It faded: the header's mark was never hidden for a flight.
        expect(classes.some((c) => c.includes("launching"))).toBe(false);
      } finally {
        header.remove();
      }
    } finally {
      watch.disconnect();
    }
  });

  it("on Home, flies into the header's mark and hides it until it lands", async () => {
    prefersReducedMotion(false);
    Object.assign(auth, {
      user: { uid: "u1" },
      profile: { onboardingComplete: true },
      loading: false,
    });
    // Home's header mark, settled where the page put it.
    const header = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg"
    );
    header.setAttribute("data-brand-mark", "");
    document.body.appendChild(header);
    const rects = new Map<Element, DOMRect>([
      [header, new DOMRect(18, 97, 13.5, 16)],
    ]);
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
      function (this: Element) {
        if (rects.has(this)) return rects.get(this)!;
        if (this.closest("[data-launch-splash]"))
          return new DOMRect(150, 370, 90, 104);
        return new DOMRect(0, 0, 0, 0);
      }
    );
    // Home's mark must be back before the landed one goes, or one frame
    // shows neither.
    const order: string[] = [];
    const watch = new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === "attributes" && r.oldValue?.includes("launching"))
          order.push("header mark back");
        if (
          r.type === "childList" &&
          [...r.removedNodes].some((n) =>
            (n as Element).matches?.("[data-launch-splash]")
          )
        )
          order.push("overlay gone");
      }
    });
    watch.observe(document.documentElement, {
      attributes: true,
      attributeOldValue: true,
      attributeFilter: ["class"],
    });
    watch.observe(document.body, { childList: true, subtree: true });
    try {
      show("/");
      await waitFor(
        () => expect(document.documentElement).toHaveClass("launching"),
        { timeout: 2000 }
      );
      await waitFor(() => expect(overlay()).toBeNull(), { timeout: 2000 });
      expect(document.documentElement).not.toHaveClass("launching");
      await waitFor(() =>
        expect(order).toEqual(["header mark back", "overlay gone"])
      );
    } finally {
      watch.disconnect();
      header.remove();
    }
  });
});
