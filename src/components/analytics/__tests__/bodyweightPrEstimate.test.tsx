import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import PRsTab from "../PRsTab";
import { EXERCISES } from "@/lib/exercises";
import { estimate1RMRange, formatOneRepMaxRange } from "@/lib/analytics";

/**
 * A bodyweight lift's stored `weight` is the ADDED load — the belt, not
 * the lifter. Epley over that figure alone produces a kilogram number
 * that is not a one-rep max of anything, and the row rendered it as one:
 * "+20 kg x 5" with "~21-26 kg 1RM" directly beneath, the plus that
 * marked the currency dropped in the second line.
 *
 * `ExerciseHistory`, one tap away through this row's own link, offers a
 * bodyweight exercise only Reps and Volume — no 1RM at all. These tests
 * hold the two surfaces to the same answer, and keep the loaded lifts
 * that DO have a one-rep max showing theirs.
 */

const BODYWEIGHT = "Weighted Push-Ups";
const LOADED = "Bench Press";

function renderPRs(prs: { name: string; weight: number; reps: number }[]) {
  return render(
    <MemoryRouter>
      <PRsTab
        runningPRs={{
          lifetime: [],
          recent30d: [],
          indoor: [],
          hasAnyIndoor: false,
          hasAnyRecent: false,
        }}
        lifetimePRs={prs.map((p) => ({ ...p, date: "2026-09-01" }))}
        recentLiftPRs={[]}
        hasAnyLifetimeWorkout
        hasAnyLifetimeRun={false}
      />
    </MemoryRouter>
  );
}

describe("bodyweight PR rows carry no one-rep-max estimate", () => {
  it("the fixtures are the equipment classes this test claims", () => {
    // If either name were reclassified the assertions below would pass
    // for the wrong reason — a suppressed estimate on a lift that never
    // had one, or a shown estimate on a row nothing exercises.
    expect(EXERCISES.find((e) => e.name === BODYWEIGHT)?.equipment).toBe(
      "Bodyweight"
    );
    expect(EXERCISES.find((e) => e.name === LOADED)?.equipment).not.toBe(
      "Bodyweight"
    );
  });

  it("shows no estimate for a WEIGHTED bodyweight record", () => {
    renderPRs([{ name: BODYWEIGHT, weight: 20, reps: 5 }]);
    // The record itself still renders in full.
    expect(screen.getByText(/\+20 kg/)).toBeInTheDocument();
    expect(screen.queryByText(/1RM/)).not.toBeInTheDocument();
  });

  it("does not print the band the estimator would have produced", () => {
    // Pinned against the helper's real output rather than a literal, so
    // the test still bites if the Epley spread is retuned.
    const band = formatOneRepMaxRange(estimate1RMRange(20, 5)!);
    renderPRs([{ name: BODYWEIGHT, weight: 20, reps: 5 }]);
    expect(screen.queryByText(new RegExp(band))).not.toBeInTheDocument();
  });

  it("shows no estimate for an unweighted bodyweight record", () => {
    renderPRs([{ name: BODYWEIGHT, weight: 0, reps: 25 }]);
    expect(screen.getByText(/BW/)).toBeInTheDocument();
    expect(screen.queryByText(/1RM/)).not.toBeInTheDocument();
  });

  it("still shows the estimate for a loaded lift", () => {
    // The suppression is scoped to bodyweight equipment. A barbell PR is
    // exactly the case the estimate was written for.
    renderPRs([{ name: LOADED, weight: 100, reps: 5 }]);
    expect(screen.getByText(/1RM/)).toBeInTheDocument();
  });

  it("suppresses only the bodyweight row when both are listed", () => {
    renderPRs([
      { name: BODYWEIGHT, weight: 20, reps: 5 },
      { name: LOADED, weight: 100, reps: 5 },
    ]);
    expect(screen.getAllByText(/1RM/)).toHaveLength(1);
  });
});
