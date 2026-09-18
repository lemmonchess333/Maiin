/**
 * Proof that `--sequence.shuffle` is still doing something.
 *
 * `unit-shuffle` runs the whole suite in a seeded order. If vitest ever
 * dropped or renamed that flag the job would keep passing and would
 * silently be a second copy of `unit`, reporting order-independence it
 * never examined. That is not hypothetical: measured on vitest 4.1.8,
 * `--sequence.bogusOption=1` exits 0 and runs the suite normally, so an
 * unknown sequence key is accepted in silence.
 *
 * The first version of this check parsed the verbose reporter's console
 * output for which test ran first. It worked locally and found nothing
 * at all on the runner — same vitest, same command, different rendering
 * — and because it hid stderr, both causes ("vitest never ran" and "the
 * orders matched") printed the same `<nothing>`. A probe with two
 * indistinguishable failure modes is the shape this repo keeps finding.
 *
 * So the order is recorded from INSIDE the run, where it is a fact
 * rather than a rendering: each test appends its name, and `afterAll`
 * writes the sequence to the path in `TROPOS_SHUFFLE_PROBE`. No glyphs,
 * no columns, no ANSI, no locale. The CI step runs this file under two
 * seeds and requires the two files to differ.
 *
 * Twelve tests because two seeds must not collide by luck: 12! is about
 * 479 million orderings. The seeds are fixed, so the outcome is
 * deterministic and was verified once rather than trusted.
 *
 * Writing is opt-in. Without the env var this is twelve trivially fast
 * assertions that cost the ordinary suite nothing.
 */
import { afterAll, describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";

const observed: string[] = [];
const record = (name: string) => {
  observed.push(name);
  expect(name).not.toBe("");
};

describe("shuffle order probe", () => {
  for (let i = 1; i <= 12; i += 1) {
    it(`step ${i}`, () => record(`step ${i}`));
  }

  afterAll(() => {
    expect(observed).toHaveLength(12);
    const out = process.env.TROPOS_SHUFFLE_PROBE;
    if (out) writeFileSync(out, observed.join("\n"), "utf8");
  });
});
