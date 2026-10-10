/**
 * The native launch image goes the moment the launch animation's first
 * frame is up, with no fade (the two frames are the same), so the rise is
 * seen; on the web there is no native image, and nothing is loaded.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  native: false,
  hide: vi.fn((_opts?: { fadeOutDuration?: number }) => Promise.resolve()),
}));

vi.mock("../platform", () => ({ isNativePlatform: () => h.native }));
vi.mock("@capacitor/splash-screen", () => ({
  SplashScreen: { hide: h.hide },
}));

import { hideNativeLaunchImage } from "../nativeLaunchImage";

afterEach(() => {
  h.native = false;
  h.hide.mockReset();
  h.hide.mockImplementation(() => Promise.resolve());
});

describe("hideNativeLaunchImage", () => {
  it("does nothing on the web", async () => {
    await hideNativeLaunchImage();
    expect(h.hide).not.toHaveBeenCalled();
  });

  it("takes the native image down at once in the native shell", async () => {
    h.native = true;
    await hideNativeLaunchImage();
    expect(h.hide).toHaveBeenCalledWith({ fadeOutDuration: 0 });
  });

  it("never fails the launch: a refusal leaves the plugin's own timer", async () => {
    h.native = true;
    h.hide.mockImplementation(() => Promise.reject(new Error("no splash")));
    await expect(hideNativeLaunchImage()).resolves.toBeUndefined();
  });
});
