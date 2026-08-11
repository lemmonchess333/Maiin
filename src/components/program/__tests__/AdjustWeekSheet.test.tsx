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
import {
  getEasedWeekKey,
  setEasedWeekKey,
} from "@/lib/easeWeekNudgeMarkers";
import { localWeekKey } from "@/lib/dateHelpers";

vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const UID = "athlete-1";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
});

function setup() {
  const applyEaseWeek = vi.fn(async () => 0);
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
      applyEaseWeek={applyEaseWeek}
      revertEaseWeek={vi.fn(async () => ({ ok: true }))}
      uid={UID}
      realignRacePlan={realignRacePlan}
    />
  );
  return { applyEaseWeek, realignRacePlan };
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

const RUN_DAYS = [
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

function openEaser(props: {
  applyEaseWeek?: (
    swaps: ReadonlyArray<{ key: string | number; toTemplateId: string }>
  ) => Promise<number | null>;
  revertEaseWeek?: () => Promise<{ ok: boolean; message?: string }>;
  easedThisWeek?: boolean;
}) {
  render(
    <AdjustWeekSheet
      open
      onClose={vi.fn()}
      runDays={RUN_DAYS}
      raceGoal={{ distance: "marathon", targetDate: "2999-10-17" }}
      applyEaseWeek={props.applyEaseWeek ?? vi.fn(async () => 2)}
      revertEaseWeek={props.revertEaseWeek ?? vi.fn(async () => ({ ok: true }))}
      easedThisWeek={props.easedThisWeek}
      uid={UID}
      realignRacePlan={vi.fn()}
    />
  );
}

/**
 * Applying an easier week is ONE command, and the count is the server's.
 *
 * Two shapes preceded this. First an unawaited `for (const s of swaps)
 * overrideRunDay(...)` — N promises into the void, "3 runs eased to easy
 * runs this week." rendered before a single write returned, and a rejected
 * swap surfacing its own error a beat later so the athlete got both
 * messages and no way to know which was true. Then the awaited loop: the
 * count became honest, but a half-eased week was still reachable and the
 * originals still lived only in a React array.
 *
 * What these pin now is that the copy reports what the SERVER changed
 * rather than what was asked for — the two differ whenever a day has been
 * completed, skipped, or turned into a race since the week was planned
 * against a cached copy.
 */
describe("AdjustWeekSheet — applying an easier week reports the truth", () => {
  function tapEase() {
    fireEvent.click(
      screen.getByRole("button", { name: /I need easier running/ })
    );
    fireEvent.click(screen.getByRole("button", { name: /Ease this week/ }));
  }

  it("sends every planned swap as a single command", async () => {
    const applyEaseWeek = vi.fn(async () => 2);
    openEaser({ applyEaseWeek });
    tapEase();

    await vi.waitFor(() => expect(applyEaseWeek).toHaveBeenCalledTimes(1));
    // One transaction for the week, not one per day: a partially-eased
    // week is what atomicity is here to make unreachable.
    expect(applyEaseWeek).toHaveBeenCalledWith([
      expect.objectContaining({ key: "rd-1" }),
      expect.objectContaining({ key: "rd-2" }),
    ]);
  });

  it("reports the server's count, not the number requested", async () => {
    // Two swaps sent, the server changed one (the other day moved on).
    const applyEaseWeek = vi.fn(async () => 1);
    openEaser({ applyEaseWeek });
    tapEase();

    const { toast } = await import("@/lib/toast");
    await vi.waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "1 run eased to an easy run this week.",
        // The fast path back is still offered — see the undo tests for the
        // durable one.
        expect.objectContaining({
          action: expect.objectContaining({ label: "Undo" }),
        })
      )
    );
  });

  it("waits for the command before claiming anything", async () => {
    // Deferred so an unawaited call would reach the toast with the command
    // still in flight — the shape of the original bug.
    let resolve!: (v: number) => void;
    const applyEaseWeek = vi.fn(
      () => new Promise<number>((res) => (resolve = res))
    );
    openEaser({ applyEaseWeek });
    tapEase();

    await vi.waitFor(() => expect(applyEaseWeek).toHaveBeenCalled());
    const { toast } = await import("@/lib/toast");
    expect(toast.success).not.toHaveBeenCalled();
    resolve(2);
    await vi.waitFor(() => expect(toast.success).toHaveBeenCalled());
  });

  it("says so — and claims nothing — when the command fails", async () => {
    const applyEaseWeek = vi.fn(async () => null);
    openEaser({ applyEaseWeek });
    tapEase();

    const { toast } = await import("@/lib/toast");
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("does not report success when the server changed nothing", async () => {
    // The server refuses an ease that would change nothing, so a 0 here
    // means a stale week rather than a silent success.
    const applyEaseWeek = vi.fn(async () => 0);
    openEaser({ applyEaseWeek });
    tapEase();

    const { toast } = await import("@/lib/toast");
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.success).not.toHaveBeenCalled();
  });
});

/**
 * The path back — and how long it lasts.
 *
 * An easier week is a REDUCTION, and the evidence handoff requires that
 * reducing work "give a bounded path back". The first version of that was
 * an 8-second toast holding a React array, because the server's
 * `overrideRunDay` reducer overwrites `templateId` as well as
 * `userOverride` and nothing on the day remembered what it had been. So an
 * athlete who felt better on Tuesday had no route back at all.
 *
 * The snapshot now lives on the programme document, which is what lets the
 * sheet offer Undo for the whole week. These pin the affordance and its
 * gate: it must appear when — and only when — a snapshot exists for the
 * week the athlete is actually in.
 */
