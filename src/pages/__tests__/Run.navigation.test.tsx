/** Exercise the real Run route's three setup exits with device I/O stubbed. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import Run from "../Run";
import {
  readStoredRun,
  writeStoredRun,
  RUN_RESUME_SCHEMA_VERSION,
  type StoredRun,
} from "@/lib/runResumeStorage";
import { freeformPlanMetadata } from "@/lib/runPlanMetadata";

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ profile: { uid: "navigation-test", runMode: "freeform" } }),
}));
vi.mock("@/features/program/useProgram", () => ({
  useProgram: () => ({ programState: null, loading: false }),
}));
vi.mock("@/hooks/useDistanceUnit", () => ({ useDistanceUnit: () => "km" }));
vi.mock("@/hooks/useLastRunType", () => ({ useLastRunType: () => null }));
vi.mock("@/hooks/useGPS", () => ({
  useGPS: () => ({
    points: [],
    distance: 0,
    stop: vi.fn(),
    currentPoint: null,
  }),
}));
vi.mock("@/hooks/useRunTimer", () => ({
  useRunTimer: () => ({
    elapsed: 0,
    isRunning: false,
    formatTime: () => "0:00",
  }),
}));
vi.mock("@/hooks/useWakeLock", () => ({
  useWakeLock: () => ({ request: vi.fn(), release: vi.fn() }),
}));
vi.mock("@/hooks/useHeartRate", () => ({
  useHeartRate: () => ({ bpm: null }),
}));
vi.mock("@/hooks/useAudioCues", () => ({ useAudioCues: () => ({}) }));
vi.mock("@/hooks/useSessionPlayer", () => ({
  useSessionPlayer: () => ({ state: { index: 0 } }),
}));
vi.mock("@/components/run/RunMapLazy", () => ({ default: () => null }));
vi.mock("@/components/run/RouteSetupSection", () => ({ default: () => null }));
vi.mock("@/components/run/RunTilePicker", () => ({
  default: ({
    onBack,
    onMoreOptions,
  }: {
    onBack: () => void;
    onMoreOptions: () => void;
  }) => (
    <>
      <button onClick={onBack}>Back from picker</button>
      <button onClick={onMoreOptions}>More options</button>
    </>
  ),
}));
vi.mock("@/components/run/RunSetupModal", () => ({
  default: ({ onCancel }: { onCancel: () => void }) => (
    <button onClick={onCancel}>Cancel setup</button>
  ),
}));
vi.mock("@/components/run/RunLaunchCard", () => ({
  default: ({ onBack }: { onBack: () => void }) => (
    <button onClick={onBack}>Back from planned run</button>
  ),
}));

function Destination() {
  const location = useLocation();
  return (
    <p data-testid="destination">
      {location.pathname}
      {location.search}
    </p>
  );
}

function open(url: string) {
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/run" element={<Run />} />
        <Route path="/program" element={<Destination />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  localStorage.clear();
});

function saveInterruptedRun() {
  const snapshot: StoredRun = {
    v: RUN_RESUME_SCHEMA_VERSION,
    config: {
      activityType: "easy",
      autoPause: true,
      audioCues: true,
      audioCueFrequency: "every_km",
      paceAlerts: true,
      voiceRate: 0.9,
      displayStats: ["pace", "distance", "time"],
      target: { type: "none" },
      planMetadata: freeformPlanMetadata("freeform"),
    },
    startedAt: Date.now() - 600000,
    lastWriteAt: Date.now(),
    accumulatedSeconds: 360,
    isRunning: false,
    phase: "paused",
    points: [],
  };
  expect(writeStoredRun("navigation-test", snapshot)).toBe(true);
  return snapshot;
}

describe("Run setup navigation", () => {
  it.each(["button", "escape"])(
    "keeps the interrupted run when leaving via %s",
    (method) => {
      const snapshot = saveInterruptedRun();
      open("/run");
      if (method === "button")
        fireEvent.click(screen.getByRole("button", { name: "Back to Run" }));
      else fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.getByTestId("destination")).toHaveTextContent(
        "/program?tab=run"
      );
      expect(readStoredRun("navigation-test")).toEqual(snapshot);
    }
  );

  it("only clears the interrupted run after confirming a replacement", () => {
    const snapshot = saveInterruptedRun();
    open("/run");
    fireEvent.click(screen.getByRole("button", { name: "Start new run" }));
    expect(readStoredRun("navigation-test")).toEqual(snapshot);
    fireEvent.click(screen.getByRole("button", { name: "Keep previous run" }));
    expect(readStoredRun("navigation-test")).toEqual(snapshot);
    fireEvent.click(screen.getByRole("button", { name: "Start new run" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Discard and start new" })
    );
    expect(readStoredRun("navigation-test")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Back from picker" })
    ).toBeInTheDocument();
  });

  it("returns the free-run picker to the Run tab", () => {
    open("/run");
    fireEvent.click(screen.getByRole("button", { name: "Back from picker" }));
    expect(screen.getByTestId("destination")).toHaveTextContent(
      "/program?tab=run"
    );
  });

  it("cancels More options back to the Run tab", () => {
    open("/run");
    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel setup" }));
    expect(screen.getByTestId("destination")).toHaveTextContent(
      "/program?tab=run"
    );
  });

  it("returns a planned run launch card to the Run tab", () => {
    open("/run?template=easy_30");
    fireEvent.click(
      screen.getByRole("button", { name: "Back from planned run" })
    );
    expect(screen.getByTestId("destination")).toHaveTextContent(
      "/program?tab=run"
    );
  });
});
