import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import MuscleVolumeCard from "../MuscleVolumeCard";
import type { MuscleWeekVolume } from "@/lib/performedVolume";
import {
  classifyVolume,
  judgementLandmark,
  type JudgementMuscle,
} from "@/features/program/volumeModel";

/**
 * Sets per muscle (DS3): the sets a user did each week against the range
 * their focus aims for. Below is the finding and says so first; above is
 * information, not alarm.
 */

const GOAL = "hypertrophy";
function row(muscle: JudgementMuscle, setsPerWeek: number): MuscleWeekVolume {
  const landmark = judgementLandmark(GOAL, muscle);
  return {
    muscle,
    setsPerWeek,
    landmark,
    status: classifyVolume(setsPerWeek, landmark),
  };
}

describe("MuscleVolumeCard", () => {
  it("leads with the muscles below their range, by name", () => {
    render(
      <MuscleVolumeCard
        rows={[row("Chest", 14), row("SideDelts", 3), row("Calves", 0)]}
        weeks={3}
        focus="Build muscle"
      />
    );
    expect(
      screen.getByText("Below range: side delts, calves")
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /A week, averaged over 3 full weeks\. Your focus: Build muscle\./
      )
    ).toBeInTheDocument();
  });

  it("counts them rather than listing a long run of names", () => {
    render(
      <MuscleVolumeCard
        rows={[
          row("Chest", 4),
          row("SideDelts", 3),
          row("Calves", 0),
          row("Abs", 0),
        ]}
        weeks={3}
        focus="Build muscle"
      />
    );
    expect(screen.getByText("4 muscles below their range")).toBeInTheDocument();
  });

  it("says so when every muscle is in its range", () => {
    render(
      <MuscleVolumeCard
        rows={[row("Chest", 14), row("Lats", 12)]}
        weeks={2}
        focus="Build muscle"
      />
    );
    expect(
      screen.getByText("Every muscle is in its range")
    ).toBeInTheDocument();
  });

  it("marks below and above in words, and in range with none", () => {
    const { container } = render(
      <MuscleVolumeCard
        rows={[row("Chest", 14), row("SideDelts", 3), row("Quads", 30)]}
        weeks={2}
        focus="Build muscle"
      />
    );
    expect(screen.getByText("Below")).toBeInTheDocument();
    expect(screen.getByText("Above")).toBeInTheDocument();
    const statuses = [...container.querySelectorAll("[data-status]")].map((d) =>
      d.getAttribute("data-status")
    );
    expect(statuses).toEqual(["optimal", "low", "high"]);
  });

  it("gives each row a sentence a screen reader can read", () => {
    render(
      <MuscleVolumeCard
        rows={[row("SideDelts", 3.5)]}
        weeks={2}
        focus="Build muscle"
      />
    );
    const { low, high } = judgementLandmark(GOAL, "SideDelts");
    expect(
      screen.getByText(
        `Side delts: 3.5 sets a week, below range of ${low} to ${high}`
      )
    ).toBeInTheDocument();
  });

  it("names one week as a week, not an average", () => {
    render(
      <MuscleVolumeCard
        rows={[row("Chest", 10)]}
        weeks={1}
        focus="Get stronger"
      />
    );
    expect(screen.getByText(/^Your last full week\./)).toBeInTheDocument();
  });

  it("waits for a first full week rather than averaging a part", () => {
    render(<MuscleVolumeCard rows={[]} weeks={0} focus="Build muscle" />);
    expect(screen.getByText("After your first full week")).toBeVisible();
  });
});
