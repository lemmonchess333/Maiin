// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Reduce Transparency reaches the page as one attribute on <html>, so the
 * frosted surfaces draw solid under it (DS6, DESIGN_GUIDE §14o). WebKit
 * has no `prefers-reduced-transparency`, so on iPhone the setting comes
 * from the app's own plugin; on the web from the media query.
 */

const native = vi.hoisted(() => ({ value: false }));
const prefs = vi.hoisted(() => ({
  get: vi.fn<() => Promise<{ reduceTransparency?: unknown }>>(),
  listeners: [] as ((p: { reduceTransparency?: unknown }) => void)[],
  removed: 0,
}));
const registered = vi.hoisted(() => [] as string[]);

vi.mock("../platform", () => ({ isNativePlatform: () => native.value }));
vi.mock("@capacitor/core", () => ({
  registerPlugin: (name: string) => {
    registered.push(name);
    return {
      get: prefs.get,
      addListener: async (
        _event: string,
        cb: (p: { reduceTransparency?: unknown }) => void
      ) => {
        prefs.listeners.push(cb);
        return {
          remove: async () => {
            prefs.removed += 1;
          },
        };
      },
    };
  },
}));

import {
  REDUCED_TRANSPARENCY_ATTRIBUTE,
  startReducedTransparencySync,
  __resetReducedTransparencyForTests,
} from "../reducedTransparency";

const settle = () => new Promise((r) => setTimeout(r, 0));
const marked = () =>
  document.documentElement.hasAttribute(REDUCED_TRANSPARENCY_ATTRIBUTE);
let stop: () => void = () => {};

function stubMatchMedia(matches: boolean) {
  const changeListeners: (() => void)[] = [];
  const query = {
    matches,
    addEventListener: (_: string, cb: () => void) => changeListeners.push(cb),
    removeEventListener: (_: string, cb: () => void) => {
      const i = changeListeners.indexOf(cb);
      if (i >= 0) changeListeners.splice(i, 1);
    },
  };
  window.matchMedia = vi.fn(() => query) as unknown as typeof matchMedia;
  return {
    set(next: boolean) {
      query.matches = next;
      for (const cb of [...changeListeners]) cb();
    },
    listening: () => changeListeners.length,
  };
}

beforeEach(() => {
  __resetReducedTransparencyForTests();
  native.value = false;
  prefs.get.mockReset();
  prefs.listeners.length = 0;
  prefs.removed = 0;
  registered.length = 0;
  document.documentElement.removeAttribute(REDUCED_TRANSPARENCY_ATTRIBUTE);
});

afterEach(() => {
  stop();
  stop = () => {};
});

describe("on iPhone, from the phone's own setting", () => {
  it("marks the page when Reduce Transparency is on", async () => {
    native.value = true;
    prefs.get.mockResolvedValue({ reduceTransparency: true });
    stop = startReducedTransparencySync();
    await settle();
    expect(registered).toEqual(["AccessibilityPrefs"]);
    expect(marked()).toBe(true);
  });

  it("leaves the page unmarked when it is off", async () => {
    native.value = true;
    prefs.get.mockResolvedValue({ reduceTransparency: false });
    stop = startReducedTransparencySync();
    await settle();
    expect(prefs.get).toHaveBeenCalledTimes(1);
    expect(marked()).toBe(false);
  });

  it("follows a change made while the app is open", async () => {
    native.value = true;
    prefs.get.mockResolvedValue({ reduceTransparency: false });
    stop = startReducedTransparencySync();
    await settle();
    expect(prefs.listeners).toHaveLength(1);
    prefs.listeners[0]({ reduceTransparency: true });
    expect(marked()).toBe(true);
    prefs.listeners[0]({ reduceTransparency: false });
    expect(marked()).toBe(false);
  });

  it("reads the setting again when the app comes back", async () => {
    native.value = true;
    prefs.get.mockResolvedValue({ reduceTransparency: false });
    stop = startReducedTransparencySync();
    await settle();
    prefs.get.mockResolvedValue({ reduceTransparency: true });
    document.dispatchEvent(new Event("visibilitychange"));
    await settle();
    expect(prefs.get).toHaveBeenCalledTimes(2);
    expect(marked()).toBe(true);
  });

  it("takes only a real true: a missing or odd answer leaves it frosted", async () => {
    native.value = true;
    prefs.get.mockResolvedValue({ reduceTransparency: "yes" });
    stop = startReducedTransparencySync();
    await settle();
    expect(prefs.get).toHaveBeenCalled();
    expect(marked()).toBe(false);
  });

  it("an app build without the plugin changes nothing and throws nothing", async () => {
    native.value = true;
    document.documentElement.setAttribute(REDUCED_TRANSPARENCY_ATTRIBUTE, "");
    prefs.get.mockRejectedValue(new Error("not implemented on ios"));
    stop = startReducedTransparencySync();
    await settle();
    expect(prefs.get).toHaveBeenCalled();
    expect(marked()).toBe(true);
  });

  it("stops listening when asked", async () => {
    native.value = true;
    prefs.get.mockResolvedValue({ reduceTransparency: false });
    stop = startReducedTransparencySync();
    await settle();
    stop();
    await settle();
    expect(prefs.removed).toBe(1);
    document.dispatchEvent(new Event("visibilitychange"));
    await settle();
    expect(prefs.get).toHaveBeenCalledTimes(1);
  });
});

describe("on the web, from the media query", () => {
  it("marks the page while the query matches, and follows it", () => {
    const media = stubMatchMedia(true);
    stop = startReducedTransparencySync();
    expect(registered).toEqual([]);
    expect(marked()).toBe(true);
    media.set(false);
    expect(marked()).toBe(false);
    stop();
    expect(media.listening()).toBe(0);
  });

  it("leaves the page unmarked where the query does not match", () => {
    stubMatchMedia(false);
    stop = startReducedTransparencySync();
    expect(window.matchMedia).toHaveBeenCalledWith(
      "(prefers-reduced-transparency: reduce)"
    );
    expect(marked()).toBe(false);
  });
});
