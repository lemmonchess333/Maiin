import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// SOCIAL-CREW-READS-01: pins the `enabled` gate on the unbounded
// `groups` catalogue read — the only new behaviour in this hook.

const mockUser = { uid: "me" };
const mockProfile: { crewId?: string } = { crewId: undefined };
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: mockUser,
    profile: mockProfile,
    updateProfile: vi.fn(),
  }),
}));

const getDocsMock = vi.hoisted(() =>
  vi.fn(async () => ({ docs: [] as unknown[] }))
);
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(() => ({})),
  getDocs: getDocsMock,
  query: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  serverTimestamp: vi.fn(() => 0),
}));
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/firestoreWrite", () => ({ addDocGuarded: vi.fn() }));
vi.mock("@/lib/firestoreGuards", () => ({
  parseCrew: (id: string) => ({ id, name: id }),
}));
vi.mock("firebase/functions", () => ({
  httpsCallable: vi.fn(() => vi.fn()),
  getFunctions: vi.fn(() => ({})),
}));

import { useCrews } from "../useCrews";

describe("useCrews — SOCIAL-CREW-READS-01 enabled gate", () => {
  beforeEach(() => getDocsMock.mockClear());

  it("does NOT read the catalogue while disabled, and reports idle (not loading)", async () => {
    const { result } = renderHook(() => useCrews(false));
    // No read fired…
    expect(getDocsMock).not.toHaveBeenCalled();
    // …and it's idle, not stuck loading.
    expect(result.current.loading).toBe(false);
  });

  it("reads exactly once on first enable", async () => {
    const { result } = renderHook(() => useCrews(true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(getDocsMock).toHaveBeenCalledTimes(1);
  });

  it("re-enabling reuses the session cache (no second read)", async () => {
    const { result, rerender } = renderHook(({ on }) => useCrews(on), {
      initialProps: { on: false },
    });
    expect(getDocsMock).not.toHaveBeenCalled();

    rerender({ on: true }); // first enable → one read
    await waitFor(() => expect(getDocsMock).toHaveBeenCalledTimes(1));

    rerender({ on: false }); // back to Feed
    rerender({ on: true }); // return to Together → cached, no new read
    await new Promise((r) => setTimeout(r, 0));
    expect(getDocsMock).toHaveBeenCalledTimes(1);
    expect(result.current.loading).toBe(false);
  });

  it("refresh() is a no-op while disabled", async () => {
    const { result } = renderHook(() => useCrews(false));
    await act(async () => {
      await result.current.refresh();
    });
    expect(getDocsMock).not.toHaveBeenCalled();
  });
});
