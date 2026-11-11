import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { useNativeInviteNavigation } from "../useNativeInviteNavigation";
import { clearPendingInvite, readPendingInvite } from "@/lib/pendingInvite";
import { useInviteCodeInput } from "../usePendingInvite";

const h = vi.hoisted(() => ({
  callbacks: [] as ((code: string) => boolean)[],
  stop: vi.fn(),
}));
vi.mock("@/lib/nativeInviteLinks", () => ({
  listenForNativeInvites: async (callback: (code: string) => boolean) => {
    h.callbacks.push(callback);
    return h.stop;
  },
}));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn() } }));
vi.mock("@/lib/platform", () => ({ isNativePlatform: () => true }));
const wrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouter initialEntries={["/onboarding"]}>{children}</MemoryRouter>
);
beforeEach(() => {
  clearPendingInvite();
  h.callbacks = [];
  h.stop.mockClear();
});
afterEach(() => {
  cleanup();
  clearPendingInvite();
});
function useFixture({
  ready,
  inSetup = false,
}: {
  ready: boolean;
  inSetup?: boolean;
}) {
  useNativeInviteNavigation(ready, inSetup);
  const location = useLocation();
  const [value, setValue] = useInviteCodeInput();
  return { path: location.pathname + location.search, value, setValue };
}
async function send(code: string) {
  await waitFor(() => expect(h.callbacks.length).toBeGreaterThan(0));
  await act(async () => {
    h.callbacks.at(-1)!(code);
  });
}

describe("native invites through setup", () => {
  it("updates an already mounted field without interrupting setup, then opens People", async () => {
    const { result, rerender } = renderHook(useFixture, {
      wrapper,
      initialProps: { ready: false },
    });
    await send("K7P49M2H");
    expect(result.current.path).toBe("/onboarding");
    expect(result.current.value).toBe("K7P4-9M2H");
    expect(readPendingInvite()).toBe("K7P49M2H");
    rerender({ ready: true });
    expect(result.current.path).toBe("/social?tab=find");
  });
  it("does not reopen People for a code setup has already redeemed", async () => {
    const { result, rerender } = renderHook(useFixture, {
      wrapper,
      initialProps: { ready: false },
    });
    await send("K7P49M2H");
    act(() => clearPendingInvite());
    rerender({ ready: true });
    expect(result.current.path).toBe("/onboarding");
  });
  it("lets people type, but a newer explicitly opened link fills the latest code", async () => {
    const { result } = renderHook(useFixture, {
      wrapper,
      initialProps: { ready: false },
    });
    await send("K7P49M2H");
    act(() => result.current.setValue("manual"));
    expect(result.current.value).toBe("manual");
    await send("A2B3C4D5");
    expect(result.current.value).toBe("A2B3-C4D5");
  });
  it("restores an edited field when the same invite link is opened again", async () => {
    const { result } = renderHook(useFixture, {
      wrapper,
      initialProps: { ready: false },
    });
    await send("K7P49M2H");
    act(() => result.current.setValue(""));
    await send("K7P49M2H");
    expect(result.current.value).toBe("K7P4-9M2H");
  });
  it("removes listeners and rejects delayed callbacks after unmount", async () => {
    const { unmount } = renderHook(useFixture, {
      wrapper,
      initialProps: { ready: true },
    });
    await waitFor(() => expect(h.callbacks.length).toBeGreaterThan(0));
    unmount();
    expect(h.stop).toHaveBeenCalledTimes(1);
    expect(h.callbacks[0]("K7P49M2H")).toBe(false);
    expect(readPendingInvite()).toBeNull();
  });
});

it("lets onboarding finish on Home even while its redemption is still pending", async () => {
  const { result, rerender } = renderHook(useFixture, {
    wrapper,
    initialProps: { ready: false, inSetup: true },
  });
  await send("K7P49M2H");
  rerender({ ready: true, inSetup: false });
  expect(result.current.path).toBe("/onboarding");
  expect(readPendingInvite()).toBe("K7P49M2H");
});
