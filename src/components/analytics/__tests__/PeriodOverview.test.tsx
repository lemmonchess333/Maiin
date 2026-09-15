import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import PeriodOverview from "../PeriodOverview";

vi.mock("@/hooks/useDistanceUnit", () => ({
  useDistanceUnit: () => "km",
}));

/**
 * The three summary columns are a number, a progress ring and an icon.
 * Each stat object has carried a `label` since it was written — but the
 * render spent it only as the React `key`, so it reached the screen
 * nowhere. Meaning was left to the glyph: a shoe, a dumbbell and a fork.
 *
 * That is the regression these tests exist to catch. `key={s.label}`
 * looks like a use, so the field reads as rendered when it is not, and a
 * future refactor could drop the visible line without anything failing.
 */
function renderOverview() {
  return render(
    <PeriodOverview
      runCount={4}
      runDistance={21.1}
      liftCount={3}
      liftVolume={12400}
      avgCalories={2143}
      nutritionAdherence={87}
      rangeDays={7}
    />
  );
}

describe("PeriodOverview column labels", () => {
  it("names all three columns in text, not by icon alone", () => {
    renderOverview();
    expect(screen.getByText("Runs")).toBeInTheDocument();
    expect(screen.getByText("Sessions")).toBeInTheDocument();
    expect(screen.getByText("Adherence")).toBeInTheDocument();
  });

  it("renders the label as a word, not in the numeral face", () => {
    // font-mono/tabular-nums are scoped to numeric displays (CLAUDE.md);
    // the number above it keeps them, the label must not.
    renderOverview();
    const label = screen.getByText("Runs");
    expect(label).not.toHaveClass("font-mono");
    expect(label).toHaveClass("text-caption");
  });

  it("truncates the free-text sub-value rather than growing the row", () => {
    // Sub-values are strings like "12.4k vol" / "2,143 kcal/day" in a
    // column a third of a phone card wide.
    renderOverview();
    const sub = screen.getByText("12.4k vol");
    expect(sub).toHaveClass("truncate");
    expect(sub).toHaveClass("font-mono");
  });

  it("still shows each column's number", () => {
    renderOverview();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("87%")).toBeInTheDocument();
  });
});

/**
 * Cold start is the state every new user lands in, and there it is not
 * one dimmed column but three: `isEmpty` is `ringVal === 0`, and a user
 * with no runs, no sessions and no logged meals reads zero on all of
 * them. The dimming used to sit on the whole column, so the number, the
 * label and the sub-line went down with the ring.
 *
 * Measured against the tokens rather than eyeballed. `--muted-foreground`
 * is deliberately tuned to clear 4.5:1 on card, muted and page in both
 * themes and to have no fractional variants — CLAUDE.md bans
 * `text-muted-foreground/<n>` outright, and `tokenContrast.test.ts`
 * enforces that ban on the CLASS. An inline `opacity` on an ancestor is
 * the same thing wearing a different hat, and it is invisible to that
 * guard. At 0.4 the label and sub measure 1.76:1 (light) / 2.15:1
 * (dark); the `text-foreground` number above them 2.72:1 / 3.37:1. No
 * alpha rescues it — 0.8 still reads 3.57:1 in light.
 *
 * So the dimming belongs on the ring, which is decoration: an empty ring
 * is legible as empty, and the word underneath it carries the meaning.
 * These two tests pin BOTH halves — text at full opacity, ring still
 * dimmed — because a fix that simply deleted the de-emphasis would pass
 * the first one alone.
 */
function emptyRunsColumn() {
  render(
    <PeriodOverview
      runCount={0}
      runDistance={0}
      liftCount={3}
      liftVolume={12400}
      avgCalories={2143}
      nutritionAdherence={87}
      rangeDays={7}
    />
  );
  const label = screen.getByText("Runs");
  const column = label.closest("div.flex.flex-col");
  if (!column) throw new Error("column wrapper is gone — retarget this test");
  return { label, column };
}

/** Every inline opacity from `el` up to and including `stop`. */
function opacitiesUpTo(el: HTMLElement, stop: Element): number[] {
  const out: number[] = [];
  let node: HTMLElement | null = el;
  while (node) {
    const raw = node.style.opacity;
    if (raw !== "") out.push(Number(raw));
    if (node === stop) break;
    node = node.parentElement;
  }
  return out;
}

describe("PeriodOverview empty columns", () => {
  it("leaves an empty column's text at full opacity", () => {
    const { label, column } = emptyRunsColumn();
    // The label, the number above it and the em-dash sub below it.
    const number = column.querySelector("p.text-xl");
    const sub = column.querySelector("p.text-xs");
    expect(number?.textContent).toBe("0");
    expect(sub?.textContent).toBe("—");
    for (const el of [label, number, sub]) {
      expect(opacitiesUpTo(el as HTMLElement, column)).toEqual([]);
    }
  });

  it("still dims the empty column's ring", () => {
    const { column } = emptyRunsColumn();
    const ring = column.querySelector("svg");
    if (!ring) throw new Error("ring is gone — retarget this test");
    // On the ring's OWN wrapper, not merely somewhere above it: an
    // ancestor-chain assertion is satisfied by the column-level opacity
    // this change removed, so it would pass the very bug it guards.
    expect((ring.parentElement as HTMLElement).style.opacity).toBe("0.4");
  });

  it("dims nothing in a column that has data", () => {
    const { column } = emptyRunsColumn();
    void column;
    const sessions = screen.getByText("Sessions").closest("div.flex.flex-col");
    if (!sessions) throw new Error("column wrapper is gone");
    const ring = sessions.querySelector("svg");
    expect(opacitiesUpTo(ring?.parentElement as HTMLElement, sessions)).toEqual(
      []
    );
  });
});
