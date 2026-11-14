import { describe, it, expect } from "vitest";
import {
  PACE_UPDATE_UPGRADE_PATH,
  paceUpdateLocked,
} from "../paceUpdateAccess";

/** Owner, 13 November 2026: faster paces after a run are Pro; slower ones,
 *  a fix to targets the runner cannot hold, stay every account's. */
describe("paceUpdateLocked", () => {
  it("locks faster paces for a free account", () => {
    expect(paceUpdateLocked("faster", false)).toBe(true);
  });

  it("locks a runner's first paces for a free account (Run24 (4))", () => {
    expect(paceUpdateLocked("first", false)).toBe(true);
    expect(paceUpdateLocked("first", true)).toBe(false);
  });

  it("leaves slower paces open to a free account", () => {
    expect(paceUpdateLocked("slower", false)).toBe(false);
  });

  it("locks nothing for Pro", () => {
    expect(paceUpdateLocked("faster", true)).toBe(false);
    expect(paceUpdateLocked("slower", true)).toBe(false);
  });

  it("sends a locked offer to the Pro page as `paces`", () => {
    expect(PACE_UPDATE_UPGRADE_PATH).toBe("/upgrade?from=paces");
  });
});
