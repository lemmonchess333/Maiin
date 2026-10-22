import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";

const H = vi.hoisted(() => ({
  result: { success: false } as Record<string, unknown>,
  toastError: vi.fn(),
  track: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { uid: "u1", email: "a@example.com" } }),
}));
vi.mock("@/lib/toast", () => ({ toast: { error: H.toastError } }));
vi.mock("@/lib/paywallAnalytics", () => ({ track: H.track }));
vi.mock("@/lib/purchaseProvider", () => ({
  purchase: async () => H.result,
  isNativeIOS: () => true,
}));

import { useProCheckout } from "../useProCheckout";

const wrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouter initialEntries={["/upgrade"]}>{children}</MemoryRouter>
);

function events() {
  return H.track.mock.calls.map((c) => c[0]);
}

beforeEach(() => {
  H.toastError.mockReset();
  H.track.mockReset();
});

describe("useProCheckout", () => {
  it("says nothing when the person closes the store's sheet", async () => {
    H.result = { success: false, cancelled: true };
    const { result } = renderHook(() => useProCheckout(), { wrapper });
    await act(() => result.current.startCheckout("yearly"));
    expect(H.toastError).not.toHaveBeenCalled();
    expect(result.current.error).toBeNull();
    expect(events()).toEqual(["checkout_started", "checkout_cancelled"]);
  });

  it("still shows and tracks a real failure", async () => {
    H.result = { success: false, error: "Purchase failed. Try again." };
    const { result } = renderHook(() => useProCheckout(), { wrapper });
    await act(() => result.current.startCheckout("yearly"));
    expect(H.toastError).toHaveBeenCalledWith("Purchase failed. Try again.");
    expect(events()).toEqual(["checkout_started", "checkout_failed"]);
  });
});
