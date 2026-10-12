/**
 * The after-session "send props?" prompt for a restricted account (S4e):
 * it invites the person to reach someone else, which a restriction stops,
 * so it is not offered.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";

const H = vi.hoisted(() => ({
  getFeed: vi.fn(),
  toggleKudos: vi.fn(),
  restriction: { isRestricted: false, loading: false },
}));
vi.mock("@/lib/socialApi", () => ({
  getFeed: (...args: unknown[]) => H.getFeed(...args),
  toggleKudos: (...args: unknown[]) => H.toggleKudos(...args),
}));
vi.mock("@/lib/postCompletionKudos", () => ({
  localDayKey: () => "2026-10-07",
  pickKudosCandidate: () => ({ activityId: "act-9", authorName: "Maya" }),
}));
vi.mock("@/hooks/useRestrictedStatus", () => ({
  useRestrictedStatus: () => H.restriction,
}));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { usePostCompletionKudos } from "../usePostCompletionKudos";

beforeEach(() => {
  localStorage.clear();
  H.getFeed.mockReset().mockResolvedValue({ items: [] });
  H.toggleKudos.mockReset().mockResolvedValue(true);
  H.restriction.isRestricted = false;
});
afterEach(cleanup);

describe("usePostCompletionKudos", () => {
  it("offers props to someone who trained today", async () => {
    const { result } = renderHook(() =>
      usePostCompletionKudos({ uid: "me", fromName: "Me" })
    );
    await waitFor(() =>
      expect(result.current.candidate?.authorName).toBe("Maya")
    );
  });

  it("offers nothing to a restricted account, and sends nothing", async () => {
    H.restriction.isRestricted = true;
    const { result } = renderHook(() =>
      usePostCompletionKudos({ uid: "me", fromName: "Me" })
    );
    // Give a feed read the chance to land, had it started.
    await act(async () => {});
    expect(result.current.candidate).toBeNull();
    expect(H.getFeed).not.toHaveBeenCalled();
    await act(async () => {
      await result.current.sendKudos();
    });
    expect(H.toggleKudos).not.toHaveBeenCalled();
  });
});
