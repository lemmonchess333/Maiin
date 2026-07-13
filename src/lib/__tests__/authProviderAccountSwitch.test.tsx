// @vitest-environment jsdom
/**
 * AuthProvider — account-switch isolation.
 *
 * onAuthStateChanged is not awaited by Firebase, so callbacks for account A
 * and B can overlap. These tests force out-of-order resolution and prove that
 * no stale A callback can commit A's identity-derived state under B, that an
 * A→B switch clears A's profile before B hydrates, and that a same-uid token
 * refresh doesn't flicker the profile away.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, cleanup, waitFor } from "@testing-library/react";

// Hoisted shared state (vi.mock factories are hoisted above module init).
type Deferred = {
  promise: Promise<unknown>;
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
};
const H = vi.hoisted(() => {
  return {
    mockAuth: { currentUser: null as { uid: string } | null },
    authCb: null as ((u: { uid: string } | null) => void) | null,
    serverReads: [] as Deferred[],
  };
});
const mockAuth = H.mockAuth;

vi.mock("../firebase", () => ({
  auth: H.mockAuth,
  db: {},
  app: {},
  storage: {},
  functions: {},
  firebaseConfig: {},
}));
vi.mock("@/lib/pushNotifications", () => ({
  unregisterDeviceToken: vi.fn(),
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

function defer(): Deferred {
  let resolve!: (v: unknown) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
const snap = (uid: string | null) =>
  uid
    ? {
        exists: () => true,
        data: () => ({ email: `${uid}@x.z`, darkMode: true }),
      }
    : { exists: () => false, data: () => ({}) };

vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, _c: string, uid: string) => ({ uid }),
  getDoc: () => {
    const d = defer();
    H.serverReads.push(d);
    return d.promise;
  },
  getDocFromCache: () => Promise.reject(new Error("cache-miss")),
  writeBatch: () => ({
    set: vi.fn(),
    commit: vi.fn().mockResolvedValue(undefined),
  }),
  serverTimestamp: () => ({}),
}));

vi.mock("../errorReporting", () => ({ setErrorReportingUid: vi.fn() }));
vi.mock("@/lib/firestoreWrite", () => ({
  setDocGuarded: vi.fn().mockResolvedValue(undefined),
  updateDocGuarded: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/lifecycleAnalytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/accountSecurity", () => ({ sendVerificationEmail: vi.fn() }));
vi.mock("@/lib/captureTimezone", () => ({
  getDeviceTimezone: () => "UTC",
  shouldUpdateTimezone: () => false,
}));

import { AuthProvider, useAuth } from "../auth";

function Probe() {
  const { user, profile, loading } = useAuth();
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
  mockAuth.currentUser = null;
  H.authCb = null;
  H.serverReads = [];
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>
  );
});
afterEach(cleanup);

describe("AuthProvider — account switch isolation", () => {
  it("B wins when A's read resolves LAST", async () => {
    await emit("A"); // A's server read pending (H.serverReads[0])
    await emit("B"); // B's server read pending (H.serverReads[1])
    // Resolve B first, then A (out of order).
    await act(async () => H.serverReads[1].resolve(snap("B")));
    await act(async () => H.serverReads[0].resolve(snap("A")));
    await waitFor(() => expect(state().p).toBe("B"));
    expect(state().u).toBe("B");
  });

  it("A→B clears A's profile immediately, before B hydrates", async () => {
    await emit("A");
    await act(async () => H.serverReads[0].resolve(snap("A")));
    await waitFor(() => expect(state().p).toBe("A"));
    // Switch to B — profile must blank before B's read resolves.
    await emit("B");
    expect(state().p).toBe("null");
    expect(state().loading).toBe("true");
  });

  it("A's rejected read after B is current does not null B", async () => {
    await emit("A");
    await emit("B");
    await act(async () => H.serverReads[1].resolve(snap("B")));
    await waitFor(() => expect(state().p).toBe("B"));
    // A's read now rejects — the stale catch must not clear B.
    await act(async () => H.serverReads[0].reject(new Error("late-fail")));
    expect(state().p).toBe("B");
  });

  it("same-uid token refresh keeps the rendered profile (no flicker)", async () => {
    await emit("A");
    await act(async () => H.serverReads[0].resolve(snap("A")));
    await waitFor(() => expect(state().p).toBe("A"));
    // A refreshes token (same uid) — profile must NOT blank.
    await emit("A");
    expect(state().p).toBe("A");
    expect(state().loading).toBe("false");
  });
});
