/**
 * Settings → Health while Apple Health is still loading: no guess at a
 * state, no 0 and no "No steps yet" alert.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

const steps = vi.hoisted(() => ({
  value: {
    status: "ambiguous",
    steps: null as number | null,
    connect: () => Promise.resolve(),
    pending: true,
  },
}));
vi.mock("@/hooks/useSteps", () => ({ useSteps: () => steps.value }));
const prefs = vi.hoisted(() => ({
  value: {
    prefs: { useWatchForRuns: false, saveWorkoutsToHealth: false },
    loading: false,
    failed: false,
    update: vi.fn().mockResolvedValue(true),
    retry: vi.fn(),
  },
}));
vi.mock("@/hooks/useConnectedTrainingPrefs", () => ({
  useConnectedTrainingPrefs: () => prefs.value,
}));
const release = vi.hoisted(() => ({ enabled: true }));
vi.mock("@/lib/connectedTrainingRelease", () => ({
  get CONNECTED_TRAINING_RELEASED() {
    return release.enabled;
  },
}));
vi.mock("@/lib/auth", () => ({ useUid: () => "u1" }));
const health = vi.hoisted(() => ({
  available: true,
  authorization: "authorized",
  request: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/lib/healthKit", () => ({
  openHealthSettings: vi.fn(),
  isWorkoutWriteAvailable: () => Promise.resolve(health.available),
  getWorkoutWriteAuthorization: () => Promise.resolve(health.authorization),
  requestWorkoutWritePermission: () => health.request(),
}));
const watch = vi.hoisted(() => ({
  status: {
    available: false,
    paired: false,
    installed: false,
    reachable: false,
    enabled: false,
  },
  setEnabled: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/lib/watchRunBridge", () => ({
  getWatchRunStatus: () => Promise.resolve({ ...watch.status }),
  setWatchRunEnabled: (enabled: boolean) => watch.setEnabled(enabled),
  subscribeWatchRunConnection: () => Promise.resolve(() => {}),
}));
const platform = vi.hoisted(() => ({ native: false }));
vi.mock("@/lib/platform", () => ({
  isNativePlatform: () => platform.native,
}));
const exports = vi.hoisted(() => ({
  pending: [] as Array<{
    runId: string;
    status: "pending" | "pending-delete" | "blocked";
  }>,
  reconcile: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/healthWorkoutExport", () => ({
  pendingHealthWorkoutExports: () => exports.pending,
  reconcilePendingHealthExports: (uid: string) => exports.reconcile(uid),
}));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/components/AccordionSection", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

import HealthSection from "../HealthSection";
import {
  isWatchRunLocallyDisabled,
  setWatchRunLocallyDisabled,
} from "@/lib/connectedTrainingPrefs";

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  setWatchRunLocallyDisabled("u1", false);
  release.enabled = true;
  platform.native = false;
  exports.pending = [];
  steps.value = {
    status: "ambiguous",
    steps: null,
    connect: () => Promise.resolve(),
    pending: true,
  };
  prefs.value.prefs = {
    useWatchForRuns: false,
    saveWorkoutsToHealth: false,
  };
  prefs.value.loading = false;
  prefs.value.failed = false;
  watch.status = {
    available: false,
    paired: false,
    installed: false,
    reachable: false,
    enabled: false,
  };
  health.available = true;
  health.authorization = "authorized";
  health.request.mockResolvedValue(true);
  prefs.value.update.mockResolvedValue(true);
  watch.setEnabled.mockImplementation(async () => true);
});

describe("HealthSection", () => {
  it("shows a placeholder while loading, not a 0 or an alert", () => {
    render(<HealthSection />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("0")).toBeNull();
    expect(screen.queryByText("Not available here")).toBeNull();
  });

  it("shows the answer once loaded", () => {
    steps.value = {
      ...steps.value,
      pending: false,
      status: "connected",
      steps: 4200,
    };
    render(<HealthSection />);
    expect(screen.getByText("Apple Health connected")).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows unavailable Watch and export choices truthfully on web", async () => {
    health.available = false;
    render(<HealthSection />);
    await screen.findByText(
      "Apple Watch runs are available in the Tropos iPhone app."
    );
    expect(
      screen.getByRole("switch", { name: "Use Watch for runs" })
    ).toBeDisabled();
    expect(
      screen.getByRole("switch", { name: "Save workouts to Apple Health" })
    ).toBeDisabled();
  });

  it("keeps both controls unavailable until the release gate is enabled", async () => {
    release.enabled = false;
    watch.status = {
      available: true,
      paired: true,
      installed: true,
      reachable: true,
      enabled: false,
    };
    render(<HealthSection />);
    await screen.findByText(
      "Watch running is unavailable in this version of Tropos."
    );
    expect(
      screen.getByRole("switch", { name: "Use Watch for runs" })
    ).toBeDisabled();
    expect(
      screen.getByRole("switch", { name: "Save workouts to Apple Health" })
    ).toBeDisabled();
    expect(prefs.value.update).not.toHaveBeenCalled();
  });

  it("enables a paired Watch only after the account choice is saved", async () => {
    watch.status = {
      available: true,
      paired: true,
      installed: true,
      reachable: true,
      enabled: false,
    };
    render(<HealthSection />);
    const toggle = await screen.findByRole("switch", {
      name: "Use Watch for runs",
    });
    await waitFor(() => expect(toggle).toBeEnabled());
    fireEvent.click(toggle);
    await waitFor(() =>
      expect(prefs.value.update).toHaveBeenCalledWith("useWatchForRuns", true)
    );
    expect(watch.setEnabled).toHaveBeenCalledWith(true);
    expect(prefs.value.update.mock.invocationCallOrder[0]).toBeLessThan(
      watch.setEnabled.mock.invocationCallOrder[0]
    );
  });

  it("keeps Watch off after an opt-out server failure and a Settings remount", async () => {
    prefs.value.prefs.useWatchForRuns = true;
    prefs.value.update.mockImplementation(
      async (key: string, enabled: boolean) =>
        key !== "useWatchForRuns" || enabled
    );
    watch.status = {
      available: true,
      paired: true,
      installed: true,
      reachable: true,
      enabled: true,
    };
    watch.setEnabled.mockImplementation(async (enabled: boolean) => {
      watch.status.enabled = enabled;
      return true;
    });
    const view = render(<HealthSection />);
    const toggle = await screen.findByRole("switch", {
      name: "Use Watch for runs",
    });
    await waitFor(() => expect(toggle).toBeChecked());
    fireEvent.click(toggle);
    await waitFor(() => expect(watch.setEnabled).toHaveBeenCalledWith(false));
    fireEvent(document, new Event("visibilitychange"));
    await waitFor(() => expect(toggle).not.toBeChecked());
    expect(isWatchRunLocallyDisabled("u1")).toBe(true);
    expect(watch.setEnabled).not.toHaveBeenCalledWith(true);

    view.unmount();
    render(<HealthSection />);
    await waitFor(() =>
      expect(
        screen.getByRole("switch", { name: "Use Watch for runs" })
      ).not.toBeChecked()
    );
    expect(watch.setEnabled).not.toHaveBeenCalledWith(true);
  });

  it("retires the local Watch-off veto only after an explicit successful enable", async () => {
    setWatchRunLocallyDisabled("u1", true);
    prefs.value.prefs.useWatchForRuns = true;
    watch.status = {
      available: true,
      paired: true,
      installed: true,
      reachable: true,
      enabled: false,
    };
    watch.setEnabled.mockImplementation(async (enabled: boolean) => {
      if (enabled) expect(isWatchRunLocallyDisabled("u1")).toBe(true);
      watch.status.enabled = enabled;
      return true;
    });
    render(<HealthSection />);
    const toggle = await screen.findByRole("switch", {
      name: "Use Watch for runs",
    });
    await waitFor(() => expect(toggle).toBeEnabled());
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    await waitFor(() => expect(watch.setEnabled).toHaveBeenCalledWith(true));
    await waitFor(() => expect(isWatchRunLocallyDisabled("u1")).toBe(false));
  });

  it("does not save workout export consent when Health write access is refused", async () => {
    health.request.mockResolvedValue(false);
    render(<HealthSection />);
    const toggle = await screen.findByRole("switch", {
      name: "Save workouts to Apple Health",
    });
    await waitFor(() => expect(toggle).toBeEnabled());
    fireEvent.click(toggle);
    await waitFor(() => expect(health.request).toHaveBeenCalled());
    expect(prefs.value.update).not.toHaveBeenCalledWith(
      "saveWorkoutsToHealth",
      true
    );
  });

  it("shows a recoverable pending Health update on iPhone", async () => {
    platform.native = true;
    exports.pending = [{ runId: "r1", status: "pending" }];
    render(<HealthSection />);
    const pending = await screen.findByText("1 Apple Health update pending");
    expect(pending).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(exports.reconcile).toHaveBeenCalledWith("u1"));
  });

  it("keeps native cleanup visible when new connected training is disabled", async () => {
    release.enabled = false;
    platform.native = true;
    exports.pending = [{ runId: "r1", status: "pending-delete" }];
    render(<HealthSection />);
    expect(
      await screen.findByText("1 Apple Health update pending")
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(exports.reconcile).toHaveBeenCalledWith("u1"));
  });

  it("shows revoked workout write access without claiming export succeeded", async () => {
    prefs.value.prefs.saveWorkoutsToHealth = true;
    health.authorization = "denied";
    render(<HealthSection />);
    expect(
      await screen.findByText("Workout access needs attention")
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Runs remain saved in Tropos"
    );
    expect(
      screen.getByRole("switch", { name: "Save workouts to Apple Health" })
    ).toBeChecked();
  });
});
