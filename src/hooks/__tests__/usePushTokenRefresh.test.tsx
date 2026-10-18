// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";

const refreshMock = vi.fn<(uid: string, generation?: number) => Promise<void>>(
  async () => {}
);
let currentUid: string | null = "u1";

vi.mock("@/lib/pushNotifications", () => ({
  getPushTokenLifecycleGeneration: () => native.generation,
  onPushTokenLifecycleReady: (callback: () => void) => {
    native.ready = callback;
    return native.stopReady;
  },
  refreshDeviceTokenForCurrentUser: (uid: string, generation?: number) =>
    refreshMock(uid, generation),
}));
const native = vi.hoisted(() => ({
  refresh: null as (() => void) | null,
  stop: vi.fn(),
  ready: null as (() => void) | null,
  stopReady: vi.fn(),
  generation: 7,
}));
vi.mock("@/lib/nativePush", () => ({
  listenForNativePushRefresh: async (refresh: () => void) => {
    native.refresh = refresh;
    return native.stop;
  },
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: currentUid ? { uid: currentUid } : null }),
  useUid: () =>
    ({ user: currentUid ? { uid: currentUid } : null }).user?.uid ?? null,
}));

import { usePushTokenRefresh } from "@/hooks/usePushTokenRefresh";

beforeEach(() => {
  vi.clearAllMocks();
  currentUid = "u1";
  native.generation = 7;
});

describe("usePushTokenRefresh", () => {
  it("refreshes once for the signed-in uid", () => {
    renderHook(() => usePushTokenRefresh());
    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(refreshMock).toHaveBeenCalledWith("u1", 7);
  });

  it("refreshes again when the document becomes visible", () => {
    renderHook(() => usePushTokenRefresh());
    refreshMock.mockClear();
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(refreshMock).toHaveBeenCalledWith("u1", 7);
  });

  it("removes the old visibility listener on uid change and never refreshes the old uid again", () => {
    const { rerender } = renderHook(() => usePushTokenRefresh());
    currentUid = "u2";
    rerender();
    refreshMock.mockClear();
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
    // Only u2's listener remains — u1 is never refreshed again.
    expect(refreshMock).not.toHaveBeenCalledWith("u1", 7);
  });

  it("does nothing when signed out", () => {
    currentUid = null;
    renderHook(() => usePushTokenRefresh());
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("refreshes on native resume/token changes and ignores old callbacks after cleanup", async () => {
    const { unmount } = renderHook(() => usePushTokenRefresh());
    await act(async () => {
      await Promise.resolve();
    });
    refreshMock.mockClear();
    native.refresh?.();
    expect(refreshMock).toHaveBeenCalledWith("u1", 7);
    unmount();
    expect(native.stop).toHaveBeenCalledOnce();
    refreshMock.mockClear();
    native.refresh?.();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("retries the same uid when a failed or cancelled credential transition is ready", () => {
    const { unmount } = renderHook(() => usePushTokenRefresh());
    refreshMock.mockClear();
    native.generation = 8;
    native.ready?.();
    expect(refreshMock).toHaveBeenCalledOnce();
    expect(refreshMock).toHaveBeenCalledWith("u1", 8);
    unmount();
    expect(native.stopReady).toHaveBeenCalledOnce();
    refreshMock.mockClear();
    native.ready?.();
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
