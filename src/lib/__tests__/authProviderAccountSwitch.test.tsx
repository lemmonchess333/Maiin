// @vitest-environment jsdom
/**
 * AuthProvider — account-switch isolation.
 *
 * onAuthStateChanged is not awaited by Firebase, so callbacks for account A
 * and B can overlap. These tests force out-of-order resolution and prove that
 * no stale A callback can commit A's identity-derived state under B, that an
 * A→B switch clears A's profile before B hydrates, and that a same-uid token
 * refresh doesn't flicker the profile away.
 *
 * MIGRATED off the inline SDK factory 2026-07-26 (ADR-0009: one fake). The
 * old version hand-rolled `getDoc` as a deferred-promise queue and fabricated
 * each account's snapshot inline. Two things improve by moving to the shared
 * fake, beyond removing a second Firestore implementation:
 *
 *   - A and B are now REAL documents at `users/A` and `users/B`, seeded and
 *     read by path. The old snapshots were synthetic and identical in shape,
 *     so nothing connected "the read that resolved" to "the account it was
 *     for" — the test trusted its own array indices.
 *   - `pendingReads()` names the held reads by path, so the interleaving is
 *     asserted rather than assumed. `releaseRead(1)` used to mean "whatever
 *     landed second"; now the test first proves the queue is
 *     `["users/A", "users/B"]`.
 *
 * The late-FAILURE case needed a new fake capability (`rejectRead`), because
 * `failNextFirestore` fires at issue time and so can never produce a read
 * that is still in flight across the switch and only then fails. See the
 * note on `rejectRead` in firestoreFake.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useEffect } from "react";
import { render, screen, act, cleanup, waitFor } from "@testing-library/react";

// Hoisted shared state (vi.mock factories are hoisted above module init).
const H = vi.hoisted(() => ({
  mockAuth: { currentUser: null as { uid: string } | null },
  authCb: null as ((u: { uid: string } | null) => void) | null,
  signUp: null as null | ((email: string, password: string) => Promise<void>),
  sendInitial: vi.fn(async (_uid: string) => {}),
  signOutAction: null as null | (() => Promise<void>),
  transition: vi.fn(async (operation: () => Promise<unknown>) => operation()),
  cancelAllNotifications: vi.fn(async () => {}),
  reload: vi.fn(),
  settled: vi.fn(async (wait: () => Promise<void>) => {
    await wait();
    return true;
  }),
  native: false,
  watchSync: vi.fn(async (_uid: string | null) => {}),
  watchClear: vi.fn(async () => {}),
  clearHeartRateSessionsForUser: vi.fn(),
  clearWatchRunSyncStatus: vi.fn(),
  stopHealthExportReconciler: vi.fn(),
  startHealthExportReconciler: vi.fn(() => H.stopHealthExportReconciler),
  stopWatchRunSyncReconciler: vi.fn(),
  startWatchRunSyncReconciler: vi.fn(() => H.stopWatchRunSyncReconciler),
}));
const mockAuth = H.mockAuth;

vi.mock("../platform", () => ({ isNativePlatform: () => H.native }));
vi.mock("../watchRunBridge", () => ({
  syncWatchRunAccount: H.watchSync,
  clearWatchRunAccountState: H.watchClear,
}));
vi.mock("../healthWorkoutExport", () => ({
  startHealthExportReconciler: H.startHealthExportReconciler,
}));
vi.mock("../watchRunSyncStatus", () => ({
  startWatchRunSyncReconciler: H.startWatchRunSyncReconciler,
  clearWatchRunSyncStatus: H.clearWatchRunSyncStatus,
}));
vi.mock("../heartRateSession", () => ({
  clearHeartRateSessionsForUser: H.clearHeartRateSessionsForUser,
}));

vi.mock("../firebase", () => ({
  auth: H.mockAuth,
  db: {},
  app: {},
  storage: {},
  functions: {},
  firebaseConfig: {},
}));
/* auth.tsx takes `auth` from firebaseApp (the Firestore-free half of the
   split), so the mock has to cover both halves — the real module calls
   getAuth() at import, which this suite's `firebase/auth` mock does not
   provide. Same shape as above so the suite's intent is unchanged. */
