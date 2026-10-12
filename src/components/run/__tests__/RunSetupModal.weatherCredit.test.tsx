/**
 * The run setup's weather strip credits MET Norway, whose licence
 * (CC BY 4.0) asks for that wherever its weather is shown, and shows
 * neither weather nor credit when there is no reading.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

const weather = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/weather", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/weather")>()),
  getCurrentWeather: () => weather.get(),
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { uid: "runner" }, profile: {} }),
}));
vi.mock("@/lib/savedRuns", () => ({
  fetchSavedRuns: vi.fn(async () => []),
}));
vi.mock("@/hooks/useDistanceUnit", () => ({
  useDistanceUnit: () => "km" as const,
}));
vi.mock("@/components/run/ShoeSelector", () => ({ default: () => null }));

import RunSetupModal from "../RunSetupModal";

beforeEach(() => {
  weather.get.mockReset();
});
afterEach(() => {
  cleanup();
});

function renderSetup() {
  render(<RunSetupModal onStart={vi.fn()} onCancel={vi.fn()} />);
}

describe("RunSetupModal — the weather credit", () => {
  it("credits MET Norway under the weather it shows", async () => {
    weather.get.mockResolvedValue({
      temperature: 14,
      feelsLike: 12,
      humidity: 70,
      windSpeed: 12,
      weatherCode: 2,
      description: "Partly cloudy",
    });
    renderSetup();
    expect(
      await screen.findByText("Weather data from MET Norway")
    ).toBeInTheDocument();
    expect(screen.getByText(/Partly cloudy/)).toBeInTheDocument();
  });

  it("shows no credit when there is no weather to credit", async () => {
    weather.get.mockResolvedValue(null);
    renderSetup();
    // The lookup has answered, and the page around the strip is drawn.
    await waitFor(() => expect(weather.get).toHaveBeenCalledOnce());
    expect(await screen.findByText("Ready to run?")).toBeInTheDocument();
    expect(
      screen.queryByText("Weather data from MET Norway")
    ).not.toBeInTheDocument();
  });
});
