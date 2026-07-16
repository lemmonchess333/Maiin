import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { claimPushDeviceToken, releasePushDeviceToken } = require("../index");

// Auth precedence: the unauthenticated guard must run before payload parsing,
// rate limiting, or any Firestore access (packet 19).
describe("push-token callables — auth precedence", () => {
  it("claimPushDeviceToken rejects an unauthenticated call", async () => {
    await expect(claimPushDeviceToken.run({}, {})).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });

  it("releasePushDeviceToken rejects an unauthenticated call", async () => {
    await expect(releasePushDeviceToken.run({}, {})).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });

  it("rejects an invalid payload (extra key) with invalid-argument", async () => {
    await expect(
      claimPushDeviceToken.run(
        {
          ownerUid: "u1",
          token: "x".repeat(40),
          platform: "web",
          bindingId: "b".repeat(20),
          sneaky: 1,
        },
        { auth: { uid: "u1" } }
      )
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("rejects an ownerUid mismatch with permission-denied (intent fence)", async () => {
    await expect(
      claimPushDeviceToken.run(
        {
          ownerUid: "other",
          token: "x".repeat(40),
          platform: "web",
          bindingId: "b".repeat(20),
        },
        { auth: { uid: "u1" } }
      )
    ).rejects.toMatchObject({ code: "permission-denied" });
  });
});
