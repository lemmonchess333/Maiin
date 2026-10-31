/**
 * A renamed run's post is named by the server (`functions/lib/runRename.js`),
 * which cuts the name as the app does. The two cuts are one number and one
 * rule, so a name the page shows is the name the post carries.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { RUN_NAME_MAX } from "@/lib/runNameLimit";
import { runRenameValue } from "@/lib/runRename";

const require = createRequire(import.meta.url);
const server = require("../../../functions/lib/runRename.js") as {
  RUN_NAME_MAX: number;
  postableRunName: (value: unknown) => string | null;
};

describe("a run's name, cut on both sides", () => {
  it("is cut at one length", () => {
    expect(server.RUN_NAME_MAX).toBe(RUN_NAME_MAX);
  });

  it.each([
    "  Parkrun  ",
    "",
    "   ",
    "x".repeat(RUN_NAME_MAX + 5),
    `${"y".repeat(RUN_NAME_MAX - 1)}  z`,
  ])("reads %j the same way", (typed) => {
    expect(server.postableRunName(typed)).toBe(runRenameValue(typed));
  });
});
