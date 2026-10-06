// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The app's text follows the phone's text size on iPhone, held between
 * the designed size and double it. WKWebView does not apply Dynamic Type
 * to a page by itself, so the app read at its designed size whatever the
 * phone was set to.
 */

const native = vi.hoisted(() => ({ value: false }));
const preferred = vi.hoisted(() => ({ value: 1 as number }));
const getPreferred = vi.hoisted(() =>
  vi.fn(() => Promise.resolve({ value: preferred.value }))
);
const listeners = vi.hoisted(
  () => [] as ((s: { isActive: boolean }) => void)[]
);

vi.mock("../platform", () => ({ isNativePlatform: () => native.value }));
vi.mock("@capacitor/text-zoom", () => ({ TextZoom: { getPreferred } }));
vi.mock("@capacitor/app", () => ({
  App: {
    addListener: vi.fn(
      async (_event: string, cb: (s: { isActive: boolean }) => void) => {
        listeners.push(cb);
        return { remove: vi.fn() };
      }
    ),
  },
}));

import {
  clampTextScale,
  startSystemTextSizeSync,
  __resetSystemTextSizeForTests,
} from "../systemTextSize";

const settle = () => new Promise((r) => setTimeout(r, 0));
const rootSize = () => document.documentElement.style.fontSize;
let stop: () => void = () => {};

beforeEach(() => {
  __resetSystemTextSizeForTests();
  getPreferred.mockClear();
  listeners.length = 0;
  native.value = false;
  preferred.value = 1;
  document.documentElement.style.removeProperty("font-size");
});

afterEach(() => stop());

describe("clampTextScale", () => {
  it("holds the scale between the designed size and double it", () => {
    expect(clampTextScale(1.35)).toBe(1.35);
    expect(clampTextScale(0.82)).toBe(1);
    expect(clampTextScale(3.1)).toBe(2);
  });

  it("treats a missing or nonsense reading as the designed size", () => {
    expect(clampTextScale(undefined)).toBe(1);
    expect(clampTextScale(Number.NaN)).toBe(1);
    expect(clampTextScale("1.5")).toBe(1);
  });
});

describe("startSystemTextSizeSync", () => {
  it("on a phone set to larger text, scales the root font size", async () => {
    native.value = true;
    preferred.value = 23 / 17; // the largest standard size
    stop = startSystemTextSizeSync();
    await settle();
    await settle();
    expect(rootSize()).toBe("135.3%");
  });

  it("at the default setting leaves the root font size alone", async () => {
    native.value = true;
    stop = startSystemTextSizeSync();
    await settle();
    await settle();
    expect(rootSize()).toBe("");
  });

  it("picks up a change made in Settings when the app comes back", async () => {
    native.value = true;
    stop = startSystemTextSizeSync();
    await settle();
    await settle();
    expect(rootSize()).toBe("");

    preferred.value = 33 / 17; // an accessibility size
    listeners.forEach((cb) => cb({ isActive: true }));
    await settle();
    await settle();
    expect(rootSize()).toBe("194.1%");
  });

  it("the web never asks for the native plugin", async () => {
    stop = startSystemTextSizeSync();
    await settle();
    expect(getPreferred).not.toHaveBeenCalled();
    expect(rootSize()).toBe("");
  });
});
