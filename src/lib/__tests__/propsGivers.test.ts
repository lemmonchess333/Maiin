/**
 * The line that says who gave a post props (`propsGivers.ts`), from the
 * givers the server kept on it.
 */
import { describe, it, expect } from "vitest";
import {
  propsLine,
  readPropsGivers,
  shownPropsGivers,
  RECENT_PROPS_MAX,
} from "@/lib/propsGivers";

const ann = { uid: "ann", name: "Ann" };
const bo = { uid: "bo", name: "Bo", photoURL: "https://x/bo.jpg" };
const cy = { uid: "cy", name: "Cy" };
const none = new Set<string>();

describe("propsLine", () => {
  it("names one giver alone", () => {
    expect(propsLine([ann], 1)).toBe("Ann gave props");
  });

  it("names two givers when there are two", () => {
    expect(propsLine([ann, bo], 2)).toBe("Ann and Bo gave props");
  });

  it("names the first and counts the rest", () => {
    expect(propsLine([ann, bo, cy], 3)).toBe("Ann and 2 others gave props");
    expect(propsLine([ann], 2)).toBe("Ann and 1 other gave props");
    expect(propsLine([ann], 1235)).toBe("Ann and 1,234 others gave props");
  });

  it("says nothing when it can name nobody", () => {
    expect(propsLine([], 4)).toBeNull();
    expect(propsLine([ann], 0)).toBeNull();
  });
});

describe("shownPropsGivers", () => {
  it("leaves out anyone either side of a block with the reader", () => {
    expect(
      shownPropsGivers([ann, bo, cy], {
        viewerUid: "me",
        viewerGave: false,
        blocked: new Set(["bo"]),
      }).map((g) => g.name)
    ).toEqual(["Ann", "Cy"]);
  });

  it("puts the reader first as You once they have given props, with their photo", () => {
    const me = { uid: "me", name: "Me Myself", photoURL: "https://x/me.jpg" };
    expect(
      shownPropsGivers([ann, me, bo], {
        viewerUid: "me",
        viewerGave: true,
        blocked: none,
      })
    ).toEqual([
      { uid: "me", name: "You", photoURL: "https://x/me.jpg" },
      ann,
      bo,
    ]);
  });

  it("shows You before the server has the tap, and drops a taken-back You", () => {
    expect(
      shownPropsGivers([ann], {
        viewerUid: "me",
        viewerGave: true,
        blocked: none,
      }).map((g) => g.name)
    ).toEqual(["You", "Ann"]);
    expect(
      shownPropsGivers([{ uid: "me", name: "Me" }, ann], {
        viewerUid: "me",
        viewerGave: false,
        blocked: none,
      }).map((g) => g.name)
    ).toEqual(["Ann"]);
  });
});

describe("readPropsGivers", () => {
  it("keeps only well-formed givers, and at most the server's number", () => {
    expect(
      readPropsGivers([
        ann,
        null,
        { uid: 3 },
        bo,
        cy,
        { uid: "di", name: "Di" },
      ])
    ).toEqual([ann, bo, cy]);
    expect(RECENT_PROPS_MAX).toBe(3);
    expect(readPropsGivers(undefined)).toEqual([]);
  });
});
