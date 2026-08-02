// @vitest-environment jsdom
/**
 * useUid — the narrow identity subscription.
 *
 * `AuthContext` carries the uid, the profile and the credential flows in one
 * memoised value, so every `updateProfile` re-rendered all 119 `useAuth()`
 * consumers — including the ~53 that only ever read `user.uid` to scope a
 * Firestore query. `useUid()` reads a second context memoised on the uid
 * alone, so those callers no longer re-render on a profile write.
 *
 * These tests are about the SUBSCRIPTION, not the value. The value is easy
 * and would pass with `useUid` implemented as `useAuth().user?.uid ?? null` —
 * which is exactly the version that buys nothing. So the load-bearing
 * assertion is the render COUNT: fold the uid back into `AuthContext` (or
 * add `profile` to `AuthUidContext`'s value) and "does not re-render when
 * only the profile changes" fails while every other test here still passes.
 *
 * Mock scaffolding mirrors authProviderAccountSwitch.test.tsx (ADR-0009: one
 * fake) — same firebase/auth callback capture, same seeded user documents.
 */
import { useEffect } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, cleanup, waitFor } from "@testing-library/react";

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

import {
  AuthProvider,
  useAuth,
  useUid,
  type UpdateProfileResult,
} from "../auth";
import { seedFirestore, resetFirestore } from "@/test/firestoreHarness";

// Commit counters live outside React so a re-render can't reset them. Counted
// in a depless effect rather than the render body: an effect fires on every
// commit, and a context bail-out produces no commit — which is precisely the
// thing under test. (Counting in the body would also trip the react-compiler
// lint rules against mutating outer state during render.)
const renders = { uid: 0, profile: 0 };

function UidProbe() {
  const uid = useUid();
  useEffect(() => {
    renders.uid += 1;
  });
  return <div data-testid="uid" data-v={uid ?? "null"} />;
}

function ProfileProbe() {
  const { profile } = useAuth();
  useEffect(() => {
    renders.profile += 1;
  });
  return <div data-testid="profile" data-v={profile?.displayName ?? "null"} />;
}

// Holds the live updateProfile so tests can drive a profile change through the
// real provider rather than poking state.
let update: (
  d: Record<string, unknown>
) => Promise<UpdateProfileResult> = async () => ({
  ok: false,
  error: new Error("not mounted"),
});

function Driver() {
  const { updateProfile } = useAuth();
  useEffect(() => {
    update = updateProfile;
  }, [updateProfile]);
  return null;
}

const uidValue = () => screen.getByTestId("uid").getAttribute("data-v");
const profileValue = () => screen.getByTestId("profile").getAttribute("data-v");

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
  renders.uid = 0;
  renders.profile = 0;
  seedFirestore({
    "users/A": { email: "A@x.z", displayName: "Ann" },
    "users/B": { email: "B@x.z", displayName: "Bea" },
  });
  render(
    <AuthProvider>
      <UidProbe />
      <ProfileProbe />
      <Driver />
    </AuthProvider>
  );
});
afterEach(() => {
  cleanup();
  resetFirestore();
});

describe("useUid", () => {
  it("is null when signed out and the uid once signed in", async () => {
    expect(uidValue()).toBe("null");
    await emit("A");
    await waitFor(() => expect(uidValue()).toBe("A"));
  });

  it("does NOT re-render when only the profile changes", async () => {
    await emit("A");
    await waitFor(() => expect(profileValue()).toBe("Ann"));

    // Baseline AFTER hydration has settled, so the counts below measure the
    // write and nothing else.
    const before = { ...renders };

    await act(async () => {
      const res = await update({ displayName: "Ann Renamed" });
      expect(res).toEqual({ ok: true });
    });
    await waitFor(() => expect(profileValue()).toBe("Ann Renamed"));

    // The profile consumer saw the change...
    expect(renders.profile).toBeGreaterThan(before.profile);
    // ...and the uid consumer did not move at all. This is the assertion the
    // whole split exists for.
    expect(renders.uid).toBe(before.uid);
    expect(uidValue()).toBe("A");
  });

  it("DOES re-render on an account switch", async () => {
    await emit("A");
    await waitFor(() => expect(uidValue()).toBe("A"));
    const before = renders.uid;

    await emit("B");
    await waitFor(() => expect(uidValue()).toBe("B"));
    expect(renders.uid).toBeGreaterThan(before);
  });

  it("DOES re-render on sign-out, back to null", async () => {
    await emit("A");
    await waitFor(() => expect(uidValue()).toBe("A"));
    const before = renders.uid;

    await emit(null);
    await waitFor(() => expect(uidValue()).toBe("null"));
    expect(renders.uid).toBeGreaterThan(before);
  });

  it("throws outside AuthProvider", () => {
    // `null` is a legitimate value (signed out), so the guard has to key off
    // the `undefined` default rather than falsiness — a bare `if (!uid)`
    // would throw for every signed-out consumer.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<UidProbe />)).toThrow(/within AuthProvider/);
    spy.mockRestore();
  });
});
