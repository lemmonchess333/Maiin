import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { uid: "me" } }),
}));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const mockIsFollowing = vi.fn();
vi.mock("@/lib/socialApi", () => ({
  isFollowing: (...args: unknown[]) => mockIsFollowing(...args),
}));

const mockGetBond = vi.fn();
const mockCreateBond = vi.fn();
const mockDissolveBond = vi.fn();
vi.mock("../partnerStreakApi", () => ({
  getBond: (...args: unknown[]) => mockGetBond(...args),
  createBond: (...args: unknown[]) => mockCreateBond(...args),
  dissolveBond: (...args: unknown[]) => mockDissolveBond(...args),
}));

import { usePartnerStreak } from "../usePartnerStreak";

const aBond = {
  id: "me__partner",
  members: ["me", "partner"] as [string, string],
  streak: 0,
  lastSharedDay: null,
  lastActive: {},
  freezeWeek: {},
};

beforeEach(() => {
  vi.clearAllMocks();
  mockIsFollowing.mockResolvedValue(true);
  mockGetBond.mockResolvedValue(null);
  mockCreateBond.mockResolvedValue("me__partner");
  mockDissolveBond.mockResolvedValue(undefined);
});

describe("usePartnerStreak", () => {
  it("is inert for an absent partner (no eligibility, not loading)", async () => {
    const { result } = renderHook(() => usePartnerStreak(undefined));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.mutualFollow).toBe(false);
    expect(mockIsFollowing).not.toHaveBeenCalled();
  });

  it("is inert for the current user's own uid", async () => {
    const { result } = renderHook(() => usePartnerStreak("me"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.mutualFollow).toBe(false);
    expect(mockIsFollowing).not.toHaveBeenCalled();
  });

  it("not eligible when the follow is one-directional", async () => {
    // I follow them; they don't follow me.
    mockIsFollowing.mockImplementation((a: string) =>
      Promise.resolve(a === "me")
    );
    const { result } = renderHook(() => usePartnerStreak("partner"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.mutualFollow).toBe(false);
    expect(result.current.bond).toBeNull();
  });

  it("eligible with no bond when mutual-follow holds", async () => {
    const { result } = renderHook(() => usePartnerStreak("partner"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.mutualFollow).toBe(true);
    expect(result.current.bond).toBeNull();
  });

  it("surfaces an existing bond", async () => {
    mockGetBond.mockResolvedValue({ ...aBond, streak: 4 });
    const { result } = renderHook(() => usePartnerStreak("partner"));
    await waitFor(() => expect(result.current.bond).not.toBeNull());
    expect(result.current.bond?.streak).toBe(4);
  });

  it("start() creates then re-reads the bond into state", async () => {
    mockGetBond
      .mockResolvedValueOnce(null) // initial load
      .mockResolvedValueOnce(aBond); // post-create re-read
    const { result } = renderHook(() => usePartnerStreak("partner"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.start();
    });

    expect(mockCreateBond).toHaveBeenCalledWith("me", "partner");
    expect(result.current.bond).toEqual(aBond);
  });

  it("end() dissolves the bond and clears state", async () => {
    mockGetBond.mockResolvedValue(aBond);
    const { result } = renderHook(() => usePartnerStreak("partner"));
    await waitFor(() => expect(result.current.bond).not.toBeNull());

    await act(async () => {
      await result.current.end();
    });

    expect(mockDissolveBond).toHaveBeenCalledWith("me__partner");
    expect(result.current.bond).toBeNull();
  });
});
