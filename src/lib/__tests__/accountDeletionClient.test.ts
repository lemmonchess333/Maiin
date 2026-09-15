import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  resetFirestore,
  seedFirestore,
  seedCache,
  failNextFirestore,
  deferReads,
  pendingReads,
  releaseRead,
} from "@/test/firestoreHarness";
const h = vi.hoisted(() => ({
  auth: { currentUser: { uid: "u1" } },
  request: vi.fn(),
  callable: vi.fn(),
}));
vi.mock("../firebase", () => ({ auth: h.auth, db: {}, functions: {} }));
vi.mock("firebase/firestore");
vi.mock("firebase/functions", () => ({
  httpsCallable: (...args: unknown[]) => {
    h.callable(...args);
    return h.request;
  },
}));
import { deleteAccount } from "../accountDeletionClient";
const path = "accountDeletionRequests/u1";
beforeEach(() => {
  vi.resetAllMocks();
  resetFirestore();
  h.auth.currentUser = { uid: "u1" };
  h.request.mockResolvedValue({ data: { ok: true } });
});
describe("deletion completion and identity", () => {
  it("keeps an accepted background request pending", async () => {
    h.request.mockResolvedValue({ data: { ok: false, status: "pending" } });
    await expect(deleteAccount("u1")).resolves.toBe("pending");
  });
  it("cannot turn an unexpected callable response into successful deletion", async () => {
    h.request.mockResolvedValue({ data: { ok: false } });
    await expect(deleteAccount("u1")).rejects.toThrow(
      "Deletion wasn't confirmed"
    );
  });
  it("uses the authenticated callable and allows time for larger accounts", async () => {
    await deleteAccount("u1");
    expect(h.callable).toHaveBeenCalledWith({}, "deleteMyAccount", {
      timeout: 600_000,
    });
    expect(h.request).toHaveBeenCalledWith({});
  });
  it("accepts a completed server ledger when retrying a lost response", async () => {
    seedFirestore({ [path]: { status: "completed" } });
    await deleteAccount("u1");
    expect(h.request).not.toHaveBeenCalled();
  });
  it("checks the server ledger after a callable timeout", async () => {
    seedFirestore({ [path]: { status: "running" } });
    h.request.mockImplementationOnce(async () => {
      seedFirestore({ [path]: { status: "completed" } });
      throw new Error("deadline");
    });
    await expect(deleteAccount("u1")).resolves.toBe("completed");
  });
  it.each(["running", "failed_cleanup"])(
    "does not call %s a successful deletion",
    async (status) => {
      h.request.mockRejectedValueOnce(new Error("cleanup error"));
      seedFirestore({ [path]: { status } });
      await expect(deleteAccount("u1")).rejects.toThrow("cleanup error");
    }
  );
  it("does not treat cached completion as server confirmation", async () => {
    seedCache({ [path]: { status: "completed" } });
    h.request.mockRejectedValueOnce(new Error("cleanup error"));
    await expect(deleteAccount("u1")).rejects.toThrow("cleanup error");
    expect(h.request).toHaveBeenCalledOnce();
  });
  it("continues with the executor when a ledger read is unavailable", async () => {
    failNextFirestore("getDoc", { path, code: "unavailable" });
    await deleteAccount("u1");
    expect(h.request).toHaveBeenCalledOnce();
  });
  it("stops if the account changes while checking the ledger", async () => {
    deferReads();
    const pending = deleteAccount("u1");
    expect(pendingReads()).toEqual([path]);
    h.auth.currentUser = { uid: "u2" };
    releaseRead(0);
    await expect(pending).rejects.toThrow("Identity mismatch");
    expect(h.request).not.toHaveBeenCalled();
  });
  it("rejects a different UID before any server access", async () => {
    deferReads();
    await expect(deleteAccount("u2")).rejects.toThrow("Identity mismatch");
    expect(pendingReads()).toEqual([]);
    expect(h.request).not.toHaveBeenCalled();
  });
});
