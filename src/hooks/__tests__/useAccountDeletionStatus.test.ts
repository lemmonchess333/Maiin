import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import {
  resetFirestore,
  seedFirestore,
  flushSnapshots,
  setSnapshotMetadata,
  failNextFirestore,
  readLog,
} from "@/test/firestoreHarness";
vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
import { useAccountDeletionStatus } from "../useAccountDeletionStatus";
const path = "accountDeletionRequests/alice";
beforeEach(resetFirestore);
async function subscriptionReady() {
  await waitFor(() =>
    expect(
      readLog().some((read) => read.op === "onSnapshot" && read.path === path)
    ).toBe(true)
  );
  await flushSnapshots();
}
describe("account deletion progress", () => {
  it("reports a durable accepted request and its support code", async () => {
    seedFirestore({
      [path]: { status: "failed_cleanup", supportCode: "DL-ABC234" },
    });
    const { result } = renderHook(() => useAccountDeletionStatus("alice"));
    await subscriptionReady();
    expect(result.current).toMatchObject({
      pending: true,
      completed: false,
      confirmed: true,
      supportCode: "DL-ABC234",
    });
  });
  it("requires server confirmation before declaring completion or clearing the device", async () => {
    seedFirestore({ [path]: { status: "completed" } });
    setSnapshotMetadata(path, { fromCache: true });
    const { result } = renderHook(() => useAccountDeletionStatus("alice"));
    await subscriptionReady();
    expect(result.current.completed).toBe(false);
    setSnapshotMetadata(path, { fromCache: false });
    await flushSnapshots();
    expect(result.current.completed).toBe(true);
  });
  it("does not treat a read failure as completion", async () => {
    failNextFirestore("onSnapshot", { path, code: "unavailable" });
    const { result } = renderHook(() => useAccountDeletionStatus("alice"));
    await subscriptionReady();
    expect(result.current.completed).toBe(false);
  });
  it("never shows the previous account's deletion on account switch", async () => {
    seedFirestore({ [path]: { status: "running" } });
    const { result, rerender } = renderHook(
      ({ uid }) => useAccountDeletionStatus(uid),
      { initialProps: { uid: "alice" } }
    );
    await subscriptionReady();
    rerender({ uid: "bob" });
    expect(result.current.pending).toBe(false);
    expect(result.current.completed).toBe(false);
  });
});
