/**
 * The app recognises the server's refusal by its reason, so the two
 * spellings are one (S4e): functions/lib/restriction.js throws it,
 * src/lib/accountRestriction.ts reads it.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { RESTRICTED_REASON } from "../accountRestriction";

const require = createRequire(import.meta.url);
const server = require("../../../functions/lib/restriction.js");

describe("the restriction's reason", () => {
  it("is spelled the same on both sides", () => {
    expect(RESTRICTED_REASON).toBe(server.RESTRICTED_REASON);
  });
});
