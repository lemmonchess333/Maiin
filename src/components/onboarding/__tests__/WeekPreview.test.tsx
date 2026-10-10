/**
 * The onboarding week preview starts the week where the app does.
 *
 * `schedule` arrives in getDay() order (Sunday first); the preview used
 * to render it as-is, so after the Monday flip it read Sun … Sat beside
 * a Home strip reading Mon … Sun. Order follows WEEK_STARTS_ON; the day
 * indices themselves are untouched (the split indexer keys on them).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import WeekPreview from "../WeekPreview";
import { WEEK_STARTS_ON } from "@/lib/dateHelpers";
import type { ScheduleDay } from "@/lib/scheduleUtils";
import type {
  ProgramExercise,
  ScheduledRunDay,
} from "@/features/program/programTypes";

afterEach(cleanup);

const schedule: ScheduleDay[] = [
  { day: 0, type: "rest" },
  { day: 1, type: "lift" },
  { day: 2, type: "run" },
  { day: 3, type: "lift" },
  { day: 4, type: "rest" },
  { day: 5, type: "lift" },
  { day: 6, type: "run" },
];

describe("WeekPreview — day order", () => {
  it("renders the days from the app's week start, not from Sunday", () => {
    expect(WEEK_STARTS_ON).toBe(1);
    render(<WeekPreview schedule={schedule} />);
    const labels = screen
      .getAllByRole("button", { pressed: false })
      .map((b) => b.textContent?.trim().slice(0, 3));
    expect(labels).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
  });

  it("keeps each day's own type — ordering never renumbers", () => {
    render(<WeekPreview schedule={schedule} />);
    expect(
      screen.getByRole("button", { name: "Sun: rest" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Mon: lift" })
    ).toBeInTheDocument();
  });
});

describe("WeekPreview — a session's lifts", () => {
  it("shows a climbing lift's range and a fixed lift's target (Lift4 (3))", () => {
    const lift = (o: Partial<ProgramExercise>) =>
      ({ sets: 3, weight: 0, ...o }) as ProgramExercise;
    render(
      <WeekPreview
        schedule={schedule}
        workouts={[
          {
            dayName: "Full body",
            dayType: "full_body",
            completed: false,
            exercises: [
              lift({
                name: "Bench Press",
                exerciseId: "bench-press",
                reps: 8,
                baseReps: 8,
                repRangeMax: 12,
                progressionType: "double",
              }),
              lift({
                name: "Squat",
                exerciseId: "squat",
                reps: 5,
                baseReps: 5,
                progressionType: "linear",
              }),
            ],
          },
        ]}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Mon: lift" }));
    expect(screen.getByText("Bench Press").parentElement).toHaveTextContent(
      "3 × 8–12 reps"
    );
    expect(screen.getByText("Squat").parentElement).toHaveTextContent(
      "3 × 5 reps"
    );
  });
});

/* Run21 (5): a run states its time; a long run its distance (its name
   says it), and its minutes only at a confirmed pace. "Long 15K · 80 min"
   assumed 5:20 /km. */
describe("WeekPreview — a run's minutes", () => {
  const runOn = (templateId: string) =>
    ({
      id: `runday_${templateId}`,
      dayIndex: 6,
      // A Saturday: the preview finds the run by its date's weekday.
      date: "2026-10-10",
      weekKey: "2026-10-05",
      templateId,
      type: "long",
      completed: false,
      status: "planned",
    }) as ScheduledRunDay;
  const open = (templateId: string, easyPaceSPerKm?: number | null) => {
    const view = render(
      <WeekPreview
        schedule={schedule}
        runDays={[runOn(templateId)]}
        easyPaceSPerKm={easyPaceSPerKm}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Sat: run" }));
    return view;
  };
  // Numerals sit in their own spans; read the heading whole.
  const heading = () =>
    screen.getByRole("heading", { level: 3 }).textContent ?? "";

  it("names a long run without minutes that aren't the runner's", () => {
    open("long_15k");
    expect(heading()).toBe("Long 15K");
  });

  it("gives a long run its minutes at a confirmed pace", () => {
    open("long_15k", 400);
    expect(heading()).toBe("Long 15K · about 100 min");
  });

  it("states a timed run's time", () => {
    open("easy_40");
    expect(heading()).toBe("Easy 40 · 40 min");
  });
});
