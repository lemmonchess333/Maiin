// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  getStatus: vi.fn(),
  setEnabled: vi.fn(),
  publishSnapshot: vi.fn(),
  addListener: vi.fn(),
  clearSession: vi.fn(async () => {}),
}));

vi.mock("../connectedTrainingRelease", () => ({
  CONNECTED_TRAINING_RELEASED: false,
}));
vi.mock("../platform", () => ({ isNativePlatform: () => true }));
vi.mock("@capacitor/app", () => ({ App: { addListener: vi.fn() } }));
vi.mock("@capacitor/core", () => ({
  registerPlugin: () => H,
}));

import {
  getWatchRunStatus,
  publishWatchRunSnapshot,
  setWatchRunEnabled,
  subscribeWatchRunCommands,
  syncWatchRunAccount,
} from "../watchRunBridge";

describe("connected training release gate", () => {
  it("does not enable or stream Watch controls in an unreleased native build", async () => {
    expect(await getWatchRunStatus()).toMatchObject({ available: false });
    expect(await setWatchRunEnabled(true)).toBe(false);
    expect(
      await publishWatchRunSnapshot({
        sessionId: "run-A",
        revision: 0,
        phase: "running",
        elapsedSeconds: 1,
        distanceMeters: 0,
        recordedAtMs: 1,
      })
    ).toBe(false);
    const stop = await subscribeWatchRunCommands(vi.fn());
    stop();
    expect(H.getStatus).not.toHaveBeenCalled();
    expect(H.setEnabled).not.toHaveBeenCalled();
    expect(H.publishSnapshot).not.toHaveBeenCalled();
    expect(H.addListener).not.toHaveBeenCalled();
  });

  it("clears a persisted Watch session even for the same user", async () => {
    localStorage.setItem("tropos.watch_run.bound_uid", "A");
    await syncWatchRunAccount("A");
    expect(H.clearSession).toHaveBeenCalledWith({});
    expect(localStorage.getItem("tropos.watch_run.bound_uid")).toBeNull();
  });
});
