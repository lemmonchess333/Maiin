/**
 * useRestrictedStatus — the moderation gate.
 *
 * Two invariants here are load-bearing, and both are about ABSENCE:
 *
 *   1. No document means NOT restricted. The lock spec is explicit that a
 *      doc must not exist per non-restricted user — at a million users that
 *      is read amplification for the state virtually everyone is in. So the
 *      gate's default has to be permissive, and a test has to say so out
 *      loud, because "absent → false" is exactly what a later refactor
 *      "tidies" into a truthy default.
 *   2. A read ERROR also means not restricted. Peeking at another user's
 *      doc is a rules-deny by design, and this hook IS called for other
 *      users; failing closed would gate the whole Find tab on a permission
 *      error that is the expected behaviour.
 *
 * The hook keeps a module-level cache keyed by uid with no reset hook, so
 * each test uses its OWN uid rather than reaching into module state. That
 * keeps the test honest about the cache instead of pretending it away.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

vi.mock("firebase/firestore");
// The hook imports these as `../lib/*` (it sits in src/hooks). `vi.mock`
// resolves specifiers relative to THIS file, so the same string would point
// at src/hooks/lib/* and silently mock nothing — the alias is unambiguous
// from either location.
vi.mock("@/lib/firebase", () => ({ db: {}, functions: {} }));

const captureError = vi.fn();
vi.mock("@/lib/errorReporting", () => ({
  captureError: (...a: unknown[]) => captureError(...a),
}));

import { useRestrictedStatus } from "../useRestrictedStatus";
import {
  seedFirestore,
  resetFirestore,
  flushSnapshots,
  failNextFirestore,
} from "@/test/firestoreHarness";

beforeEach(() => {
  resetFirestore();
  vi.clearAllMocks();
});

describe("useRestrictedStatus", () => {
  it("treats an ABSENT document as not restricted", async () => {
    // The 1M-scale invariant: absence is the normal state, not an error.
    const { result } = renderHook(() => useRestrictedStatus("absent-uid"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isRestricted).toBe(false);
  });

  it("reports restricted when the document exists", async () => {
    seedFirestore({
      "globalRestrictedUids/banned-uid": { restrictedAt: null, strikes: 2 },
    });
    const { result } = renderHook(() => useRestrictedStatus("banned-uid"));
    await waitFor(() => expect(result.current.isRestricted).toBe(true));
    expect(result.current.loading).toBe(false);
  });

  it("is LIVE — a restriction applied mid-session takes effect", async () => {
    const { result } = renderHook(() => useRestrictedStatus("live-uid"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isRestricted).toBe(false);

    seedFirestore({ "globalRestrictedUids/live-uid": { strikes: 1 } });
    await flushSnapshots();

    expect(result.current.isRestricted).toBe(true);
  });

  it("treats a read ERROR as not restricted, and reports it", async () => {
    // Reading another user's doc is a rules-deny by design. Failing closed
    // would gate the Find tab on the expected behaviour.
    failNextFirestore("onSnapshot", { times: 5 });
    const { result } = renderHook(() => useRestrictedStatus("denied-uid"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isRestricted).toBe(false);
    expect(captureError).toHaveBeenCalled();
  });

  it("does not subscribe at all without a uid", () => {
    // Sign-out flips the consumer's uid to undefined. No listener, and no
    // loading state to flash.
    const { result } = renderHook(() => useRestrictedStatus(undefined));
    expect(result.current).toEqual({ isRestricted: false, loading: false });
  });

  it("shares ONE listener across consumers of the same uid", async () => {
    // The reason for the module-level registry: the Find tab renders this
    // for a search input, a FollowButton and an invite-share at once.
    seedFirestore({ "globalRestrictedUids/shared-uid": { strikes: 1 } });
    const a = renderHook(() => useRestrictedStatus("shared-uid"));
    const b = renderHook(() => useRestrictedStatus("shared-uid"));

    await waitFor(() => expect(a.result.current.isRestricted).toBe(true));
    expect(b.result.current.isRestricted).toBe(true);

    // Tearing down one consumer must not blind the other.
    a.unmount();
    seedFirestore({ "globalRestrictedUids/shared-uid": { strikes: 3 } });
    await flushSnapshots();
    expect(b.result.current.isRestricted).toBe(true);
  });
});
