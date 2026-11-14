/**
 * The run setup on a hot day (heatAdjustment.ts, the owner's heat
 * adjustment). The weather strip says it is hot, naming the rule of
 * thumb's range, and nothing is applied by itself: the run starts at the
 * plan's pace unless the runner adjusts it. A planned session gets the
 * offer under the strip: Adjust for heat sets the eased session, Clear
 * gives back the plan's, and a swap changes the run being set up. Below
 * hot the strip says nothing about heat.
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

import RunSetupModal, { type RunSetupHeat } from "../RunSetupModal";
import { segmentsFromTempo } from "@/lib/runSegments";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import { heatLine } from "@/lib/heatAdjustment";

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
  const credits = await screen.findAllByText("Weather data from MET Norway");
  return credits[0].parentElement!;
}

/** A 5:00 /km pace target, as a plan's prefill sets one. */
const PACE_TARGET = { type: "pace" as const, value: 300 };

/** 32°C at 70% humidity: a T+DP sum of about 168°F, the 6–8% band. */
const HOT_DAY = {
  temperature: 32,
  feelsLike: 36,
  humidity: 70,
  windSpeed: 10,
  weatherCode: 0,
  description: "Clear sky",
};
const HOT_LINE =
  "By a common rule of thumb, this heat slows the same effort by 6–8%.";

const tempoShape = RUN_TEMPLATES.find((t) => t.id === "tempo_30")!.config
  .tempo!;

/** A planned tempo, as the plan's prefill hands it to the setup: its
 *  pace, and its warm-up, tempo blocks and cool-down. */
const PLANNED_TEMPO = {
  activityType: "tempo" as const,
  target: PACE_TARGET,
  segments: segmentsFromTempo(tempoShape, "km", PACE_TARGET.value),
};

/** What a hot day offers that tempo, as the run page works it out: the
 *  same session built from the eased paces (5:21 at 7% slower). */
const OFFER: RunSetupHeat = {
  level: "hot",
  line: HOT_LINE,
  adjustment: { from: 0.06, to: 0.08 },
  prefill: {
    activityType: "tempo",
    target: { type: "pace", value: 321 },
    segments: segmentsFromTempo(tempoShape, "km", 321),
  },
  adjustedLine: "Adjusted for heat: work at 5:18–5:24 /km.",
  swapMinutes: 45,
  longSwap: false,
};

function plannedTempo(heat: RunSetupHeat | null = OFFER) {
  const onStart = vi.fn();
  render(
    <RunSetupModal
      onStart={onStart}
      onCancel={vi.fn()}
      savedPreferences={PLANNED_TEMPO}
      sessionName="Tempo 30"
      heat={heat}
    />
  );
  return onStart;
}

describe("RunSetupModal — the heat line", () => {
  it("on a hot day, says it once with the rule of thumb's range, and applies nothing by itself", async () => {
    weather.get.mockResolvedValue(HOT_DAY);
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
    expect(heatLine(HOT_DAY)).toBe(HOT_LINE);
    expect(
      within(strip)
        .queryAllByText(HEAT_WORDS)
        .map((line) => line.textContent)
    ).toEqual([HOT_LINE]);

    fireEvent.click(screen.getByRole("button", { name: "Start easy run" }));
    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({ target: PACE_TARGET })
    );
    expect(onStart.mock.calls[0][0]).not.toHaveProperty("heatAdjustment");
  });

  it("below hot, says nothing about heat", async () => {
    // 22°C at 40%: 118°F, the T+DP table's 0.5–1% band, which is not hot.
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
    expect(screen.queryByRole("note", { name: "Hot day" })).toBeNull();
  });
});

describe("RunSetupModal — a planned run's heat offer", () => {
  beforeEach(() => weather.get.mockResolvedValue(HOT_DAY));

  it("offers the adjustment under the strip, saying it once, and starts the plan's session without it", async () => {
    const onStart = plannedTempo();
    const note = await screen.findByRole("note", { name: "Hot day" });
    expect(within(note).getByText(HOT_LINE)).toBeInTheDocument();
    // The strip leaves the line to the offer.
    expect(screen.getAllByText(HOT_LINE)).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Start Tempo 30" }));
    expect(onStart.mock.calls[0][0]).toMatchObject({
      activityType: "tempo",
      target: PACE_TARGET,
    });
    expect(onStart.mock.calls[0][0]).not.toHaveProperty("heatAdjustment");
  });

  it("adjusts the session for heat: its eased paces, carried with the run", async () => {
    const onStart = plannedTempo();
    const note = await screen.findByRole("note", { name: "Hot day" });
    fireEvent.click(
      within(note).getByRole("button", { name: "Adjust for heat" })
    );
    expect(
      within(note).getByText("Adjusted for heat: work at 5:18–5:24 /km.")
    ).toBeInTheDocument();
    // Still the planned session, adjusted.
    fireEvent.click(screen.getByRole("button", { name: "Start Tempo 30" }));
    const started = onStart.mock.calls[0][0];
    expect(started.target).toEqual({ type: "pace", value: 321 });
    expect(started.segments).toEqual(OFFER.prefill!.segments);
    expect(started.heatAdjustment).toEqual({ from: 0.06, to: 0.08 });
  });

  it("clears the adjustment back to the plan's session", async () => {
    const onStart = plannedTempo();
    const note = await screen.findByRole("note", { name: "Hot day" });
    fireEvent.click(
      within(note).getByRole("button", { name: "Adjust for heat" })
    );
    fireEvent.click(
      within(note).getByRole("button", { name: "Clear adjustment" })
    );
    expect(
      within(note).queryByText(/^Adjusted for heat/)
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Start Tempo 30" }));
    const started = onStart.mock.calls[0][0];
    expect(started.target).toEqual(PACE_TARGET);
    expect(started.segments).toEqual(PLANNED_TEMPO.segments);
    expect(started).not.toHaveProperty("heatAdjustment");
  });

  it("swaps the tempo for an easy run of its minutes, which Start then starts", async () => {
    const onStart = plannedTempo();
    const note = await screen.findByRole("note", { name: "Hot day" });
    expect(
      within(note).getByText("Or run easy for the same 45 min.")
    ).toBeInTheDocument();
    fireEvent.click(
      within(note).getByRole("button", { name: "Switch to easy" })
    );
    // The offer has had its answer.
    expect(
      screen.queryByRole("button", { name: "Switch to easy" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Adjust for heat" })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Start easy run" }));
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

  it("swaps a long run's race-pace finish for easy running", async () => {
    const onStart = vi.fn();
    render(
      <RunSetupModal
        onStart={onStart}
        onCancel={vi.fn()}
        savedPreferences={{
          activityType: "long",
          target: { type: "distance", value: 16000 },
          segments: PLANNED_TEMPO.segments,
        }}
        sessionName="Long 16K"
        heat={{
          ...OFFER,
          adjustment: null,
          prefill: null,
          swapMinutes: null,
          longSwap: true,
        }}
      />
    );
    const note = await screen.findByRole("note", { name: "Hot day" });
    expect(
      within(note).getByText("Or run it all at an easy pace.")
    ).toBeInTheDocument();
    fireEvent.click(
      within(note).getByRole("button", { name: "Run it all easy" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Start long run" }));
    const started = onStart.mock.calls[0][0];
    expect(started.activityType).toBe("long");
    expect(started.target).toEqual({ type: "distance", value: 16000 });
    expect(started).not.toHaveProperty("segments");
  });
});
