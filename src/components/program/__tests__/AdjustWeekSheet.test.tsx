/**
 * AdjustWeekSheet intent-list contract.
 *
 * Guards the Run13 chip set after the no-op "Keep the plan as is" row was
 * removed (it just dismissed the sheet — sheet dismissal already means "no
 * change", so the row led back to where you started). Pins: exactly the three
 * actionable intents render, the no-op row is gone, and an easier-intent tap
 * still advances to the preview (the removed `keep` branch didn't gate it).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import AdjustWeekSheet from "../AdjustWeekSheet";

vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function setup() {
  const overrideRunDay = vi.fn();
  const realignRacePlan = vi.fn().mockResolvedValue({
    timing: "healthy" as const,
    totalWeeks: 15,
  });
  render(
    <AdjustWeekSheet
      open
      onClose={vi.fn()}
      runDays={[]}
      raceGoal={{ distance: "marathon", targetDate: "2026-10-17" }}
      overrideRunDay={overrideRunDay}
      realignRacePlan={realignRacePlan}
    />
  );
  return { overrideRunDay, realignRacePlan };
}

describe("AdjustWeekSheet — intent list", () => {
  it("renders exactly the three actionable intents", () => {
    setup();
    expect(
      screen.getByRole("button", { name: /I'm not feeling 100%/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /My week is crowded/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /I need easier running/ })
    ).toBeInTheDocument();
  });

  it("no longer offers the no-op 'Keep the plan as is' row", () => {
    setup();
    expect(screen.queryByText(/Keep the plan as is/i)).toBeNull();
    expect(screen.queryByText(/No changes/i)).toBeNull();
  });

  it("an easier-intent tap still advances to the preview step", () => {
    setup();
    fireEvent.click(
      screen.getByRole("button", { name: /I'm not feeling 100%/ })
    );
    expect(screen.getByText(/Easier week — preview/)).toBeInTheDocument();
  });
});

/**
 * Applying an easier week must AWAIT the swaps and report what landed.
 *
 * The apply loop was `for (const s of swaps) overrideRunDay(...)` with no
 * await. N promises went into the void, the enclosing try/catch could not
 * see any of them, and "3 runs eased to easy runs this week." rendered
 * before a single write had returned. A rejected swap then surfaced its
 * own "Couldn't change that run" toast a beat later, so the athlete got
 * both messages and no way to know which was true.
 *
 * The prop was typed `=> void`, which is precisely what made forgetting
 * the await type-correct. That type is now the truth, so the compiler
 * catches the next one; these tests cover what the compiler cannot — the
 * count in the copy, and staying silent when nothing applied.
 */
describe("AdjustWeekSheet — applying an easier week reports the truth", () => {
  const runDays = [
    {
      id: "rd-1",
      dayIndex: 2,
      templateId: "tempo_40",
      type: "tempo",
      status: "planned",
      date: "2999-01-02",
    },
    {
      id: "rd-2",
      dayIndex: 4,
      templateId: "6x1k",
      type: "intervals",
      status: "planned",
      date: "2999-01-04",
    },
  ] as never;

  function open(
    overrideRunDay: (
      idOrDayIndex: string | number,
      templateId: string
    ) => Promise<boolean>
  ) {
    render(
      <AdjustWeekSheet
        open
        onClose={vi.fn()}
        runDays={runDays}
        raceGoal={{ distance: "marathon", targetDate: "2999-10-17" }}
        overrideRunDay={overrideRunDay}
        realignRacePlan={vi.fn()}
      />
    );
    fireEvent.click(
      screen.getByRole("button", { name: /I need easier running/ })
    );
  }

  it("awaits every swap before claiming success", async () => {
    // Resolution is deferred so an unawaited loop would reach the toast
    // with both calls still pending — exactly the shipped bug.
    const resolvers: ((v: boolean) => void)[] = [];
    const overrideRunDay = vi.fn(
      () => new Promise<boolean>((res) => resolvers.push(res))
    );
    open(overrideRunDay);
    fireEvent.click(screen.getByRole("button", { name: /Ease this week/ }));

    await vi.waitFor(() => expect(overrideRunDay).toHaveBeenCalledTimes(1));
    // Sequential: the second swap must not start until the first settles.
    expect(overrideRunDay).toHaveBeenCalledTimes(1);
    resolvers[0](true);
    await vi.waitFor(() => expect(overrideRunDay).toHaveBeenCalledTimes(2));
    resolvers[1](true);
  });

  it("counts what actually landed, not what was attempted", async () => {
    const overrideRunDay = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    open(overrideRunDay);
    fireEvent.click(screen.getByRole("button", { name: /Ease this week/ }));

    // Two attempted, one landed → the copy must say one, and singular.
    await vi.waitFor(() =>
      expect(overrideRunDay).toHaveBeenCalledTimes(2)
    );
    const { toast } = await import("@/lib/toast");
    await vi.waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "1 run eased to an easy run this week."
      )
    );
  });

  it("says nothing when every swap failed", async () => {
    // overrideRunDay has already explained each failure. A success toast
    // here would directly contradict the errors beside it.
    const overrideRunDay = vi.fn().mockResolvedValue(false);
    open(overrideRunDay);
    fireEvent.click(screen.getByRole("button", { name: /Ease this week/ }));

    await vi.waitFor(() => expect(overrideRunDay).toHaveBeenCalledTimes(2));
    const { toast } = await import("@/lib/toast");
    expect(toast.success).not.toHaveBeenCalled();
  });
});
