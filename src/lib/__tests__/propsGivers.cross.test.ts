/**
 * The givers a post names under its props are kept by the server
 * (`functions/lib/socialCounters.js`) and read by the card
 * (`propsGivers.ts`): one number on both sides, so the card never cuts a
 * list the server kept or waits for one it never keeps.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { RECENT_PROPS_MAX } from "@/lib/propsGivers";

describe("the givers a post names", () => {
  it("are as many on the server as the card reads", () => {
    // Read as text: the module needs the functions' installed packages.
    const source = readFileSync(
      resolve(__dirname, "../../../functions/lib/socialCounters.js"),
      "utf8"
    );
    const match = /const RECENT_PROPS_MAX = (\d+);/.exec(source);
    expect(match, "RECENT_PROPS_MAX is no longer a literal").not.toBeNull();
    expect(Number(match![1])).toBe(RECENT_PROPS_MAX);
  });
});
