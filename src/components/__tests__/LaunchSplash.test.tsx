/**
 * The launch overlay: it takes over index.html's static first frame, hands
 * the native launch image over to it, raises the chevron, stays while the
 * app loads (breathing if that is slow), and leaves once the app is ready,
 * by flying into Home's header mark on Home and by lifting away anywhere
 * else. It never shows under automation. The flight's arithmetic is
 * launchSplash.test.ts's.
 *
 * jsdom has no Web Animations API, so `Element.animate` is a recorder here:
 * the tests read the motion the component asked for, not pixels. The clock
 * is fake (requestAnimationFrame runs on it as a 16 ms timer): nothing here
 * uses framer, so no frame loop is left holding it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import {
  flightBetween,
  flightFrames,
  hexagonClipPath,
} from "@/lib/launchSplash";

const auth: {
  user: { uid: string } | null;
  profile: { onboardingComplete: boolean } | null;
  loading: boolean;
} = { user: null, profile: null, loading: true };
vi.mock("@/lib/auth", () => ({ useAuth: () => auth }));

const native = vi.hoisted(() => ({ order: [] as string[] }));
vi.mock("@/lib/nativeLaunchImage", () => ({
  hideNativeLaunchImage: vi.fn(() => {
    native.order.push("native image hidden");
    return Promise.resolve();
  }),
}));

import LaunchSplash from "../LaunchSplash";

type Played = {
  el: Element;
  keyframes: Keyframe[];
  options: KeyframeAnimationOptions;
  cancelled: boolean;
};
let played: Played[] = [];
const motionsOf = (selector: string) =>
  played.filter((p) => p.el.matches(selector));

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
const chevronLayer = () => overlay()?.querySelector(".launch-splash-chevron");

function show(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LaunchSplash />
    </MemoryRouter>
  );
}

/** Advance the clock a frame at a time, each in its own act(): React holds
 *  the updates made inside one act() until it ends, so a single long
 *  advance would let nothing that waits on state (the breath, the look
 *  for Home's header) start until the time had already passed. */
async function wait(ms: number) {
  for (let left = ms; left > 0; left -= 16) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(Math.min(16, left));
    });
  }
  await act(async () => {});
}

function signedInOnHome() {
  Object.assign(auth, {
    user: { uid: "u1" },
    profile: { onboardingComplete: true },
    loading: false,
  });
}

/** Home's header mark, settled where the page put it, and the boxes the
 *  overlay measures. `ready` is Home saying its content has loaded. */
