/**
 * settleWrite: offline a write counts as made at once, and its later
 * refusal is still heard; online it is the write. The SDK's promise for an
 * offline write waits for the server, so anything awaiting it waited for
 * the connection (settleWrite.ts).
 */
import { describe, it, expect, vi } from "vitest";
import { settleWrite } from "../settleWrite";

vi.mock("../logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), log: vi.fn() },
}));

const never = () => new Promise<void>(() => {});

describe("settleWrite", () => {
  it("online, is the write: saved once the server answers", async () => {
    await expect(
      settleWrite(Promise.resolve(), { label: "t", online: true })
    ).resolves.toBe("saved");
  });

  it("online, a refusal throws", async () => {
    await expect(
      settleWrite(Promise.reject(new Error("permission-denied")), {
        label: "t",
        online: true,
      })
    ).rejects.toThrow("permission-denied");
  });

  it("offline, answers queued without waiting for the server", async () => {
    await expect(
      settleWrite(never(), { label: "t", online: false })
    ).resolves.toBe("queued");
  });

  it("offline, a refusal once back online is handed on, not thrown", async () => {
    const onLateFailure = vi.fn();
    let refuse!: (err: Error) => void;
    const write = new Promise<void>((_resolve, reject) => {
      refuse = reject;
    });
    await expect(
      settleWrite(write, { label: "t", online: false, onLateFailure })
    ).resolves.toBe("queued");
    expect(onLateFailure).not.toHaveBeenCalled();
    refuse(new Error("permission-denied"));
    await vi.waitFor(() => expect(onLateFailure).toHaveBeenCalledOnce());
  });
});