describe("AdjustWeekSheet — undoing an easier week", () => {
  it("offers a durable Undo when this week is already eased", () => {
    openEaser({ easedThisWeek: true });
    expect(
      screen.getByRole("button", { name: /Undo easier week/ })
    ).toBeInTheDocument();
    expect(screen.getByText(/This week is already eased/)).toBeInTheDocument();
  });

  it("offers nothing when this week has not been eased", () => {
    // The gate matters more than the affordance: an Undo shown for a week
    // with no snapshot is a button whose only outcome is a refusal.
    openEaser({ easedThisWeek: false });
    expect(screen.queryByRole("button", { name: /Undo easier week/ })).toBeNull();
    expect(screen.queryByText(/already eased/)).toBeNull();
  });

  it("restores the week through the server snapshot", async () => {
    const revertEaseWeek = vi.fn(async () => ({ ok: true }));
    openEaser({ easedThisWeek: true, revertEaseWeek });

    fireEvent.click(screen.getByRole("button", { name: /Undo easier week/ }));
    await vi.waitFor(() => expect(revertEaseWeek).toHaveBeenCalledTimes(1));

    const { toast } = await import("@/lib/toast");
    await vi.waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "Easier week undone — this week is back to plan."
      )
    );
  });

  it("says so when the restore fails", async () => {
    const revertEaseWeek = vi.fn(async () => ({ ok: false }));
    openEaser({ easedThisWeek: true, revertEaseWeek });

    fireEvent.click(screen.getByRole("button", { name: /Undo easier week/ }));
    const { toast } = await import("@/lib/toast");
    await vi.waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Couldn't undo the easier week.")
    );
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("records the eased week only once the ease COMMITS", async () => {
    /* A6 keeps a marker for the week an ease was applied in, so the
       following week can ask "did the quality come back?".

       The sheet writes it itself. It used to be an optional callback from
       the caller, and the sheet's other mount (SettingsRunPlan) passed
       none — so easing from Settings recorded nothing and the bounce line
       never appeared for those users at all. */
    openEaser({ applyEaseWeek: vi.fn(async () => null) });
    fireEvent.click(
      screen.getByRole("button", { name: /I need easier running/ })
    );
    fireEvent.click(screen.getByRole("button", { name: /Ease this week/ }));
    const { toast } = await import("@/lib/toast");
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(getEasedWeekKey(UID)).toBeNull();

    cleanup();
    openEaser({ applyEaseWeek: vi.fn(async () => 2) });
    fireEvent.click(
      screen.getByRole("button", { name: /I need easier running/ })
    );
    fireEvent.click(screen.getByRole("button", { name: /Ease this week/ }));
    await vi.waitFor(() =>
      expect(getEasedWeekKey(UID)).toBe(localWeekKey(new Date()))
    );
  });

  it("forgets the eased week on undo, but only once the restore lands", async () => {
    /* Left standing through an undo, the marker makes next week's bounce
       line report recovering from a reduction the athlete cancelled and
       never ran. Gated on success for the same reason the success toast
       is: a failed restore leaves the week eased, so the marker is still
       true. */
    setEasedWeekKey(UID, localWeekKey(new Date()));
    openEaser({
      easedThisWeek: true,
      revertEaseWeek: vi.fn(async () => ({ ok: false })),
    });
    fireEvent.click(screen.getByRole("button", { name: /Undo easier week/ }));
    const { toast } = await import("@/lib/toast");
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(getEasedWeekKey(UID)).toBe(localWeekKey(new Date()));

    cleanup();
    openEaser({
      easedThisWeek: true,
      revertEaseWeek: vi.fn(async () => ({ ok: true })),
    });
    fireEvent.click(screen.getByRole("button", { name: /Undo easier week/ }));
    await vi.waitFor(() => expect(getEasedWeekKey(UID)).toBeNull());
  });

  it("shows the server's sentence when the undo is REFUSED, not a generic error", async () => {
    /* The ordering rule declines with a next step ("Undo the deload week
       first…"). Reporting that as "Couldn't undo the easier week" would hide
       the only information that makes the refusal actionable — the same
       dishonest-copy failure this whole feature exists to remove. */
    const revertEaseWeek = vi.fn(async () => ({
      ok: false,
      message: "Undo the deload week first, then the easier week.",
    }));
    openEaser({ easedThisWeek: true, revertEaseWeek });
    fireEvent.click(screen.getByRole("button", { name: /Undo easier week/ }));

    const { toast } = await import("@/lib/toast");
    await vi.waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Undo the deload week first, then the easier week."
      )
    );
  });

  it("falls back to the generic error when the server gave no sentence", async () => {
    const revertEaseWeek = vi.fn(async () => ({ ok: false }));
    openEaser({ easedThisWeek: true, revertEaseWeek });
    fireEvent.click(screen.getByRole("button", { name: /Undo easier week/ }));

    const { toast } = await import("@/lib/toast");
    await vi.waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Couldn't undo the easier week.")
    );
  });

  it("the toast's Undo takes the same route as the row", async () => {
    // Both affordances must land on the snapshot restore. The toast one
    // previously replayed swaps in reverse from memory, which is why it
    // could not survive a reload — pinning them to one path is the point.
    const revertEaseWeek = vi.fn(async () => ({ ok: true }));
    openEaser({ revertEaseWeek });
    fireEvent.click(
      screen.getByRole("button", { name: /I need easier running/ })
    );
    fireEvent.click(screen.getByRole("button", { name: /Ease this week/ }));

    const { toast } = await import("@/lib/toast");
    await vi.waitFor(() => expect(toast.success).toHaveBeenCalled());
    const opts = (toast.success as ReturnType<typeof vi.fn>).mock.calls[0][1];
    (opts.action.onClick as () => void)();

    await vi.waitFor(() => expect(revertEaseWeek).toHaveBeenCalledTimes(1));
  });
});
