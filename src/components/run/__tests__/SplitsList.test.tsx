import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SplitsList } from "../RunBottomSheet";
import { THEME } from "@/lib/theme";
import type { Split } from "@/lib/gps";

/**
 * The middle detent exists to show these rows, and the capture rig can
 * never film them: the CI walk is 150m and a split needs a full km, so
 * the frames show the designed sub-first-lap state instead. The rows
 * branch is pinned here — the exact inversion D24's history warns about
 * (its predecessor detent shipped unfilmed AND untested, and rendered
 * nothing for months).
 */

function split(km: number, paceSeconds: number): Split {
  return { km, paceSeconds } as Split;
}

/** jsdom normalises inline colours to "rgb(r, g, b)". */
function rgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

const SEVEN: Split[] = [
  split(1, 340),
  split(2, 331),
  split(3, 322), // best
  split(4, 335),
  split(5, 350),
  split(6, 344),
  split(7, 338),
];

describe("SplitsList — the middle detent's content", () => {
  it("caps at the last five with an honest header, newest first", () => {
    render(<SplitsList splits={SEVEN} distance={7400} unit="km" />);
    expect(screen.getByText("SPLITS · LAST 5 OF 7")).toBeInTheDocument();
    // Laps 1-2 fell off the cap; 3-7 remain, newest (7) rendered first.
    const laps = screen.getAllByText(/^km \d$/).map((el) => el.textContent);
    expect(laps).toEqual(["km 7", "km 6", "km 5", "km 4", "km 3"]);
  });

  it("marks the best lap with the teal the expanded strip already uses", () => {
    render(<SplitsList splits={SEVEN} distance={7400} unit="km" />);
    // Lap 3 (5:22) is the best pace in the fixture.
    const best = screen.getByText("5:22");
    expect(best.style.color).toBe(rgb(THEME.teal));
    // A non-best lap does not carry it.
    const ordinary = screen.getByText("5:38");
    expect(ordinary.style.color).not.toBe(rgb(THEME.teal));
  });

  it("shows a signed pace delta vs the previous lap, green when faster", () => {
    render(<SplitsList splits={SEVEN} distance={7400} unit="km" />);
    // Laps 7 and 6 are each 6s faster than the lap before → −0:06 twice,
    // both in success green.
    const faster = screen.getAllByText("−0:06");
    expect(faster).toHaveLength(2);
    for (const el of faster) expect(el.style.color).toBe(rgb(THEME.success));
    // Lap 5 (350) vs lap 4 (335): 15s slower → +0:15, muted (not green).
    const slower = screen.getByText("+0:15");
    expect(slower.style.color).not.toBe(rgb(THEME.success));
  });

  it("plain header (no cap note) at five or fewer splits", () => {
    render(<SplitsList splits={SEVEN.slice(0, 3)} distance={3200} unit="km" />);
    expect(screen.getByText("SPLITS")).toBeInTheDocument();
    expect(screen.queryByText(/LAST 5 OF/)).toBeNull();
  });

  it("sub-first-lap state is designed copy, not an empty box — and is unit-aware", () => {
    render(<SplitsList splits={[]} distance={150} unit="km" />);
    expect(screen.getByText("SPLITS APPEAR AFTER EACH KM")).toBeInTheDocument();
    render(<SplitsList splits={[]} distance={150} unit="mi" />);
    expect(
      screen.getByText("SPLITS APPEAR AFTER EACH MILE")
    ).toBeInTheDocument();
  });
});
