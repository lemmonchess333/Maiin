/**
 * SOCIAL-FOCUS-01 — TS↔JS mirror pin (mirror cross-test gate, D4).
 *
 * The weekly-focus enum lives twice by necessity: the client schema
 * contract (goalSpaceTypes.ts WEEKLY_FOCUS_OPTIONS — the sheet's
 * options, the parse guard) and the server validator
 * (functions/lib/goalSpaceCheckIn.js WEEKLY_FOCUS_VALUES — what the
 * callable will actually accept). If they drift, a focus the sheet
 * offers gets rejected server-side (or worse, a retired value keeps
 * being accepted). Same for the supporterIds bound.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import {
  WEEKLY_FOCUS_OPTIONS,
  WEEKLY_FOCUS_SUPPORTERS_MAX,
} from "../goalSpaceTypes";

const require = createRequire(import.meta.url);
const server = require("../../../../functions/lib/goalSpaceCheckIn.js") as {
  WEEKLY_FOCUS_VALUES: string[];
  MAX_FOCUS_SUPPORTERS: number;
};

describe("weekly focus client↔server mirror", () => {
  it("the closed focus enum is identical on both sides, order included", () => {
    expect([...server.WEEKLY_FOCUS_VALUES]).toEqual([...WEEKLY_FOCUS_OPTIONS]);
  });

  it("the supporterIds bound matches", () => {
    expect(server.MAX_FOCUS_SUPPORTERS).toBe(WEEKLY_FOCUS_SUPPORTERS_MAX);
  });
});
