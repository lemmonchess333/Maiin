/**
 * Answering a follow request takes its row away at once and puts it back
 * if the write fails: only that row, in its place. Putting back the list
 * as it was before the answer brought back a request answered meanwhile,
 * to be answered again.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";

const api = vi.hoisted(() => ({
  getFollowRequests: vi.fn(),
  acceptFollowRequest: vi.fn(),
  declineFollowRequest: vi.fn(),
  hasFollowRequestFrom: vi.fn(),
}));
vi.mock("@/lib/socialApi", () => api);
vi.mock("@/lib/auth", () => ({ useUid: () => "me" }));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));

import { useFollowRequests } from "../useFollowRequests";

const request = (uid: string) => ({ uid, displayName: uid, requestedAt: null });

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("useFollowRequests", () => {
  it("puts back only the request whose answer failed, in its place", async () => {
    api.getFollowRequests.mockResolvedValue([
      request("ana"),
      request("ben"),
      request("cai"),
    ]);
    let failAna!: () => void;
    api.acceptFollowRequest.mockImplementation((_me: string, who: string) =>
      who === "ana"
        ? new Promise((_, reject) => (failAna = () => reject(new Error("x"))))
        : Promise.resolve()
    );
    const { result } = renderHook(() => useFollowRequests(true));
    await waitFor(() => expect(result.current.requests).toHaveLength(3));

    let ana!: Promise<boolean>;
    act(() => {
      ana = result.current.accept("ana");
    });
    await act(async () => {
      await result.current.accept("ben");
    });
    expect(result.current.requests.map((r) => r.uid)).toEqual(["cai"]);

    await act(async () => {
      failAna();
      await ana;
    });
    // Ben was accepted: he stays answered.
    expect(result.current.requests.map((r) => r.uid)).toEqual(["ana", "cai"]);
  });
});
