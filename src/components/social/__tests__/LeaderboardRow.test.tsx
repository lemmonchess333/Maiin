import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import LeaderboardRow from "../LeaderboardRow";

/* Both avatars pull real Firestore/block state. The row's layout
   contract is independent of them, so they are stubbed to keep this
   focused on what it claims to test. */
/* The stubs deliberately do NOT render displayName: the real avatars
   don't paint it either (it's alt/fallback text), and echoing it here
   would make `getByText(name)` ambiguous and hide which element actually
   carries the layout classes. */
vi.mock("../../Avatar", () => ({
  default: () => <div data-testid="avatar" />,
}));
vi.mock("../BlockAwareAvatar", () => ({
  default: () => <div data-testid="block-aware-avatar" />,
}));

/**
 * A leaderboard row is scanned right-to-left: people look for the score.
 * Before this, the name was `flex-1 truncate` with no `min-w-0` and the
 * score had neither `shrink-0` nor `whitespace-nowrap` — so a long
 * athlete name pushed the ranked number toward (and past) the right
 * edge. `truncate` cannot prevent that on its own: a flex child's
 * default `min-width` is `auto`, so it refuses to shrink below its
 * content and the overflow happens at the layout step, before
 * `text-overflow` ever applies.
 *
 * The score also matched the name at `text-sm`, so the row had no
 * numeric hierarchy at all.
 */
const LONG_NAME =
  "Bartholomew Fitzgerald-Montgomery the Third of Ashby-de-la-Zouch";

function renderRow(
  overrides: Partial<Parameters<typeof LeaderboardRow>[0]> = {}
) {
  return render(
    <LeaderboardRow
      rank={4}
      uid="u-1"
      name={LONG_NAME}
      value={12480}
      unit="kg"
      isSelf={false}
      {...overrides}
    />
  );
}

describe("LeaderboardRow layout contract", () => {
  it("lets a long athlete name shrink and ellipse rather than push the score out", () => {
    renderRow();
    const name = screen.getByText(LONG_NAME);
    expect(name).toHaveClass("min-w-0");
    expect(name).toHaveClass("flex-1");
    expect(name).toHaveClass("truncate");
  });

  it("holds the score whole — it never shrinks and never wraps", () => {
    renderRow();
    const score = screen.getByText("12,480").closest("span");
    expect(score).toHaveClass("shrink-0");
    expect(score).toHaveClass("whitespace-nowrap");
    expect(score).toHaveClass("font-mono");
    expect(score).toHaveClass("tabular-nums");
  });

  it("makes the score the primary figure in the row by size, not by weight", () => {
    // DESIGN_GUIDE reserves extrabold for hero numbers and page titles,
    // and forbids mixing 700/800 in one visual tier — the rank beside
    // this is 700. Size carries the hierarchy instead.
    renderRow();
    const score = screen.getByText("12,480").closest("span");
    expect(score).toHaveClass("text-body");
    expect(score).not.toHaveClass("font-extrabold");
    expect(score).toHaveClass("font-bold");
  });

  it("keeps the unit secondary to the figure it qualifies", () => {
    renderRow();
    const unit = screen.getByText("kg");
    expect(unit).toHaveClass("text-caption");
    expect(unit).toHaveClass("text-muted-foreground");
    expect(unit).not.toHaveClass("text-body");
  });

  it("preserves the self-row highlight and the medal rank colour", () => {
    // Both are pre-existing behaviour the polish must not disturb: the
    // "you" row is the one a user scans for, and the top-3 medal colour
    // is the row's other scanning cue.
    const { container } = renderRow({
      rank: 1,
      isSelf: true,
      selfInitial: "A",
    });
    const row = container.firstElementChild;
    expect(row).toHaveClass("bg-primary/10");
    expect(row).toHaveClass("border-primary/25");
    expect(row).toHaveClass("min-w-0");
    expect(screen.getByText("1")).toHaveClass("shrink-0");
  });
});
