// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { enqueueCommand, outboxLength, __resetCommandOutboxForTests } from "../commandOutbox";
import { flushProgramCommands } from "../programCommandClient";

const { auth, call } = vi.hoisted(() => ({
  auth: { currentUser: { uid: "alice" } as { uid: string } | null },
  call: vi.fn(),
}));
vi.mock("firebase/auth", () => ({ getAuth: () => auth }));
vi.mock("firebase/functions", () => ({ getFunctions: () => ({}), httpsCallable: () => call }));

beforeEach(() => {
  __resetCommandOutboxForTests();
  auth.currentUser = { uid: "alice" };
  call.mockReset().mockResolvedValue({ data: {} });
  enqueueCommand("alice", { kind: "applyDeloadWeek", commandId: "first" });
  enqueueCommand("alice", { kind: "applyDeloadWeek", commandId: "second" });
});

describe("replay account binding", () => {
  it.each([null, { uid: "bob" }])("does not send stale account work under %j", async (user) => {
    auth.currentUser = user;
    expect(await flushProgramCommands("alice")).toBe(0);
    expect(call).not.toHaveBeenCalled();
    expect(outboxLength("alice")).toBe(2);
  });

  it("stops when auth changes during the first request and resumes for its owner", async () => {
    call.mockImplementationOnce(async () => {
      auth.currentUser = { uid: "bob" };
      return { data: {} };
    });
    expect(await flushProgramCommands("alice")).toBe(1);
    expect(call).toHaveBeenCalledTimes(1);
    expect(outboxLength("alice")).toBe(1);
    auth.currentUser = { uid: "alice" };
    expect(await flushProgramCommands("alice")).toBe(1);
    expect(outboxLength("alice")).toBe(0);
  });

  it("does not discard an in-flight request rejected after sign-out", async () => {
    call.mockImplementationOnce(async () => {
      auth.currentUser = null;
      throw Object.assign(new Error("signed out"), { code: "functions/unauthenticated" });
    });
    expect(await flushProgramCommands("alice")).toBe(0);
    expect(outboxLength("alice")).toBe(2);
  });
});


it("binds the request to Alice even when the SDK selects Bob's token after an await", async () => {
  call.mockImplementationOnce(async (payload) => {
    // The SDK's token selection yields before reading currentUser. The
    // handler rejects the original owner's envelope under the new token.
    await Promise.resolve();
    auth.currentUser = { uid: "bob" };
    expect(payload.expectedUid).toBe("alice");
    if (payload.expectedUid !== auth.currentUser.uid) {
      throw Object.assign(new Error("account changed"), { code: "functions/cancelled" });
    }
  });
  expect(await flushProgramCommands("alice")).toBe(0);
  expect(outboxLength("alice")).toBe(2);
});
