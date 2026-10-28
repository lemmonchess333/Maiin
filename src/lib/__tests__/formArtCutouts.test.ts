/**
 * The card cut-outs stay bound to the released drawings they were cut from.
 *
 * `scripts/art/cut-out-form-art.ts` derives one transparent image per
 * released set from that set's card frame: its reference, unless
 * `formArtCardFrames` lists a frame that shows the exercise better. The
 * reviewed frames are never edited (their release records pin every
 * frame's hash), so the failure this guards is the other direction: a
 * frame replaced or re-released while its cut-out keeps showing the old
 * drawing on Home.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { FORM_ARTWORK, getReleasedFormArtwork } from "../formArtwork";
import { FORM_ART_CUTOUTS } from "../formArtCutouts.data";
import { getFormArtCutout, sessionLeadArt } from "../formArtCutouts";
import { CARD_FRAMES, cardFrameOf } from "../formArtCardFrames";

const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const publicFile = (path: string) =>
  readFileSync(resolve(process.cwd(), "public", path));

/** Width, height and alpha flag of a WebP, read from its header. */
function webpHeader(data: Buffer): {
  width: number;
  height: number;
  alpha: boolean;
} {
  expect(data.toString("ascii", 0, 4)).toBe("RIFF");
  expect(data.toString("ascii", 8, 12)).toBe("WEBP");
  const kind = data.toString("ascii", 12, 16);
  // Lossy with alpha is always extended format.
  expect(kind).toBe("VP8X");
  const flags = data[20];
  return {
    width: 1 + data.readUIntLE(24, 3),
    height: 1 + data.readUIntLE(27, 3),
    alpha: (flags & 0x10) !== 0,
  };
}

const released = Object.keys(FORM_ARTWORK)
  .filter((id) => getReleasedFormArtwork(id))
  .sort();

describe("form art cut-outs", () => {
  it("covers every released drawing, and nothing else", () => {
    expect(released.length).toBeGreaterThan(0);
    expect(Object.keys(FORM_ART_CUTOUTS).sort()).toEqual(released);
  });

  it.each(released)("%s is cut from its current card frame", (id) => {
    const art = getReleasedFormArtwork(id)!;
    const cutout = FORM_ART_CUTOUTS[id];
    expect(cutout.source).toBe(cardFrameOf(id, art));
    expect(
      sha(publicFile(cutout.source)),
      `${cutout.source} changed since its cut-out was made — run ` +
        `npm run art:cutouts`
    ).toBe(cutout.sourceSha256);
  });

  it.each(released)("%s ships the file its manifest names", (id) => {
    const cutout = FORM_ART_CUTOUTS[id];
    const bytes = publicFile(cutout.src);
    expect(sha(bytes)).toBe(cutout.sha256);
    const header = webpHeader(bytes);
    expect(header.alpha).toBe(true);
    expect([header.width, header.height]).toEqual([
      cutout.width,
      cutout.height,
    ]);
    // Sized for a card, not a hero: 480 px on the long side at most.
    expect(Math.max(header.width, header.height)).toBeLessThanOrEqual(480);
  });

  it("hands out no cut-out cut from a frame other than the card frame", () => {
    // squat's card is its bottom position (frame 4), not its reference.
    const art = getReleasedFormArtwork("squat")!;
    expect(cardFrameOf("squat", art)).toBe("form-frames/squat/4.webp");
    expect(art.reference).toBe("form-frames/squat/1.webp");
    expect(getFormArtCutout("squat")?.src).toBe("form-art/squat.webp");
  });

  it("keeps the reviewed frame sets out of the cut-out folder", () => {
    for (const cutout of Object.values(FORM_ART_CUTOUTS)) {
      expect(cutout.src.startsWith("form-art/")).toBe(true);
      expect(cutout.source.startsWith("form-frames/")).toBe(true);
    }
  });

  it("hands out a cut-out only for released art from the same frame", () => {
    const id = released[0];
    expect(getFormArtCutout(id)?.src).toBe(FORM_ART_CUTOUTS[id].src);
    expect(getFormArtCutout("not-an-exercise")).toBeNull();
  });
});

describe("card frames", () => {
  /* The frame a card shows is chosen per set (owner, 2026-10-16: "the
     exercise itself, not just the outlined version"), never by editing
     the reviewed reference. */
  const listed = Object.entries(CARD_FRAMES);

  it.each(listed)("%s lists a frame of a released set", (id, frame) => {
    const art = getReleasedFormArtwork(id);
    expect(art, `${id} is not a released set`).not.toBeNull();
    expect(Number.isInteger(frame) && frame >= 1 && frame <= 6).toBe(true);
    // A listed frame that is the reference would say nothing.
    expect(art!.frames[frame - 1]).not.toBe(art!.reference);
  });

  it("binds each reviewed hand-made cut-out to its current card frame", () => {
    /* A prepared transparent source records the exact released frame shown
       on the card, whether that frame is the review reference or a listed
       pose. Changing the card frame must invalidate the prepared review. */
    const prepared = readdirSync(
      resolve(process.cwd(), "docs/exercise-art/cutout-sources")
    )
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""));
    expect(prepared).toContain("ab-wheel");
    for (const id of prepared) {
      const art = getReleasedFormArtwork(id);
      expect(art, `${id} has no released art`).not.toBeNull();
      const record = JSON.parse(
        readFileSync(
          resolve(process.cwd(), "docs/exercise-art/cutout-sources", `${id}.json`),
          "utf8"
        )
      );
      const source = cardFrameOf(id, art!);
      expect(record.reference).toBe(source);
      expect(record.referenceSha256).toBe(sha(publicFile(source)));
    }
  });
});

describe("sessionLeadArt", () => {
  it("pictures a lift day with its first drawn exercise, the squat at the bottom", () => {
    const art = sessionLeadArt([
      { name: "Custom finisher" },
      { exerciseId: "not-in-the-library", name: "Mystery lift" },
      { exerciseId: "squat", name: "Barbell Squat" },
      { exerciseId: "hack-squat", name: "Hack Squat" },
    ]);
    expect(art?.exerciseName).toBe("Barbell Squat");
    expect(art?.cutout).toBe(getFormArtCutout("squat"));
    expect(art?.cutout.source).toBe("form-frames/squat/4.webp");
  });

  it("is null for a day with no drawn exercise", () => {
    expect(sessionLeadArt([{ name: "Custom finisher" }])).toBeNull();
    expect(sessionLeadArt([])).toBeNull();
  });
});
