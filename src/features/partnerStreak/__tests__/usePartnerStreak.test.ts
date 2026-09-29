import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { uid: "me" } }),
  useUid: () => ({ user: { uid: "me" } }).user?.uid ?? null,
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

/* The hook's answer belongs to one pair. Moving from one profile to the
   next (the /user/:uid page stays mounted across a param change) must
   never show the first partner's bond or eligibility under the second —
   not for the render before the second read lands, and not after it
   fails. Every render is recorded, so a value that is right only once the
   effects have run still fails. */
describe("usePartnerStreak — switching partners", () => {
  const bondWithA = { ...aBond, id: "me__a", streak: 9 };

  function mountOn(first: string) {
    const seen: {
      partner: string;
      loading: boolean;
      mutual: boolean;
      streak: number | null;
    }[] = [];
    const view = renderHook(
      ({ partner }: { partner: string }) => {
        const v = usePartnerStreak(partner);
        seen.push({
          partner,
          loading: v.loading,
          mutual: v.mutualFollow,
          streak: v.bond?.streak ?? null,
        });
        return v;
      },
      { initialProps: { partner: first } }
    );
    return { ...view, seen };
  }

  it("the next partner reads as loading with no bond until its own read lands", async () => {
    mockGetBond.mockImplementation((_me: string, partner: string) =>
      partner === "a" ? Promise.resolve(bondWithA) : new Promise(() => {})
    );
    const view = mountOn("a");
    // POSITIVE anchor: partner a's bond is showing before the switch.
    await waitFor(() => expect(view.result.current.bond?.streak).toBe(9));
    expect(view.result.current.mutualFollow).toBe(true);

    const from = view.seen.length;
    view.rerender({ partner: "b" });

    const forB = view.seen.slice(from);
    expect(forB.length).toBeGreaterThan(0);
    for (const render of forB) {
      expect(render).toEqual({
        partner: "b",
        loading: true,
        mutual: false,
        streak: null,
      });
    }
  });

  it("a failed read for the next partner settles as not eligible, never as the previous answer", async () => {
    mockGetBond.mockImplementation((_me: string, partner: string) =>
      partner === "a"
        ? Promise.resolve(bondWithA)
        : Promise.reject(new Error("offline"))
    );
    const view = mountOn("a");
    await waitFor(() => expect(view.result.current.bond?.streak).toBe(9));

    view.rerender({ partner: "b" });
    // POSITIVE anchor for the negatives below: b's read has settled.
    await waitFor(() => expect(view.result.current.loading).toBe(false));
    expect(view.result.current.mutualFollow).toBe(false);
    expect(view.result.current.bond).toBeNull();
  });
});
