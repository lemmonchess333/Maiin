/**
 * Settings' heart rate sensor row: what web says, and pairing, reading and
 * forgetting a sensor on the iPhone.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type {
  HeartRateSensorStatus,
  PairedSensor,
} from "@/lib/heartRateSensorBridge";
import type { HeartRateSample } from "@/lib/hrZones";

const H = vi.hoisted(() => ({
  native: false,
  status: null as unknown as HeartRateSensorStatus,
  onFound: null as ((sensor: PairedSensor) => void) | null,
  onReading: null as ((sample: HeartRateSample) => void) | null,
  onStatus: null as ((status: HeartRateSensorStatus) => void) | null,
  stopScan: vi.fn(),
  pair: vi.fn(),
  forget: vi.fn(),
  preview: vi.fn(),
  openSettings: vi.fn(),
}));

vi.mock("@/lib/platform", () => ({ isNativePlatform: () => H.native }));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/heartRateSensorBridge", async (importOriginal) => {
  const real =
    await importOriginal<typeof import("@/lib/heartRateSensorBridge")>();
  return {
    UNAVAILABLE_SENSOR_STATUS: real.UNAVAILABLE_SENSOR_STATUS,
    getHeartRateSensorStatus: async () => H.status,
    subscribeHeartRateSensorStatus: async (
      handler: (status: HeartRateSensorStatus) => void
    ) => {
      H.onStatus = handler;
      return () => {};
    },
    scanForHeartRateSensors: async (
      onFound: (sensor: PairedSensor) => void
    ) => {
      H.onFound = onFound;
      return H.stopScan;
    },
    subscribeHeartRateSensorReadings: async (
      handler: (sample: HeartRateSample) => void
    ) => {
      H.onReading = handler;
      return () => {};
    },
    pairHeartRateSensor: (id: string) => H.pair(id),
    forgetHeartRateSensor: () => H.forget(),
    previewHeartRateSensor: (on: boolean) => H.preview(on),
    openHeartRateSensorSettings: () => H.openSettings(),
  };
});

import HeartRateSensorSection from "../HeartRateSensorSection";
import { restoreRealTimers } from "@/test/fakeTimers";

const READY: HeartRateSensorStatus = {
  available: true,
  authorization: "allowed",
  bluetooth: "poweredOn",
  paired: null,
  connection: "idle",
  scanning: false,
};
const H10 = { id: "UUID-1", name: "Polar H10 1A2B3C4D" };

beforeEach(() => {
  H.native = false;
  H.status = READY;
  H.onFound = null;
  H.onReading = null;
  H.onStatus = null;
  H.stopScan.mockReset();
  H.pair.mockReset();
  H.forget.mockReset();
  H.preview.mockReset();
  H.openSettings.mockReset();
});
afterEach(() => cleanup());

describe("HeartRateSensorSection on web", () => {
  it("says the sensor pairs in the iPhone app, and what it gives a run", () => {
    render(<HeartRateSensorSection />);
    expect(screen.getByText("Heart rate sensor")).toBeVisible();
    expect(screen.getByText("Pair a sensor in the iPhone app")).toBeVisible();
    expect(screen.getByText(/stays above Zone 2 on an easy run/)).toBeVisible();
    expect(screen.getByText(/time in zones/)).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Pair a sensor" })
    ).not.toBeInTheDocument();
  });
});

describe("HeartRateSensorSection on the iPhone", () => {
  beforeEach(() => {
    H.native = true;
  });

  it("searches on a tap, lists what it finds once each, and pairs one", async () => {
    H.pair.mockResolvedValue({
      ...READY,
      paired: H10,
      connection: "connecting",
    });
    render(<HeartRateSensorSection />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Pair a sensor" })
    );
    await screen.findByText("Looking for sensors…");
    act(() => {
      H.onFound?.(H10);
      H.onFound?.(H10);
      H.onFound?.({ id: "UUID-2", name: "HRM-Pro" });
    });
    expect(screen.getAllByRole("button", { name: "Pair" })).toHaveLength(2);
    fireEvent.click(screen.getAllByRole("button", { name: "Pair" })[0]);
    await screen.findByText("Polar H10 1A2B3C4D");
    expect(H.pair).toHaveBeenCalledWith("UUID-1");
    expect(H.stopScan).toHaveBeenCalled();
    expect(
      screen.getByText("Connecting… Put it on so it wakes up.")
    ).toBeVisible();
  });

  it("says when a search finds nothing", async () => {
    vi.useFakeTimers();
    try {
      render(<HeartRateSensorSection />);
      await act(async () => {
        await Promise.resolve();
      });
      fireEvent.click(screen.getByRole("button", { name: "Pair a sensor" }));
      await act(async () => {
        await Promise.resolve();
      });
      await act(async () => {
        vi.advanceTimersByTime(30_000);
      });
      expect(screen.getByText(/No sensor found/)).toBeVisible();
      expect(H.stopScan).toHaveBeenCalled();
    } finally {
      await restoreRealTimers();
    }
  });

  it("shows the paired sensor's live reading and keeps it connected while on screen", async () => {
    H.status = { ...READY, paired: H10, connection: "connected" };
    const { unmount } = render(<HeartRateSensorSection />);
    await screen.findByText("Polar H10 1A2B3C4D");
    await waitFor(() => expect(H.preview).toHaveBeenCalledWith(true));
    expect(screen.getByText("Connected")).toBeVisible();
    await waitFor(() => expect(H.onReading).not.toBeNull());
    act(() => {
      H.onReading?.({ id: "ble:1", at: 1, bpm: 72, source: "bluetooth" });
    });
    expect(screen.getByText("72")).toBeVisible();
    unmount();
    expect(H.preview).toHaveBeenLastCalledWith(false);
  });

  it("says a paired sensor connects at a run when it is not connected", async () => {
    H.status = { ...READY, paired: H10, connection: "idle" };
    render(<HeartRateSensorSection />);
    expect(
      await screen.findByText("Connects when you start a run.")
    ).toBeVisible();
  });

  it("forgets the sensor", async () => {
    H.status = { ...READY, paired: H10, connection: "connected" };
    H.forget.mockResolvedValue(READY);
    render(<HeartRateSensorSection />);
    fireEvent.click(await screen.findByRole("button", { name: "Forget" }));
    await screen.findByText("No sensor paired");
  });

  it("sends a person who turned Bluetooth off for Tropos to Settings", async () => {
    H.status = { ...READY, authorization: "denied" };
    render(<HeartRateSensorSection />);
    expect(
      await screen.findByText("Bluetooth is off for Tropos")
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Open settings" }));
    expect(H.openSettings).toHaveBeenCalledOnce();
  });

  it("follows a status change, such as Bluetooth turned off", async () => {
    render(<HeartRateSensorSection />);
    await screen.findByText("No sensor paired");
    await waitFor(() => expect(H.onStatus).not.toBeNull());
    act(() => {
      H.onStatus?.({ ...READY, bluetooth: "poweredOff" });
    });
    expect(
      screen.getByText(/Bluetooth is off\. Turn it on in Control Center/)
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Pair a sensor" })
    ).toBeDisabled();
  });

  it("says an older app cannot pair one, once native has answered", async () => {
    H.status = { ...READY, available: false };
    render(<HeartRateSensorSection />);
    // Nothing claims anything before the first answer.
    expect(
      screen.queryByText("Update Tropos to pair a sensor")
    ).not.toBeInTheDocument();
    expect(
      await screen.findByText("Update Tropos to pair a sensor")
    ).toBeVisible();
  });
});
