/**
 * The line above a shared card or post (owner, 22 Nov 2026): the sharer's
 * first name and what they shared, in three or four words.
 */
import { describe, expect, it } from "vitest";
import { JOIN_TROPOS, joinTroposHref, sharedLine } from "@/lib/joinTropos";
import { APP_STORE_URL, appInviteUrl } from "@/lib/publicLinks";

const said = (line: { name: string | null; rest: string }) =>
  `${line.name ?? ""}${line.rest}`;

describe("the line above the card", () => {
  it("names the sharer and what they shared", () => {
    expect(said(sharedLine("Sam", "lift"))).toBe("Sam shared a workout");
    expect(said(sharedLine("Sam", "run"))).toBe("Sam shared a run");
    expect(said(sharedLine("Sam", "hybrid"))).toBe("Sam shared a session");
    expect(said(sharedLine("Sam", "nutrition"))).toBe("Sam shared their food");
    expect(said(sharedLine("Sam", "recap"))).toBe("Sam shared their week");
    expect(said(sharedLine("Sam", "recap", "This year"))).toBe(
      "Sam shared their year"
    );
    expect(sharedLine("Sam", "run").name).toBe("Sam");
  });

  it("says what was shared without a name to show", () => {
    expect(said(sharedLine(null, "run"))).toBe("A run, shared");
    expect(said(sharedLine("  ", "recap"))).toBe("A week, shared");
    expect(sharedLine(undefined, "lift").name).toBeNull();
  });

  it("is three or four words, with a name or without", () => {
    for (const template of [
      "lift",
      "run",
      "hybrid",
      "nutrition",
      "recap",
    ] as const) {
      for (const name of ["Sam", null]) {
        const words = said(sharedLine(name, template)).split(" ").length;
        expect(words, template).toBeGreaterThanOrEqual(3);
        expect(words, template).toBeLessThanOrEqual(4);
      }
    }
  });
});

describe("the button", () => {
  it("says Join Tropos and carries a code only when it has one", () => {
    expect(JOIN_TROPOS).toBe("Join Tropos");
    expect(joinTroposHref("K7P49M2H")).toBe(appInviteUrl("K7P49M2H"));
    expect(joinTroposHref(undefined)).toBe(APP_STORE_URL);
    expect(joinTroposHref("nonsense")).toBe(APP_STORE_URL);
  });
});
