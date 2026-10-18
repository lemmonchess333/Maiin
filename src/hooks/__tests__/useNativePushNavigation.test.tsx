import { act, cleanup, renderHook } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { useNativePushNavigation } from "../useNativePushNavigation";

const h = vi.hoisted(() => ({
  callbacks: [] as ((data: unknown) => void)[],
  stop: vi.fn(),
}));
vi.mock("@/lib/nativePush", () => ({
  listenForNativePushActions: async (callback: (data: unknown) => void) => {
    h.callbacks.push(callback);
    return h.stop;
  },
}));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn() } }));
const wrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouter initialEntries={["/social?tab=feed"]}>{children}</MemoryRouter>
);
beforeEach(() => {
  h.callbacks = [];
  h.stop.mockClear();
});
afterEach(() => cleanup());

function useFixture({ uid, ready }: { uid: string | null; ready: boolean }) {
  useNativePushNavigation(uid, ready);
  const location = useLocation();
  return location.pathname + location.search;
}

describe("native notification tap navigation", () => {
  it("holds a cold-start tap until matching Auth is ready, then replaces the Feed destination", async () => {
    const { result, rerender } = renderHook(useFixture, {
      wrapper,
      initialProps: { uid: null as string | null, ready: false },
    });
    await act(async () => {
      h.callbacks.at(-1)?.({ ownerUid: "me", route: "/social" });
    });
    expect(result.current).toBe("/social?tab=feed");
    rerender({ uid: "me", ready: false });
    expect(result.current).toBe("/social?tab=feed");
    rerender({ uid: "me", ready: true });
    expect(result.current).toBe("/social?tab=together");
  });
  it("discards an old account's notification when a different account becomes ready", async () => {
    const { result, rerender } = renderHook(useFixture, {
      wrapper,
      initialProps: { uid: null as string | null, ready: false },
    });
    await act(async () => {
      h.callbacks.at(-1)?.({ ownerUid: "account-a", route: "/social" });
    });
    rerender({ uid: "account-b", ready: true });
    expect(result.current).toBe("/social?tab=feed");
  });
  it("ignores stale account callbacks and removes listeners on unmount", async () => {
    const { result, rerender, unmount } = renderHook(useFixture, {
      wrapper,
      initialProps: { uid: "account-a" as string | null, ready: true },
    });
    await act(async () => {
      await Promise.resolve();
    });
    const oldCallback = h.callbacks.at(-1)!;
    rerender({ uid: "account-b", ready: true });
    await act(async () => {
      oldCallback({ ownerUid: "account-a", route: "/" });
    });
    expect(result.current).toBe("/social?tab=feed");
    unmount();
    expect(h.stop).toHaveBeenCalled();
  });
});
