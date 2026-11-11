import { describe, expect, it } from "vitest";
import {
  createRunSessionIdentity,
  parseRunSessionIdentity,
} from "../runSessionIdentity";
import { freeformPlanMetadata } from "../runPlanMetadata";
import { localDateString } from "../dateHelpers";
import type { RunConfig } from "@/components/run/runConfigDefaults";

describe("run session identity", () => {
  const config = {
    activityType: "freerun",
    planMetadata: freeformPlanMetadata("freeform"),
  } as RunConfig;

  it("captures one document ID, start day and zone before recording", () => {
    const startedAt = Date.UTC(2026, 6, 20, 23, 55);
    const identity = createRunSessionIdentity(
      "runner",
      "run-at-start",
      config,
      startedAt
    );
    expect(identity).toMatchObject({
      uid: "runner",
      sessionId: "run-at-start",
      runId: "run-at-start",
      startedAt,
      startLocalDate: localDateString(new Date(startedAt)),
      scheduledRunId: null,
    });
    expect(identity.originTimeZone).toBeTruthy();
    expect(parseRunSessionIdentity(identity, "runner")).toEqual(identity);
    expect(parseRunSessionIdentity(identity, "different-account")).toBeNull();
  });
});
