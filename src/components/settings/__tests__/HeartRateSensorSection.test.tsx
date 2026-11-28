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

  /* The owner's recording (23 November 2026): "Looking for sensors…" and
     Stop showed under iOS's Bluetooth question, and stayed beside
     "Bluetooth is off" once it was answered with the radio off in Control
     Center. A search is not looking until Tropos may use Bluetooth and the
     radio is on, and it ends the moment either stops being true. */
  const NOT_ASKED: HeartRateSensorStatus = {
    ...READY,
    authorization: "notDetermined",
    bluetooth: "unknown",
  };

  async function tapPair() {
    fireEvent.click(
      await screen.findByRole("button", { name: "Pair a sensor" })
    );
    await waitFor(() => expect(H.onFound).not.toBeNull());
  }

  it("is not looking while iOS asks for Bluetooth", async () => {
    H.status = NOT_ASKED;
    render(<HeartRateSensorSection />);
    await tapPair();
    expect(screen.queryByText("Looking for sensors…")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Stop" })
    ).not.toBeInTheDocument();
    // The tap is answered: the button waits for the question.
    expect(
      screen.getByRole("button", { name: "Pair a sensor" })
    ).toHaveAttribute("aria-busy", "true");
    // The radio is still being read after Allow: still not looking.
    act(() => H.onStatus?.({ ...NOT_ASKED, authorization: "allowed" }));
    expect(screen.queryByText("Looking for sensors…")).not.toBeInTheDocument();
    act(() =>
      H.onStatus?.({
        ...NOT_ASKED,
        authorization: "allowed",
        bluetooth: "resetting",
      })
    );
    expect(screen.queryByText("Looking for sensors…")).not.toBeInTheDocument();
    act(() => H.onStatus?.(READY));
    expect(screen.getByText("Looking for sensors…")).toBeVisible();
    expect(screen.getByRole("button", { name: "Stop" })).toBeVisible();
  });

  it("ends the search when Allow finds the radio off, and says only that", async () => {
    H.status = NOT_ASKED;
    render(<HeartRateSensorSection />);
    await tapPair();
    act(() =>
      H.onStatus?.({ ...READY, bluetooth: "poweredOff", scanning: true })
    );
    expect(
      screen.getByText(
        "Bluetooth is off. Turn it on in Control Center to pair a sensor."
      )
    ).toBeVisible();
    expect(screen.queryByText("Looking for sensors…")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Stop" })
    ).not.toBeInTheDocument();
    expect(H.stopScan).toHaveBeenCalledOnce();
    // Turned on again, nothing searches by itself.
    act(() => H.onStatus?.(READY));
    expect(screen.queryByText("Looking for sensors…")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pair a sensor" })).toBeEnabled();
  });

  it("ends the search on Don't Allow and says how to allow it", async () => {
    H.status = NOT_ASKED;
    render(<HeartRateSensorSection />);
    await tapPair();
    // iOS's answer to Don't Allow: refused, and the radio unauthorized.
    act(() =>
      H.onStatus?.({
        ...READY,
        authorization: "denied",
        bluetooth: "unauthorized",
        scanning: true,
      })
    );
    expect(screen.getByText("Bluetooth is off for Tropos")).toBeVisible();
    expect(
      screen.getByText(/Allow Bluetooth for Tropos in Settings/)
    ).toBeVisible();
    expect(
      screen.queryByText(/Turn it on in Control Center/)
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Looking for sensors…")).not.toBeInTheDocument();
    expect(H.stopScan).toHaveBeenCalledOnce();
  });

  it("stops looking when the radio goes off mid-search", async () => {
    render(<HeartRateSensorSection />);
    await tapPair();
    expect(await screen.findByText("Looking for sensors…")).toBeVisible();
    act(() => H.onStatus?.({ ...READY, bluetooth: "poweredOff" }));
    expect(screen.queryByText("Looking for sensors…")).not.toBeInTheDocument();
    expect(H.stopScan).toHaveBeenCalledOnce();
    expect(screen.queryByText(/No sensor found/)).not.toBeInTheDocument();
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
