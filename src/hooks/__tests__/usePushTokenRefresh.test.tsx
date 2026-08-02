// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

const refreshMock = vi.fn<(uid: string) => Promise<void>>(async () => {});
let currentUid: string | null = "u1";

vi.mock("@/lib/pushNotifications", () => ({
  refreshDeviceTokenForCurrentUser: (uid: string) => refreshMock(uid),
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
});

describe("usePushTokenRefresh", () => {
  it("refreshes once for the signed-in uid", () => {
    renderHook(() => usePushTokenRefresh());
    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(refreshMock).toHaveBeenCalledWith("u1");
  });

  it("refreshes again when the document becomes visible", () => {
    renderHook(() => usePushTokenRefresh());
    refreshMock.mockClear();
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(refreshMock).toHaveBeenCalledWith("u1");
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
    expect(refreshMock).not.toHaveBeenCalledWith("u1");
  });

  it("does nothing when signed out", () => {
    currentUid = null;
    renderHook(() => usePushTokenRefresh());
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
