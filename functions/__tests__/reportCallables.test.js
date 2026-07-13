/**
 * Auth-precedence coverage for the packet 14 report callables. The heavy
 * target-resolution / authority logic lives in reportTargets.test.js (pure)
 * and the emulator integration lane; this pins that createReport rejects an
 * unauthenticated call BEFORE doing any work.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// firebase-functions/v1 refuses to construct triggers without a project id.
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "demo-tropos";

const { createReport } = require("../index");

describe("createReport — auth precedence", () => {
  it("rejects an unauthenticated call with unauthenticated", async () => {
    await expect(createReport.run({}, {})).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });
});
