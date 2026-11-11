import type { Response } from "@playwright/test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isProgramCommandResponse } from "../e2e/helpers/programCommandResponse";
import { sendProgramCommand } from "../src/features/program/programCommandClient";

const { call } = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock("firebase/functions", () => ({
  getFunctions: () => ({}),
  httpsCallable: () => call,
}));

const endpoint =
  "http://127.0.0.1:5001/demo-tropos/us-central1/applyProgramCommand";

function responseFor(data: unknown, method = "POST", url = endpoint): Response {
  return {
    url: () => url,
    request: () => ({ method: () => method, postDataJSON: () => ({ data }) }),
  } as Response;
}

beforeEach(() => call.mockReset().mockResolvedValue({ data: {} }));

describe("run-coaching capture command response", () => {
  it.each(["applyEaseWeek", "revertEaseWeek"] as const)(
    "recognizes the real sender's account-bound %s payload",
    async (kind) => {
      const command = {
        kind,
        commandId: "11111111-1111-4111-8111-111111111111",
        expectedWeekNumber: 1,
        ...(kind === "applyEaseWeek"
          ? { runSwaps: [{ runDayId: "today", templateId: "easy_30" }] }
          : {}),
      };
      await sendProgramCommand(command, "runner");
      expect(call).toHaveBeenCalledExactlyOnceWith({
        command,
        expectedUid: "runner",
      });
      const response = responseFor(call.mock.calls[0][0]);
      expect(isProgramCommandResponse(response, kind, "runner")).toBe(true);
      expect(isProgramCommandResponse(response, kind, "someone-else")).toBe(
        false
      );
      expect(
        isProgramCommandResponse(response, "skipWorkoutDay", "runner")
      ).toBe(false);
    }
  );

  it.each([
    ["OPTIONS", endpoint],
    ["POST", endpoint.replace("applyProgramCommand", "configurePlan")],
  ])("ignores %s to %s without reading a command body", (method, url) => {
    expect(
      isProgramCommandResponse(
        responseFor(undefined, method, url),
        "applyEaseWeek",
        "runner"
      )
    ).toBe(false);
  });

  it.each([
    null,
    undefined,
    { kind: "applyEaseWeek", expectedUid: "runner" },
    { command: { kind: "applyEaseWeek" } },
  ])("does not match a command without its account-bound envelope", (data) => {
    expect(
      isProgramCommandResponse(responseFor(data), "applyEaseWeek", "runner")
    ).toBe(false);
  });
});
