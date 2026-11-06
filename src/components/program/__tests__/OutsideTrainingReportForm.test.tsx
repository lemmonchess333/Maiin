import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import OutsideTrainingReportForm, {
  type OutsideTrainingSubmission,
  type OutsideTrainingReceipt,
} from "../OutsideTrainingReportForm";

const props = {
  expectedUid: "user-1",
  stage: 1,
  date: "2026-11-09",
  today: "2026-11-10",
  expectedAuthorityRevision: 4,
  raceGoalId: "race-block",
  scheduledRunId: "scheduled-run",
};
const form = () =>
  screen.getByRole("form", { name: "Report outside training" });
function fill({ minutes = "60", completed = "yes", manageable = "yes" } = {}) {
  fireEvent.change(screen.getByLabelText("Total session minutes"), {
    target: { value: minutes },
  });
  fireEvent.change(screen.getByLabelText(/How did it feel/), {
    target: { value: "matched" },
  });
  fireEvent.change(screen.getByLabelText(/Did you complete/), {
    target: { value: completed },
  });
  fireEvent.change(screen.getByLabelText(/Did the session feel manageable/), {
    target: { value: manageable },
  });
}
const confirm = () => fireEvent.click(screen.getByRole("checkbox"));
const receipt = (
  submission: OutsideTrainingSubmission
): OutsideTrainingReceipt => ({
  accountId: submission.expectedUid,
  raceGoalId: submission.raceGoalId,
  scheduledRunId: submission.scheduledRunId,
  report: submission.report,
  activityId: submission.report.activityId,
  authorityRevision: 5,
});

