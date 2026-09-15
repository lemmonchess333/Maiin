import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { User } from "firebase/auth";
import { useEmailVerificationGate } from "../useEmailVerificationGate";
const native = vi.hoisted(() => ({
  callback: null as null | ((state: { isActive: boolean }) => void),
  remove: vi.fn(),
}));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true },
}));
vi.mock("@capacitor/app", () => ({
  App: {
    addListener: async (
      _name: string,
      callback: (state: { isActive: boolean }) => void
    ) => {
      native.callback = callback;
      return { remove: native.remove };
    },
  },
}));

// recheck must reload the Auth user (a verification made elsewhere is
// invisible to the SDK) and then force a token refresh, because Firestore
// reuses the cached token — without the refresh the rules keep reading
// email_verified:false for up to an hour after the link was tapped.
function fakeUser(opts: { verifiedAfterReload: boolean }) {
  const user = {
    emailVerified: false,
    providerData: [{ providerId: "password" }],
    reload: vi.fn(async () => {
      user.emailVerified = opts.verifiedAfterReload;
    }),
    getIdToken: vi.fn(async () => "fresh-token"),
  };
  return user as unknown as User & typeof user;
}

describe("useEmailVerificationGate", () => {
  it("checks again when the iPhone app returns from Mail and removes the listener", async () => {
    const user = fakeUser({ verifiedAfterReload: false });
    const { result, unmount } = renderHook(() =>
      useEmailVerificationGate(user, true)
    );
    await waitFor(() => expect(native.callback).toBeTypeOf("function"));
    await act(async () => {});
    user.reload.mockImplementationOnce(async () => {
      user.emailVerified = true;
    });
    await act(async () => {
      native.callback?.({ isActive: true });
    });
    expect(user.reload).toHaveBeenCalledTimes(2);
    expect(user.getIdToken).toHaveBeenCalledWith(true);
    expect(result.current.needsVerification).toBe(false);
    unmount();
    expect(native.remove).toHaveBeenCalled();
  });
  it("reports the gate for an unverified password account", () => {
    const { result } = renderHook(() =>
      useEmailVerificationGate(fakeUser({ verifiedAfterReload: false }))
    );
    expect(result.current.needsVerification).toBe(true);
  });

  it("recheck reloads, then refreshes the token once the account reads verified", async () => {
    const user = fakeUser({ verifiedAfterReload: true });
    const { result } = renderHook(() => useEmailVerificationGate(user));
    let verified = false;
    await act(async () => {
      verified = await result.current.recheck();
    });
    expect(verified).toBe(true);
    expect(user.reload).toHaveBeenCalledTimes(1);
    expect(user.getIdToken).toHaveBeenCalledWith(true);
    expect(result.current.needsVerification).toBe(false);
  });

  it("recheck leaves the token alone while the account is still unverified", async () => {
    const user = fakeUser({ verifiedAfterReload: false });
    const { result } = renderHook(() => useEmailVerificationGate(user));
    let verified = true;
    await act(async () => {
      verified = await result.current.recheck();
    });
    expect(verified).toBe(false);
    expect(user.getIdToken).not.toHaveBeenCalled();
    expect(result.current.needsVerification).toBe(true);
  });

  it("recheck with no user resolves false", async () => {
    const { result } = renderHook(() => useEmailVerificationGate(null));
    expect(result.current.needsVerification).toBe(false);
    await expect(result.current.recheck()).resolves.toBe(false);
  });
});

describe("failed and stale verification checks", () => {
  it("keeps the gate closed if reload succeeds but the new security token fails", async () => {
    const user = fakeUser({ verifiedAfterReload: true });
    user.getIdToken.mockRejectedValueOnce(new Error("offline"));
    const { result, rerender } = renderHook(() =>
      useEmailVerificationGate(user)
    );
    await act(async () => {
      await expect(result.current.recheck()).rejects.toThrow("offline");
    });
    expect(user.emailVerified).toBe(true); // Firebase mutates this before refresh.
    rerender();
    expect(result.current.emailVerified).toBe(false);
    expect(result.current.needsVerification).toBe(true);
    await act(async () => {
      await expect(result.current.recheck()).resolves.toBe(true);
    });
    expect(result.current.needsVerification).toBe(false);
  });
  it("reports a reload failure rather than saying the link was not clicked", async () => {
    const user = fakeUser({ verifiedAfterReload: true });
    user.reload.mockRejectedValueOnce(new Error("network"));
    const { result } = renderHook(() => useEmailVerificationGate(user));
    await act(async () => {
      await expect(result.current.recheck()).rejects.toThrow("network");
    });
    expect(user.getIdToken).not.toHaveBeenCalled();
    expect(result.current.needsVerification).toBe(true);
  });
  it("does not apply a completed check to a replacement account", async () => {
    const user = fakeUser({ verifiedAfterReload: true });
    let finish!: () => void;
    user.reload.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = () => {
            user.emailVerified = true;
            resolve();
          };
        })
    );
    const { result, rerender } = renderHook(
      ({ account }) => useEmailVerificationGate(account),
      { initialProps: { account: user } }
    );
    let pending!: Promise<boolean>;
    act(() => {
      pending = result.current.recheck();
    });
    rerender({ account: fakeUser({ verifiedAfterReload: false }) });
    await act(async () => {
      finish();
      await expect(pending).rejects.toThrow("Account changed");
    });
    expect(result.current.needsVerification).toBe(true);
  });
});
