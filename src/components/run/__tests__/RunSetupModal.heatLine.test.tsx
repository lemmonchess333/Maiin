/**
 * The run setup's weather strip on a hot day, Pgm8 (E8): one heat line,
 * saying to run by feel, with no number in it, and the run starts at the
 * plan's pace. Below hot the strip says nothing about heat. A planned tempo
 * or interval session is offered as an easy run of its minutes, which the
 * setup's Start then starts; the plan's session is otherwise untouched.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";

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
import { segmentsFromTempo } from "@/lib/runSegments";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";

beforeEach(() => {
  weather.get.mockReset();
});
afterEach(() => {
  cleanup();
});

/** Words a line about heat uses. (The cold tips' "warm up" can't fire on
 *  the days below.) */
const HEAT_WORDS = /\b(hot|heat|humid|hydrat\w*|water|warm)\b/i;

/** The strip's text, once the weather has arrived: the headline, any tip,
 *  any heat line and the credit. */
async function weatherStrip(): Promise<HTMLElement> {
  const credit = await screen.findByText("Weather data from MET Norway");
  return credit.parentElement!;
}

/** A 5:00 /km pace target, as a plan's prefill sets one. */
const PACE_TARGET = { type: "pace" as const, value: 300 };

describe("RunSetupModal — the heat line", () => {
  it("on a hot day, says once to run by feel, with no number, and starts at the plan's pace", async () => {
    // 32°C at 70% humidity: a T+DP sum of 168°F, well into hot.
    weather.get.mockResolvedValue({
      temperature: 32,
      feelsLike: 36,
      humidity: 70,
      windSpeed: 10,
      weatherCode: 0,
      description: "Clear sky",
    });
    const onStart = vi.fn();
    render(
      <RunSetupModal
        onStart={onStart}
        onCancel={vi.fn()}
        savedPreferences={{ target: PACE_TARGET }}
      />
    );
    const strip = await weatherStrip();
    expect(within(strip).getByText(/32°C/)).toBeInTheDocument();

    const heatLines = within(strip).queryAllByText(HEAT_WORDS);
    expect(heatLines.map((line) => line.textContent)).toEqual([
      "Hot today: run by feel, not by pace",
    ]);
    // No %, and no equivalent of the 5:00 /km target.
    expect(heatLines[0].textContent).not.toMatch(/\d/);
    expect(within(strip).queryByText(/\/km/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Start easy run" }));
    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({ target: PACE_TARGET })
    );
  });

  it("below hot, says nothing about heat", async () => {
    // 22°C at 40%: 118°F, the T+DP table's 1% band, which is not hot.
    weather.get.mockResolvedValue({
      temperature: 22,
      feelsLike: 22,
      humidity: 40,
      windSpeed: 10,
      weatherCode: 2,
      description: "Partly cloudy",
    });
    render(
      <RunSetupModal
        onStart={vi.fn()}
        onCancel={vi.fn()}
        savedPreferences={{ target: PACE_TARGET }}
      />
    );
    const strip = await weatherStrip();
    expect(within(strip).getByText(/22°C/)).toBeInTheDocument();
    expect(within(strip).queryAllByText(HEAT_WORDS)).toEqual([]);
    expect(
      within(strip).queryByText(/slower|by feel/i)
    ).not.toBeInTheDocument();
  });
});

const HOT_DAY = {
  temperature: 32,
  feelsLike: 36,
  humidity: 70,
  windSpeed: 10,
  weatherCode: 0,
  description: "Clear sky",
};

/** A planned tempo, as the plan's prefill hands it to the setup: its
 *  pace, and its warm-up, tempo blocks and cool-down. */
const PLANNED_TEMPO = {
  activityType: "tempo" as const,
  target: PACE_TARGET,
  segments: segmentsFromTempo(
    RUN_TEMPLATES.find((t) => t.id === "tempo_30")!.config.tempo!,
    "km",
    PACE_TARGET.value
  ),
};

describe("RunSetupModal — a hot day's swap", () => {
  it("offers a planned tempo as an easy run of its minutes, which Start then starts", async () => {
    weather.get.mockResolvedValue(HOT_DAY);
    const onStart = vi.fn();
    render(
      <RunSetupModal
        onStart={onStart}
        onCancel={vi.fn()}
        savedPreferences={PLANNED_TEMPO}
        sessionName="Tempo 30"
        heatSwapMinutes={45}
      />
    );
    expect(
      await screen.findByText("Or run easy for the same 45 min.")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Start Tempo 30" })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Switch to easy" }));
    // The offer is taken: the run being set up is the easy run now.
    expect(
      screen.queryByRole("button", { name: "Switch to easy" })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Start easy run" }));
    expect(onStart).toHaveBeenCalledOnce();
    const started = onStart.mock.calls[0][0];
    expect(started.activityType).toBe("easy");
    expect(started.target).toEqual({ type: "time", value: 2700 });
    expect(started.intervals).toBeUndefined();
    expect(started.segments).toEqual([
      expect.objectContaining({
        type: "easy",
        label: "Easy 45 min",
        target: { kind: "duration", seconds: 2700 },
      }),
    ]);
  });

  it("offers nothing on a mild day, and the tempo starts as planned", async () => {
    weather.get.mockResolvedValue({
      ...HOT_DAY,
      temperature: 15,
      feelsLike: 15,
      humidity: 50,
    });
    const onStart = vi.fn();
    render(
      <RunSetupModal
        onStart={onStart}
        onCancel={vi.fn()}
        savedPreferences={PLANNED_TEMPO}
        sessionName="Tempo 30"
        heatSwapMinutes={45}
      />
    );
    await weatherStrip();
    expect(
      screen.queryByRole("button", { name: "Switch to easy" })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Start Tempo 30" }));
    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({ activityType: "tempo", target: PACE_TARGET })
    );
  });

  it("offers nothing for a run with no session to swap", async () => {
    weather.get.mockResolvedValue(HOT_DAY);
    render(
      <RunSetupModal
        onStart={vi.fn()}
        onCancel={vi.fn()}
        savedPreferences={{ activityType: "easy", target: PACE_TARGET }}
        heatSwapMinutes={null}
      />
    );
    const strip = await weatherStrip();
    expect(
      within(strip).getByText("Hot today: run by feel, not by pace")
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Switch to easy" })
    ).not.toBeInTheDocument();
  });
});
