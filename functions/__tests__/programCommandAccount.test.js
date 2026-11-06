/** Account ownership must be checked before any Firestore / limiter work. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "demo-tropos";
const locks = require("../lib/accountDeletionLocks");
const commands = require("../lib/programCommands");
const { applyProgramCommand } = require("../index");
const command = { kind: "dismissFellBehindPrompt", commandId: "c".repeat(20) };
let lock;
let validate;
beforeEach(() => {
  // Stop a permitted request at the first downstream seam. No RPCs occur.
  lock = vi.spyOn(locks, "assertCallableActorNotDeleting").mockRejectedValue(new Error("owner gate passed"));
  validate = vi.spyOn(commands, "assertClientProgramCommand");
});
afterEach(() => vi.restoreAllMocks());

describe("programme callable account binding", () => {
  it.each(["alice", null, 123, ""])("rejects expectedUid=%j under Bob before downstream work", async (expectedUid) => {
    await expect(applyProgramCommand.run({ command, expectedUid }, { auth: { uid: "bob" } }))
      .rejects.toMatchObject({ code: "cancelled" });
    expect(lock).not.toHaveBeenCalled();
    expect(validate).not.toHaveBeenCalled();
  });

  it.each([command, { command }, { command, expectedUid: "alice" }])(
    "accepts legacy and correctly bound envelope %j", async (data) => {
      await expect(applyProgramCommand.run(data, { auth: { uid: "alice" } }))
        .rejects.toThrow("owner gate passed");
      expect(lock).toHaveBeenCalledOnce();
    }
  );

  it("still requires authentication first", async () => {
    await expect(applyProgramCommand.run({ command, expectedUid: "alice" }, {}))
      .rejects.toMatchObject({ code: "unauthenticated" });
    expect(lock).not.toHaveBeenCalled();
  });
});
