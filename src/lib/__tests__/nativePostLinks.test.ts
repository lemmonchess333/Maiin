/**
 * A shared post's link, tapped on a phone with Tropos (App1 Q51): the
 * universal-links file sends /activity/* to the app, which opens the post.
 * A native URL event is untrusted input, so only that one shape on the
 * production origin becomes a route.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  native: true,
  add: vi.fn(),
  launch: vi.fn(),
  remove: vi.fn(),
  callbacks: [] as ((event: { url: string }) => void)[],
}));
vi.mock("@/lib/platform", () => ({ isNativePlatform: () => h.native }));
vi.mock("@capacitor/app", () => ({
  App: { addListener: h.add, getLaunchUrl: h.launch },
}));

const POST = "https://troposfit.com/activity/AbC123xyz";

beforeEach(() => {
  vi.resetModules();
  h.native = true;
  h.callbacks = [];
  h.remove.mockReset().mockResolvedValue(undefined);
  h.add.mockReset().mockImplementation(async (_event, callback) => {
    h.callbacks.push(callback);
    return { remove: h.remove };
  });
  h.launch.mockReset().mockResolvedValue(undefined);
});

describe("which links open a post", () => {
  it.each([POST, `${POST}/`, `${POST}?utm_source=messages#top`])(
    "opens %s",
    async (url) => {
      const { nativePostRoute } = await import("../nativePostLinks");
      expect(nativePostRoute(url)).toBe("/activity/AbC123xyz");
    }
  );

  it.each([
    undefined,
    null,
    {},
    "bad URL",
    "http://troposfit.com/activity/AbC123xyz",
    "https://evil.example/activity/AbC123xyz",
    "https://www.troposfit.com/activity/AbC123xyz",
    "https://user:pw@troposfit.com/activity/AbC123xyz",
    "https://troposfit.com/activity/",
    "https://troposfit.com/activity/a/comments",
    "https://troposfit.com/activity/a%2F..%2Fsettings",
    "https://troposfit.com/settings/account",
    "https://troposfit.com/?invite=K7P49M2H",
    "capacitor://localhost/activity/AbC123xyz",
    `https://troposfit.com/activity/${"a".repeat(65)}`,
  ])("refuses untrusted or unrelated input %#", async (url) => {
    const { nativePostRoute } = await import("../nativePostLinks");
    expect(nativePostRoute(url)).toBeNull();
  });
});

describe("delivery", () => {
  it("does nothing on the web", async () => {
    h.native = false;
    const { listenForNativePostLinks } = await import("../nativePostLinks");
    const open = vi.fn();
    (await listenForNativePostLinks(open))();
    expect(h.add).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });

  it("opens a cold launch's post once, not again on a remount", async () => {
    h.launch.mockResolvedValue({ url: POST });
    const { listenForNativePostLinks } = await import("../nativePostLinks");
    const first = vi.fn();
    (await listenForNativePostLinks(first))();
    await vi.waitFor(() =>
      expect(first).toHaveBeenCalledExactlyOnceWith("/activity/AbC123xyz")
    );
    const second = vi.fn();
    (await listenForNativePostLinks(second))();
    await Promise.resolve();
    expect(second).not.toHaveBeenCalled();
    expect(h.launch).toHaveBeenCalledTimes(1);
  });

  it("opens a link that arrives while the app is open, and ignores an invite", async () => {
    const { listenForNativePostLinks } = await import("../nativePostLinks");
    const open = vi.fn();
    const stop = await listenForNativePostLinks(open);
    h.callbacks[0]({ url: "https://troposfit.com/?invite=K7P49M2H" });
    h.callbacks[0]({ url: POST });
    expect(open).toHaveBeenCalledExactlyOnceWith("/activity/AbC123xyz");
    stop();
    expect(h.remove).toHaveBeenCalled();
    h.callbacks[0]({ url: POST });
    expect(open).toHaveBeenCalledTimes(1);
  });
});
