import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ negotiate: vi.fn(), enroll: vi.fn(), saveReview: vi.fn(), createPreview: vi.fn(), completeMigration: vi.fn(), adoptInitial: vi.fn(), apply: vi.fn() }));
vi.mock("@/features/program/runningReviewTransport", () => ({ runningReviewTransport: api }));
vi.mock("@/features/program/runningPrescriptionFeature", () => ({ RUNNING_PRESCRIPTION_GATE_ENABLED: true }));
vi.mock("@/features/program/runningAdaptationApply", async (original) => ({ ...await original<object>(), RUNNING_ADAPTATION_ENABLED: true }));
vi.mock("@/features/program/outsideTrainingTransport", () => ({ submitOutsideTrainingReport: vi.fn() }));
import RunningAdaptationFlow from "../RunningAdaptationFlow";
function authority(revision = 8, holds: string[] = []) { return { status: holds.length ? "held" : "ready", accountId: "runner", authority: { accountId: "runner", schemaVersion: 1, revision, timeZone: "UTC", holds, plan: { raceGoalId: "race", sessions: holds.length ? [] : [{ id: "one", date: "2026-11-09", minutes: 40, kind: "easy", templateId: "easy_40" }] } } }; }
async function open() { fireEvent.click(screen.getByRole("button", { name: "Review my plan" })); await screen.findByLabelText("How is it affecting you?"); }
function fill() {
  fireEvent.change(screen.getByLabelText("How is it affecting you?"), { target: { value: "none" } });
  fireEvent.change(screen.getByLabelText("Days per week you can currently manage"), { target: { value: "2" } });
  fireEvent.change(screen.getByLabelText("Longest comfortable session, in minutes"), { target: { value: "20" } });
  fireEvent.click(screen.getByLabelText("I confirm this reflects what I can manage now."));
  fireEvent.click(screen.getByLabelText("I have considered symptoms during and after those sessions."));
  fireEvent.change(screen.getByLabelText("Have you been given training restrictions?"), { target: { value: "none" } });
}
beforeEach(() => { vi.clearAllMocks(); api.negotiate.mockResolvedValue(authority()); });
describe("mounted authenticated review flow", () => {
  it("does not read until opened and saves only with explicit consent", async () => {
    api.saveReview.mockImplementation(async (r) => ({ receipt: { accountId: "runner", requestId: r.requestId, baseRevision: 8, appliedRevision: 9 } }));
    render(<RunningAdaptationFlow expectedUid="runner" />); expect(api.negotiate).not.toHaveBeenCalled(); await open(); fill();
    expect(screen.getByRole("button", { name: "Save review answers" })).toBeDisabled();
    fireEvent.click(screen.getByLabelText("Save these answers privately to review my running plan."));
    api.negotiate.mockResolvedValue(authority(9)); fireEvent.click(screen.getByRole("button", { name: "Save review answers" }));
    await waitFor(() => expect(api.saveReview).toHaveBeenCalledOnce());
    expect(api.saveReview.mock.calls[0][0]).toMatchObject({ expectedUid: "runner", expectedRevision: 8, confirmed: true, raceGoalId: "race", review: { symptoms: "none", capacity: { confirmed: true, afterEffectsReviewed: true, daysPerWeek: 2, longestMinutes: 20 }, restrictions: { status: "none" } } });
    await waitFor(() => expect(api.negotiate).toHaveBeenCalledTimes(2));
  });
  it("previews exact server changes and renders only a reconciled saved plan", async () => {
    api.createPreview.mockResolvedValue({ proposal: { id: "preview1", accountId: "runner", baseRevision: 8, expiresAtMs: Date.now() + 60000,
      preview: { status: "preview", accountId: "runner", revision: 8, before: [{ id: "one", date: "2026-11-09", minutes: 40, kind: "easy" }], after: [{ id: "one", date: "2026-11-09", minutes: 20, kind: "easy" }], days: { before: 1, after: 1 }, longestMinutes: { before: 40, after: 20 }, removedIds: [], changedIds: ["one"], raceGoalId: "race", raceImpact: "review_required", applyAvailable: false } } });
    api.apply.mockImplementation(async (r) => ({ outcome: "applied", receipt: { accountId: "runner", proposalId: r.proposalId, idempotencyKey: r.idempotencyKey, baseRevision: 8, appliedRevision: 9 } }));
    render(<RunningAdaptationFlow expectedUid="runner" />); await open();
    fireEvent.change(screen.getByLabelText("Start of the future week"), { target: { value: "2026-11-09" } });
    fireEvent.change(screen.getByLabelText("Maximum session minutes"), { target: { value: "20" } });
    fireEvent.click(screen.getByLabelText("2026-11-09 · 40 min"));
    fireEvent.click(screen.getByRole("button", { name: "Preview changes" }));
    await screen.findByRole("heading", { name: "Your proposed plan" }); expect(api.apply).not.toHaveBeenCalled();
    const updated = authority(9); updated.authority.plan.sessions[0].minutes = 20; updated.authority.plan.sessions[0].templateId = "easy_20";
    api.negotiate.mockResolvedValue(updated);
    fireEvent.click(screen.getByLabelText("Apply exactly the session changes shown above.")); fireEvent.click(screen.getByRole("button", { name: "Apply changes" }));
    await screen.findByText("Your reviewed running plan is saved."); expect(screen.getByText("2026-11-09 · 20 min · Easy run")).toBeInTheDocument(); expect(api.apply).toHaveBeenCalledOnce();
  });
  it("saves uncertainty as unknown capacity rather than inventing a baseline", async () => {
    api.saveReview.mockImplementation(async (r) => ({ receipt: { accountId: "runner", requestId: r.requestId, baseRevision: 8, appliedRevision: 9 } }));
    render(<RunningAdaptationFlow expectedUid="runner" />); await open();
    fireEvent.change(screen.getByLabelText("How is it affecting you?"), { target: { value: "unknown" } });
    fireEvent.click(screen.getByLabelText("I’m not sure what I can currently manage."));
    fireEvent.change(screen.getByLabelText("Have you been given training restrictions?"), { target: { value: "unknown" } });
    fireEvent.click(screen.getByLabelText("Save these answers privately to review my running plan."));
    api.negotiate.mockResolvedValue(authority(9, ["running_review_required"]));
    fireEvent.click(screen.getByRole("button", { name: "Save review answers" }));
    await waitFor(() => expect(api.saveReview).toHaveBeenCalledOnce());
    expect(api.saveReview.mock.calls[0][0].review.capacity).toEqual({ confirmed: false, afterEffectsReviewed: false, daysPerWeek: null, longestMinutes: null });
    await screen.findByText(/Running remains paused/);
  });
  it("shows an exact nonrace starting preview and requires explicit adoption", async () => {
    const empty = { ...authority(), authority: { ...authority().authority, plan: { raceGoalId: null, sessions: [] }, migration: { version: 1, status: "complete", legacyStateExisted: false } } };
    api.negotiate.mockResolvedValue(empty);
    api.adoptInitial.mockImplementation(async (r) => ({ outcome: "adopted", receipt: { accountId: "runner", requestId: r.requestId, raceGoalId: null, baseRevision: 8, appliedRevision: 9, sessions: [{ id: "initial_20261109", date: "2026-11-09", templateId: "run_walk_1", minutes: 29, kind: "run_walk" }] } }));
    render(<RunningAdaptationFlow expectedUid="runner" />); await open();
    expect(screen.getByText(/Each selected date uses Run-walk 1/)).toHaveTextContent("29 min");
    expect(api.adoptInitial).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Starting session 1"), { target: { value: "2026-11-09" } });
    expect(screen.getByRole("button", { name: "Confirm starting plan" })).toBeDisabled();
    fireEvent.click(screen.getByLabelText("I want these exact run/walk sessions on the selected dates."));
    api.negotiate.mockResolvedValue({ ...empty, authority: { ...empty.authority, revision: 9, plan: { raceGoalId: null, sessions: [{ id: "initial_20261109", date: "2026-11-09", templateId: "run_walk_1", minutes: 29, kind: "run_walk" }] } } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm starting plan" }));
    await screen.findByText("Your reviewed running plan is saved.");
    expect(api.adoptInitial.mock.calls[0][0]).toMatchObject({ expectedUid: "runner", expectedRevision: 8, raceGoalId: null, confirmed: true, confirmationVersion: "initial-run-walk-v1", dates: ["2026-11-09"] });
  });
  it("never removes a race goal to make initial adoption available", async () => {
    api.negotiate.mockResolvedValue({ ...authority(), authority: { ...authority().authority, plan: { raceGoalId: "race", sessions: [] }, migration: { version: 1, status: "complete", legacyStateExisted: false } } });
    render(<RunningAdaptationFlow expectedUid="runner" />); await open();
    expect(screen.getByText(/race goal is preserved/)).toBeInTheDocument(); expect(screen.queryByRole("button", { name: "Confirm starting plan" })).not.toBeInTheDocument(); expect(api.adoptInitial).not.toHaveBeenCalled();
  });
  it("shows mapped legacy evidence and binds explicit confirmation to its digest", async () => {
    const previous = { ...authority(8, ["enrollment_review_required"]), legacyReconciliation: { version: 1, snapshotDigest: "snapshot-digest", evidence: ["legacy_recovery_indicator", "legacy_prescriptions_retired"], holds: ["recovery_evidence_required"] } };
    Object.assign(previous.authority, { migration: { version: 1, status: "review_required", legacyStateExisted: true } });
    api.negotiate.mockResolvedValue(previous); api.completeMigration.mockResolvedValue({ outcome: "completed" });
    render(<RunningAdaptationFlow expectedUid="runner" />); await open();
    expect(screen.getByText("Your previous plan includes recovery.")).toBeInTheDocument(); expect(screen.getByText("Recovery needs a separate review.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm previous-training review" })).toBeDisabled();
    fireEvent.click(screen.getByLabelText("I reviewed these details and want to retire old prescriptions while keeping my history and safety holds."));
    api.negotiate.mockResolvedValue(authority(9, ["recovery_evidence_required"]));
    fireEvent.click(screen.getByRole("button", { name: "Confirm previous-training review" }));
    await waitFor(() => expect(api.completeMigration).toHaveBeenCalledOnce());
    expect(api.completeMigration.mock.calls[0][0]).toMatchObject({ expectedUid: "runner", expectedRevision: 8, raceGoalId: "race", confirmed: true, acknowledgedLegacyPrescriptionsRetired: true, expectedLegacyDigest: "snapshot-digest", confirmedLegacyReview: true });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Confirm previous-training review" })).not.toBeInTheDocument());
    expect(screen.getByText(/Running remains paused/)).toBeInTheDocument(); expect(api.apply).not.toHaveBeenCalled();
  });
  it("held accounts can review answers but cannot create prescriptions or clear holds", async () => {
    api.negotiate.mockResolvedValue(authority(8, ["injury"])); render(<RunningAdaptationFlow expectedUid="runner" />); await open();
    expect(screen.getByText(/Running remains paused/)).toBeInTheDocument(); expect(screen.queryByRole("button", { name: "Preview changes" })).not.toBeInTheDocument(); expect(api.apply).not.toHaveBeenCalled();
  });
  it("retains uncertainty after a failed save until explicit read-only reconciliation", async () => {
    api.saveReview.mockRejectedValue(new Error("network")); render(<RunningAdaptationFlow expectedUid="runner" />); await open(); fill();
    fireEvent.click(screen.getByLabelText("Save these answers privately to review my running plan.")); fireEvent.click(screen.getByRole("button", { name: "Save review answers" }));
    await screen.findByRole("button", { name: "Check current plan" }); expect(screen.getByRole("button", { name: "Save review answers" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Check current plan" })); await waitFor(() => expect(api.negotiate).toHaveBeenCalledTimes(2)); expect(api.saveReview).toHaveBeenCalledOnce();
  });
  it("does not auto-enroll or imply that enrollment makes a plan", async () => {
    api.negotiate.mockResolvedValue({ status: "not_enrolled", accountId: "runner" }); render(<RunningAdaptationFlow expectedUid="runner" />);
    fireEvent.click(screen.getByRole("button", { name: "Review my plan" })); await screen.findByText(/Existing running prescriptions will be retired/);
    expect(api.enroll).not.toHaveBeenCalled(); expect(screen.getByRole("button", { name: "Begin plan review" })).toBeDisabled();
  });
  it("hides old account answers immediately and ignores pending completion", async () => {
    let finish!: (value: unknown) => void; api.negotiate.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const view = render(<RunningAdaptationFlow expectedUid="runner" />); fireEvent.click(screen.getByRole("button", { name: "Review my plan" }));
    view.rerender(<RunningAdaptationFlow expectedUid="other" />); await act(async () => finish(authority()));
    expect(screen.queryByLabelText("How is it affecting you?")).not.toBeInTheDocument();
  });
});

it("mounts reports only for arrived explicitly adopted canonical sessions", async () => {
  const response = authority();
  Object.assign(response.authority, { acceptedRunWalkStage: { version: 1, stage: 1, adoptionRequestId: "adopted", adoptedAtRevision: 8, raceGoalId: null, sessionIds: ["initial_20200101"] } });
  Object.assign(response.authority.plan, { raceGoalId: null, sessions: [{ id: "initial_20200101", date: "2020-01-01", templateId: "run_walk_1", minutes: 29, kind: "run_walk" }] });
  api.negotiate.mockResolvedValue(response);
  render(<RunningAdaptationFlow expectedUid="runner" />); await open();
  expect(screen.getByRole("button", { name: "Report training for 2020-01-01" })).toBeInTheDocument();
});
