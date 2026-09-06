/** Exercise the real Run route's three setup exits with device I/O stubbed. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import Run from "../Run";

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

afterEach(cleanup);

describe("Run setup navigation", () => {
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
