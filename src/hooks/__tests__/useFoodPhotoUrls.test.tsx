import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  uid: "alice" as string | null,
  list: vi.fn(),
  read: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ useUid: () => mocks.uid }));
vi.mock("@/lib/foodPhotoStore", () => ({
  listFoodPhotos: mocks.list,
  readFoodPhotoSrc: mocks.read,
}));
import {
  invalidateFoodPhotoCache,
  useFoodPhotoUrls,
} from "../useFoodPhotoUrls";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("useFoodPhotoUrls account and diary scope", () => {
  beforeEach(() => {
    mocks.uid = "alice";
    mocks.list.mockReset().mockResolvedValue([{ mealId: "meal" }]);
    mocks.read
      .mockReset()
      .mockImplementation(async (uid: string) => `${uid}-photo`);
  });
  afterEach(() => {
    invalidateFoodPhotoCache("alice");
    invalidateFoodPhotoCache("bob");
  });

  it("hides the previous account's same-ID photo before the next account loads", async () => {
    const { result, rerender } = renderHook(() => useFoodPhotoUrls(["meal"]));
    await waitFor(() =>
      expect(result.current).toEqual({ meal: "alice-photo" })
    );
    const pending = deferred<string>();
    mocks.read.mockReturnValue(pending.promise);
    mocks.uid = "bob";
    rerender();
    expect(result.current).toEqual({});
    await act(async () => {
      pending.resolve("bob-photo");
    });
    await waitFor(() => expect(result.current).toEqual({ meal: "bob-photo" }));
  });

  it("hides photos immediately on sign-out", async () => {
    const { result, rerender } = renderHook(() => useFoodPhotoUrls(["meal"]));
    await waitFor(() => expect(result.current.meal).toBe("alice-photo"));
    mocks.uid = null;
    rerender();
    expect(result.current).toEqual({});
  });

  it("returns only requested IDs and clears an empty diary", async () => {
    const { result, rerender } = renderHook(
      ({ ids }) => useFoodPhotoUrls(ids),
      {
        initialProps: { ids: ["meal"] },
      }
    );
    await waitFor(() => expect(result.current.meal).toBe("alice-photo"));
    rerender({ ids: ["missing"] });
    expect(result.current).toEqual({});
    rerender({ ids: [] });
    expect(result.current).toEqual({});
    rerender({ ids: ["meal"] });
    await waitFor(() => expect(result.current.meal).toBe("alice-photo"));
    expect(mocks.read).toHaveBeenCalledTimes(1);
  });

  it("ignores a previous account's in-flight read", async () => {
    const pending = deferred<string>();
    mocks.read.mockImplementation((uid: string) =>
      uid === "alice" ? pending.promise : Promise.resolve("bob-photo")
    );
    const { result, rerender } = renderHook(() => useFoodPhotoUrls(["meal"]));
    await waitFor(() =>
      expect(mocks.read).toHaveBeenCalledWith("alice", "meal")
    );
    mocks.uid = "bob";
    rerender();
    await waitFor(() => expect(result.current).toEqual({ meal: "bob-photo" }));
    await act(async () => {
      pending.resolve("alice-photo");
    });
    expect(result.current).toEqual({ meal: "bob-photo" });
  });

  it("preserves meal IDs containing delimiters", async () => {
    mocks.list.mockResolvedValue([{ mealId: "meal,one" }]);
    const { result } = renderHook(() => useFoodPhotoUrls(["meal,one"]));
    await waitFor(() =>
      expect(result.current).toEqual({ "meal,one": "alice-photo" })
    );
    expect(mocks.read).toHaveBeenCalledWith("alice", "meal,one");
  });
});