vi.mock("../firebaseApp", () => ({
  auth: H.mockAuth,
  app: {},
  firebaseConfig: {},
}));
vi.mock("@/lib/pushNotifications", () => ({
  withPushTokenLifecycleTransition: (operation: () => Promise<unknown>) =>
    H.transition(operation),
  invalidatePushTokenLifecycle: vi.fn(),
  stopListeningForForegroundPush: vi.fn(),
  unregisterDeviceToken: vi.fn().mockResolvedValue(undefined),
  waitForPendingPushRegistration: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/notifications", () => ({
  cancelAllNotifications: H.cancelAllNotifications,
}));
// jsdom cannot reload, and the reload is what these tests watch for.
vi.mock("../firestoreCacheClear", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../firestoreCacheClear")>()),
  reloadToClearFirestoreCache: H.reload,
  writesSettled: (wait: () => Promise<void>) => H.settled(wait),
}));
vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (
    _a: unknown,
    cb: (u: { uid: string } | null) => void
  ) => {
    H.authCb = cb;
    return () => {
      H.authCb = null;
    };
  },
  createUserWithEmailAndPassword: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(),
  signInWithRedirect: vi.fn(),
  getRedirectResult: vi.fn().mockResolvedValue(null),
  signInWithCredential: vi.fn(),
  GoogleAuthProvider: class {},
  OAuthProvider: class {},
  signOut: vi.fn(),
}));

// The one fake (ADR-0009). `getDocFromCache` models a cold cache and rejects
// synchronously without going through the deferral queue, so the cache-first
// paint in AuthProvider never appears in `pendingReads()` — the held reads
// below are the authoritative server reads only.
vi.mock("firebase/firestore");

vi.mock("../errorReporting", () => ({ setErrorReportingUid: vi.fn() }));
vi.mock("@/lib/firestoreWrite", () => ({
  setDocGuarded: vi.fn().mockResolvedValue(undefined),
  updateDocGuarded: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/lifecycleAnalytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/accountSecurity", () => ({
  sendVerificationEmail: vi.fn(),
  sendInitialVerificationEmail: H.sendInitial,
}));
vi.mock("@/lib/captureTimezone", () => ({
  getDeviceTimezone: () => "UTC",
  shouldUpdateTimezone: () => false,
}));

import { AuthProvider, useAuth } from "../auth";
import { noteEmailChange, pendingEmailChange } from "../emailChangeNote";
import {
  seedFirestore,
  resetFirestore,
  deferReads,
  pendingReads,
  releaseRead,
  rejectRead,
  failNextFirestore,
  unfiredFailures,
} from "@/test/firestoreHarness";

function Probe() {
  const auth = useAuth();
  // Hand the sign-up action to the test that drives it.
  useEffect(() => {
    H.signUp = auth.signUp;
    H.signOutAction = auth.signOut;
  }, [auth.signUp, auth.signOut]);
  const { user, profile, loading } = auth;
  return (
    <div
      data-testid="s"
      data-u={user?.uid ?? "null"}
      data-p={profile?.uid ?? "null"}
      data-loading={String(loading)}
    />
  );
}
const state = () => {
  const el = screen.getByTestId("s");
  return {
    u: el.getAttribute("data-u"),
    p: el.getAttribute("data-p"),
    loading: el.getAttribute("data-loading"),
  };
};

// Emit an auth event: set Firebase's current user, then fire the callback.
async function emit(uid: string | null) {
  mockAuth.currentUser = uid ? { uid } : null;
  await act(async () => {
    H.authCb?.(mockAuth.currentUser);
  });
}

beforeEach(() => {
  H.native = false;
  H.watchSync.mockReset().mockResolvedValue(undefined);
  H.watchClear.mockClear();
  H.clearHeartRateSessionsForUser.mockClear();
  H.clearWatchRunSyncStatus.mockClear();
  H.stopHealthExportReconciler.mockClear();
  H.startHealthExportReconciler.mockClear();
  H.stopWatchRunSyncReconciler.mockClear();
  H.startWatchRunSyncReconciler.mockClear();
  resetFirestore();
  mockAuth.currentUser = null;
  H.authCb = null;
  // Deliberately OPPOSITE darkMode values so "whose document won" is
  // readable off the store, not just inferred from the uid the provider
  // happens to carry over from auth.
  seedFirestore({
    "users/A": { email: "A@x.z", darkMode: true },
    "users/B": { email: "B@x.z", darkMode: false },
  });
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>
  );
});
afterEach(() => {
  cleanup();
  resetFirestore();
});

