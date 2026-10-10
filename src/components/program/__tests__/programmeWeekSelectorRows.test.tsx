/**
 * The Train strip's bottom label needs a row of its own, reserved.
 *
 * Rest days pass `bottomLabel: ""`, so without a floor the span collapsed:
 * cells carrying a run distance were taller than cells without, the strip's
 * height moved with the week's shape, and a lone "12K" hung under one day
 * off a row nothing else occupied. Home's indicator row has had a fixed
 * height for exactly this reason.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render } from "@testing-library/react";
import ProgrammeWeekSelector from "@/components/program/ProgrammeWeekSelector";
import type { ProgrammeWeekSelectorCell } from "@/components/program/ProgrammeWeekSelector";

vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

const LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

/** One run on the Wednesday, rest everywhere else — the shape in which the
 *  orphaned label showed up. */
const cells: ProgrammeWeekSelectorCell[] = LETTERS.map((letter, i) => ({
  key: `2026-09-0${i + 6}`,
  topLabel: letter,
  center: String(6 + i),
  bottomLabel: i === 3 ? "12K" : "",
  status: i === 3 ? "upcoming" : "rest",
  isToday: i === 5,
}));

function renderSelector() {
  return render(
    <ProgrammeWeekSelector
      sport="run"
      ariaLabel="Run days"
      cells={cells}
      selectedKey={cells[5].key}
      onSelect={vi.fn()}
    />
  );
}

function bottomLabels(container: HTMLElement) {
  return Array.from(container.querySelectorAll("span[data-cell-label]"));
}

describe("the bottom-label row", () => {
  it("reserves its height on every cell, labelled or not", () => {
    const { container } = renderSelector();
    expect(bottomLabels(container)).toHaveLength(7);
  });

  it("still renders the label it has", () => {
    // Guards against "fixing" the orphan by dropping the label entirely.
    const { container } = renderSelector();
    const texts = bottomLabels(container).map((s) => s.textContent);
    expect(texts.filter(Boolean)).toEqual(["12K"]);
  });
});

describe("a run's name on the strip (Run21 (2))", () => {
  // The strip names the session. One line held "Easy 30" and cut "Easy 30 +
  // strides" to "Easy 3…", so a run's name takes two lines. Each line ends
  // in "…" on its own: wrapped and clamped, a word too wide for a narrow
  // cell ("Intervals") was cut off bare, and hyphenated it split mid-word.
  // A lift's split name keeps its one line.
  function labelFor(sport: "run" | "lift", bottomLabel: string) {
    const { container, unmount } = render(
      <ProgrammeWeekSelector
        sport={sport}
        ariaLabel="Days"
        cells={[{ ...cells[3], bottomLabel }]}
        selectedKey={cells[3].key}
        onSelect={vi.fn()}
      />
    );
    const span = container.querySelector("span[data-cell-label]")!;
    const tab = container.querySelector("[role=tab]")!;
    const result = {
      className: span.className,
      text: span.textContent,
      lines: Array.from(span.children).map((line) => ({
        text: line.textContent,
        className: line.className,
      })),
      tabName: tab.getAttribute("aria-label"),
    };
    unmount();
    return result;
  }

  it("sets a run's name on two lines, each ending in '…' when it doesn't fit", () => {
    const run = labelFor("run", "Easy 30 + strides");
    expect(run.lines.map((l) => l.text)).toEqual(["Easy 30", "+ strides"]);
    for (const line of run.lines) {
      expect(line.className).toMatch(/\btruncate\b/);
      expect(line.className).toMatch(/\bblock\b/);
    }
    // Neither hyphenated nor clamped by line: either cuts a word.
    expect(run.className).not.toMatch(/hyphens|line-clamp/);
    // Two lines' height, whatever the day holds.
    expect(run.className).toMatch(/\bmin-h-7\b/);
    // The tab's name is the whole name, whatever the strip shows.
    expect(run.tabName).toBe("Easy 30 + strides");
  });

  it("keeps a lift's split name to one line", () => {
    const lift = labelFor("lift", "Deadlift");
    expect(lift.className).toMatch(/\btruncate\b/);
    expect(lift.className).toMatch(/\bblock\b/);
    expect(lift.className).toMatch(/\bmin-h-4\b/);
    expect(lift.text).toBe("Deadlift");
    expect(lift.lines).toEqual([]);
  });
});

describe("the weekday row", () => {
  it("shows one letter per day", () => {
    const { container } = renderSelector();
    const tops = Array.from(
      container.querySelectorAll("span.text-caption.text-muted-foreground")
    ).map((s) => s.textContent ?? "");
    expect(tops).toHaveLength(7);
    for (const t of tops) expect(t).toHaveLength(1);
  });
});

describe("today's cell", () => {
  // Today used to render at 48px against 40px peers (a rule inherited from
  // a `DayStepper` that no longer exists). A taller cell pushes its own
  // weekday letter and bottom label off the row's baselines on the one day
  // a user looks at most, and Home's strip already held the opposite rule:
  // today is a colour and a soft halo, never a geometry.
  it("is the same size as its peers — today is a colour and a halo, not a geometry", () => {
    const { container } = renderSelector();
    const circles = Array.from(
      container.querySelectorAll<HTMLElement>(
        "button[role=tab] > div.rounded-full"
      )
    );
    expect(circles).toHaveLength(7);
    const widths = circles.map((c) => c.style.width);
    expect(new Set(widths).size).toBe(1);
    expect(widths[5]).toBe("40px");
  });

  it("has no second size to drift to", () => {
    // The size is a plain `style`, not a Motion `animate` value, so the
    // render above is the real geometry rather than a pre-tween frame; this
    // guards the other direction — a per-state diameter creeping back in.
    const src = readFileSync(
      resolve(__dirname, "../ProgrammeWeekSelector.tsx"),
      "utf8"
    );
    expect(src).not.toMatch(/diameter/);
    expect(src).toMatch(/const CELL_PX = 40;/);
    expect(src).not.toMatch(/animate=\{\{[^}]*width/s);
  });
});
