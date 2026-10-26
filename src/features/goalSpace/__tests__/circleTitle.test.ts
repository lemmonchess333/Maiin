import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as wordFilter from "@/lib/profanityFilter";
import { circleTitle as circleTitleWith } from "../circleTitle";

/** With the word filter loaded, as the Circle lists draw once it has. */
const circleTitle = (space: Parameters<typeof circleTitleWith>[0]) =>
  circleTitleWith(space, wordFilter);

/* A Circle named before a word joined the filter keeps that name in
   Firestore: a "Hitler" Circle made before 14 Oct 2026 (#2802) still read
   "Hitler" to its members. The name is shown as the Circle's kind. */
describe("circleTitle", () => {
  it("shows an ordinary name as it is", () => {
    expect(
      circleTitle({ title: "Autumn strength block", type: "strength_block" })
    ).toBe("Autumn strength block");
    // Whole words only, as the filter: a name is not refused for a word inside it.
    expect(
      circleTitle({ title: "Ashkenazi lifters", type: "strength_block" })
    ).toBe("Ashkenazi lifters");
  });

  it("shows a refused name as the Circle's kind", () => {
    expect(circleTitle({ title: "Hitler", type: "strength_block" })).toBe(
      "Strength Block"
    );
    expect(circleTitle({ title: "h1tl3r squad", type: "race" })).toBe(
      "Race Journey"
    );
    expect(
      circleTitle({ title: "nazi-gym", type: "nutrition_consistency" })
    ).toBe("Consistency Reset");
  });

  it("shows no name the filter has not seen: the kind, until it loads", () => {
    expect(
      circleTitleWith(
        { title: "Autumn strength block", type: "strength_block" },
        null
      )
    ).toBe("Strength Block");
  });

  it("falls back to a plain word for a kind with no template", () => {
    expect(circleTitle({ title: "Hitler", type: "body_composition" })).toBe(
      "Circle"
    );
  });
});

/* Members read the Circle document directly, so a name drawn anywhere
   without circleTitle shows whatever was saved. */
describe("every Circle name drawn in the app goes through circleTitle", () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (name === "__tests__" || name === "node_modules") continue;
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.tsx?$/.test(name)) files.push(path);
    }
  };
  walk(root);

  it("finds no space.title read outside circleTitle.ts", () => {
    const offenders = files
      .filter(
        (f) => !f.replaceAll("\\", "/").endsWith("goalSpace/circleTitle.ts")
      )
      .filter((f) => /\bspace\??\.title\b/.test(readFileSync(f, "utf8")))
      .map((f) => relative(root, f));
    expect(offenders).toEqual([]);
  });

  it("is used where Circles are drawn", () => {
    // Anchored: the pin above would pass vacuously if the readers moved.
    for (const f of [
      "components/social/CirclesSection.tsx",
      "components/social/CircleShareSheet.tsx",
    ]) {
      expect(readFileSync(join(root, f), "utf8")).toMatch(/circleTitle\(/);
    }
  });
});
