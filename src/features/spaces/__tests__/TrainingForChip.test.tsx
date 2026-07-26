/**
 * TrainingForChip (SOC-P2f) — the display gate IS the safety net for
 * the self-declared public `trainingForSpaceId` field. The rules gate
 * values to known space ids; everything else is enforced HERE, so
 * these pins are load-bearing:
 *   - unknown ids, interest-space ids → nothing (never a lie)
 *   - past races → nothing (stale identity self-heals visually)
 *   - upcoming races → chip + honest weeks-out ("race week" at 0)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const mockOverrides = vi.fn<() => Record<string, object>>(() => ({}));
vi.mock("../raceEventOverrides", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../raceEventOverrides")>();
  return {
    ...actual,
    useRaceEventOverrides: () => mockOverrides(),
  };
});

import TrainingForChip from "../TrainingForChip";
import { SPACE_DEFS } from "../spaceDefs";

const raceDef = SPACE_DEFS.find((d) => d.kind === "race" && d.event)!;
const interestDef = SPACE_DEFS.find((d) => d.kind === "interest")!;

function renderChip(spaceId: string) {
  return render(
    <MemoryRouter>
      <TrainingForChip spaceId={spaceId} />
    </MemoryRouter>
  );
}

function isoDaysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => mockOverrides.mockReturnValue({}));

describe("TrainingForChip — display gate", () => {
  it("renders for an upcoming race with weeks-out", () => {
    mockOverrides.mockReturnValue({
      [raceDef.id]: { dateKey: isoDaysFromNow(21) },
    });
    renderChip(raceDef.id);
    const link = screen.getByRole("link");
    expect(link.textContent).toContain(`Training for ${raceDef.name}`);
    expect(link.textContent).toContain("3 wks");
    expect(link).toHaveAttribute("href", `/space/${raceDef.id}`);
  });

  it("says 'race week' inside the final week", () => {
    mockOverrides.mockReturnValue({
      [raceDef.id]: { dateKey: isoDaysFromNow(3) },
    });
    renderChip(raceDef.id);
    expect(screen.getByRole("link").textContent).toContain("race week");
  });

  it("renders NOTHING once the race date has passed (stale value self-heals)", () => {
    mockOverrides.mockReturnValue({
      [raceDef.id]: { dateKey: isoDaysFromNow(-1) },
    });
    renderChip(raceDef.id);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("renders NOTHING for an interest-space id", () => {
    renderChip(interestDef.id);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("renders NOTHING for an unknown id", () => {
    renderChip("not-a-space");
    expect(screen.queryByRole("link")).toBeNull();
  });
});
