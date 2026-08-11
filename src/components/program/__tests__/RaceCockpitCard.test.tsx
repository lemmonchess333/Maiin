/**
 * RaceCockpitCard — cockpit identity card contract.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// PROGRAM-CIRCLE-01: the card's "Train together" action navigates —
// mock useNavigate so tests can pin the exact hand-off URL.
const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom"
    );
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

import RaceCockpitCard from "../RaceCockpitCard";

afterEach(cleanup);
beforeEach(() => {
  navigateMock.mockClear();
});

function renderCard(
  props: Partial<React.ComponentProps<typeof RaceCockpitCard>> = {}
) {
  return render(
    <MemoryRouter>
      <RaceCockpitCard
        distanceLabel="Marathon"
        targetDate="2026-10-17"
        daysToRace={140}
        currentWeek={0}
        totalWeeks={20}
        phaseLabel="Base"
        inTaper={false}
        compressed={false}
        onEdit={() => {}}
        {...props}
      />
    </MemoryRouter>
  );
}

describe("RaceCockpitCard", () => {
  it("renders the readable distance as a heading (Marathon, not MARATHON)", () => {
    renderCard();
    const heading = screen.getByRole("heading", { name: "Marathon" });
    expect(heading).toBeInTheDocument();
    expect(screen.queryByText("MARATHON")).not.toBeInTheDocument();
  });

  it("shows the human date and days-out countdown", () => {
    renderCard();
    expect(screen.getByText(/17 Oct 2026/)).toBeInTheDocument();
    expect(screen.getByText(/140 days out/)).toBeInTheDocument();
  });

  it("renders week N of M and the current phase", () => {
    renderCard();
    expect(screen.getByText("1 / 20")).toBeInTheDocument();
    // Phase appears both as the stat value and as the highlighted rail
    // segment, so assert at least one match.
    expect(screen.getAllByText("Base").length).toBeGreaterThan(0);
  });

  it("sizes the progress bar from (currentWeek + 1) / totalWeeks", () => {
    const { container } = renderCard({ currentWeek: 4, totalWeeks: 20 });
    // (4 + 1) / 20 = 25%.
    const fill = container.querySelector(".h-full.rounded-full") as HTMLElement;
    expect(fill).not.toBeNull();
    expect(fill.style.width).toBe("25%");
  });

  it("hides progress + rail when there are no week counters", () => {
    renderCard({ currentWeek: null, totalWeeks: null });
    expect(screen.queryByText(/\d+ \/ \d+/)).not.toBeInTheDocument();
  });

  it("surfaces the compressed-plan note when compressed", () => {
    renderCard({ compressed: true });
    expect(screen.getByText(/Compressed plan/i)).toBeInTheDocument();
  });

  /**
   * RUN-EV-05, applied to the site the 2026-08-09 pass missed.
   *
   * That pass removed the safety promise from `realignCopy.ts`'s below-floor
   * message ("the old finish-safely / train-safely phrasing implied a safety
   * promise") and from this card's below-floor branch. The COMPRESSED branch
   * kept saying "…the long-run progression shortened to keep it safe" — so the
   * product went on promising safety in the one place the message is permanent
   * rather than transient.
   *
   * The sentence was also backwards. In the compressed-but-above-floor band
   * the long-run progression is the STEEPEST in the system, not shortened:
   * racePlanSafetySweep.test.ts measures a six-week marathon stepping
   * 12 km → 25 km in one week (+108%) against 25-33% steps in a full build.
   *
   * Nothing pinned the old string, which is how the site was missed. These two
   * assertions are the guard: the claim must be honest, and no compressed-plan
   * copy may promise safety.
   */
  it("does not promise safety, in either compressed state", () => {
    for (const belowFloor of [false, true]) {
      const { unmount } = renderCard({ compressed: true, belowFloor });
      const body = document.body.textContent ?? "";
      expect(body, `belowFloor=${belowFloor}`).not.toMatch(/keep it safe/i);
      expect(body, `belowFloor=${belowFloor}`).not.toMatch(/safely/i);
      unmount();
    }
  });

  it("says the long-run build is PACKED IN, not shortened", () => {
    renderCard({ compressed: true });
    expect(screen.getByText(/packed into fewer weeks/i)).toBeInTheDocument();
    expect(screen.getByText(/bigger jumps between long runs/i)).toBeInTheDocument();
    expect(document.body.textContent ?? "").not.toMatch(/progression shortened/i);
  });

  /**
   * A below-floor plan ALWAYS also has `compressed: true`, so before
   * 2026-08-04 it fell into the compressed branch and permanently told the
   * user that "interval work is trimmed and the long-run progression
   * shortened". It has no long-run progression to shorten — measured, a
   * marathon 3 weeks out emits `easy_30` x3 in every non-race week. The
   * honest wording existed only in the transient realign toast.
   *
   * Both halves are asserted deliberately: the compressed sentence must be
   * ABSENT, not merely joined by a second one, or the card would say two
   * contradictory things at once.
   */
  it("says mostly-easy, NOT compressed, when the plan is below the floor", () => {
    renderCard({ compressed: true, belowFloor: true });
    expect(screen.getByText(/Mostly-easy plan/i)).toBeInTheDocument();
    expect(screen.queryByText(/Compressed plan/i)).not.toBeInTheDocument();
  });

  it("promises no hard sessions, matching the realign toast", () => {
    // The transient message and the persistent one have to agree — a user
    // who realigns is told "all easy runs, no hard sessions", and the card
    // is what they see every day afterwards.
    renderCard({ compressed: true, belowFloor: true });
    expect(screen.getByText(/no hard sessions/i)).toBeInTheDocument();
    expect(screen.getByText(/finish strong, not to PR/i)).toBeInTheDocument();
  });

  it("calls onEdit when the edit affordance is tapped", () => {
    const onEdit = vi.fn();
    renderCard({ onEdit });
    fireEvent.click(screen.getByRole("button", { name: /Edit race goal/i }));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  /* PROGRAM-CIRCLE-01 (slice 4a) — the hand-off carries EXACTLY the
     space type, a readable title and the race date. Nothing else may
     ever travel (privacy fence). */
  it("Train together navigates with exactly type/title/date params", () => {
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Train together" }));
    expect(navigateMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith(
      "/social?circleCreate=race&circleTitle=Marathon%20training&circleDate=2026-10-17"
    );
  });

  it("Train together renders even without week counters", () => {
    renderCard({ currentWeek: null, totalWeeks: null });
    expect(
      screen.getByRole("button", { name: "Train together" })
    ).toBeInTheDocument();
  });

  /* Races plan PR4 — cockpit → race space cross-link, exact-id (Q4). */
  it("Race community links to the space when the binding resolves", () => {
    renderCard({ raceSpaceId: "london-marathon" });
    fireEvent.click(screen.getByRole("button", { name: /Race community/i }));
    expect(navigateMock).toHaveBeenCalledWith("/space/london-marathon");
  });

  it("no community row without a binding or with an unknown/non-race id", () => {
    renderCard();
    expect(
      screen.queryByRole("button", { name: /Race community/i })
    ).not.toBeInTheDocument();
    cleanup();
    renderCard({ raceSpaceId: "not-a-real-space" });
    expect(
      screen.queryByRole("button", { name: /Race community/i })
    ).not.toBeInTheDocument();
    cleanup();
    // An interest space id must never render as a race community.
    renderCard({ raceSpaceId: "runners" });
    expect(
      screen.queryByRole("button", { name: /Race community/i })
    ).not.toBeInTheDocument();
  });
});
