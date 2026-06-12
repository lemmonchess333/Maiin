/**
 * Instagram-Stories share seam (SOCIAL S2). The web/native split: a provider the
 * native layer injects at boot, a no-op web default. The contract the rest of the
 * share flow relies on is the GRACEFUL FALLBACK — with no provider (web, or native
 * before the plugin lands) the share returns false and never throws, so the caller
 * falls back to the generic OS share sheet. Mirrors the appCheck provider-seam tests.
 */
import { describe, it, expect, afterEach } from "vitest";
import {
  isInstagramShareAvailable,
  setNativeInstagramProvider,
  shareToInstagramStories,
  type IgStoryAsset,
} from "../instagramShare";

const asset = (): IgStoryAsset => ({
  file: new File([new Uint8Array([1, 2, 3])], "story.png", {
    type: "image/png",
  }),
  asTransparentSticker: false,
});

afterEach(() => {
  // Module-level provider is global state — reset between tests.
  setNativeInstagramProvider(null);
});

describe("isInstagramShareAvailable", () => {
  it("is false with no native provider (web / pre-plugin native)", () => {
    expect(isInstagramShareAvailable()).toBe(false);
  });

  it("flips to true once a provider is registered, and back when cleared", () => {
    setNativeInstagramProvider(async () => true);
    expect(isInstagramShareAvailable()).toBe(true);
    setNativeInstagramProvider(null);
    expect(isInstagramShareAvailable()).toBe(false);
  });
});

describe("shareToInstagramStories", () => {
  it("returns false (graceful fallback) when no provider is registered", async () => {
    expect(await shareToInstagramStories(asset())).toBe(false);
  });

  it("delegates to the provider and returns its result", async () => {
    setNativeInstagramProvider(async () => true);
    expect(await shareToInstagramStories(asset())).toBe(true);

    setNativeInstagramProvider(async () => false);
    expect(await shareToInstagramStories(asset())).toBe(false);
  });

  it("passes the asset through to the provider", async () => {
    let received: IgStoryAsset | null = null;
    setNativeInstagramProvider(async (a) => {
      received = a;
      return true;
    });
    const a = asset();
    await shareToInstagramStories(a);
    expect(received).toBe(a);
  });

  it("never throws — a provider rejection resolves to false", async () => {
    setNativeInstagramProvider(async () => {
      throw new Error("Instagram bridge declined");
    });
    await expect(shareToInstagramStories(asset())).resolves.toBe(false);
  });
});
