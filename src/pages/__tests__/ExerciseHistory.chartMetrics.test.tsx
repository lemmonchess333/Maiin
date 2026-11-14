import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { addLocalDays, localDateString } from "@/lib/dateHelpers";

const h = vi.hoisted(() => ({
  workouts: [] as unknown[],
  unit: "kg" as "kg" | "lbs",
  pro: true,
  track: vi.fn(),
}));
vi.mock("@/lib/subscription", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/subscription")>()),
  useSubscription: () => ({ isPro: h.pro }),
}));
vi.mock("@/lib/paywallAnalytics", () => ({ track: h.track }));
vi.mock("@/hooks/useWorkouts", () => ({
  useWorkouts: () => ({ workouts: h.workouts, loading: false }),
}));
vi.mock("@/hooks/useLiftUnit", () => ({ useLiftUnit: () => h.unit }));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  },
}));
vi.mock("@/components/analytics/ExerciseProgressChart", () => ({
  default: (props: unknown) => (
    <output data-testid="exercise-chart">{JSON.stringify(props)}</output>
  ),
}));

import ExerciseHistory from "../ExerciseHistory";

function session(
  id: string,
  daysAgo: number,
  weightKg: number,
  reps: number,
  count = 1,
  name = "Bench Press"
) {
  const date = addLocalDays(new Date(), -daysAgo);
  return {
    id,
    date: localDateString(date),
    createdAt: date,
    exercises: [
      {
        exerciseName: name,
        sets: Array.from({ length: count }, () => ({ weightKg, reps })),
      },
    ],
  };
}

beforeEach(() => {
  h.unit = "kg";
  h.pro = true;
  h.track.mockClear();
  const repeated = session("volume", 2, 95, 2, 2);
  repeated.exercises.push({ ...repeated.exercises[0] });
  h.workouts = [
    session("old", 120, 100, 1),
    session("reps", 3, 90, 5),
    repeated,
    session("latest", 1, 82.5, 15),
  ];
});

async function open(name = "Bench Press") {
  render(
    <MemoryRouter
      initialEntries={[`/history/exercise/${encodeURIComponent(name)}`]}
    >
      <Routes>
        <Route path="/history/exercise/:name" element={<ExerciseHistory />} />
        <Route path="/upgrade" element={<p>Pro page</p>} />
      </Routes>
    </MemoryRouter>
  );
  await screen.findByTestId("exercise-chart");
}
function chart() {
  return JSON.parse(screen.getByTestId("exercise-chart").textContent ?? "{}");
}
function select(metric: string) {
  const label = metric === "1RM" ? "Est. 1RM" : metric;
  fireEvent.click(
    screen.queryByRole("radio", { name: label }) ??
      screen.getByRole("button", { name: metric })
  );
}

describe("charts older than 3 months are Pro (whole-app grill Q84)", () => {
  it("a free account's long ranges carry a lock and open Pro, not the chart", async () => {
    h.pro = false;
    await open();
    for (const range of ["6M", "1Y", "All"]) {
      expect(
        screen.getByRole("radio", { name: `${range}, Pro` })
      ).toBeInTheDocument();
    }
    expect(screen.getByRole("radio", { name: "3M" })).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: "All, Pro" }));
    expect(h.track).toHaveBeenCalledWith("paywall_cta_clicked", {
      source: "history",
    });
    expect(await screen.findByText("Pro page")).toBeInTheDocument();
  });

  it("Pro sees every range with no lock", async () => {
    await open();
    expect(screen.getByRole("radio", { name: "All" })).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /, Pro$/ })).toBeNull();
  });
});

describe("exercise chart metric records", () => {
  it("keeps a weight best outside the selected range in the record comparison", async () => {
    await open();
    select("Max Weight");
    expect(chart().data.map((p: { isPR: boolean }) => p.isPR)).toEqual([
      false,
      false,
      false,
    ]);
    fireEvent.click(screen.getByRole("radio", { name: "All" }));
    expect(chart().data.map((p: { isPR: boolean }) => p.isPR)).toEqual([
      true,
      false,
      false,
      false,
    ]);
  });

  it("counts every matching exercise entry and marks volume records independently of estimated strength", async () => {
    await open();
    select("Volume");
    expect(chart().data.map((p: { value: number }) => p.value)).toEqual([
      450, 760, 1237.5,
    ]);
    expect(chart().data.map((p: { isPR: boolean }) => p.isPR)).toEqual([
      true,
      true,
      true,
    ]);
    select("1RM");
    expect(chart().data.map((p: { isPR: boolean }) => p.isPR)).toEqual([
      true,
      false,
      true,
    ]);
  });

  it("keeps fractional loads and the same record decisions in pounds", async () => {
    h.unit = "lbs";
    await open();
    select("Max Weight");
    expect(chart().data.at(-1).value).toBe(181.9);
    expect(chart().unit).toBe("lb");
    expect(chart().data.every((p: { isPR: boolean }) => !p.isPR)).toBe(true);
  });

  it("records bodyweight reps and does not award a record for zero added-load volume", async () => {
    h.workouts = [
      session("old", 120, 0, 8, 1, "Push-Ups"),
      session("more", 3, 0, 10, 1, "Push-Ups"),
      session("less", 2, 0, 6, 1, "Push-Ups"),
      session("best", 1, 0, 12, 1, "Push-Ups"),
    ];
    await open("Push-Ups");
    expect(chart().data.map((p: { isPR: boolean }) => p.isPR)).toEqual([
      true,
      false,
      true,
    ]);
    expect(chart().unit).toBe("reps");
    select("Volume");
    expect(chart().data.every((p: { isPR: boolean }) => !p.isPR)).toBe(true);
  });

  it("uses the longest hold for timed records", async () => {
    h.workouts = [
      session("old", 120, 0, 30, 1, "Plank"),
      session("long", 3, 0, 40, 1, "Plank"),
      session("short", 2, 0, 35, 1, "Plank"),
      session("longest", 1, 0, 45, 1, "Plank"),
    ];
    await open("Plank");
    expect(chart().data.map((p: { value: number }) => p.value)).toEqual([
      40, 35, 45,
    ]);
    expect(chart().data.map((p: { isPR: boolean }) => p.isPR)).toEqual([
      true,
      false,
      true,
    ]);
    expect(chart().unit).toBe("s");
  });

  it("does not mark a tied weight as a new record", async () => {
    h.workouts = [session("old", 120, 100, 1), session("tie", 1, 100, 8)];
    await open();
    select("Max Weight");
    expect(chart().data[0].isPR).toBe(false);
  });

  it("reads the chosen metric's latest point against its first in the range", async () => {
    await open();
    select("Max Weight");
    // 90 kg three days ago, 82.5 kg yesterday; the 120-day-old session
    // is outside the 3-month range.
    expect(screen.getByTestId("chart-reading").textContent).toMatch(
      /^Down 7\.5\skg since \d{1,2}\s\w{3,4}\.$/
    );
  });

  it("announces the metric selection and moves it with the keyboard", async () => {
    await open();
    const group = screen.getByRole("radiogroup", {
      name: "Progression metric",
    });
    const estimate = within(group).getByRole("radio", { name: "Est. 1RM" });
    expect(estimate).toHaveAttribute("aria-checked", "true");
    estimate.focus();
    fireEvent.keyDown(estimate, { key: "End" });
    const volume = within(group).getByRole("radio", { name: "Volume" });
    expect(volume).toHaveFocus();
    expect(volume).toHaveAttribute("aria-checked", "true");
    await waitFor(() =>
      expect(chart().data.every((p: { isPR: boolean }) => p.isPR)).toBe(true)
    );
  });
});
