import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import MoveRunSheet from "../MoveRunSheet";
import type { ScheduledRunDay } from "@/features/program/programTypes";
import type { ScheduleDay } from "@/lib/scheduleUtils";

vi.mock("@/components/ui/BottomSheet", () => ({
  BottomSheet: ({
    children,
    title,
    onBack,
  }: {
    children: ReactNode;
    title: string;
    onBack: () => void;
  }) => (
    <div role="dialog" aria-label={title}>
      <button onClick={onBack}>Browser Back</button>
      {children}
    </div>
  ),
}));
vi.mock("@/components/ui/ConfirmDialog", () => ({
  ConfirmDialog: ({
    open,
    title,
    onConfirm,
    onCancel,
  }: {
    open: boolean;
    title: string;
    onConfirm: () => void;
    onCancel: () => void;
  }) =>
    open ? (
      <div role="alertdialog" aria-label={title}>
        <button onClick={onConfirm}>Discard change</button>
        <button onClick={onCancel}>Keep editing</button>
      </div>
    ) : null,
}));

const run = {
  id: "tempo",
  dayIndex: 4,
  date: "2026-10-29",
  weekKey: "2026-10-26",
  templateId: "tempo_30",
  type: "tempo",
  status: "planned",
  completed: false,
} as ScheduledRunDay;
const layout: ScheduleDay[] = Array.from({ length: 7 }, (_, day) => ({
  day,
  type: day === 5 ? "lift" : "rest",
}));
function setup(overrides: Record<string, unknown> = {}) {
  const onMove = vi.fn().mockResolvedValue({ status: "applied" });
  const onClose = vi.fn();
  const onResult = vi.fn();
  const props = {
    runs: [run],
    allRuns: [run],
    savedRuns: [],
    weekSchedule: layout,
    todayKey: "2026-10-28",
    unit: "km" as const,
    nextLiftName: "Lower A",
    blocked: false,
    onMove,
    onClose,
    onResult,
    ...overrides,
  };
  const view = render(<MoveRunSheet {...props} />);
  return { ...view, props, onMove, onClose, onResult };
}
function chooseSaturday() {
  fireEvent.click(screen.getByRole("radio", { name: /Sat 31 Oct/ }));
  fireEvent.click(screen.getByRole("button", { name: "Review change" }));
}

