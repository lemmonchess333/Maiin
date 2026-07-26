// @vitest-environment jsdom
/**
 * usePushSettings — uid safety.
 *
 * The hook's header claims "a late getDoc for account A can never render
 * under account B" and that update refuses to write when
 * `auth.currentUser` no longer matches. There are THREE layers behind
 * that: the effect's `cancelled` flag, its `auth.currentUser?.uid !== uid`
 * re-check, and a derived `state.uid === uid ? … : DEFAULT` guard at
 * render.
 *
 * The previous version of this suite exercised NONE of them. Deleting all
 * three left all three tests passing, for two compounding reasons:
 *
 *   - its `getDoc` stub kept a single `deferred` resolver that each call
 *     OVERWROTE, so "resolve u1's read" actually resolved u2's;
 *   - it asserted `await waitFor(() => expect(...).not.toBe(true))` — a
 *     NEGATIVE, which `waitFor` satisfies on its first poll from the
 *     initial state and returns before the resolution ever lands.
 *
 * A negative assertion with no positive anchor is vacuous: it passes at
 * t=0, before the thing it is meant to catch could have happened. So the
 * ordering test below waits for u2's read to LAND first (positive), and
 * only then checks that u1's late read doesn't overwrite it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

let currentUid: string | null = "u1";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({
  db: {},
  auth: {
    get currentUser() {
      return currentUid ? { uid: currentUid } : null;
    },
  },
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: currentUid ? { uid: currentUid } : null }),
}));
const setDocGuardedMock = vi.fn<(...a: unknown[]) => Promise<void>>(
  async () => {}
);
vi.mock("@/lib/firestoreWrite", () => ({
  setDocGuarded: (...a: unknown[]) => setDocGuardedMock(...a),
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));

import { usePushSettings } from "@/hooks/usePushSettings";
import {
  seedFirestore,
  resetFirestore,
  deferReads,
  pendingReads,
  releaseRead,
} from "@/test/firestoreHarness";

const U1 = "users/u1/settings/push";
const U2 = "users/u2/settings/push";

beforeEach(() => {
  resetFirestore();
  vi.clearAllMocks();
  currentUid = "u1";
  // Deliberately OPPOSITE values, so "whose read won" is readable off the
  // result rather than inferred.
  seedFirestore({
    [U1]: { enabled: true },
    [U2]: { enabled: false },
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("usePushSettings — uid safety", () => {
  it("a late u1 read never renders under u2", async () => {
    deferReads();
    const { result, rerender } = renderHook(() => usePushSettings());
    await waitFor(() => expect(pendingReads()).toEqual([U1]));

    currentUid = "u2";
    rerender();
    await waitFor(() => expect(pendingReads()).toEqual([U1, U2]));

    // u2 answers first. POSITIVE anchor: without waiting for this to
    // land, the negative below would pass at t=0 from the initial state
    // and prove nothing — which is exactly how the old test passed with
    // every guard deleted.
    await act(async () => {
      expect(releaseRead(1)).toBe(true);
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.consent.enabled).toBe(false); // u2's own value

    // u1's read lands LATE, carrying enabled:true. It must not surface.
    await act(async () => {
      expect(releaseRead(0)).toBe(true);
    });
    expect(result.current.consent.enabled).toBe(false);
  });

  it("signed out exposes the default consent and stops loading", () => {
    currentUid = null;
    const { result } = renderHook(() => usePushSettings());
    expect(result.current.loading).toBe(false);
    expect(result.current.consent).toBeTruthy();
  });

  it("loads the signed-in user's own stored consent", async () => {
    // The plain path, and the positive control for the test above: u1's
    // value really does reach the hook when nothing races it.
    const { result } = renderHook(() => usePushSettings());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.consent.enabled).toBe(true);
  });

  it("update refuses to write when auth.currentUser no longer matches", async () => {
    const { result } = renderHook(() => usePushSettings());
    await waitFor(() => expect(result.current.loading).toBe(false));

    currentUid = "u2"; // auth switched; the captured uid is still u1
    await act(async () => {
      await result.current.update({ enabled: false });
    });
    expect(setDocGuardedMock).not.toHaveBeenCalled();
  });
});
