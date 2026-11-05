import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const H = vi.hoisted(() => ({
  auth: { currentUser: { uid: "reader" } as { uid: string } | null },
  listener: null as null | ((user: { uid: string } | null) => void),
  read: vi.fn(),
  unsubscribe: vi.fn(),
}));
vi.mock("@/lib/firebase", () => ({ auth: H.auth }));
vi.mock("@/lib/activityMedia", () => ({ readActivityMediaUrl: H.read }));
vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (_: unknown, callback: typeof H.listener) => {
    H.listener = callback;
    queueMicrotask(() => callback?.(H.auth.currentUser));
    return H.unsubscribe;
  },
}));
import { useActivityMedia } from "../useActivityMedia";

beforeEach(() => {
  H.auth.currentUser = { uid: "reader" };
  H.read.mockReset();
  H.unsubscribe.mockReset();
  URL.revokeObjectURL = vi.fn();
});

describe("useActivityMedia", () => {
  it("revokes the in-memory image on unmount", async () => {
    H.read.mockResolvedValue("blob:image");
    const { result, unmount } = renderHook(() =>
      useActivityMedia("old-token-url")
    );
    await waitFor(() => expect(result.current).toBe("blob:image"));
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:image");
    expect(H.unsubscribe).toHaveBeenCalled();
  });
  it("clears pixels immediately on sign out", async () => {
    H.read.mockResolvedValue("blob:image");
    const { result } = renderHook(() => useActivityMedia("old-token-url"));
    await waitFor(() => expect(result.current).toBe("blob:image"));
    act(() => {
      H.auth.currentUser = null;
      H.listener?.(null);
    });
    expect(result.current).toBeUndefined();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:image");
  });
  it("discards late bytes from a previous user", async () => {
    let finish!: (url: string) => void;
    H.read.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    const { result } = renderHook(() => useActivityMedia("old-token-url"));
    await waitFor(() => expect(H.read).toHaveBeenCalledOnce());
    act(() => {
      H.auth.currentUser = null;
      H.listener?.(null);
    });
    await act(async () => {
      finish("blob:late");
    });
    expect(result.current).toBeUndefined();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:late");
  });
  it("does not reuse a previous photo while the next is loading", async () => {
    H.read
      .mockResolvedValueOnce("blob:first")
      .mockReturnValueOnce(new Promise(() => {}));
    const { result, rerender } = renderHook(
      ({ identity }) => useActivityMedia(identity),
      { initialProps: { identity: "first" } }
    );
    await waitFor(() => expect(result.current).toBe("blob:first"));
    rerender({ identity: "second" });
    expect(result.current).toBeUndefined();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:first");
  });
  it("never falls back to a bearer URL when authorization fails", async () => {
    H.read.mockRejectedValue(new Error("permission-denied"));
    const { result } = renderHook(() => useActivityMedia("old-token-url"));
    await waitFor(() => expect(H.read).toHaveBeenCalled());
    expect(result.current).toBeUndefined();
  });
});
