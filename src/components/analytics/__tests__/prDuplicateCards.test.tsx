import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import PRsTab from "../PRsTab";

/**
 * Two things this tab owed its readers, both visible in the rich capture.
 *
 * It printed every record twice for anyone whose history fits inside the
 * 30-day window — which is every user for their first month. "Running
 * PRs" and "Recent bests" held the same two rows; "Lift PRs" and its own
 * "Recent bests" held the same three. The second card now appears only
 * once it has something to add, and the single card's subtitle says the
 * records are both the all-time bests and the recent ones rather than
 * quietly dropping half the claim.
 *
 * And every lift row opened its exercise history while the running rows,
 * each of which IS a specific saved run, sat inert. They route now.
 *
 * `samePRSet` is unit-tested on its own; these are the assertions that
 * the TAB uses it, which a pure test of the helper cannot make.
 */

/** The shape the tab renders. `runId` is optional because an empty
 *  bucket renders a "--" placeholder that names no run. */
interface RunningRowFixture {
  label: string;
  value: string;
  date: string;
  runId?: string;
}

const paceRow: RunningRowFixture = {
  label: "Best pace",
  value: "5:32 /km",
  date: "23 Aug",
  runId: "run-pace",
};
const longestRow: RunningRowFixture = {
  label: "Longest run",
  value: "8.0 km",
  date: "8 Sept",
  runId: "run-longest",
};
const bench = { name: "Bench Press", weight: 80, reps: 8, date: "2026-09-19" };

function renderTab(overrides: {
  lifetime?: RunningRowFixture[];
  recent30d?: RunningRowFixture[];
  lifetimePRs?: (typeof bench)[];
  recentLiftPRs?: (typeof bench)[];
}) {
  const lifetime = overrides.lifetime ?? [];
  const recent30d = overrides.recent30d ?? [];
  return render(
    <MemoryRouter>
      <PRsTab
        runningPRs={{
          lifetime,
          recent30d,
          indoor: [],
          hasAnyIndoor: false,
          hasAnyRecent: recent30d.length > 0,
        }}
        lifetimePRs={overrides.lifetimePRs ?? []}
        recentLiftPRs={overrides.recentLiftPRs ?? []}
        hasAnyLifetimeWorkout={(overrides.lifetimePRs ?? []).length > 0}
        hasAnyLifetimeRun={lifetime.length > 0}
      />
    </MemoryRouter>
  );
}

describe("PRs tab — the duplicate Recent-bests card", () => {
  it("shows one running card, and says it covers both windows", () => {
    renderTab({
      lifetime: [paceRow, longestRow],
      recent30d: [{ ...paceRow }, { ...longestRow }],
    });
    expect(screen.queryByText("Recent bests")).toBeNull();
    expect(
      screen.getByText("All-time and last 30 days · outdoor GPS only")
    ).toBeInTheDocument();
    /* The rows themselves appear once, not twice — the assertion the
       capture would have caught. */
    expect(screen.getAllByText("5:32 /km")).toHaveLength(1);
  });

  it("keeps both running cards once the window holds a better figure", () => {
    renderTab({
      lifetime: [paceRow, longestRow],
      recent30d: [
        { ...paceRow, value: "5:10 /km", date: "18 Sept" },
        longestRow,
      ],
    });
    expect(screen.getByText("Recent bests")).toBeInTheDocument();
    expect(screen.getByText("All-time · outdoor GPS only")).toBeInTheDocument();
  });

  it("shows one lifting card when the same sets hold both records", () => {
    renderTab({ lifetimePRs: [bench], recentLiftPRs: [{ ...bench }] });
    expect(screen.queryByText("Recent bests")).toBeNull();
    expect(screen.getByText("All-time and last 30 days")).toBeInTheDocument();
    expect(screen.getAllByText(/80 kg/)).toHaveLength(1);
  });

  it("keeps both lifting cards when the all-time list is longer", () => {
    renderTab({
      lifetimePRs: [bench, { ...bench, name: "Back Squat", weight: 70 }],
      recentLiftPRs: [bench],
    });
    expect(screen.getByText("Recent bests")).toBeInTheDocument();
    expect(screen.getByText("All-time")).toBeInTheDocument();
  });
});

describe("PRs tab — running rows open the run that holds the record", () => {
  it("routes each row to its own run", () => {
    renderTab({ lifetime: [paceRow, longestRow] });
    expect(
      screen.getByRole("link", { name: /Best pace, 5:32 \/km, 23 Aug/ })
    ).toHaveAttribute("href", "/run/run-pace");
    expect(
      screen.getByRole("link", { name: /Longest run, 8\.0 km, 8 Sept/ })
    ).toHaveAttribute("href", "/run/run-longest");
  });

  it("leaves a row with no run behind it inert", () => {
    /* An empty bucket renders a "--" placeholder. It names no run, so it
       must not offer a tap that goes nowhere. */
    renderTab({
      lifetime: [{ label: "Best pace", value: "--", date: "" }],
    });
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("--")).toBeInTheDocument();
  });
});
