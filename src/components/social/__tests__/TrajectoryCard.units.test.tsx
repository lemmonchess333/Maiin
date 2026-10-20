import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import TrajectoryCard from "../TrajectoryCard";
import { LiftUnitContext } from "@/hooks/useLiftUnit";
import type { LiftUnit } from "@/lib/liftLoad";
import type { PersonalTrajectory } from "@/lib/personalTrajectory";
import { groupText } from "@/test/localeGrouping";

afterEach(cleanup);

/* Lift18: the week's lifting figure is the reader's own, so it reads in
   their unit. Stored as kg. */
const week = (sessions: number, kg: number) => ({ sessions, km: 0, kg });
const data: PersonalTrajectory = {
  thisWeek: week(3, 4500),
  lastWeek: week(4, 4000),
  lastWeekToDate: week(2, 3000),
  delta: 1,
};

const renderIn = (unit: LiftUnit, trajectory: PersonalTrajectory = data) =>
  render(
    <LiftUnitContext value={unit}>
      <TrajectoryCard data={trajectory} loading={false} />
    </LiftUnitContext>
  );

/* Polish2 call 5: the slot reads in sessions, as the friends board does,
   never in points. */
describe("TrajectoryCard's week", () => {
  it("counts sessions against last week at the same point", () => {
    renderIn("kg");
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("sessions")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /\+1/ })).toBeInTheDocument();
    expect(screen.getByText("4 sessions")).toBeInTheDocument();
    expect(screen.queryByText(/pts/)).toBeNull();
  });

  it("one session is one session, and a level week says so", () => {
    renderIn("kg", {
      thisWeek: week(1, 0),
      lastWeek: week(1, 0),
      lastWeekToDate: week(1, 0),
      delta: 0,
    });
    expect(screen.getByText("session")).toBeInTheDocument();
    expect(screen.getByText("1 session")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Same/ })).toBeInTheDocument();
  });

  it("an empty week asks for the first session, with no delta in red", () => {
    renderIn("kg", {
      thisWeek: week(0, 0),
      lastWeek: week(2, 0),
      lastWeekToDate: week(1, 0),
      delta: -1,
    });
    expect(
      screen.getByText("Start your week — beat last week")
    ).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("TrajectoryCard's lifting figure", () => {
  it("reads in kg by default", () => {
    renderIn("kg");
    expect(screen.getByText(groupText(4500))).toBeInTheDocument();
    expect(screen.getByText("kg")).toBeInTheDocument();
  });

  it("reads in lb for an lb lifter", () => {
    renderIn("lbs");
    // 4,500 kg is 9,921 lb.
    expect(screen.getByText(groupText(9921))).toBeInTheDocument();
    expect(screen.getByText("lb")).toBeInTheDocument();
    expect(screen.queryByText("kg")).not.toBeInTheDocument();
  });
});
