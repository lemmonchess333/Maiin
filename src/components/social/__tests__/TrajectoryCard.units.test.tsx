import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import TrajectoryCard from "../TrajectoryCard";
import { LiftUnitContext } from "@/hooks/useLiftUnit";
import type { LiftUnit } from "@/lib/liftLoad";
import type { PersonalTrajectory } from "@/lib/personalTrajectory";
import { groupText } from "@/test/localeGrouping";

/* Lift18: the week's lifting figure is the reader's own, so it reads in
   their unit. Stored as kg. */
const week = (kg: number) => ({ km: 0, kg, score: Math.round(kg * 0.1) });
const data: PersonalTrajectory = {
  thisWeek: week(4500),
  lastWeek: week(4000),
  lastWeekToDate: week(3000),
  deltaPct: 50,
};

const renderIn = (unit: LiftUnit) =>
  render(
    <LiftUnitContext value={unit}>
      <TrajectoryCard data={data} loading={false} />
    </LiftUnitContext>
  );

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