describe("AuthProvider — account switch isolation", () => {
  it("clears native Watch state before exposing a new account", async () => {
    H.native = true;
    await emit("A");
    await waitFor(() => expect(state().p).toBe("A"));
    await waitFor(() =>
      expect(H.startHealthExportReconciler).toHaveBeenCalledWith("A")
    );
    await waitFor(() =>
      expect(H.startWatchRunSyncReconciler).toHaveBeenCalledWith("A")
    );

    let finishClear!: () => void;
    const clearB = new Promise<void>((resolve) => (finishClear = resolve));
    H.watchSync.mockImplementation(async (uid) => {
      if (uid === "B") await clearB;
    });
    await emit("B");
    expect(H.watchSync).toHaveBeenCalledWith("B");
    expect(state()).toMatchObject({ u: "null", p: "null", loading: "true" });
    await act(async () => finishClear());
    await waitFor(() => expect(state().u).toBe("B"));
    await waitFor(() =>
      expect(H.startHealthExportReconciler).toHaveBeenCalledWith("B")
    );
    await waitFor(() =>
      expect(H.startWatchRunSyncReconciler).toHaveBeenCalledWith("B")
    );
    expect(H.stopHealthExportReconciler).toHaveBeenCalled();
    expect(H.stopWatchRunSyncReconciler).toHaveBeenCalled();
    expect(H.clearHeartRateSessionsForUser).toHaveBeenCalledWith("A");
    expect(H.clearWatchRunSyncStatus).toHaveBeenCalledWith("A");
  });

  it("B wins when A's read resolves LAST", async () => {
    deferReads();
    await emit("A");
    await emit("B");
    // Assert the interleaving exists before relying on it — indexing a
    // bare array cannot tell A's read from B's.
    // Awaited, not read synchronously: the provider reaches Firestore
    // through a dynamic import, so the read is issued a tick or more after
    // the auth callback rather than inside it. Reading straight after
    // emit() therefore samples an empty queue on a cold module cache and
    // only passes when some earlier suite happens to have warmed it. The
    // expectation is unchanged and still positive — both reads, in order —
    // so a provider that issued one, none, or the wrong order still fails.
    await waitFor(() => expect(pendingReads()).toEqual(["users/A", "users/B"]));

    await act(async () => {
      expect(releaseRead(1)).toBe(true); // B answers first
    });
    await waitFor(() => expect(state().p).toBe("B"));

    await act(async () => {
      expect(releaseRead(0)).toBe(true); // A answers LATE
    });
    expect(state().p).toBe("B");
    expect(state().u).toBe("B");
  });

  it("A→B clears A's profile immediately, before B hydrates", async () => {
    await emit("A");
    await waitFor(() => expect(state().p).toBe("A"));

    // Hold B's read so "before B hydrates" is a real window rather than a
    // race the test happens to win.
    deferReads();
    await emit("B");
    // Same dynamic-import wait as above; the profile assertions below still
    // land inside the held window, which is what "before B hydrates" means.
    await waitFor(() => expect(pendingReads()).toEqual(["users/B"]));
    expect(state().p).toBe("null");
    expect(state().loading).toBe("true");

    await act(async () => {
      expect(releaseRead(0)).toBe(true);
    });
    await waitFor(() => expect(state().p).toBe("B"));
  });

  it("A's read FAILING after B is current does not null B", async () => {
    deferReads();
    await emit("A");
    await emit("B");
    await waitFor(() => expect(pendingReads()).toEqual(["users/A", "users/B"]));

    await act(async () => {
      expect(releaseRead(1)).toBe(true);
    });
    await waitFor(() => expect(state().p).toBe("B"));

    // A's still-in-flight read now rejects. The stale catch must not clear
    // the account that is actually signed in.
    await act(async () => {
      expect(rejectRead(0)).toBe(true);
    });
    expect(state().p).toBe("B");
    expect(state().loading).toBe("false");
  });

  it("same-uid token refresh keeps the rendered profile (no flicker)", async () => {
    await emit("A");
    await waitFor(() => expect(state().p).toBe("A"));
    // A refreshes token (same uid) — profile must NOT blank.
    await emit("A");
    expect(state().p).toBe("A");
    expect(state().loading).toBe("false");
  });
});

describe("AuthProvider — email sign-up", () => {
  it("sends the verification link at sign-up, so onboarding need not wait for it", async () => {
    const { createUserWithEmailAndPassword } = await import("firebase/auth");
    vi.mocked(createUserWithEmailAndPassword).mockImplementationOnce(
      async () => {
        mockAuth.currentUser = { uid: "N" };
        return { user: { uid: "N", email: "n@example.com" } } as never;
      }
    );
    await act(async () => {
      await H.signUp!("n@example.com", "secret-123");
    });
    await waitFor(() => expect(H.sendInitial).toHaveBeenCalledWith("N"));
  });

  it("still sends the link and counts the sign-up when the profile write fails", async () => {
    const { createUserWithEmailAndPassword } = await import("firebase/auth");
    const { track } = await import("@/lib/lifecycleAnalytics");
    vi.mocked(createUserWithEmailAndPassword).mockImplementationOnce(
      async () => {
        mockAuth.currentUser = { uid: "F" };
        return { user: { uid: "F", email: "f@example.com" } } as never;
      }
    );
    failNextFirestore("commit", { code: "unavailable" });
    // Before: the write's failure was the sign-up's, so no link went and
    // the person was told sign-up failed while being signed in.
    await act(async () => {
      await expect(
        H.signUp!("f@example.com", "secret-123")
      ).resolves.toBeUndefined();
    });
    expect(unfiredFailures()).toEqual([]);
    await waitFor(() => expect(H.sendInitial).toHaveBeenCalledWith("F"));
    expect(track).toHaveBeenCalledWith("signup_completed", {
      method: "email",
    });
  });
});

