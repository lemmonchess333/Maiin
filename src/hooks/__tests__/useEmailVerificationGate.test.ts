import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { User } from "firebase/auth";
import { useEmailVerificationGate } from "../useEmailVerificationGate";
import { track } from "@/lib/lifecycleAnalytics";
vi.mock("@/lib/lifecycleAnalytics", () => ({ track: vi.fn() }));
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
// Each account gets its own uid: the gates share which account they have
// seen needing verification, and one test's account must not be another's.
let accounts = 0;
function fakeUser(opts: { verifiedAfterReload: boolean; verified?: boolean }) {
  const user = {
    uid: `account-${++accounts}`,
    emailVerified: opts.verified ?? false,
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

describe("email_verified", () => {
  const verifiedEvents = () =>
    vi.mocked(track).mock.calls.filter(([e]) => e === "email_verified");

  it("is reported once, by the check that confirms the address", async () => {
    vi.mocked(track).mockClear();
    const user = fakeUser({ verifiedAfterReload: true });
    const { result } = renderHook(() => useEmailVerificationGate(user));
    expect(verifiedEvents()).toHaveLength(0);
    await act(async () => {
      await result.current.recheck();
    });
    expect(verifiedEvents()).toEqual([["email_verified", { method: "email" }]]);
    // Checking again says nothing more.
    await act(async () => {
      await result.current.recheck();
    });
    expect(verifiedEvents()).toHaveLength(1);
  });

  it("is reported once between the gates that share an account", async () => {
    vi.mocked(track).mockClear();
    const user = fakeUser({ verifiedAfterReload: true });
    // The App-level gate and, say, Home's notice.
    const app = renderHook(() => useEmailVerificationGate(user));
    const home = renderHook(() => useEmailVerificationGate(user));
    await act(async () => {
      await Promise.all([
        app.result.current.recheck(),
        home.result.current.recheck(),
      ]);
    });
    expect(app.result.current.needsVerification).toBe(false);
    expect(verifiedEvents()).toHaveLength(1);
  });

  it("waits for the token: a failed refresh reports nothing until a check succeeds", async () => {
    vi.mocked(track).mockClear();
    const user = fakeUser({ verifiedAfterReload: true });
    user.getIdToken.mockRejectedValueOnce(new Error("offline"));
    const { result } = renderHook(() => useEmailVerificationGate(user));
    await act(async () => {
      await expect(result.current.recheck()).rejects.toThrow("offline");
    });
    expect(verifiedEvents()).toHaveLength(0);
    await act(async () => {
      await expect(result.current.recheck()).resolves.toBe(true);
    });
    expect(verifiedEvents()).toHaveLength(1);
  });

  it("says nothing for an account that never needed it", async () => {
    vi.mocked(track).mockClear();
    const verified = fakeUser({ verifiedAfterReload: true, verified: true });
    const { result } = renderHook(() => useEmailVerificationGate(verified));
    expect(result.current.needsVerification).toBe(false);
    await act(async () => {
      await expect(result.current.recheck()).resolves.toBe(true);
    });
    expect(verifiedEvents()).toHaveLength(0);
    // Anchor: an account that did need it is reported.
    const pending = fakeUser({ verifiedAfterReload: true });
    const second = renderHook(() => useEmailVerificationGate(pending));
    await act(async () => {
      await second.result.current.recheck();
    });
    expect(verifiedEvents()).toHaveLength(1);
  });

  it("says nothing when a different account confirms", async () => {
    vi.mocked(track).mockClear();
    // An unverified account was seen on this device, then another
    // (verified) account signed in and checked.
    renderHook(() =>
      useEmailVerificationGate(fakeUser({ verifiedAfterReload: false }))
    );
    const other = fakeUser({ verifiedAfterReload: true, verified: true });
    const { result } = renderHook(() => useEmailVerificationGate(other));
    await act(async () => {
      await expect(result.current.recheck()).resolves.toBe(true);
    });
    expect(verifiedEvents()).toHaveLength(0);
  });
});
