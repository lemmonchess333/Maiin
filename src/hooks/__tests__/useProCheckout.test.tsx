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

  it("a purchase the store took is a calm notice, never an error", async () => {
    H.result = { success: false, pending: "entitlement" };
    const { result } = renderHook(() => useProCheckout(), { wrapper });
    await act(() => result.current.startCheckout("yearly"));
    expect(H.toastError).not.toHaveBeenCalled();
    expect(result.current.error).toBeNull();
    expect(result.current.notice).toBe(
      "The App Store has your purchase. Pro switches on once it's confirmed. If it hasn't in a few minutes, tap Restore."
    );
    expect(events()).toEqual(["checkout_started", "checkout_pending"]);
    expect(H.track.mock.calls[1][1]).toMatchObject({ pending: "entitlement" });
  });

  it("a payment held for approval says what it is waiting for", async () => {
    H.result = { success: false, pending: "approval" };
    const { result } = renderHook(() => useProCheckout(), { wrapper });
    await act(() => result.current.startCheckout("monthly"));
    expect(H.toastError).not.toHaveBeenCalled();
    expect(result.current.error).toBeNull();
    expect(result.current.notice).toBe(
      "Your purchase is waiting for approval. Pro switches on once it's approved."
    );
    expect(events()).toEqual(["checkout_started", "checkout_pending"]);
  });

  it("the notice clears when the person starts again", async () => {
    H.result = { success: false, pending: "entitlement" };
    const { result } = renderHook(() => useProCheckout(), { wrapper });
    await act(() => result.current.startCheckout("yearly"));
    expect(result.current.notice).not.toBeNull();

    H.result = {
      success: false,
      error: "Couldn't complete the purchase. Try again.",
    };
    await act(() => result.current.startCheckout("yearly"));
    expect(result.current.notice).toBeNull();
    expect(result.current.error).toBe(
      "Couldn't complete the purchase. Try again."
    );
  });

  it("still shows and tracks a real failure", async () => {
    H.result = {
      success: false,
      error: "Couldn't complete the purchase. Try again.",
    };
    const { result } = renderHook(() => useProCheckout(), { wrapper });
    await act(() => result.current.startCheckout("yearly"));
    expect(H.toastError).toHaveBeenCalledWith(
      "Couldn't complete the purchase. Try again."
    );
    expect(events()).toEqual(["checkout_started", "checkout_failed"]);
  });
});
