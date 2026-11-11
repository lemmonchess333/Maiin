/**
 * The launch overlay: it takes over index.html's static first frame, hands
 * the native launch image over to it, raises the stem, stays while the
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
import { MARK_BAR, MARK_STEM } from "@/lib/brandMark";

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
const stemLayer = () => overlay()?.querySelector(".launch-splash-stem");
/** The paths of the mark's own drawing, the one the flight moves. */
const drawn = () =>
  [...overlay()!.querySelectorAll("svg.launch-splash-mark > path")].map((el) =>
    el.getAttribute("d")
  );

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

  it("draws the bar alone first, as the launch image does", () => {
    show();
    // Nothing moves before the first frame is on screen, and the stem is
    // not yet part of the drawing.
    expect(played).toHaveLength(0);
    expect(drawn()).toEqual([MARK_BAR]);
    expect(stemLayer()).not.toBeNull();
  });

  it("hands the native launch image over, then raises the stem in view", async () => {
    show();
    await wait(100);
    expect(native.order).toEqual(["native image hidden"]);
    const [rise, solid] = motionsOf(".launch-splash-stem");
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

  it("raises the mark's own stem, on a layer of its own", () => {
    show();
    expect(stemLayer()!.querySelector("path")).toHaveAttribute("d", MARK_STEM);
  });

  it("once risen, the stem is part of the one drawing the flight moves", async () => {
    show();
    await wait(800);
    expect(stemLayer()).toBeNull();
    expect(drawn()).toEqual([MARK_BAR, MARK_STEM]);
  });

  it("under Reduce Motion the stem fades in where it stays", async () => {
    prefersReducedMotion(true);
    show();
    await wait(100);
    const motions = motionsOf(".launch-splash-stem");
    expect(motions).toHaveLength(1);
    expect(motions[0].keyframes).toEqual([{ opacity: 0 }, { opacity: 1 }]);
    await wait(300);
    expect(drawn()).toEqual([MARK_BAR, MARK_STEM]);
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
    // Whole, still holding for the app, and its one motion (the stem's
    // fade) recorded, so the recorder would have seen a breath.
    expect(drawn()).toEqual([MARK_BAR, MARK_STEM]);
    expect(motionsOf(".launch-splash-stem")).toHaveLength(1);
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

      // From where the overlay's mark is, landing exactly on the header's.
      // Centre onto centre: x 18 + 13.5/2 − (150 + 90/2) = −170.25,
      // y 97 + 16/2 − (370 + 104/2) = −317; scale 16/104 ≈ 0.15385. The
      // arc between is launchSplash.test.ts's.
      const [flight] = motionsOf(".launch-splash-flight");
      const frames = flight.keyframes.map((k) => k.transform);
      expect(frames).toHaveLength(31); // 30 steps, both ends
      expect(frames[0]).toBe("translate(0px, 0px) scale(1)");
      expect(frames.at(-1)).toBe("translate(-170.25px, -317px) scale(0.15385)");
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