function homeHeader({ ready }: { ready: boolean }) {
  const header = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  header.setAttribute("data-brand-mark", "");
  const page = document.createElement("div");
  if (ready) page.setAttribute("data-page-ready", "");
  page.appendChild(header);
  document.body.appendChild(page);
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
    function (this: Element) {
      if (this === header) return new DOMRect(18, 97, 13.5, 16);
      if (this.closest("[data-launch-splash]"))
        return new DOMRect(150, 370, 90, 104);
      return new DOMRect(0, 0, 0, 0);
    }
  );
  return page;
}

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "performance"],
  });
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) =>
    window.setTimeout(() => cb(performance.now()), 16)
  );
  vi.stubGlobal("cancelAnimationFrame", (id: number) =>
    window.clearTimeout(id)
  );
  played = [];
  Object.defineProperty(Element.prototype, "animate", {
    configurable: true,
    writable: true,
    value: function (
      this: Element,
      keyframes: Keyframe[],
      options: KeyframeAnimationOptions
    ) {
      const record = { el: this, keyframes, options, cancelled: false };
      played.push(record);
      return {
        cancel: () => {
          record.cancelled = true;
        },
      } as unknown as Animation;
    },
  });
  native.order.length = 0;
  Object.assign(auth, { user: null, profile: null, loading: true });
  prefersReducedMotion(false);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (Element.prototype as { animate?: unknown }).animate;
  window.matchMedia = realMatchMedia;
  document.getElementById("boot-splash")?.remove();
  document.body.innerHTML = "";
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

  it("draws the hexagon alone first, as the launch image does", () => {
    show();
    // Nothing moves before the first frame is on screen, and the chevron
    // is not yet cut out of the hexagon.
    expect(played).toHaveLength(0);
    expect(overlay()!.querySelector("mask")).toBeNull();
    expect(overlay()!.querySelector("svg > polygon")).not.toHaveAttribute(
      "mask"
    );
    expect(chevronLayer()).not.toBeNull();
  });

  it("hands the native launch image over, then raises the chevron in view", async () => {
    show();
    await wait(100);
    expect(native.order).toEqual(["native image hidden"]);
    const [rise, solid] = motionsOf(".launch-splash-chevron");
    expect(rise.keyframes).toEqual([
      { transform: "translateY(11%)" },
      { transform: "translateY(0)" },
    ]);
    expect(rise.options.duration).toBeGreaterThan(400);
    // Solid before it slows into place.
    expect(solid.keyframes).toEqual([{ opacity: 0 }, { opacity: 1 }]);
    expect(solid.options.duration).toBeLessThan(
      rise.options.duration as number
    );
  });

  it("cuts the rising chevron out only inside the hexagon's outline", () => {
    show();
    const cut = overlay()!.querySelector(".launch-splash-cut") as HTMLElement;
    expect(cut.style.clipPath).toBe(hexagonClipPath());
    expect(chevronLayer()!.parentElement).toBe(cut);
  });

  it("once risen, the chevron is a hole in the hexagon, not a shape", async () => {
    // A hole shows the launch ground, then the page as the ground fades:
    // what Home's mark shows when the flight lands on it, in either theme.
    show();
    await wait(800);
    expect(chevronLayer()).toBeNull();
    const chevron = overlay()!.querySelector("polyline")!;
    const mask = chevron.closest("mask");
    expect(mask).not.toBeNull();
    expect(chevron).toHaveAttribute("stroke", "black");
    expect(overlay()!.querySelector("svg > polygon")).toHaveAttribute(
      "mask",
      `url(#${mask!.id})`
    );
  });

  it("under Reduce Motion the chevron fades in where it stays", async () => {
    prefersReducedMotion(true);
    show();
    await wait(100);
    const motions = motionsOf(".launch-splash-chevron");
    expect(motions).toHaveLength(1);
    expect(motions[0].keyframes).toEqual([{ opacity: 0 }, { opacity: 1 }]);
    await wait(300);
    expect(overlay()!.querySelector("mask")).not.toBeNull();
  });

  it("breathes while the app is still loading, and stops when it leaves", async () => {
    const { rerender } = show("/food");
    await wait(1400);
    const [breath] = motionsOf(".launch-splash-body");
    expect(breath.options.iterations).toBe(Infinity);
    expect(breath.options.direction).toBe("alternate");
    expect(breath.cancelled).toBe(false);

    signedInOnHome();
    rerender(
      <MemoryRouter initialEntries={["/food"]}>
        <LaunchSplash />
      </MemoryRouter>
    );
    await wait(50);
    expect(breath.cancelled).toBe(true);
  });

  it("does not breathe under Reduce Motion", async () => {
    prefersReducedMotion(true);
    show("/food");
    await wait(3000);
    // Whole, still holding for the app, and its one motion (the chevron's
    // fade) recorded, so the recorder would have seen a breath.
    expect(overlay()!.querySelector("mask")).not.toBeNull();
    expect(motionsOf(".launch-splash-chevron")).toHaveLength(1);
    expect(motionsOf(".launch-splash-body")).toHaveLength(0);
  });

  it("stays while the app loads, then lifts away once it is ready", async () => {
    const { rerender } = show("/food");
    // Longer than its own motion: loading holds it.
    await wait(1500);
    expect(overlay()).not.toBeNull();

    signedInOnHome();
    rerender(
      <MemoryRouter initialEntries={["/food"]}>
        <LaunchSplash />
      </MemoryRouter>
    );
    await wait(50);
    const [lift] = motionsOf(".launch-splash-flight");
    expect(lift.keyframes.at(-1)).toEqual({
      opacity: 0,
      transform: "translateY(-5%)",
    });
    const [clear] = motionsOf(".launch-splash-ground");
    expect(clear.keyframes).toEqual([{ opacity: 1 }, { opacity: 0 }]);
    await wait(400);
    expect(overlay()).toBeNull();
    expect(document.documentElement).not.toHaveClass("launching");
  });

  it("under Reduce Motion, still waits for Home, then only fades", async () => {
    prefersReducedMotion(true);
    signedInOnHome();
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
      await wait(600);
      expect(overlay()).not.toBeNull();

      homeHeader({ ready: true });
      await wait(200);
      const [fade] = motionsOf(".launch-splash-flight");
      expect(fade.keyframes).toEqual([{ opacity: 1 }, { opacity: 0 }]);
      await wait(400);
      expect(overlay()).toBeNull();
      // It faded: the header's mark was never hidden for a flight.
      expect(classes.some((c) => c.includes("launching"))).toBe(false);
    } finally {
      watch.disconnect();
    }
  });

  it("on Home, waits for Home's content before it lands, within a bound", async () => {
    signedInOnHome();
    const page = homeHeader({ ready: false });
    show("/");
    // Risen, and the header is still, but the cards are loading.
    await wait(1200);
    expect(motionsOf(".launch-splash-flight")).toHaveLength(0);

    page.setAttribute("data-page-ready", "");
    await wait(100);
    expect(motionsOf(".launch-splash-flight")).toHaveLength(1);
    expect(document.documentElement).toHaveClass("launching");

    // And when the content never says so, it lands on what Home has drawn.
    cleanup();
    played = [];
    document.body.innerHTML = "";
    document.documentElement.classList.remove("launching");
    vi.restoreAllMocks();
    homeHeader({ ready: false });
    show("/");
    await wait(900);
    expect(motionsOf(".launch-splash-flight")).toHaveLength(0);
    await wait(1200);
    expect(motionsOf(".launch-splash-flight")).toHaveLength(1);
  });

  it("on Home, flies into the header's mark and hides it until it lands", async () => {
    signedInOnHome();
    homeHeader({ ready: true });
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
      await wait(800);
      expect(document.documentElement).toHaveClass("launching");

      // Along the arc, landing exactly on the header's mark.
      const [flight] = motionsOf(".launch-splash-flight");
      const expected = flightFrames(
        flightBetween(
          { left: 150, top: 370, width: 90, height: 104 },
          { left: 18, top: 97, width: 13.5, height: 16 }
        )
      );
      expect(flight.keyframes.map((k) => k.transform)).toEqual(expected);
      expect(flight.options.easing).toBe("linear");
      // The ground clears just after the mark has left it.
      const [clear] = motionsOf(".launch-splash-ground");
      expect(clear.options.delay).toBeGreaterThan(0);

      await wait(600);
      expect(overlay()).toBeNull();
      expect(document.documentElement).not.toHaveClass("launching");
      await wait(0);
      expect(order).toEqual(["header mark back", "overlay gone"]);
    } finally {
      watch.disconnect();
    }
  });
});
