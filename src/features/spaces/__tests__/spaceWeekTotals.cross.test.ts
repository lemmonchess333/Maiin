/**
 * A Space's week (Run27 call 11): the server decides when it stores figures
 * (functions/lib/spaceWeeks.js) and the app decides when it shows them
 * (spaceWeek.ts). The two floors are one number, the floor a Space's
 * member count has (Spc1c). If the server's were lower, a small group's
 * figures would sit in a document any signed-in person can read; if the
 * app's were lower, nothing would change; if higher, a week the server
 * counted would never show.
 */
import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { SPACE_WEEK_MIN_MEMBERS } from "../spaceWeek";
import { SPACE_MEMBER_COUNT_MIN_VISIBLE } from "../spaceDefs";

const require = createRequire(import.meta.url);
const server = require("../../../../functions/lib/spaceWeeks.js") as {
  SPACE_WEEK_MIN_MEMBERS: number;
};

describe("a Space's week floor", () => {
  it("is the server's and the app's alike, and the member count's", () => {
    expect(server.SPACE_WEEK_MIN_MEMBERS).toBe(SPACE_WEEK_MIN_MEMBERS);
    expect(SPACE_WEEK_MIN_MEMBERS).toBe(SPACE_MEMBER_COUNT_MIN_VISIBLE);
  });
});