describe("AuthProvider — push transition barrier", () => {
  it("keeps a failed Firebase sign-out inside the transition wrapper and preserves the current account", async () => {
    await emit("A");
    await waitFor(() => expect(state().p).toBe("A"));
    const { signOut } = await import("firebase/auth");
    vi.mocked(signOut).mockRejectedValueOnce(new Error("sign-out unavailable"));
    H.transition.mockClear();
    await act(async () => {
      await expect(H.signOutAction!()).rejects.toThrow("sign-out unavailable");
    });
    expect(H.transition).toHaveBeenCalledOnce();
    expect(state().u).toBe("A");
  });
});

/* Firestore keeps every document an account read in IndexedDB, not split
   by account and not under the rules, and signing out left it there for
   the next person on the browser. A sign-out with nothing left to send
   ends in a reload that clears it (firestoreCacheClear.ts). */
describe("AuthProvider — the device's copy of the signed-out account", () => {
  it("an online sign-out with nothing left to send reloads to clear it, holding the loading screen", async () => {
    await emit("A");
    await waitFor(() => expect(state().p).toBe("A"));
    const { signOut } = await import("firebase/auth");
    vi.mocked(signOut).mockClear();
    H.reload.mockClear();
    await act(async () => {
      await H.signOutAction!();
    });
    expect(H.reload).toHaveBeenCalledOnce();
    expect(vi.mocked(signOut).mock.invocationCallOrder[0]).toBeLessThan(
      H.reload.mock.invocationCallOrder[0]
    );
    // Login drawn now would take input the reload throws away.
    expect(state().loading).toBe("true");
  });

  it("keeps it, and does not reload, while writes are still waiting to go up", async () => {
    await emit("A");
    await waitFor(() => expect(state().p).toBe("A"));
    H.reload.mockClear();
    H.settled.mockResolvedValueOnce(false);
    await act(async () => {
      await H.signOutAction!();
    });
    expect(H.reload).not.toHaveBeenCalled();
    expect(state().loading).toBe("false");
  });

  it("a failed sign-out lets go of the loading screen and does not reload", async () => {
    await emit("A");
    await waitFor(() => expect(state().p).toBe("A"));
    const { signOut } = await import("firebase/auth");
    vi.mocked(signOut).mockRejectedValueOnce(new Error("sign-out unavailable"));
    H.reload.mockClear();
    await act(async () => {
      await expect(H.signOutAction!()).rejects.toThrow("sign-out unavailable");
    });
    expect(H.reload).not.toHaveBeenCalled();
    expect(state().loading).toBe("false");
    expect(state().u).toBe("A");
  });

  /* The note says where an email change is going, for the Login a
     confirmed change signs the phone out to. Someone who signs out
     themselves knows; the next person on the device need not be told. */
  it("signing out forgets a pending email change", async () => {
    await emit("A");
    await waitFor(() => expect(state().p).toBe("A"));
    noteEmailChange("new-address@x.z");
    expect(pendingEmailChange()).toBe("new-address@x.z");
    await act(async () => {
      await H.signOutAction!();
    });
    expect(pendingEmailChange()).toBeNull();
  });
});

describe("AuthProvider — the outgoing account's reminders", () => {
  /* Meal, workout and streak reminders live on the device. Unmounting their
     hooks only stopped the next pass, so the phone kept firing the signed-out
     account's reminders every day. */
  it("signing out cancels them before Firebase signs the account out", async () => {
    await emit("A");
    await waitFor(() => expect(state().p).toBe("A"));
    const { signOut } = await import("firebase/auth");
    vi.mocked(signOut).mockClear();
    H.cancelAllNotifications.mockClear();
    await act(async () => {
      await H.signOutAction!();
    });
    expect(H.cancelAllNotifications).toHaveBeenCalledOnce();
    expect(H.cancelAllNotifications.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(signOut).mock.invocationCallOrder[0]
    );
  });

  it("a failed cancel does not hold the sign-out", async () => {
    await emit("A");
    await waitFor(() => expect(state().p).toBe("A"));
    const { signOut } = await import("firebase/auth");
    vi.mocked(signOut).mockClear();
    H.cancelAllNotifications.mockRejectedValueOnce(new Error("plugin gone"));
    await act(async () => {
      await H.signOutAction!();
    });
    expect(signOut).toHaveBeenCalledOnce();
  });
});