describe("outside training form, inactive without a reporting adapter", () => {
  it("hides one account's draft if the signed-in account changes", () => {
    const submit = vi.fn();
    const view = render(
      <OutsideTrainingReportForm {...props} onSubmit={submit} />
    );
    fill();
    confirm();
    view.rerender(
      <OutsideTrainingReportForm
        {...props}
        expectedUid="another-user"
        onSubmit={submit}
      />
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      /signed-in account changed/
    );
    expect(
      screen.queryByLabelText("Total session minutes")
    ).not.toBeInTheDocument();
    expect(submit).not.toHaveBeenCalled();
  });
  it("does not accept a receipt scoped to another race block", async () => {
    const submit = vi.fn(async (input: OutsideTrainingSubmission) => ({
      ...receipt(input),
      raceGoalId: "other-race",
    }));
    render(<OutsideTrainingReportForm {...props} onSubmit={submit} />);
    fill();
    confirm();
    fireEvent.submit(form());
    await screen.findByRole("alert");
    expect(screen.queryByText(/Training report saved/)).not.toBeInTheDocument();
  });
  it("preserves typed answers and stops submission when authority changes", () => {
    const submit = vi.fn();
    const view = render(
      <OutsideTrainingReportForm {...props} onSubmit={submit} />
    );
    fill();
    confirm();
    view.rerender(
      <OutsideTrainingReportForm
        {...props}
        expectedAuthorityRevision={5}
        stage={2}
        onSubmit={submit}
      />
    );
    expect(screen.getByLabelText("Total session minutes")).toHaveValue(60);
    expect(
      screen.getByRole("button", { name: "Save training report" })
    ).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(/Your plan changed/);
    fireEvent.submit(form());
    expect(submit).not.toHaveBeenCalled();
  });
  it("rejects a receipt for the same identity but different saved facts", async () => {
    const submit = vi.fn(async (input: OutsideTrainingSubmission) => ({
      ...receipt(input),
      report: { ...input.report, durationSeconds: 1 },
    }));
    render(<OutsideTrainingReportForm {...props} onSubmit={submit} />);
    fill();
    confirm();
    fireEvent.submit(form());
    await screen.findByRole("alert");
    expect(screen.queryByText(/Training report saved/)).not.toBeInTheDocument();
  });
  it("never prefills subjective answers or consent and requires explicit confirmation", async () => {
    const submit = vi.fn(async (input: OutsideTrainingSubmission) =>
      receipt(input)
    );
    render(<OutsideTrainingReportForm {...props} onSubmit={submit} />);
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(screen.getByLabelText(/Did you complete/)).toHaveValue("");
    fill();
    fireEvent.submit(form());
    expect(submit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/confirm the details/);
    confirm();
    fireEvent.submit(form());
    await screen.findByText(/Training report saved/);
    expect(submit).toHaveBeenCalledOnce();
    expect(submit.mock.calls[0][0]).toMatchObject({
      expectedAuthorityRevision: 4,
      raceGoalId: "race-block",
      scheduledRunId: "scheduled-run",
      report: {
        source: "outside_session",
        durationSeconds: 3600,
        completedStage: 1,
        sessionCompletedAsDescribed: true,
        manageable: true,
      },
    });
  });
  it("can report a shorter incomplete session without creating progression credit", async () => {
    const submit = vi.fn(async (input: OutsideTrainingSubmission) =>
      receipt(input)
    );
    render(<OutsideTrainingReportForm {...props} onSubmit={submit} />);
    fill({ minutes: "10", completed: "no", manageable: "unknown" });
    confirm();
    fireEvent.submit(form());
    await screen.findByText(/Training report saved/);
    expect(submit.mock.calls[0][0].report).toMatchObject({
      durationSeconds: 600,
      sessionCompletedAsDescribed: false,
    });
    expect(submit.mock.calls[0][0].report.completedStage).toBeUndefined();
    expect(submit.mock.calls[0][0].report.manageable).toBeUndefined();
  });
  it("rejects future dates and contradictory full-session duration", () => {
    const submit = vi.fn();
    render(<OutsideTrainingReportForm {...props} onSubmit={submit} />);
    fill({ minutes: "0.1" });
    confirm();
    fireEvent.submit(form());
    expect(submit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      /Check the date and duration/
    );
    fill();
    fireEvent.change(screen.getByLabelText("Date"), {
      target: { value: "2026-11-11" },
    });
    fireEvent.submit(form());
    expect(submit).not.toHaveBeenCalled();
  });
  it("deduplicates rapid submission and confirms only a matching durable receipt", async () => {
    let resolve!: (receipt: OutsideTrainingReceipt) => void;
    const submit = vi.fn(
      () =>
        new Promise<OutsideTrainingReceipt>((done) => {
          resolve = done;
        })
    );
    render(<OutsideTrainingReportForm {...props} onSubmit={submit} />);
    fill();
    confirm();
    fireEvent.submit(form());
    fireEvent.submit(form());
    expect(submit).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: /Saving/ })).toBeDisabled();
    await act(async () =>
      resolve({
        accountId: "user-1",
        raceGoalId: "race-block",
        scheduledRunId: "scheduled-run",
        activityId: "wrong-report",
        authorityRevision: 5,
        report: {} as OutsideTrainingSubmission["report"],
      })
    );
    expect(screen.queryByText(/Training report saved/)).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/not confirmed saved/);
  });
  it("keeps answers and the same identity after an uncertain or rejected save", async () => {
    const submit = vi
      .fn<
        (input: OutsideTrainingSubmission) => Promise<OutsideTrainingReceipt>
      >()
      .mockRejectedValueOnce(new Error("offline"))
      .mockImplementation(async (input) => receipt(input));
    render(<OutsideTrainingReportForm {...props} onSubmit={submit} />);
    fill();
    confirm();
    fireEvent.submit(form());
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/not confirmed saved/)
    );
    expect(screen.getByLabelText("Total session minutes")).toHaveValue(60);
    fireEvent.submit(form());
    await screen.findByText(/Training report saved/);
    expect(submit.mock.calls[0][0].report.activityId).toBe(
      submit.mock.calls[1][0].report.activityId
    );
  });
});
