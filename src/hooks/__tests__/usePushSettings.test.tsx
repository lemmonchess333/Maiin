// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

let currentUid: string | null = "u1";
let deferred: {
  resolve: (v: { exists: () => boolean; data: () => unknown }) => void;
} = { resolve: () => {} };

const getDocMock = vi.fn(
  () =>
    new Promise((resolve) => {
      deferred = { resolve };
    })
);
const setDocGuardedMock = vi.fn<(...a: unknown[]) => Promise<void>>(
  async () => {}
);

vi.mock("firebase/firestore", () => ({
  doc: (...a: unknown[]) => a,
  getDoc: () => getDocMock(),
}));
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
vi.mock("@/lib/firestoreWrite", () => ({
  setDocGuarded: (...a: unknown[]) => setDocGuardedMock(...a),
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));

import { usePushSettings } from "@/hooks/usePushSettings";

beforeEach(() => {
  vi.clearAllMocks();
  currentUid = "u1";
});

describe("usePushSettings — uid safety", () => {
  it("a late u1 read never renders under u2", async () => {
    const { result, rerender } = renderHook(() => usePushSettings());
    // Switch to u2 before u1's getDoc resolves.
    currentUid = "u2";
    rerender();
    // Resolve u1's read with enabled:true — it must be ignored.
    act(() => {
      deferred.resolve({ exists: () => true, data: () => ({ enabled: true }) });
    });
    await waitFor(() => expect(result.current.consent.enabled).not.toBe(true));
  });

  it("signed out exposes DEFAULT_PUSH_CONSENT and loading false", () => {
    currentUid = null;
    const { result } = renderHook(() => usePushSettings());
    expect(result.current.loading).toBe(false);
    expect(result.current.consent).toBeTruthy();
  });

  it("update refuses to write when auth.currentUser no longer matches", async () => {
    const { result } = renderHook(() => usePushSettings());
    currentUid = "u2"; // auth switched; captured uid was u1
    await act(async () => {
      await result.current.update({ enabled: false });
    });
    expect(setDocGuardedMock).not.toHaveBeenCalled();
  });
});
