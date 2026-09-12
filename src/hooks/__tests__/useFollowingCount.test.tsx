import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
let uid: string | null = "u1";
vi.mock("@/lib/auth", () => ({ useUid: () => uid }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));
import { useFollowingCount } from "../useFollowingCount";
import {
  seedFirestore,
  resetFirestore,
  flushSnapshots,
  failNextFirestore,
  unfiredFailures,
} from "@/test/firestoreHarness";

beforeEach(() => {
  resetFirestore();
  localStorage.clear();
  uid = "u1";
});
afterEach(cleanup);

it("bounds the live follow density count at three", async () => {
  seedFirestore(
    Object.fromEntries(
      Array.from({ length: 8 }, (_, i) => [
        `following/u1/users/p${i}`,
        { followedAt: i },
      ])
    )
  );
  const { result } = renderHook(useFollowingCount);
  await waitFor(() => expect(result.current.count).toBe(3));
});

it("does not turn a failed follow read into zero and can resubscribe", async () => {
  seedFirestore({ "following/u1/users/p1": { followedAt: 1 } });
  await flushSnapshots();
  failNextFirestore("onSnapshot", { path: "following/u1/users" });
  const { result } = renderHook(useFollowingCount);
  await flushSnapshots();
  expect(unfiredFailures()).toHaveLength(0);
  expect(result.current.count).toBeNull();
  act(() => result.current.refresh());
  await waitFor(() => expect(result.current.count).toBe(1));
});

it("never supplies the previous account's follow count after an account switch", async () => {
  seedFirestore({ "following/u1/users/p1": { followedAt: 1 } });
  const { result, rerender } = renderHook(useFollowingCount);
  await waitFor(() => expect(result.current.count).toBe(1));
  uid = "u2";
  failNextFirestore("onSnapshot", { path: "following/u2/users" });
  rerender();
  expect(result.current.count).toBeNull();
  await flushSnapshots();
  expect(result.current.count).toBeNull();
  expect(unfiredFailures()).toHaveLength(0);
});
