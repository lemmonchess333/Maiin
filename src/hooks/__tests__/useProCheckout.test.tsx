import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";

const H = vi.hoisted(() => ({
  result: { kind: "cancelled" } as unknown,
  toastError: vi.fn(),
  track: vi.fn(),
}));

const auth = vi.hoisted(() => ({
  user: { uid: "u1", email: "a@example.com" } as {
    uid: string;
    email: string;
  } | null,
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: auth.user }),
}));
vi.mock("@/lib/toast", () => ({ toast: { error: H.toastError } }));
vi.mock("@/lib/paywallAnalytics", () => ({ track: H.track }));
const purchase = vi.hoisted(() =>
  vi.fn(async (..._args: unknown[]) => H.result)
);
vi.mock("@/lib/purchaseProvider", () => ({
  purchase,
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
  purchase.mockClear();
  auth.user = { uid: "u1", email: "a@example.com" };
});

describe("useProCheckout", () => {
  it("says nothing when the person closes the store's sheet", async () => {
    H.result = { kind: "cancelled" };
    const { result } = renderHook(() => useProCheckout(), { wrapper });
    await act(() => result.current.startCheckout("yearly"));
    expect(H.toastError).not.toHaveBeenCalled();
    expect(result.current.error).toBeNull();
    expect(events()).toEqual(["checkout_started", "checkout_cancelled"]);
  });

  it("a purchase the store took is a calm notice, never an error", async () => {
    H.result = { kind: "pending", pending: "entitlement" };
    const { result } = renderHook(() => useProCheckout(), { wrapper });
    await act(() => result.current.startCheckout("yearly"));
    expect(H.toastError).not.toHaveBeenCalled();
    expect(result.current.error).toBeNull();
    expect(result.current.notice).toBe(
      "The App Store has your purchase. Pro switches on once it’s confirmed. If it hasn’t in a few minutes, tap Restore."
    );
    expect(events()).toEqual(["checkout_started", "checkout_pending"]);
    expect(H.track.mock.calls[1][1]).toMatchObject({ pending: "entitlement" });
  });

  it("a payment held for approval says what it is waiting for", async () => {
    H.result = { kind: "pending", pending: "approval" };
    const { result } = renderHook(() => useProCheckout(), { wrapper });
    await act(() => result.current.startCheckout("monthly"));
    expect(H.toastError).not.toHaveBeenCalled();
    expect(result.current.error).toBeNull();
    expect(result.current.notice).toBe(
      "Your purchase is waiting for approval. Pro switches on once it’s approved."
    );
    expect(events()).toEqual(["checkout_started", "checkout_pending"]);
  });

  it("the notice clears when the person starts again", async () => {
    H.result = { kind: "pending", pending: "entitlement" };
    const { result } = renderHook(() => useProCheckout(), { wrapper });
    await act(() => result.current.startCheckout("yearly"));
    expect(result.current.notice).not.toBeNull();

    H.result = {
      kind: "failed",
      message: "Couldn’t complete the purchase. Try again.",
    };
    await act(() => result.current.startCheckout("yearly"));
    expect(result.current.notice).toBeNull();
    expect(result.current.error).toBe(
      "Couldn’t complete the purchase. Try again."
    );
  });

  it("still shows and tracks a real failure", async () => {
    H.result = {
      kind: "failed",
      message: "Couldn’t complete the purchase. Try again.",
      detail: "There was a problem with the App Store.",
    };
    const { result } = renderHook(() => useProCheckout(), { wrapper });
    await act(() => result.current.startCheckout("yearly"));
    expect(H.toastError).toHaveBeenCalledWith(
      "Couldn’t complete the purchase. Try again."
    );
    expect(events()).toEqual(["checkout_started", "checkout_failed"]);
    expect(H.track.mock.calls[1][1]).toMatchObject({
      error: "There was a problem with the App Store.",
    });
  });

  it("a purchase that throws is a failure in the app's words", async () => {
    purchase.mockRejectedValueOnce(new Error("bridge gone"));
    const { result } = renderHook(() => useProCheckout(), { wrapper });
    await act(() => result.current.startCheckout("yearly"));
    expect(result.current.error).toBe("Couldn’t start checkout. Try again.");
    expect(result.current.loading).toBe(false);
    expect(H.track.mock.calls[1]).toEqual([
      "checkout_failed",
      expect.objectContaining({ error: "bridge gone" }),
    ]);
  });

  it("starts one purchase at a time, however fast the taps (App1 Q20)", async () => {
    let settle!: (outcome: unknown) => void;
    purchase.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          settle = resolve;
        })
    );
    const { result } = renderHook(() => useProCheckout(), { wrapper });
    // Two taps in one event, before a render could disable the button.
    await act(async () => {
      void result.current.startCheckout("yearly");
      void result.current.startCheckout("monthly");
    });
    expect(purchase).toHaveBeenCalledOnce();
    expect(purchase.mock.calls[0][0]).toBe("yearly");
    expect(result.current.loading).toBe(true);
    await act(async () => settle({ kind: "bought" }));
    expect(result.current).toMatchObject({
      loading: false,
      error: null,
      notice: null,
    });
  });

  it("a sign-in message never stands beside a purchase's notice (App1 Q20)", async () => {
    H.result = { kind: "pending", pending: "entitlement" };
    const { result, rerender } = renderHook(() => useProCheckout(), {
      wrapper,
    });
    await act(() => result.current.startCheckout("yearly"));
    expect(result.current.notice).not.toBeNull();
    auth.user = null;
    rerender();
    await act(() => result.current.startCheckout("yearly"));
    expect(result.current.error).toBe("Sign in to start Pro.");
    expect(result.current.notice).toBeNull();
    expect(H.toastError).toHaveBeenCalledWith("Sign in to start Pro.");
    expect(purchase).toHaveBeenCalledOnce();
  });
});
