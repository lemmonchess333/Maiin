// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The status bar and the browser bar follow the theme class on <html>.
 * They were set once, for the dark boot, and a person who chose light
 * got light status-bar text over a light page on iPhone.
 */

const native = vi.hoisted(() => ({ value: false }));
const setStyle = vi.hoisted(() => vi.fn(() => Promise.resolve()));

vi.mock("../platform", () => ({ isNativePlatform: () => native.value }));
vi.mock("@capacitor/status-bar", () => ({ StatusBar: { setStyle } }));

import {
  startSystemChromeSync,
  __resetSystemChromeForTests,
} from "../systemChrome";

let stop: () => void = () => {};

function themeColor(): string {
  return (
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
      ?.content ?? ""
  );
}

/** MutationObserver delivers on a microtask; the plugin loads on another. */
const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  __resetSystemChromeForTests();
  setStyle.mockClear();
  native.value = false;
  document.head.innerHTML = '<meta name="theme-color" content="#0e0e11" />';
  document.documentElement.className = "dark";
  document.body.style.backgroundColor = "rgb(14, 14, 17)";
});

afterEach(() => {
  stop();
});

describe("systemChrome", () => {
  it("the browser bar takes the page's ground when the theme turns light", async () => {
    stop = startSystemChromeSync();
    expect(themeColor()).toBe("#0e0e11");

    document.body.style.backgroundColor = "rgb(247, 247, 248)";
    document.documentElement.classList.remove("dark");
    await settle();
    expect(themeColor()).toBe("#f7f7f8");
  });

  it("on a phone, the status bar text flips with the theme", async () => {
    native.value = true;
    stop = startSystemChromeSync();
    await settle();
    // Capacitor's DARK style is light text, for the dark page.
    expect(setStyle).toHaveBeenLastCalledWith({ style: "DARK" });

    document.documentElement.classList.remove("dark");
    await settle();
    await settle();
    expect(setStyle).toHaveBeenLastCalledWith({ style: "LIGHT" });
  });

  it("other class changes on <html> leave the status bar alone", async () => {
    native.value = true;
    stop = startSystemChromeSync();
    await settle();
    setStyle.mockClear();

    document.documentElement.classList.add("booting");
    await settle();
    await settle();
    expect(setStyle).not.toHaveBeenCalled();
  });

  it("the web never asks for the native plugin", async () => {
    stop = startSystemChromeSync();
    document.documentElement.classList.remove("dark");
    await settle();
    await settle();
    expect(setStyle).not.toHaveBeenCalled();
  });
});
