/**
 * A shared post's link opens the post in the app (App1 Q51), once the app
 * is ready for it: a link that wakes a signed-out app waits for sign-in.
 */
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { useNativePostNavigation } from "../useNativePostNavigation";

const h = vi.hoisted(() => ({
  callbacks: [] as ((route: string) => void)[],
  stop: vi.fn(),
}));
vi.mock("@/lib/nativePostLinks", () => ({
  listenForNativePostLinks: async (callback: (route: string) => void) => {
    h.callbacks.push(callback);
    return h.stop;
  },
}));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn() } }));
vi.mock("@/lib/platform", () => ({ isNativePlatform: () => true }));

const wrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouter initialEntries={["/"]}>{children}</MemoryRouter>
);
function useFixture({ ready }: { ready: boolean }) {
  useNativePostNavigation(ready);
  return useLocation().pathname;
}
async function tap(route: string) {
  await waitFor(() => expect(h.callbacks.length).toBeGreaterThan(0));
  await act(async () => {
    h.callbacks.at(-1)!(route);
  });
}

beforeEach(() => {
  h.callbacks = [];
  h.stop.mockClear();
});
afterEach(cleanup);

describe("a shared post's link in the app", () => {
  it("opens the post at once when the app is ready", async () => {
    const { result } = renderHook(useFixture, {
      wrapper,
      initialProps: { ready: true },
    });
    await tap("/activity/AbC123");
    expect(result.current).toBe("/activity/AbC123");
  });

  it("waits for sign-in and setup, then opens it", async () => {
    const { result, rerender } = renderHook(useFixture, {
      wrapper,
      initialProps: { ready: false },
    });
    await tap("/activity/AbC123");
    expect(result.current).toBe("/");
    rerender({ ready: true });
    await waitFor(() => expect(result.current).toBe("/activity/AbC123"));
  });

  it("stops listening when it unmounts", async () => {
    const { unmount } = renderHook(useFixture, {
      wrapper,
      initialProps: { ready: true },
    });
    await waitFor(() => expect(h.callbacks.length).toBe(1));
    unmount();
    expect(h.stop).toHaveBeenCalled();
  });
});
