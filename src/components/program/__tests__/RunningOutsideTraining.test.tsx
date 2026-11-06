import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import RunningOutsideTraining from "../RunningOutsideTraining";
const submit = vi.hoisted(() => vi.fn());
vi.mock("@/features/program/outsideTrainingTransport", () => ({ submitOutsideTrainingReport: submit }));
const initial = () => ({ schemaVersion: 1, accountId: "runner", revision: 4, plan: { raceGoalId: null, sessions: [{ id: "initial_20261107", date: "2026-11-07", templateId: "run_walk_1", minutes: 29, kind: "run_walk" }] }, acceptedRunWalkStage: { version: 1, stage: 1, adoptionRequestId: "adopt1", adoptedAtRevision: 4, raceGoalId: null, sessionIds: ["initial_20261107"] } });
const props = () => ({ expectedUid: "runner", authority: initial(), today: "2026-11-08", enabled: true });
beforeEach(() => { submit.mockReset(); });
it.each(["disabled", "no_adoption", "other_account", "future", "wrong_template"])("does not infer reporting scope for %s", kind => {
  const p = props();
  if (kind === "disabled") p.enabled = false;
  if (kind === "no_adoption") Object.assign(p.authority, { acceptedRunWalkStage: undefined });
  if (kind === "other_account") p.expectedUid = "other";
  if (kind === "future") p.today = "2026-11-06";
  if (kind === "wrong_template") p.authority.plan.sessions[0].templateId = "run_walk_2";
  const { container } = render(<RunningOutsideTraining {...p} />); expect(container).toBeEmptyDOMElement(); expect(submit).not.toHaveBeenCalled();
});
it("requires explicit form consent and reuses command for an uncertain save", async () => {
  submit.mockRejectedValue(new Error("uncertain")); render(<RunningOutsideTraining {...props()} />);
  fireEvent.click(screen.getByRole("button", { name: /Report training for/ }));
  fireEvent.change(screen.getByLabelText("Total session minutes"), { target: { value: "29" } });
  for (const label of [/How did it feel/, /Did you complete/, /Did the session feel manageable/]) fireEvent.change(screen.getByLabelText(label), { target: { value: "unknown" } });
  expect(submit).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.submit(screen.getByRole("form", { name: "Report outside training" }));
  await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
  await screen.findByRole("alert"); fireEvent.submit(screen.getByRole("form", { name: "Report outside training" }));
  await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
  expect(submit.mock.calls[0][0].raceGoalId).toBeNull();
  expect(submit.mock.calls[0][0].report.completedStage).toBeUndefined();
  expect(submit.mock.calls[0][1]).toBe(submit.mock.calls[1][1]);
});
it("refreshes only after a matching durable report receipt", async () => {
  const onSaved = vi.fn().mockResolvedValue(undefined);
  submit.mockImplementation(async submission => ({ accountId: submission.expectedUid, raceGoalId: submission.raceGoalId, scheduledRunId: submission.scheduledRunId,
    report: submission.report, activityId: submission.report.activityId, authorityRevision: 5 }));
  render(<RunningOutsideTraining {...props()} onSaved={onSaved} />);
  fireEvent.click(screen.getByRole("button", { name: /Report training for/ }));
  fireEvent.change(screen.getByLabelText("Total session minutes"), { target: { value: "29" } });
  for (const label of [/How did it feel/, /Did you complete/, /Did the session feel manageable/]) fireEvent.change(screen.getByLabelText(label), { target: { value: "unknown" } });
  fireEvent.click(screen.getByRole("checkbox")); fireEvent.submit(screen.getByRole("form", { name: "Report outside training" }));
  await screen.findByRole("status"); expect(onSaved).toHaveBeenCalledOnce();
});
