/**
 * A route's preview says how long it took. For a route saved from a run,
 * that is the run's moving time: a stop at a crossing is not part of the
 * route, and a five-minute pause used to add five minutes to it.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { GPSPoint } from "@/lib/gps";

vi.mock("@/hooks/useDistanceUnit", () => ({
  useDistanceUnit: () => "km" as const,
}));
vi.mock("../RunMapLazy", () => ({ default: () => null }));
vi.mock("../RunMap", () => ({ default: () => null }));

import RoutePreviewSheet from "../RoutePreviewSheet";

/** A fix a minute, with the time held before it. */
const fix = (minute: number, pausedMs = 0): GPSPoint => ({
  lat: 51.5,
  lon: minute * 0.003,
  rawLat: 51.5,
  rawLon: minute * 0.003,
  timestamp: 1_700_000_000_000 + minute * 60_000 + pausedMs,
  altitude: 10,
  accuracy: 5,
  speed: 3,
  ...(pausedMs > 0 ? { pausedMs } : {}),
});

afterEach(cleanup);

it("gives a route from a run its moving time, without the run's pauses", () => {
  const held = 5 * 60_000;
  // Twenty minutes running, with a five-minute pause after the tenth.
  const points = [
    ...Array.from({ length: 11 }, (_, m) => fix(m)),
    ...Array.from({ length: 10 }, (_, m) => fix(m + 11, held)),
  ];
  render(
    <RoutePreviewSheet
      open
      onClose={vi.fn()}
      points={points}
      defaultName="Park loop"
      source="run"
      showSave={false}
      onFollow={vi.fn()}
      onSave={vi.fn()}
    />
  );
  // 20 minutes of moving time; the wall clock said 25.
  expect(screen.getByText("20 min")).toBeInTheDocument();
  expect(screen.queryByText("25 min")).toBeNull();
});
