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
  return Array.from(container.querySelectorAll("span.min-h-4"));
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