describe("run move review", () => {
  it("names the goal's own day for a goal run on your own (Run9)", () => {
    const race = {
      ...run,
      id: "race",
      dayIndex: 6,
      date: "2026-10-31",
      templateId: "5k_race",
      type: "race",
    } as ScheduledRunDay;
    const { unmount } = setup({ allRuns: [run, race] });
    expect(screen.getByText("Race day stays on its date")).toBeInTheDocument();
    expect(screen.getByText("After this week's race")).toBeInTheDocument();
    unmount();
    setup({ allRuns: [run, race], goalDay: "Your 5K" });
    expect(screen.getByText("Your 5K stays on its date")).toBeInTheDocument();
    expect(screen.getByText("After your 5K")).toBeInTheDocument();
  });

  it("names a long run in the runner's unit", () => {
    const long = {
      ...run,
      id: "long",
      templateId: "long_12k",
      type: "long",
    } as ScheduledRunDay;
    setup({ runs: [long], allRuns: [long], unit: "mi" });
    expect(screen.getByText("Long 7.5 mi")).toBeInTheDocument();
    expect(screen.queryByText(/12K/)).not.toBeInTheDocument();
  });

  it("asks before a dirty editor closes through Browser Back, including after Review", () => {
    const view = setup();
    chooseSaturday();
    fireEvent.click(screen.getByRole("button", { name: "Edit destination" }));
    fireEvent.click(screen.getByRole("button", { name: "Browser Back" }));
    expect(
      screen.getByRole("alertdialog", { name: "Discard this change?" })
    ).toBeInTheDocument();
    expect(view.onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.getByRole("radio", { name: /Sat 31 Oct/ })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Browser Back" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard change" }));
    expect(view.onClose).toHaveBeenCalledOnce();
    expect(view.onMove).not.toHaveBeenCalled();
  });

  it("never writes from selection, review or cancellation", () => {
    const { onMove, onClose } = setup();
    chooseSaturday();
    expect(
      screen.getByRole("dialog", { name: "Review change" })
    ).toBeInTheDocument();
    expect(onMove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Keep current week" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onMove).not.toHaveBeenCalled();
  });

  it("retains the destination when returning to edit and focuses the step", () => {
    setup();
    chooseSaturday();
    expect(
      screen.getByRole("heading", { name: "Review selected run change" })
    ).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Edit destination" }));
    expect(screen.getByRole("radio", { name: /Sat 31 Oct/ })).toBeChecked();
    expect(
      screen.getByRole("heading", { name: "Choose a run and destination" })
    ).toHaveFocus();
  });

  it("passes the reviewed source/evidence and distinguishes queued from applied", async () => {
    const onMove = vi.fn().mockResolvedValue({ status: "queued" });
    const { onResult, onClose } = setup({ onMove });
    chooseSaturday();
    fireEvent.click(screen.getByRole("button", { name: "Confirm change" }));
    await waitFor(() =>
      expect(onResult).toHaveBeenCalledWith(
        { status: "queued" },
        expect.stringContaining("Sat 31 Oct")
      )
    );
    expect(onMove).toHaveBeenCalledWith("tempo", 6, {
      sourceSignature: expect.any(String),
      todayKey: "2026-10-28",
      completionEvidence: expect.any(String),
    });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("keeps the draft after a refusal and does not announce success", async () => {
    const onMove = vi
      .fn()
      .mockResolvedValue({ status: "declined", reason: "stale" });
    const { onResult, onClose } = setup({ onMove });
    chooseSaturday();
    fireEvent.click(screen.getByRole("button", { name: "Confirm change" }));
    await screen.findByRole("alert");
    expect(onResult).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(
      screen.getByRole("dialog", { name: "Review change" })
    ).toBeInTheDocument();
  });

  it("requires acknowledgement for a lift-day warning and invalidates changed layout", () => {
    const view = setup();
    fireEvent.click(screen.getByRole("radio", { name: /Fri 30 Oct/ }));
    fireEvent.click(screen.getByRole("button", { name: "Review change" }));
    const confirm = screen.getByRole("button", { name: "Confirm change" });
    expect(confirm).toBeDisabled();
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Keep this destination" })
    );
    expect(confirm).toBeEnabled();
    view.rerender(
      <MoveRunSheet
        {...view.props}
        weekSchedule={layout.map((day) => ({ ...day, type: "rest" }))}
      />
    );
    expect(
      screen.getByRole("button", { name: "Confirm change" })
    ).toBeDisabled();
    expect(view.onMove).not.toHaveBeenCalled();
  });

  it("rejects a preview after midnight or source changes", () => {
    const view = setup();
    chooseSaturday();
    view.rerender(<MoveRunSheet {...view.props} todayKey="2026-10-29" />);
    expect(
      screen.getByRole("button", { name: "Confirm change" })
    ).toBeDisabled();
    expect(view.onMove).not.toHaveBeenCalled();
  });

  it("keeps the reviewed dates stable during its own optimistic save", async () => {
    let finish: (value: { status: "applied" }) => void = () => {};
    const onMove = vi.fn(
      () =>
        new Promise<{ status: "applied" }>((resolve) => {
          finish = resolve;
        })
    );
    const view = setup({ onMove });
    chooseSaturday();
    fireEvent.click(screen.getByRole("button", { name: "Confirm change" }));
    const optimistic = { ...run, date: "2026-10-31", dayIndex: 6 };
    view.rerender(
      <MoveRunSheet
        {...view.props}
        runs={[optimistic]}
        allRuns={[optimistic]}
      />
    );
    expect(screen.getByText("Thu 29 Oct")).toBeInTheDocument();
    expect(screen.getByText("Sat 31 Oct")).toBeInTheDocument();
    expect(
      screen.queryByText(/Your plan or session changed/)
    ).not.toBeInTheDocument();
    expect(onMove).toHaveBeenCalledOnce();
    finish({ status: "applied" });
    await waitFor(() => expect(view.onClose).toHaveBeenCalledOnce());
  });
});
