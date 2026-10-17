/**
 * Home's run card draws a runner at the right, as the lift card draws the
 * session's lead lift: the fast stride for a tempo, intervals or a race,
 * the easy one for the rest.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import RunCTACard from "../RunCTACard";
import type { ScheduledRunDay } from "@/features/program/runScheduler";

vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/homeAnalytics", () => ({ track: vi.fn() }));

afterEach(cleanup);

function runDay(templateId: string, type: ScheduledRunDay["type"]) {
  return {
    id: `runday_${templateId}`,
    dayIndex: 2,
    templateId,
    type,
    completed: false,
    status: "planned",
    date: "2026-05-12",
    weekKey: "2026-05-10",
  } as ScheduledRunDay;
}

function runner(container: HTMLElement) {
  return container.querySelector("img");
}

describe("RunCTACard — the runner", () => {
  it("draws the fast stride for a tempo run", () => {
    const { container } = render(
      <RunCTACard
        unit="km"
        todayRun={runDay("tempo_20", "tempo")}
        navigate={vi.fn()}
      />
    );
    expect(runner(container)?.getAttribute("src")).toMatch(
      /\/form-art\/run-fast\.webp$/
    );
  });

  it("draws the easy stride for an easy run and for a free run", () => {
    const { container } = render(
      <RunCTACard
        unit="km"
        todayRun={runDay("easy_30", "easy")}
        navigate={vi.fn()}
      />
    );
    expect(runner(container)?.getAttribute("src")).toMatch(
      /\/form-art\/run-easy\.webp$/
    );
    cleanup();
    const free = render(
      <RunCTACard unit="km" todayRun={null} navigate={vi.fn()} />
    );
    expect(runner(free.container)?.getAttribute("src")).toMatch(
      /\/form-art\/run-easy\.webp$/
    );
  });

  it("keeps the runner from screen readers and in place of the icon tile", () => {
    const { container } = render(
      <RunCTACard
        unit="km"
        todayRun={runDay("easy_30", "easy")}
        navigate={vi.fn()}
      />
    );
    const image = runner(container)!;
    expect(image).toHaveAttribute("alt", "");
    expect(image).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("img")).toBeNull();
    // The type's glyph tile is gone: the only drawing is in Start.
    expect(container.querySelectorAll("svg")).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: "Start run" }).querySelector("svg")
    ).not.toBeNull();
  });
});
