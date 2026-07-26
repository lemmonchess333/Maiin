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
import { render, screen, act, cleanup, waitFor } from "@testing-library/react";

// Hoisted shared state (vi.mock factories are hoisted above module init).
const H = vi.hoisted(() => ({
  mockAuth: { currentUser: null as { uid: string } | null },
  authCb: null as ((u: { uid: string } | null) => void) | null,
}));
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
  invalidatePushTokenLifecycle: vi.fn(),
  stopListeningForForegroundPush: vi.fn(),
  unregisterDeviceToken: vi.fn().mockResolvedValue(undefined),
  waitForPendingPushRegistration: vi.fn().mockResolvedValue(undefined),
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
vi.mock("@/lib/accountSecurity", () => ({ sendVerificationEmail: vi.fn() }));
vi.mock("@/lib/captureTimezone", () => ({
  getDeviceTimezone: () => "UTC",
  shouldUpdateTimezone: () => false,
}));

import { AuthProvider, useAuth } from "../auth";
import {
  seedFirestore,
  resetFirestore,
  deferReads,
  pendingReads,
  releaseRead,
  rejectRead,
} from "@/test/firestoreHarness";

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
  it("B wins when A's read resolves LAST", async () => {
    deferReads();
    await emit("A");
    await emit("B");
    // Assert the interleaving exists before relying on it. The old suite
    // indexed a bare array and could not tell A's read from B's.
    expect(pendingReads()).toEqual(["users/A", "users/B"]);

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
    expect(pendingReads()).toEqual(["users/B"]);
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
    expect(pendingReads()).toEqual(["users/A", "users/B"]);

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
