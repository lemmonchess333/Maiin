/**
 * Cross-consistency test for the TS + JS copies of the profanity filter.
 *
 * `functions/profanityFilter.js` opens "Mirrors src/lib/profanityFilter.ts
 * exactly: same library, same predicate semantics" — and until now nothing
 * held it to that. The mirror gate walked straight past the file: its
 * detector matched `mirrors? the client`, and this author named the
 * counterpart by PATH instead, which is the more precise habit. So the
 * clearest mirror declaration in `functions/` was the one the gate could not
 * see.
 *
 * BOTH copies run, which is what makes this a cross-test rather than an
 * exemption (the distinction the gate's own header draws): the client filters
 * at the composer for inline feedback, the server is the trust boundary a
 * `curl` cannot bypass. Divergence is therefore user-visible in a
 * particularly confusing way — a caption the composer accepts gets silently
 * auto-flagged and forced to private visibility by `onActivityCreated`, with
 * nothing telling the author why.
 *
 * They agree today. Both wrap `leo-profanity`, both declare `^1.9.0`, and
 * both currently resolve 1.9.0. That last part is the fragile bit and the
 * reason this test asserts BEHAVIOUR over a corpus rather than comparing
 * source: the two live in separate package trees (`node_modules` and
 * `functions/node_modules`), so a range bump applied to one and not the other
 * changes the WORD LIST under one copy while every line of code in both files
 * stays identical. No amount of reading either file would show it; running
 * both over the same strings does.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import {
  containsProfanity as clientContains,
  cleanProfanity as clientClean,
} from "@/lib/profanityFilter";

const require = createRequire(import.meta.url);
const server = require("../../../functions/profanityFilter.js");

/* Deliberately mundane. The point is not to enumerate slurs — it is to cover
   the SHAPES where two wrappers around the same library can still disagree:
   casing, embedded matches, punctuation, the empty/whitespace short-circuit,
   and non-string input. The one actual profanity is the mildest that
   leo-profanity's English list carries. */
const CORPUS: string[] = [
  "",
  "   ",
  "\n\t",
  "great session today",
  "ate a whole pizza, what a beast",
  "smashed my PR, absolutely ripped",
  // Real entries from the 253-word English list. The first corpus used
  // "damn", which leo-profanity does NOT carry — so every equality below
  // passed while the two copies agreed about nothing. The control at the
  // bottom of this file is what caught that, and is the reason it exists.
  "sucks",
  "Sucks",
  "SUCKS",
  "sucks!",
  "this hill sucks",
  "butt",
  "butterfly",
  "s u c k s",
  "sucked",
  "hello@example.com",
  "\u{1F3C3} 10k done",
];

const NON_STRINGS: unknown[] = [undefined, null, 0, 42, {}, [], true];

describe("profanity filter — TS and JS copies agree", () => {
  it.each(CORPUS)("containsProfanity(%j)", (text) => {
    expect(server.containsProfanity(text)).toBe(clientContains(text));
  });

  it("agrees on non-string input", () => {
    for (const v of NON_STRINGS) {
      expect(server.containsProfanity(v)).toBe(clientContains(v));
    }
  });

  it.each(CORPUS)("cleanProfanity(%j)", (text) => {
    expect(server.cleanProfanity(text)).toBe(clientClean(text));
  });

  it("actually detects something — the corpus is not all-clean", () => {
    /* The control. Every assertion above is an equality, so two copies that
       both returned `false` for everything would pass the whole file while
       agreeing about nothing. At least one corpus entry must trip the filter
       on BOTH sides for the agreement to mean anything. */
    const flagged = CORPUS.filter((t) => clientContains(t));
    expect(flagged.length).toBeGreaterThan(0);
    expect(flagged.every((t) => server.containsProfanity(t))).toBe(true);
  });

  it("and leaves ordinary fitness language alone on both copies", () => {
    // The other half of the control: an over-eager dictionary swap that
    // flagged everything would also make every equality above pass.
    for (const clean of [
      "great session today",
      "ate a whole pizza, what a beast",
      "smashed my PR, absolutely ripped",
    ]) {
      expect(clientContains(clean)).toBe(false);
      expect(server.containsProfanity(clean)).toBe(false);
    }
  });

  it("pins the declared dependency range on both sides", () => {
    /* The divergence vector the behavioural corpus cannot reach: the copies
       resolve `leo-profanity` from different package trees, so bumping one
       range and not the other changes the word list under one copy with no
       code change anywhere. Equal ranges is what keeps them installing the
       same dictionary. */
    const root = require("../../../package.json");
    const fns = require("../../../functions/package.json");
    expect(fns.dependencies["leo-profanity"]).toBe(
      root.dependencies["leo-profanity"]
    );
  });
});
