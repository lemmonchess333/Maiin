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
const A = "https://troposfit.com/?invite=K7P49M2H";
const B = "https://troposfit.com/?invite=A2B3C4D5";

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

describe("native invite URL allowlist", () => {
  it.each([
    A,
    "https://troposfit.com/?invite=k7p4-9m2h&utm_source=messages#top",
  ])("accepts %s", async (url) => {
    const { nativeInviteCode } = await import("../nativeInviteLinks");
    expect(nativeInviteCode(url)).toBe("K7P49M2H");
  });
  it.each([
    undefined,
    null,
    {},
    "bad URL",
    "http://troposfit.com/?invite=K7P49M2H",
    "https://evil.example/?invite=K7P49M2H",
    "https://troposfit.com.evil.example/?invite=K7P49M2H",
    "https://www.troposfit.com/?invite=K7P49M2H",
    "https://troposfit.com:8443/?invite=K7P49M2H",
    "https://user:password@troposfit.com/?invite=K7P49M2H",
    "https://troposfit.com/legal/privacy?invite=K7P49M2H",
    "https://troposfit.com/__/auth/handler?invite=K7P49M2H",
    "https://troposfit.com/?invite=nope",
    "https://troposfit.com/?invite=K7P49M2H&invite=A2B3C4D5",
    "https://troposfit.com/",
    "capacitor://localhost/?invite=K7P49M2H",
    `https://troposfit.com/?invite=K7P49M2H&x=${"a".repeat(2048)}`,
  ])("rejects untrusted or unrelated input %#", async (url) => {
    const { nativeInviteCode } = await import("../nativeInviteLinks");
    expect(nativeInviteCode(url)).toBeNull();
  });
});

describe("native invite delivery", () => {
  it("does nothing on the web", async () => {
    h.native = false;
    const { listenForNativeInvites } = await import("../nativeInviteLinks");
    const receive = vi.fn(() => true);
    (await listenForNativeInvites(receive))();
    expect(h.add).not.toHaveBeenCalled();
    expect(h.launch).not.toHaveBeenCalled();
    expect(receive).not.toHaveBeenCalled();
  });
  it("consumes a cold launch once, without replaying it on remount", async () => {
    h.launch.mockResolvedValue({ url: A });
    const { listenForNativeInvites } = await import("../nativeInviteLinks");
    const first = vi.fn(() => true);
    (await listenForNativeInvites(first))();
    expect(first).toHaveBeenCalledExactlyOnceWith("K7P49M2H");
    const second = vi.fn(() => true);
    (await listenForNativeInvites(second))();
    expect(second).not.toHaveBeenCalled();
    expect(h.launch).toHaveBeenCalledTimes(1);
  });
  it("keeps a newer warm invite when the older launch URL resolves late", async () => {
    let resolve!: (value: { url: string }) => void;
    h.launch.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      })
    );
    const { listenForNativeInvites } = await import("../nativeInviteLinks");
    const receive = vi.fn(() => true);
    const stop = await listenForNativeInvites(receive);
    h.callbacks[0]({ url: B });
    resolve({ url: A });
    await Promise.resolve();
    expect(receive).toHaveBeenCalledExactlyOnceWith("A2B3C4D5");
    stop();
  });
  it("does not lose a slow cold launch across unmount/remount", async () => {
    let resolve!: (value: { url: string }) => void;
    h.launch.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      })
    );
    const { listenForNativeInvites } = await import("../nativeInviteLinks");
    const old = vi.fn(() => true);
    (await listenForNativeInvites(old))();
    const current = vi.fn(() => true);
    const stop = await listenForNativeInvites(current);
    resolve({ url: A });
    await Promise.resolve();
    expect(old).not.toHaveBeenCalled();
    expect(current).toHaveBeenCalledExactlyOnceWith("K7P49M2H");
    stop();
    expect(h.remove).toHaveBeenCalledTimes(2);
  });
  it("reoffers a cold URL refused by an already-cancelled subscriber", async () => {
    h.launch.mockResolvedValue({ url: A });
    const { listenForNativeInvites } = await import("../nativeInviteLinks");
    (await listenForNativeInvites(() => false))();
    const receive = vi.fn(() => true);
    (await listenForNativeInvites(receive))();
    expect(receive).toHaveBeenCalledExactlyOnceWith("K7P49M2H");
  });
  it("keeps warm delivery working after launch lookup fails, and ignores callbacks after cleanup", async () => {
    h.launch.mockRejectedValue(new Error("unavailable"));
    const { listenForNativeInvites } = await import("../nativeInviteLinks");
    const receive = vi.fn(() => true);
    const stop = await listenForNativeInvites(receive);
    h.callbacks[0]({ url: "https://troposfit.com/legal/privacy" });
    h.callbacks[0]({ url: A });
    h.callbacks[0]({ url: B });
    stop();
    h.callbacks[0]({ url: A });
    expect(receive.mock.calls).toEqual([["K7P49M2H"], ["A2B3C4D5"]]);
  });
});
