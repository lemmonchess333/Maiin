/**
 * After signing out and in, the native Watch switch is off while the
 * account still chooses the Watch for runs; only Settings turned it back
 * on, so a run sent snapshots the phone refused. A run the Watch can join
 * now turns it on.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";

const bridge = vi.hoisted(() => ({
  getWatchRunStatus: vi.fn(),
  setWatchRunEnabled: vi.fn(async () => true),
}));
vi.mock("@/lib/watchRunBridge", () => bridge);

import { useWatchRunSwitch } from "../useWatchRunSwitch";

const status = (enabled: boolean) => ({
  available: true,
  paired: true,
  installed: true,
  reachable: true,
  enabled,
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("useWatchRunSwitch", () => {
  it("turns the native switch on for a run the Watch can join", async () => {
    bridge.getWatchRunStatus.mockResolvedValue(status(false));
    renderHook(() => useWatchRunSwitch("me", true));
    await waitFor(() =>
      expect(bridge.setWatchRunEnabled).toHaveBeenCalledWith(true)
    );
  });

  it("leaves it alone when it is on, or the run is not the Watch's", async () => {
    bridge.getWatchRunStatus.mockResolvedValue(status(true));
    renderHook(() => useWatchRunSwitch("me", true));
    await waitFor(() => expect(bridge.getWatchRunStatus).toHaveBeenCalled());
    bridge.getWatchRunStatus.mockClear();
    bridge.getWatchRunStatus.mockResolvedValue(status(false));
    renderHook(() => useWatchRunSwitch("me", false));
    await Promise.resolve();
    expect(bridge.getWatchRunStatus).not.toHaveBeenCalled();
    expect(bridge.setWatchRunEnabled).not.toHaveBeenCalled();
  });

  it("asks once per account, however often the run renders", async () => {
    bridge.getWatchRunStatus.mockResolvedValue(status(false));
    const { rerender } = renderHook(({ uid }) => useWatchRunSwitch(uid, true), {
      initialProps: { uid: "me" },
    });
    rerender({ uid: "me" });
    await waitFor(() =>
      expect(bridge.setWatchRunEnabled).toHaveBeenCalledTimes(1)
    );
    expect(bridge.getWatchRunStatus).toHaveBeenCalledTimes(1);
  });
});
