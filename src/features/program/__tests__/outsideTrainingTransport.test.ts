// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ user: { uid: "runner" } as { uid: string } | null, call: vi.fn(), names: [] as string[] }));
vi.mock("@/lib/firebase", () => ({ auth: { get currentUser() { return api.user; } }, functions: {} }));
vi.mock("firebase/functions", () => ({ httpsCallable: (_functions: unknown, name: string) => { api.names.push(name); return api.call; } }));
import { submitOutsideTrainingReport } from "../outsideTrainingTransport";
const report = { expectedUid: "runner", confirmationVersion: "outside-training-report-v1" as const, expectedAuthorityRevision: 4, raceGoalId: null, scheduledRunId: "initial_run", report: { activityId: "outside:one", source: "outside_session" as const, date: "2026-11-06", durationSeconds: 1800, relativeEffort: null } };
beforeEach(() => { api.user = { uid: "runner" }; api.names = []; api.call.mockReset(); Object.defineProperty(navigator, "onLine", { configurable: true, value: true }); });
describe("authenticated running callable client transport", () => {
  it("routes to real endpoint names without changing confirmed payload", async () => {
    api.call.mockResolvedValue({ data: { outcome: "saved", receipt: { accountId: "runner" } } });
    const request = report;
    expect(await submitOutsideTrainingReport(request, "command1")).toEqual({ accountId: "runner" });
    expect(api.names).toEqual(["submitOutsideTrainingReport"]); expect(api.call).toHaveBeenCalledWith({ ...request, commandId: "command1" });
  });
  it.each(["signed_out", "other_account", "offline"])("fails %s before calling Firebase", async condition => {
    if (condition === "signed_out") api.user = null;
    if (condition === "other_account") api.user = { uid: "other" };
    if (condition === "offline") Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    await expect(submitOutsideTrainingReport(report, "command1")).rejects.toThrow(); expect(api.call).not.toHaveBeenCalled();
  });
  it("rejects an old auth session response even when the uid is the same again", async () => {
    let finish!: (value: unknown) => void; api.call.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const pending = submitOutsideTrainingReport(report, "command1");
    api.user = { uid: "runner" }; finish({ data: { status: "ready" } });
    await expect(pending).rejects.toThrow(/changed/); expect(api.call).toHaveBeenCalledOnce();
  });
});
