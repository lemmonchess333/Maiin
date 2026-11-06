import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import RunningAdaptationPreview, { RunningAdaptationPreviewCandidate } from "../RunningAdaptationPreview";
import type { ComponentProps } from "react";
import type { AdaptationApplyRequest, AdaptationApplyResponse } from "@/features/program/runningAdaptationApply";

type Props = ComponentProps<typeof RunningAdaptationPreviewCandidate>;
function response(r: AdaptationApplyRequest): AdaptationApplyResponse {
  return { outcome: "applied", receipt: { accountId: r.expectedUid, proposalId: r.proposalId, idempotencyKey: r.idempotencyKey, baseRevision: r.expectedRevision, appliedRevision: r.expectedRevision + 1 } };
}
function props(): Props {
  return {
    proposal: { id: "p1", expiresAtMs: Date.now() + 60000, preview: { status: "preview", accountId: "a", revision: 1, before: [{ id: "s1", date: "2026-11-09", minutes: 30, kind: "quality" }], after: [{ id: "s1", date: "2026-11-09", minutes: 20, kind: "easy" }], days: { before: 1, after: 1 }, longestMinutes: { before: 30, after: 20 }, removedIds: [], changedIds: ["s1"], raceGoalId: "race", raceImpact: "review_required", applyAvailable: false } },
    authority: { accountId: "a", revision: 1, online: true, ready: true, holds: [] }, idempotencyKey: "retained-key",
    apply: vi.fn(async (r) => response(r)), reconcile: vi.fn(async () => true),
    onEdit: vi.fn(), onReviewPause: vi.fn(), onClose: vi.fn(),
  };
}
function accept() { fireEvent.click(screen.getByRole("checkbox")); }
function apply() { fireEvent.click(screen.getByRole("button", { name: "Apply changes" })); }

describe("disabled adaptation preview UI", () => {
  it("is invisible through the production entry", () => {
    const p = props(); const { container } = render(<RunningAdaptationPreview {...p} />);
    expect(container).toBeEmptyDOMElement(); expect(p.apply).not.toHaveBeenCalled();
  });
  it("shows actual changes, race uncertainty and explicit acceptance", async () => {
    const p = props(); render(<RunningAdaptationPreviewCandidate {...p} />);
    expect(screen.getByText(/Before: Quality session/)).toBeInTheDocument();
    expect(screen.getByText(/After: Easy run/)).toBeInTheDocument();
    expect(screen.getByText(/do not establish readiness/)).toBeInTheDocument();
    apply(); expect(p.apply).not.toHaveBeenCalled(); accept(); apply();
    await screen.findByText("Your saved plan has been checked.");
    expect(p.apply).toHaveBeenCalledWith({ expectedUid: "a", accepted: true, proposalId: "p1", expectedRevision: 1, idempotencyKey: "retained-key" });
    expect(p.reconcile).toHaveBeenCalledTimes(1);
  });
  it.each(["offline", "hold", "revision", "account", "expired", "unready"])("blocks %s", (condition) => {
    const p = props();
    if (condition === "offline") p.authority.online = false;
    if (condition === "hold") p.authority.holds = ["injury"];
    if (condition === "revision") p.authority.revision = 2;
    if (condition === "account") p.authority.accountId = "b";
    if (condition === "expired") p.proposal.expiresAtMs = Date.now() - 1;
    if (condition === "unready") p.authority.ready = false;
    render(<RunningAdaptationPreviewCandidate {...p} />); accept(); apply();
    expect(p.apply).not.toHaveBeenCalled();
  });
  it("locks rapid repeated Apply and waits for reconciliation", async () => {
    const p = props(); let finish!: (r: AdaptationApplyResponse) => void;
    p.apply = vi.fn(() => new Promise<AdaptationApplyResponse>((resolve) => { finish = resolve; }));
    render(<RunningAdaptationPreviewCandidate {...p} />); accept(); apply(); apply();
    expect(p.apply).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
    await act(async () => finish(response((p.apply as ReturnType<typeof vi.fn>).mock.calls[0][0])));
    await screen.findByText("Your saved plan has been checked.");
  });
  it("does not retry uncertain network failures or claim success", async () => {
    const p = props(); p.apply = vi.fn(async () => { throw new Error("network"); });
    render(<RunningAdaptationPreviewCandidate {...p} />); accept(); apply();
    await screen.findByText(/couldn’t confirm whether/); apply();
    expect(p.apply).toHaveBeenCalledTimes(1); expect(p.reconcile).not.toHaveBeenCalled();
  });
  it("rejects mismatching receipts", async () => {
    const p = props(); p.apply = vi.fn(async (r) => ({ ...response(r), receipt: { ...response(r).receipt, accountId: "other" } }));
    render(<RunningAdaptationPreviewCandidate {...p} />); accept(); apply();
    await screen.findByText(/couldn’t confirm whether/); expect(p.reconcile).not.toHaveBeenCalled();
  });
  it("ignores an old account's pending completion", async () => {
    const p = props(); let finish!: (r: AdaptationApplyResponse) => void;
    p.apply = vi.fn(() => new Promise<AdaptationApplyResponse>((resolve) => { finish = resolve; }));
    const view = render(<RunningAdaptationPreviewCandidate {...p} />); accept(); apply();
    view.rerender(<RunningAdaptationPreviewCandidate {...p} authority={{ ...p.authority, accountId: "b" }} />);
    await act(async () => finish(response((p.apply as ReturnType<typeof vi.fn>).mock.calls[0][0])));
    expect(p.reconcile).not.toHaveBeenCalled();
    expect(screen.queryByText("Your saved plan has been checked.")).not.toBeInTheDocument();
  });
  it("resets consent if displayed proposal contents change", () => {
    const p = props(); const view = render(<RunningAdaptationPreviewCandidate {...p} />); accept();
    const changed = structuredClone(p.proposal); changed.preview.after[0].minutes = 10;
    view.rerender(<RunningAdaptationPreviewCandidate {...p} proposal={changed} />);
    expect(screen.getByRole("checkbox")).not.toBeChecked(); apply(); expect(p.apply).not.toHaveBeenCalled();
  });
  it("edit, pause review and close do not mutate anything", () => {
    const p = props(); render(<RunningAdaptationPreviewCandidate {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit answers" }));
    fireEvent.click(screen.getByRole("button", { name: "Review pausing running" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(p.onEdit).toHaveBeenCalledOnce(); expect(p.onReviewPause).toHaveBeenCalledOnce(); expect(p.onClose).toHaveBeenCalledOnce(); expect(p.apply).not.toHaveBeenCalled();
  });
  it("never calls a save confirmed without canonical reconciliation", async () => {
    const p = props(); p.reconcile = vi.fn(async () => false);
    render(<RunningAdaptationPreviewCandidate {...p} />); accept(); apply();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/couldn’t confirm whether/));
  });
});
